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

async function firecrawlSearch(query: string, limit = 10, recency: "month" | "week" | "none" = "month"): Promise<FirecrawlSearchItem[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return [];
  const tbsMap = { month: "qdr:m", week: "qdr:w", none: undefined } as const;
  const tbs = tbsMap[recency];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        limit,
        ...(tbs ? { tbs } : {}),
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
      }),
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

// 对单个候选 URL 做深度抓取, 拿到完整正文用于精准提取报名截止时间
async function firecrawlScrape(url: string): Promise<FirecrawlSearchItem | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 1500 }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { markdown?: string; metadata?: { title?: string; description?: string } };
    };
    const d = data?.data;
    if (!d) return null;
    return { url, title: d.metadata?.title, description: d.metadata?.description, markdown: d.markdown };
  } catch {
    return null;
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
  // —— 国际平台 ——
  { name: "Devpost", query: "site:devpost.com hackathon 2025 OR 2026 register", enabled: true },
  { name: "MLH", query: "site:mlh.io hackathon season 2026", enabled: true },
  { name: "DoraHacks", query: "site:dorahacks.io hackathon ongoing", enabled: true },
  { name: "ETHGlobal", query: "site:ethglobal.com events hackathon", enabled: true },
  { name: "Devfolio", query: "site:devfolio.co hackathon", enabled: true },
  // —— 国内大厂 ——
  { name: "美团", query: "美团 黑客松 报名 2025 OR 2026", enabled: true },
  { name: "字节跳动", query: "字节跳动 OR ByteDance 黑客松 报名", enabled: true },
  { name: "腾讯", query: "腾讯 犀牛鸟 OR 黑客松 报名 2025 OR 2026", enabled: true },
  { name: "阿里", query: "阿里巴巴 OR 阿里云 天池 OR 黑客松 报名", enabled: true },
  { name: "华为", query: "华为 软件精英挑战赛 OR 开发者大赛 报名", enabled: true },
  { name: "百度", query: "百度 黑客松 OR 飞桨 大赛 报名", enabled: true },
  { name: "网易", query: "网易 黑客松 报名 2025 OR 2026", enabled: true },
  { name: "小红书", query: "小红书 REDtech OR 黑客松 报名", enabled: true },
  { name: "京东", query: "京东 黑客松 OR 开发者大赛 报名", enabled: true },
  // —— 中文社区聚合 ——
  { name: "稀土掘金", query: "site:juejin.cn 黑客松 报名 2025 OR 2026", enabled: true },
  { name: "InfoQ", query: "site:infoq.cn 黑客松 报名", enabled: true },
  { name: "AIGC 社区", query: "AIGC 黑客松 OR AI Agent 黑客松 报名", enabled: true },
  { name: "微信公众号", query: "黑客松 报名截止 2025 OR 2026", enabled: true },
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
  // 之前为了控制成本只跑前 5 个, 现在国内国外都要覆盖, 放宽到 14 个 (一次扫描预算可控)
  const sources = settings.sources.filter((s) => s.enabled).slice(0, 14);
  const allFound: Array<{ source: string; item: z.infer<typeof ExtractedSchema>["hackathons"][number] }> = [];
  const debug: Array<{ source: string; query: string; snippets: number; extracted: number; deepScraped?: number; error?: string }> = [];

  // 并发跑搜索, 单源失败不影响别的源
  const perSource = await Promise.all(
    sources.map(async (src) => {
      const snippets = await firecrawlSearch(src.query, 10, "month");
      return { src, snippets };
    }),
  );

  let deepScrapeBudget = 8; // 整次扫描最多 8 次深度抓取, 避免烧 Firecrawl 额度

  for (const { src, snippets } of perSource) {
    if (snippets.length === 0) {
      debug.push({ source: src.name, query: src.query, snippets: 0, extracted: 0, error: "firecrawl 0 结果" });
      continue;
    }
    const aiResult = await withTimeout(
      extractWithAI(src.name, snippets),
      22_000,
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

    // 深度抓取兜底: 对那些 AI 没提取到任何日期的候选, 直接 scrape 详情页再让 AI 看一遍
    let deepScraped = 0;
    const needsDeep = ex.hackathons.filter(
      (h) => h.url?.startsWith("http") && !h.deadline && !h.starts_at && !h.ends_at,
    );
    for (const h of needsDeep) {
      if (deepScrapeBudget <= 0) break;
      deepScrapeBudget -= 1;
      deepScraped += 1;
      const page = await firecrawlScrape(h.url);
      if (!page?.markdown) continue;
      const reExtract = await withTimeout(
        extractWithAI(src.name, [page]),
        15_000,
        { data: { hackathons: [] }, error: "深度提取超时" },
      );
      const better = reExtract.data.hackathons.find((x) => x.url === h.url) ?? reExtract.data.hackathons[0];
      if (better) {
        h.deadline = h.deadline ?? better.deadline;
        h.starts_at = h.starts_at ?? better.starts_at;
        h.ends_at = h.ends_at ?? better.ends_at;
        h.location = h.location ?? better.location;
        h.prize = h.prize ?? better.prize;
        if (!h.summary || h.summary.length < 10) h.summary = better.summary;
      }
    }

    debug.push({ source: src.name, query: src.query, snippets: snippets.length, extracted: ex.hackathons.length, deepScraped, error });
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

// ============================================================
// 🤖 AI 监控来源规划师 Agent
// 给一个主题 (例: 徒步 / 马拉松 / 飞盘 / Web3 黑客松),
// AI 自动判断: 该挑哪些来源 / 用什么搜索关键词 / 多久扫一次。
// ============================================================
const PlanSourcesInputSchema = z.object({
  topic: z.string().min(1).max(80),
  notes: z.string().max(500).optional(), // 用户的额外偏好补充
});

const PlannedSourceSchema = z.object({
  name: z.string().min(1).max(60).describe("数据源中文简称, 例: 中国马拉松官网 / 小红书 徒步话题"),
  query: z.string().min(1).max(280).describe("可直接喂给搜索引擎的查询, 善用 site: 操作符"),
  rationale: z.string().max(160).describe("一句话: 为什么选这个源, 它的更新质量怎么样"),
  enabled: z.boolean().default(true),
});

const SourcePlanSchema = z.object({
  topic: z.string(),
  summary: z.string().describe("100-200 字: 这个主题在网上的信息生态长什么样, 用户该期待什么"),
  update_rhythm: z.string().describe("一句话: 这类内容一般多久会有值得关注的新动态"),
  suggested_interval_hours: z.coerce.number().int().min(1).max(168).describe("建议扫描频率, 单位小时 (24/48/72/168)"),
  sources: z.array(PlannedSourceSchema).min(1).max(12),
  tips: z.array(z.string()).max(6).describe("3-6 条给用户的小贴士: 怎么用更高效, 该注意什么"),
});

export const planMonitoringSources = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PlanSourcesInputSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "LOVABLE_API_KEY 未配置", plan: null };

    // —— 1) 探路: 让 Firecrawl 用几个朴素 query 把主题在中文/英文圈的样子拉一下,
    //         给 AI 当现实参考, 避免凭空臆造来源。
    const probeQueries = [
      `${data.topic} 报名 平台 官方 推荐`,
      `${data.topic} 资讯 社区 site:zhihu.com OR site:xiaohongshu.com`,
      `${data.topic} 赛事 OR 活动 最新 2025 OR 2026`,
      `best ${data.topic} community platform site:reddit.com OR site:medium.com`,
    ];
    const probeResults = await Promise.all(
      probeQueries.slice(0, 2).map((q) => withTimeout(firecrawlSearch(q, 4, "month"), 5_000, [] as FirecrawlSearchItem[])),
    );
    const snippets = probeResults.flat().slice(0, 12);
    const corpus = snippets.length
      ? snippets
          .map(
            (s, i) =>
              `[${i + 1}] ${s.title ?? ""} | ${s.url ?? ""}\n${(s.description ?? s.markdown ?? "").replace(/\s+/g, " ").slice(0, 220)}`,
          )
          .join("\n\n")
      : "(本次探路没有抓到搜索结果, 完全靠你的先验知识规划)";

    const gateway = createLovableAiGatewayProvider(apiKey);
    const models = ["google/gemini-3-flash-preview", "google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"] as const;
    let lastErr = "";
    for (const m of models) {
      try {
        const { object } = await generateObject({
          model: gateway(m),
          schema: SourcePlanSchema,
          system: `你是一位「主题监控来源规划师」。用户告诉你一个想长期追踪的主题 (例: 徒步 / 马拉松 / 飞盘 / 户外露营 / AI Agent 论文 / Web3 黑客松 / 独立开发产品),
你要像做调研一样回答三个问题:

1) 该挑哪些数据源? 优先级:
   - 该主题的官方/权威平台 (例: 中国马拉松 → 中国田协 / 中国马拉松官网)
   - 该主题在国内的头部社区/聚合 (小红书话题 / 知乎专栏 / 微信公众号 / 垂直 App 站点)
   - 该主题在国外的头部社区 (Reddit subreddit / Medium tag / 官网博客)
   - 国内/国外都要覆盖, 但优先国内可访问的源
   - 不要全都塞同一个平台, 至少 4 种不同类型的源

2) 每个源用什么搜索关键词? 必须可以直接喂给搜索引擎:
   - 善用 site: 操作符锁定平台 (例: site:xiaohongshu.com 徒步 路线 推荐)
   - 加上「报名 / 最新 / 2025 OR 2026 / 攻略 / 测评」之类的时间/意图限定词
   - 不要太长, 6-15 个有效 token 最佳

3) 监控节奏? 根据这类内容更新有多频繁选择:
   - 24h: 资讯/快讯/赛事报名 (黑客松, 马拉松报名)
   - 72h: 攻略/经验/产品评测 (徒步路线, 装备测评)
   - 168h (一周): 深度长文/季度榜单 (年度路书)
   解释为什么。

参考资料 (本次探路的真实搜索片段, 仅供参考, 你可以无视并依赖自己的先验知识):
${corpus}

输出严格遵守 JSON schema, 不要客套话。`,
          prompt: `主题:「${data.topic}」${data.notes ? `\n用户补充偏好: ${data.notes}` : ""}\n\n请规划一套 6-10 条监控来源, 并给出建议扫描频率与小贴士。`,
        });
        return { ok: true as const, plan: object };
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }
    const topic = data.topic.trim();
    const fallbackPlan: z.infer<typeof SourcePlanSchema> = {
      topic,
      summary: `已为「${topic}」生成基础监控来源。AI 结构化输出暂时不可用，因此先采用覆盖官方信息、社区讨论、攻略经验和最新动态的通用搜索组合。`,
      update_rhythm: "建议每 72 小时扫描一次；如果是报名、赛事或强时效信息，可手动调到 24 小时。",
      suggested_interval_hours: 72,
      sources: [
        { name: `${topic} 官方/报名`, query: `${topic} 官方 报名 最新 2025 OR 2026`, rationale: "优先捕捉权威公告、报名入口和最新活动。", enabled: true },
        { name: `${topic} 小红书`, query: `site:xiaohongshu.com ${topic} 攻略 推荐 最新`, rationale: "适合发现真实体验、路线推荐和近期讨论。", enabled: true },
        { name: `${topic} 知乎`, query: `site:zhihu.com ${topic} 攻略 经验 推荐`, rationale: "适合收集长回答、避坑经验和系统化建议。", enabled: true },
        { name: `${topic} 微信/资讯`, query: `${topic} 最新 活动 攻略 公众号`, rationale: "补充中文资讯、活动预告和本地服务信息。", enabled: true },
        { name: `${topic} 社区动态`, query: `${topic} 讨论 社群 活动 最新`, rationale: "用于发现分散在社区里的短期机会和口碑变化。", enabled: true },
      ],
      tips: ["先用基础来源跑一轮，再删除噪声较多的来源。", "如果想追报名/活动，把扫描频率调到 24 小时。", "可在关键词里加入城市、年份或平台名来提高命中率。"],
    };
    console.warn(`[monitor-plan] AI schema failed, using fallback plan. Last error: ${lastErr}`);
    return { ok: true as const, plan: fallbackPlan };
  });
