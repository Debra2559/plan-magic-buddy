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

async function extractWithAI(source: string, snippets: FirecrawlSearchItem[]): Promise<z.infer<typeof ExtractedSchema>> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || snippets.length === 0) return { hackathons: [] };

  const corpus = snippets
    .map((s, i) => `[${i + 1}] ${s.title ?? ""}\nURL: ${s.url ?? ""}\n${(s.markdown ?? s.description ?? "").slice(0, 800)}`)
    .join("\n\n---\n\n");

  const gateway = createLovableAiGatewayProvider(apiKey);
  try {
    const { object } = await generateObject({
      model: gateway("google/gemini-3-flash-preview"),
      schema: ExtractedSchema,
      system: `你是一个黑客松信息提取器。从搜索结果中提取「正在或即将进行报名」的黑客松/比赛。
当前是 2026 年 5 月。只保留:
- 真正的黑客松/编程比赛/创新比赛 (不要会议/课程/招聘)
- url 必须是完整 https:// 链接 (不要相对路径)
- 截止日期晚于 2026-05-01 (无法判断也保留)
来源: ${source}`,
      prompt: `从下面 ${snippets.length} 条搜索结果中提取黑客松, 去重并补全字段:\n\n${corpus}`,
    });
    return object;
  } catch {
    return { hackathons: [] };
  }
}

// ------- Scan & store -------
const SOURCES: Array<{ name: string; query: string }> = [
  { name: "Devpost", query: "site:devpost.com hackathon 2026 register" },
  { name: "MLH", query: "site:mlh.io 2026 hackathon season" },
  { name: "DoraHacks", query: "site:dorahacks.io hackathon 2026 报名" },
  { name: "小红书", query: "小红书 黑客松 2026 报名" },
  { name: "稀土掘金", query: "site:juejin.cn 黑客松 2026" },
];

export const scanHackathonsNow = createServerFn({ method: "POST" }).handler(async () => {
  const allFound: Array<{ source: string; item: z.infer<typeof ExtractedSchema>["hackathons"][number] }> = [];

  for (const src of SOURCES) {
    const snippets = await firecrawlSearch(src.query, 6);
    if (snippets.length === 0) continue;
    const { hackathons } = await extractWithAI(src.name, snippets);
    for (const h of hackathons) {
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
  for (const { source, item } of byUrl.values()) {
    const { data: row, error } = await supabaseAdmin
      .from("hackathons")
      .insert({
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
      })
      .select("*")
      .maybeSingle();
    // unique violation = already seen; ignore
    if (!error && row) {
      inserted += 1;
      // 发现新比赛 → 飞书推送（失败不影响主流程）
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

  return { ok: true as const, scanned: allFound.length, deduped: byUrl.size, inserted };
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

    return { ok: true as const, items, hackathon: row as HackathonRow };
  });
