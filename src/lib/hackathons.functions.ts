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
  location: string | null;
  prize: string | null;
  summary: string | null;
  tags: string[];
  status: "pending" | "accepted" | "dismissed";
  discovered_at: string;
}

// ------- Firecrawl helpers -------
type FirecrawlSearchItem = { url?: string; title?: string; description?: string; markdown?: string };

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
        deadline: z.string().nullable().describe("报名截止或比赛结束日期 (YYYY-MM-DD 或简述)"),
        starts_at: z.string().nullable().describe("开始日期 (YYYY-MM-DD 或简述)"),
        location: z.string().nullable().describe("线上 / 城市 / 混合"),
        prize: z.string().nullable().describe("奖金/奖品概述, 一句话"),
        summary: z.string().describe("一句中文简介, 不超过 60 字"),
        tags: z.array(z.string()).describe("3-5 个主题标签, 比如 AI、Web3、Education"),
      }),
    )
    .max(15),
});

async function extractWithAI(
  source: string,
  snippets: FirecrawlSearchItem[],
): Promise<{ data: z.infer<typeof ExtractedSchema>; error?: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { data: { hackathons: [] }, error: "LOVABLE_API_KEY 未配置" };
  if (snippets.length === 0) return { data: { hackathons: [] } };

  const corpus = snippets
    .map((s, i) => `[${i + 1}] ${s.title ?? ""}\nURL: ${s.url ?? ""}\n${(s.markdown ?? s.description ?? "").slice(0, 800)}`)
    .join("\n\n---\n\n");

  const now = new Date();
  const ym = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`;
  const todayStr = now.toISOString().slice(0, 10);

  const gateway = createLovableAiGatewayProvider(apiKey);
  const models = ["google/gemini-3-flash-preview", "google/gemini-2.5-flash"] as const;
  let lastErr = "";
  for (const m of models) {
    try {
      const { object } = await generateObject({
        model: gateway(m),
        schema: ExtractedSchema,
        system: `你是黑客松信息提取器。从搜索结果里挑出所有看起来像黑客松/编程比赛/创新比赛的条目。
当前是 ${ym} (today=${todayStr})。要求:
- 只要 url 是完整 https:// 链接, 都尽量保留, 不要因为信息不全而丢弃
- 如果不确定截止日期, 字段填 null 就行, 不要因此丢掉条目
- 不要只挑「中文」的, 英文比赛也保留
- 跳过纯会议/课程/招聘/广告
- 一次最多 12 条, 信息差不多的去重
来源: ${source}`,
        prompt: `下面是 ${snippets.length} 条搜索结果, 把里面的黑客松全提出来:\n\n${corpus}`,
      });
      return { data: object };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  return { data: { hackathons: [] }, error: lastErr };
}

// ------- Scan & store -------
const SOURCES: Array<{ name: string; query: string }> = [
  { name: "Devpost", query: "devpost hackathon register open" },
  { name: "Devpost", query: "site:devpost.com hackathon" },
  { name: "MLH", query: "mlh.io hackathon season" },
  { name: "DoraHacks", query: "dorahacks hackathon 报名" },
  { name: "DoraHacks", query: "site:dorahacks.io hackathon" },
  { name: "ETHGlobal", query: "ethglobal hackathon upcoming" },
  { name: "小红书", query: "小红书 黑客松 报名" },
  { name: "稀土掘金", query: "掘金 黑客松 2025 OR 2026" },
  { name: "微信公众号", query: "黑客松 报名 截止" },
];

export const scanHackathonsNow = createServerFn({ method: "GET" }).handler(async () => {
  const allFound: Array<{ source: string; item: z.infer<typeof ExtractedSchema>["hackathons"][number] }> = [];
  const debug: Array<{ source: string; query: string; snippets: number; extracted: number; error?: string }> = [];

  for (const src of SOURCES) {
    const snippets = await firecrawlSearch(src.query, 8);
    if (snippets.length === 0) {
      debug.push({ source: src.name, query: src.query, snippets: 0, extracted: 0, error: "firecrawl 0 结果" });
      continue;
    }
    const { data: ex, error } = await extractWithAI(src.name, snippets);
    debug.push({ source: src.name, query: src.query, snippets: snippets.length, extracted: ex.hackathons.length, error });
    for (const h of ex.hackathons) {
      if (!h.url?.startsWith("http")) continue;
      allFound.push({ source: src.name, item: h });
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
    .limit(20);
  if (error) return { ok: false as const, error: error.message, items: [] as HackathonRow[] };
  return { ok: true as const, items: (data ?? []) as HackathonRow[] };
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
        title: `🏆 ${row.title}`,
        date: startDate,
        time: "10:00",
        durationMin: 240,
        tag: "工作",
        note: row.summary ?? row.url ?? undefined,
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
