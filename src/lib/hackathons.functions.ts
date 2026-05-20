import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "./ai-gateway";
import { notifyHackathonDiscovered, notifyHackathonAccepted } from "./feishu.functions";

// ------- Types -------
export interface HackathonRow {
  id: string;
  source: string;
  url: string;
  title: string;
  deadline: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  prize: string | null;
  summary: string | null;
  tags: string[];
  status: "pending" | "accepted" | "dismissed";
  discovered_at: string;
}

// ------- Firecrawl helpers -------
type FirecrawlSearchItem = { url?: string; title?: string; description?: string; markdown?: string };

function isHackathonSnippet(item: FirecrawlSearchItem): boolean {
  const text = `${item.title ?? ""}\n${item.description ?? ""}\n${item.markdown ?? ""}`.toLowerCase();
  return /hackathon|黑客松|编程比赛|创新大赛|报名|register|prize|devpost|dorahacks|mlh/.test(text);
}

function fallbackHackathons(source: string, snippets: FirecrawlSearchItem[]): z.infer<typeof ExtractedSchema>["hackathons"] {
  return snippets
    .filter((s) => s.url?.startsWith("http") && isHackathonSnippet(s))
    .slice(0, 6)
    .map((s) => {
      const text = `${s.title ?? ""}\n${s.description ?? ""}\n${s.markdown ?? ""}`;
      return {
        title: (s.title ?? source).trim().slice(0, 120),
        url: s.url!,
        deadline: inferDateFromText(text),
        starts_at: null,
        ends_at: null,
        location: /online|线上/i.test(text) ? "线上" : null,
        prize: null,
        summary: (s.description ?? s.markdown ?? "黑客松/创新比赛报名信息").replace(/\s+/g, " ").trim().slice(0, 60),
        tags: ["黑客松", source].filter(Boolean).slice(0, 5),
      };
    });
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function firecrawlSearch(query: string, limit = 8): Promise<FirecrawlSearchItem[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, limit, scrapeOptions: { formats: ["markdown"] } }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { web?: FirecrawlSearchItem[] } | FirecrawlSearchItem[] };
    const raw = data?.data;
    if (Array.isArray(raw)) return raw;
    return raw?.web ?? [];
  } catch {
    return [];
  }
}

// ------- AI extraction -------
const ExtractedSchema = z.object({
  hackathons: z
    .array(
      z.object({
        title: z.string().describe("黑客松名称, 中文优先"),
        url: z.string().describe("详情/报名链接 (完整 https://)"),
        deadline: z.string().nullable().describe("⚠️ 报名截止日期 (YYYY-MM-DD)。注意区分: 这是「报名结束」, 不是比赛结束"),
        starts_at: z.string().nullable().describe("比赛开始日期 (YYYY-MM-DD)"),
        ends_at: z.string().nullable().describe("比赛结束日期 (YYYY-MM-DD), 如果只是单日活动可以和 starts_at 相同"),
        location: z.string().nullable().describe("线上 / 城市 / 混合"),
        prize: z.string().nullable().describe("奖金/奖品概述, 一句话"),
        summary: z.string().describe("一句中文简介, 不超过 60 字"),
        tags: z.array(z.string()).describe("3-5 个主题标签, 比如 AI、Web3、Education"),
      }),
    )
    .max(15),
});

type HackathonDateFields = {
  title?: string | null;
  summary?: string | null;
  deadline: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toValidDate(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function parseDateLike(s: string | null | undefined): Date | null {
  if (!s) return null;
  const full = s.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*(?:[-/.月])\s*(\d{1,2})/);
  if (full) return toValidDate(Number(full[1]), Number(full[2]), Number(full[3]));
  const md = s.match(/(?:^|[^\d])(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/);
  if (md) return toValidDate(new Date().getFullYear(), Number(md[1]), Number(md[2]));
  return null;
}

function extractDateCandidates(text: string): Date[] {
  const dates: Date[] = [];
  const currentYear = new Date().getFullYear();
  for (const m of text.matchAll(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*(?:[-/.月])\s*(\d{1,2})/g)) {
    const d = toValidDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (d) dates.push(d);
  }
  for (const m of text.matchAll(/(?:^|[^\d])(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/g)) {
    const d = toValidDate(currentYear, Number(m[1]), Number(m[2]));
    if (d) dates.push(d);
  }
  return dates;
}

function inferDateFromText(text: string): string | null {
  const dates = extractDateCandidates(text);
  if (dates.length === 0) return null;
  return formatDate(dates.sort((a, b) => b.getTime() - a.getTime())[0]);
}

function normalizeHackathonDates<T extends HackathonDateFields>(item: T): T {
  if (parseDateLike(item.deadline) || parseDateLike(item.ends_at) || parseDateLike(item.starts_at)) return item;
  const inferred = inferDateFromText(`${item.title ?? ""}\n${item.summary ?? ""}`);
  return inferred ? ({ ...item, deadline: inferred } as T) : item;
}

function isActionableHackathon(item: HackathonDateFields): boolean {
  const today = startOfToday();
  const normalized = normalizeHackathonDates(item);
  const deadline = parseDateLike(normalized.deadline);
  if (deadline) return deadline.getTime() >= today.getTime();

  const timeline = [parseDateLike(normalized.ends_at), parseDateLike(normalized.starts_at)].filter(Boolean) as Date[];
  if (timeline.length > 0) return Math.max(...timeline.map((d) => d.getTime())) >= today.getTime();

  const candidates = extractDateCandidates(`${item.title ?? ""}\n${item.summary ?? ""}`);
  if (candidates.length > 0) return Math.max(...candidates.map((d) => d.getTime())) >= today.getTime();

  // 没有任何可解析日期的结果不可行动，避免旧新闻/往届比赛长期占位。
  return false;
}

async function extractWithAI(
  source: string,
  snippets: FirecrawlSearchItem[],
): Promise<{ data: z.infer<typeof ExtractedSchema>; error?: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { data: { hackathons: [] }, error: "LOVABLE_API_KEY 未配置" };
  if (snippets.length === 0) return { data: { hackathons: [] } };

  const corpus = snippets
    .map((s, i) => `[${i + 1}] ${s.title ?? ""}\nURL: ${s.url ?? ""}\n${(s.markdown ?? s.description ?? "").slice(0, 1600)}`)
    .join("\n\n---\n\n");

  const now = new Date();
  const ym = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`;
  const todayStr = now.toISOString().slice(0, 10);

  const gateway = createLovableAiGatewayProvider(apiKey);
  const models = ["google/gemini-2.5-flash", "google/gemini-3-flash-preview"] as const;
  let lastErr = "";
  for (const m of models) {
    try {
      const { object } = await generateObject({
        model: gateway(m),
        schema: ExtractedSchema,
        system: `你是黑客松信息提取器。从搜索结果里挑出所有看起来像黑客松/编程比赛/创新比赛的条目。
当前是 ${ym} (today=${todayStr})。

【关键时间提取要求 - 非常重要】
仔细阅读每条 markdown 内容, 提取三个关键日期, 统一输出 YYYY-MM-DD:
- deadline: 「报名截止」时间。识别关键词: 报名截止 / 报名结束 / 截止日期 / register by / registration deadline / submission deadline / apply by
- starts_at: 「比赛开始」时间。识别关键词: 比赛开始 / 开赛 / 开始日期 / starts / event starts / hackathon begins / kickoff
- ends_at: 「比赛结束」时间。识别关键词: 比赛结束 / 结束日期 / 闭幕 / ends / event ends / final day / demo day

中文日期解析示例:
- "2025年9月30日24时" → deadline=2025-09-30
- "报名开始日期为2025年5月22日, 报名截止日期为2025年6月13日" → deadline=2025-06-13
- "5月22日 至 6月13日" 在「报名」语境 → deadline=06-13; 在「比赛」语境 → starts_at=05-22, ends_at=06-13
- 只写「2025-09-30」无上下文, 默认当作 deadline

其他规则:
- url 必须是完整 https:// 链接
- 找不到的日期填 null, 不要瞎编, 但要尽力从正文里找
- 不要只挑「中文」的, 英文比赛也保留
- 跳过纯会议/课程/招聘/广告
- 一次最多 12 条, 信息差不多的去重
来源: ${source}`,
        prompt: `下面是 ${snippets.length} 条搜索结果, 把里面的黑客松全提出来, 务必尽力提取报名截止/比赛开始/比赛结束三个日期:\n\n${corpus}`,
      });
      return { data: object };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  return { data: { hackathons: [] }, error: lastErr };
}

// ------- Scan & store -------
export interface HackathonSource {
  name: string;
  query: string;
  enabled: boolean;
}
export interface HackathonSettings {
  enabled: boolean;
  sources: HackathonSource[];
  scan_interval_hours: number;
  last_scanned_at: string | null;
}

const DEFAULT_SOURCES: HackathonSource[] = [
  { name: "Devpost", query: "devpost hackathon register open", enabled: true },
  { name: "Devpost", query: "site:devpost.com hackathon", enabled: true },
  { name: "MLH", query: "mlh.io hackathon season", enabled: true },
  { name: "DoraHacks", query: "dorahacks hackathon 报名", enabled: true },
  { name: "DoraHacks", query: "site:dorahacks.io hackathon", enabled: true },
  { name: "ETHGlobal", query: "ethglobal hackathon upcoming", enabled: true },
  { name: "小红书", query: "小红书 黑客松 报名", enabled: true },
  { name: "稀土掘金", query: "掘金 黑客松 2025 OR 2026", enabled: true },
  { name: "微信公众号", query: "黑客松 报名 截止", enabled: true },
];

async function loadSettings(): Promise<HackathonSettings> {
  const { data } = await supabaseAdmin
    .from("hackathon_settings" as never)
    .select("*")
    .eq("id", "singleton")
    .maybeSingle();
  const row = data as unknown as {
    enabled?: boolean;
    sources?: unknown;
    scan_interval_hours?: number;
    last_scanned_at?: string | null;
  } | null;
  if (!row) {
    return { enabled: true, sources: DEFAULT_SOURCES, scan_interval_hours: 24, last_scanned_at: null };
  }
  const raw = row.sources;
  const sources = Array.isArray(raw) && raw.length > 0
    ? (raw as HackathonSource[]).filter((s) => s && s.name && s.query)
    : DEFAULT_SOURCES;
  return {
    enabled: row.enabled ?? true,
    sources,
    scan_interval_hours: row.scan_interval_hours ?? 24,
    last_scanned_at: row.last_scanned_at ?? null,
  };
}

export const getHackathonSettings = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const settings = await loadSettings();
    return { ok: true as const, settings };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e), settings: null as HackathonSettings | null };
  }
});

const SourceSchema = z.object({
  name: z.string().min(1).max(80),
  query: z.string().min(1).max(300),
  enabled: z.boolean(),
});
const UpdateHackathonSchema = z.object({
  enabled: z.boolean().optional(),
  sources: z.array(SourceSchema).max(40).optional(),
  scan_interval_hours: z.number().int().min(1).max(168).optional(),
});

export const updateHackathonSettings = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateHackathonSchema.parse(d))
  .handler(async ({ data }) => {
    const current = await loadSettings();
    const next = {
      id: "singleton",
      enabled: data.enabled ?? current.enabled,
      sources: data.sources ?? current.sources,
      scan_interval_hours: data.scan_interval_hours ?? current.scan_interval_hours,
    };
    const { error } = await supabaseAdmin
      .from("hackathon_settings" as never)
      .upsert(next as never, { onConflict: "id" });
    if (error) return { ok: false as const, error: error.message };
    return {
      ok: true as const,
      settings: { ...next, last_scanned_at: current.last_scanned_at } as HackathonSettings,
    };
  });

export const scanHackathonsNow = createServerFn({ method: "GET" }).handler(async () => {
  const settings = await loadSettings();
  const sources = settings.sources.filter((s) => s.enabled).slice(0, 5);
  const allFound: Array<{ source: string; item: z.infer<typeof ExtractedSchema>["hackathons"][number] }> = [];
  const debug: Array<{ source: string; query: string; snippets: number; extracted: number; error?: string }> = [];

  for (const src of sources) {
    const snippets = await firecrawlSearch(src.query, 6);
    if (snippets.length === 0) {
      debug.push({ source: src.name, query: src.query, snippets: 0, extracted: 0, error: "firecrawl 0 结果" });
      continue;
    }
    // 总是优先用 AI 提取(能从 markdown 里抠出真实的报名截止/比赛开始/比赛结束时间)
    // AI 失败/超时, 才退回只有标题/链接的关键词兜底
    const aiResult = await withTimeout(
      extractWithAI(src.name, snippets),
      20_000,
      { data: { hackathons: [] }, error: "AI 提取超时" },
    );
    let ex = aiResult.data;
    let error = aiResult.error;
    if (ex.hackathons.length === 0) {
      const fb = fallbackHackathons(src.name, snippets);
      if (fb.length > 0) {
        ex = { hackathons: fb };
        error = error ?? "AI 0 条, 用关键词兜底";
      }
    }
    debug.push({ source: src.name, query: src.query, snippets: snippets.length, extracted: ex.hackathons.length, error });
    for (const h of ex.hackathons) {
      if (!h.url?.startsWith("http")) continue;
      const normalized = normalizeHackathonDates(h);
      if (!isActionableHackathon(normalized)) continue;
      allFound.push({ source: src.name, item: normalized });
    }
  }

  // Dedupe by url (keep first)
  const byUrl = new Map<string, (typeof allFound)[number]>();
  for (const f of allFound) {
    if (!byUrl.has(f.item.url)) byUrl.set(f.item.url, f);
  }

  let inserted = 0;
  const insertErrors: string[] = [];
  for (const { source, item } of byUrl.values()) {
    const { data: row, error } = await supabaseAdmin
      .from("hackathons")
      .upsert(
        {
          source,
          url: item.url,
          title: item.title,
          deadline: item.deadline,
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          location: item.location,
          prize: item.prize,
          summary: item.summary,
          tags: item.tags ?? [],
          status: "pending",
          raw: item,
        },
        { onConflict: "url", ignoreDuplicates: true },
      )
      .select("*")
      .maybeSingle();
    if (error) {
      insertErrors.push(`${item.url}: ${error.message}`);
      continue;
    }
    if (row) {
      inserted += 1;
      void notifyHackathonDiscovered({
        id: (row as any).id,
        title: (row as any).title,
        source: (row as any).source,
        summary: (row as any).summary,
        deadline: (row as any).deadline,
        starts_at: (row as any).starts_at,
        location: (row as any).location,
        prize: (row as any).prize,
        url: (row as any).url,
      }).catch(() => {});
    }
  }

  await supabaseAdmin
    .from("hackathon_settings" as never)
    .upsert({ id: "singleton", last_scanned_at: new Date().toISOString(), last_scan_result: { scanned: allFound.length, deduped: byUrl.size, inserted, debug } } as never, { onConflict: "id" });

  return {
    ok: true as const,
    scanned: allFound.length,
    deduped: byUrl.size,
    inserted,
    debug,
    insertErrors,
  };
});

// ------- List / decide -------
export const listPendingHackathons = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("status", "pending")
    .order("discovered_at", { ascending: false })
    .limit(60);
  if (error) return { ok: false as const, error: error.message, items: [] as HackathonRow[] };

  const staleIds: string[] = [];
  const items = ((data ?? []) as HackathonRow[])
    .map((h) => normalizeHackathonDates(h))
    .filter((h) => {
      const keep = isActionableHackathon(h);
      if (!keep) staleIds.push(h.id);
      return keep;
    })
    .slice(0, 30);

  if (staleIds.length > 0) {
    void supabaseAdmin
      .from("hackathons")
      .update({ status: "dismissed", decided_at: new Date().toISOString() })
      .in("id", staleIds)
      .then(() => undefined);
  }
  return { ok: true as const, items };
});

export const dismissHackathon = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("hackathons")
      .update({ status: "dismissed", decided_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const acceptHackathon = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("hackathons")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) return { ok: false as const, error: error?.message ?? "未找到" };

    await supabaseAdmin
      .from("hackathons")
      .update({ status: "accepted", decided_at: new Date().toISOString() })
      .eq("id", data.id);

    // Convert to plan items
    const items: Array<{
      type: "event" | "todo" | "reminder";
      title: string;
      date: string;
      time?: string;
      durationMin?: number;
      tag: "工作" | "学习" | "健康" | "生活" | "英语" | "习惯";
      note?: string;
    }> = [];

    // try parse date
    const parseDate = (s: string | null): string | null => {
      if (!s) return null;
      const m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (!m) return null;
      return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    };
    const startDate = parseDate(row.starts_at) ?? parseDate(row.deadline);
    const endDate = parseDate((row as any).ends_at);
    const deadlineDate = parseDate(row.deadline);
    const today = new Date().toISOString().slice(0, 10);

    if (deadlineDate) {
      items.push({
        type: "reminder",
        title: `⏰ 报名截止: ${row.title}`,
        date: deadlineDate,
        time: "20:00",
        tag: "工作",
        note: row.url ?? undefined,
      });
    }
    if (startDate) {
      items.push({
        type: "event",
        title: `🏆 ${row.title}${endDate && endDate !== startDate ? " (开赛)" : ""}`,
        date: startDate,
        time: "10:00",
        durationMin: 240,
        tag: "工作",
        note: row.summary ?? row.url ?? undefined,
      });
    }
    if (endDate && endDate !== startDate) {
      items.push({
        type: "event",
        title: `🏁 ${row.title} (结束/提交)`,
        date: endDate,
        time: "18:00",
        durationMin: 120,
        tag: "工作",
        note: row.url ?? undefined,
      });
    }
    items.push({
      type: "todo",
      title: `准备 ${row.title} 项目 idea & 组队`,
      date: today,
      tag: "工作",
      note: row.url ?? undefined,
    });

    // 推一张「已加入日程」的飞书卡片
    void notifyHackathonAccepted({
      id: (row as any).id,
      title: (row as any).title,
      source: (row as any).source,
      summary: (row as any).summary,
      deadline: (row as any).deadline,
      starts_at: (row as any).starts_at,
      location: (row as any).location,
      prize: (row as any).prize,
      url: (row as any).url,
    }).catch(() => {});

    return { ok: true as const, items, hackathon: row as HackathonRow };
  });
