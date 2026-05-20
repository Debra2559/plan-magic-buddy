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

function isAiNewsSnippet(item: FirecrawlSearchItem): boolean {
  const text = `${item.title ?? ""}\n${item.description ?? ""}\n${item.markdown ?? ""}`.toLowerCase();
  return /\bai\b|artificial intelligence|llm|agent|openai|anthropic|deepmind|gemini|大模型|人工智能|机器学习|模型|推理/.test(text);
}

function fallbackNews(source: string, snippets: FirecrawlSearchItem[]): z.infer<typeof ExtractedSchema>["news"] {
  return snippets
    .filter((s) => s.url?.startsWith("http") && isAiNewsSnippet(s))
    .slice(0, 6)
    .map((s) => ({
      title: (s.title ?? source).trim().slice(0, 140),
      url: s.url!,
      published_at: null,
      summary: (s.description ?? s.markdown ?? "AI 行业动态").replace(/\s+/g, " ").trim().slice(0, 60),
      tags: ["AI", source].filter(Boolean).slice(0, 5),
    }));
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

async function extractWithAI(
  source: string,
  snippets: FirecrawlSearchItem[],
): Promise<{ data: z.infer<typeof ExtractedSchema>; error?: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { data: { news: [] }, error: "LOVABLE_API_KEY 未配置" };
  if (snippets.length === 0) return { data: { news: [] } };

  const corpus = snippets
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title ?? ""}\nURL: ${s.url ?? ""}\n${(s.markdown ?? s.description ?? "").slice(0, 1000)}`,
    )
    .join("\n\n---\n\n");

  const now = new Date();
  const ym = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`;

  const gateway = createLovableAiGatewayProvider(apiKey);
  const models = ["google/gemini-3-flash-preview", "google/gemini-2.5-flash"] as const;
  let lastErr = "";
  for (const m of models) {
    try {
      const { object } = await generateObject({
        model: gateway(m),
        schema: ExtractedSchema,
        system: `你是 AI 行业新闻编辑。从搜索结果里挑出和 AI/LLM/Agent/机器学习相关的条目。
当前是 ${ym}。要求:
- url 是完整 https:// 链接的都尽量保留, 不要因为信息不全就丢
- 不确定发布日期就填 null, 不要因此丢条目
- 跳过纯营销/招聘/广告/无关
- 一次最多 12 条, 同一话题去重
来源: ${source}`,
        prompt: `下面是 ${snippets.length} 条搜索结果, 提取相关 AI 新闻:\n\n${corpus}`,
      });
      return { data: object };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  return { data: { news: [] }, error: lastErr };
}

const DEFAULT_SOURCES: Array<{ name: string; query: string; enabled: boolean }> = [
  { name: "Hacker News", query: "hacker news AI OR LLM OR agent", enabled: true },
  { name: "TechCrunch", query: "techcrunch AI OpenAI Anthropic DeepMind", enabled: true },
  { name: "The Verge", query: "the verge AI model release", enabled: true },
  { name: "arXiv", query: "arxiv large language model agent reasoning", enabled: true },
  { name: "机器之心", query: "机器之心 AI 大模型", enabled: true },
  { name: "量子位", query: "量子位 AI 大模型 发布", enabled: true },
];

const SourceSchema = z.object({
  name: z.string().trim().min(1).max(40),
  query: z.string().trim().min(1).max(300),
  enabled: z.boolean(),
});

const SettingsSchema = z.object({
  enabled: z.boolean(),
  sources: z.array(SourceSchema).min(1).max(20),
  include_keywords: z.array(z.string().trim().min(1).max(40)).max(30),
  exclude_keywords: z.array(z.string().trim().min(1).max(40)).max(30),
  tag_filters: z.array(z.string().trim().min(1).max(30)).max(30),
  scan_interval_hours: z.number().int().min(1).max(168),
  time_window: z.enum(["qdr:h", "qdr:d", "qdr:w", "qdr:m", "qdr:y"]),
  per_source_limit: z.number().int().min(1).max(20),
});

export type AiNewsSettings = z.infer<typeof SettingsSchema> & {
  last_scanned_at: string | null;
};

const DEFAULT_SETTINGS: AiNewsSettings = {
  enabled: true,
  sources: DEFAULT_SOURCES,
  include_keywords: [],
  exclude_keywords: [],
  tag_filters: [],
  scan_interval_hours: 24,
  time_window: "qdr:w",
  per_source_limit: 6,
  last_scanned_at: null,
};

async function loadSettings(): Promise<AiNewsSettings> {
  const { data } = await supabaseAdmin
    .from("ai_news_settings")
    .select("*")
    .eq("id", "singleton")
    .maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    enabled: data.enabled ?? true,
    sources:
      Array.isArray(data.sources) && data.sources.length > 0
        ? (data.sources as unknown as AiNewsSettings["sources"])
        : DEFAULT_SOURCES,
    include_keywords: data.include_keywords ?? [],
    exclude_keywords: data.exclude_keywords ?? [],
    tag_filters: data.tag_filters ?? [],
    scan_interval_hours: data.scan_interval_hours ?? 24,
    time_window: (data.time_window ?? "qdr:w") as AiNewsSettings["time_window"],
    per_source_limit: data.per_source_limit ?? 6,
    last_scanned_at: data.last_scanned_at ?? null,
  };
}

function matchesFilters(
  text: string,
  tags: string[],
  s: AiNewsSettings,
): boolean {
  const lower = text.toLowerCase();
  const tagLower = tags.map((t) => t.toLowerCase());
  if (s.exclude_keywords.length > 0) {
    for (const k of s.exclude_keywords) {
      if (lower.includes(k.toLowerCase())) return false;
    }
  }
  if (s.include_keywords.length > 0) {
    const hit = s.include_keywords.some((k) => lower.includes(k.toLowerCase()));
    if (!hit) return false;
  }
  if (s.tag_filters.length > 0) {
    const hit = s.tag_filters.some((t) => tagLower.includes(t.toLowerCase()));
    if (!hit) return false;
  }
  return true;
}

export const getAiNewsSettings = createServerFn({ method: "GET" }).handler(async () => {
  const s = await loadSettings();
  return { ok: true as const, settings: s };
});

export const updateAiNewsSettings = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SettingsSchema.parse(d))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("ai_news_settings")
      .upsert({ id: "singleton", ...data, updated_at: new Date().toISOString() });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

const PromptParseSchema = z.object({
  enabled: z.boolean(),
  sources: z.array(SourceSchema).min(1).max(20),
  include_keywords: z.array(z.string().trim().min(1).max(40)).max(30),
  exclude_keywords: z.array(z.string().trim().min(1).max(40)).max(30),
  tag_filters: z.array(z.string().trim().min(1).max(30)).max(30),
  scan_interval_hours: z.number().int().min(1).max(168),
  time_window: z.enum(["qdr:h", "qdr:d", "qdr:w", "qdr:m", "qdr:y"]),
  per_source_limit: z.number().int().min(1).max(20),
});

export const parseRadarPrompt = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ prompt: z.string().min(2).max(4000) }).parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI 未配置" };
    const current = await loadSettings();
    const gateway = createLovableAiGatewayProvider(apiKey);
    try {
      const { object } = await generateObject({
        model: gateway("google/gemini-3-flash-preview"),
        schema: PromptParseSchema,
        system: `你是 AI 雷达的配置助手。把用户用自然语言写的「想关注什么」翻译成结构化的扫描配置。
规则：
- sources: 每条给一个简短中文/英文名称 + 一个 Google 搜索 query（可用 site: OR 等语法）。除非用户明确要重置，否则尽量在现有列表基础上增删改。
- include_keywords / exclude_keywords / tag_filters: 用户没提就保持原值。
- scan_interval_hours: 可选 1/3/6/12/24/48/168。
- time_window: "qdr:h" 1小时, "qdr:d" 1天, "qdr:w" 1周, "qdr:m" 1月, "qdr:y" 1年。
- per_source_limit: 1-20，默认 6。
- enabled: 用户没说就保持原值。
当前配置：${JSON.stringify(current, null, 2)}`,
        prompt: `用户描述：\n${data.prompt}\n\n请输出新的完整配置。`,
      });
      return { ok: true as const, settings: object };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const scanAiNewsNow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ force: z.boolean().optional() }).optional().parse(d) ?? {},
  )
  .handler(async ({ data }) => {
    const settings = await loadSettings();
    const force = data?.force === true;

    if (!settings.enabled && !force) {
      return { ok: true as const, skipped: "disabled", scanned: 0, deduped: 0, inserted: 0 };
    }
    if (!force && settings.last_scanned_at) {
      const last = new Date(settings.last_scanned_at).getTime();
      const minMs = settings.scan_interval_hours * 3600 * 1000;
      if (Date.now() - last < minMs) {
        return { ok: true as const, skipped: "interval", scanned: 0, deduped: 0, inserted: 0 };
      }
    }

    const activeSources = settings.sources.filter((s) => s.enabled).slice(0, 5);
    const allFound: Array<{ source: string; item: z.infer<typeof ExtractedSchema>["news"][number] }> = [];
    const debug: Array<{ source: string; query: string; snippets: number; extracted: number; kept: number; error?: string }> = [];

    for (const src of activeSources) {
      const snippets = await firecrawlSearch(src.query, Math.min(settings.per_source_limit, 6), settings.time_window);
      if (snippets.length === 0) {
        debug.push({ source: src.name, query: src.query, snippets: 0, extracted: 0, kept: 0, error: "firecrawl 0 结果" });
        continue;
      }
      const fallbackItems = fallbackNews(src.name, snippets);
      const { data: ex, error } = fallbackItems.length > 0
        ? { data: { news: fallbackItems }, error: undefined }
        : await withTimeout(extractWithAI(src.name, snippets), 3_000, { data: { news: [] }, error: "AI 提取超时" });
      let kept = 0;
      for (const n of ex.news) {
        if (!n.url?.startsWith("http")) continue;
        const blob = `${n.title}\n${n.summary}\n${(n.tags ?? []).join(" ")}`;
        if (!matchesFilters(blob, n.tags ?? [], settings)) continue;
        allFound.push({ source: src.name, item: n });
        kept += 1;
      }
      debug.push({ source: src.name, query: src.query, snippets: snippets.length, extracted: ex.news.length, kept, error });
    }

    const byUrl = new Map<string, (typeof allFound)[number]>();
    for (const f of allFound) if (!byUrl.has(f.item.url)) byUrl.set(f.item.url, f);

    let inserted = 0;
    const insertErrors: string[] = [];
    for (const { source, item } of byUrl.values()) {
      const { data: row, error } = await supabaseAdmin
        .from("ai_news")
        .upsert(
          {
            source,
            url: item.url,
            title: item.title,
            published_at: item.published_at,
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
      if (row) inserted += 1;
    }

    const result = { scanned: allFound.length, deduped: byUrl.size, inserted };
    await supabaseAdmin
      .from("ai_news_settings")
      .upsert({ id: "singleton", last_scanned_at: new Date().toISOString(), last_scan_result: result });

    return { ok: true as const, ...result, debug, insertErrors };
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
