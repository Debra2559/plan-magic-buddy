import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "./ai-gateway";

export interface AiNewsRow {
  id: string;
  source: string;
  url: string;
  title: string;
  published_at: string | null;
  summary: string | null;
  tags: string[];
  status: "pending" | "saved" | "dismissed";
  discovered_at: string;
}

type FirecrawlSearchItem = { url?: string; title?: string; description?: string; markdown?: string };

async function firecrawlSearch(query: string, limit = 8, tbs = "qdr:w"): Promise<FirecrawlSearchItem[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit, tbs, scrapeOptions: { formats: ["markdown"] } }),
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

const ExtractedSchema = z.object({
  news: z
    .array(
      z.object({
        title: z.string().describe("新闻标题, 中文优先, 若原文是英文可意译"),
        url: z.string().describe("文章链接, 必须完整 https://"),
        published_at: z.string().nullable().describe("发布日期 YYYY-MM-DD, 不确定填 null"),
        summary: z.string().describe("一句中文摘要, 60 字内, 说清楚『发生了什么 + 为什么重要』"),
        tags: z.array(z.string()).describe("3-5 个标签, 如 模型发布、Agent、推理、开源、融资、产品、研究"),
      }),
    )
    .max(15),
});

async function extractWithAI(source: string, snippets: FirecrawlSearchItem[]) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || snippets.length === 0) return { news: [] };

  const corpus = snippets
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title ?? ""}\nURL: ${s.url ?? ""}\n${(s.markdown ?? s.description ?? "").slice(0, 1000)}`,
    )
    .join("\n\n---\n\n");

  const gateway = createLovableAiGatewayProvider(apiKey);
  try {
    const { object } = await generateObject({
      model: gateway("google/gemini-3-flash-preview"),
      schema: ExtractedSchema,
      system: `你是一名 AI 行业新闻编辑。从搜索结果里提取「最近一周」真正重要的 AI 动态。
当前是 2026 年 5 月。只保留:
- 模型发布 / 重大更新 / Agent 进展 / 研究突破 / 重要融资 / 行业大事
- url 必须是完整 https:// 链接
- 跳过纯营销、招聘、教程、广告软文
来源: ${source}`,
      prompt: `从下面 ${snippets.length} 条搜索结果中提取 AI 新闻, 去重并补全字段:\n\n${corpus}`,
    });
    return object;
  } catch {
    return { news: [] };
  }
}

const SOURCES: Array<{ name: string; query: string }> = [
  { name: "Hacker News", query: "site:news.ycombinator.com AI OR LLM OR agent" },
  { name: "TechCrunch", query: "site:techcrunch.com AI OR OpenAI OR Anthropic OR Google DeepMind" },
  { name: "The Verge", query: "site:theverge.com AI model release" },
  { name: "arXiv", query: "site:arxiv.org large language model OR agent OR reasoning" },
  { name: "机器之心", query: "site:jiqizhixin.com AI 大模型" },
  { name: "量子位", query: "site:qbitai.com AI 大模型 发布" },
];

export const scanAiNewsNow = createServerFn({ method: "GET" }).handler(async () => {
  const allFound: Array<{ source: string; item: z.infer<typeof ExtractedSchema>["news"][number] }> = [];

  for (const src of SOURCES) {
    const snippets = await firecrawlSearch(src.query, 6, "qdr:w");
    if (snippets.length === 0) continue;
    const { news } = await extractWithAI(src.name, snippets);
    for (const n of news) {
      if (!n.url?.startsWith("http")) continue;
      allFound.push({ source: src.name, item: n });
    }
  }

  const byUrl = new Map<string, (typeof allFound)[number]>();
  for (const f of allFound) if (!byUrl.has(f.item.url)) byUrl.set(f.item.url, f);

  let inserted = 0;
  for (const { source, item } of byUrl.values()) {
    const { data: row, error } = await supabaseAdmin
      .from("ai_news")
      .insert({
        source,
        url: item.url,
        title: item.title,
        published_at: item.published_at,
        summary: item.summary,
        tags: item.tags ?? [],
        status: "pending",
        raw: item,
      })
      .select("*")
      .maybeSingle();
    if (!error && row) inserted += 1;
  }

  return { ok: true as const, scanned: allFound.length, deduped: byUrl.size, inserted };
});

export const listPendingAiNews = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("ai_news")
    .select("*")
    .eq("status", "pending")
    .order("discovered_at", { ascending: false })
    .limit(30);
  if (error) return { ok: false as const, error: error.message, items: [] as AiNewsRow[] };
  return { ok: true as const, items: (data ?? []) as AiNewsRow[] };
});

export const dismissAiNews = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("ai_news")
      .update({ status: "dismissed", decided_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const saveAiNews = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("ai_news")
      .update({ status: "saved", decided_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
