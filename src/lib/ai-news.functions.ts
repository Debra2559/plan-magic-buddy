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

const DEFAULT_SOURCES: Array<{ name: string; query: string; enabled: boolean }> = [
  { name: "Hacker News", query: "site:news.ycombinator.com AI OR LLM OR agent", enabled: true },
  { name: "TechCrunch", query: "site:techcrunch.com AI OR OpenAI OR Anthropic OR Google DeepMind", enabled: true },
  { name: "The Verge", query: "site:theverge.com AI model release", enabled: true },
  { name: "arXiv", query: "site:arxiv.org large language model OR agent OR reasoning", enabled: true },
  { name: "机器之心", query: "site:jiqizhixin.com AI 大模型", enabled: true },
  { name: "量子位", query: "site:qbitai.com AI 大模型 发布", enabled: true },
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

    const activeSources = settings.sources.filter((s) => s.enabled);
    const allFound: Array<{ source: string; item: z.infer<typeof ExtractedSchema>["news"][number] }> = [];

    for (const src of activeSources) {
      const snippets = await firecrawlSearch(src.query, settings.per_source_limit, settings.time_window);
      if (snippets.length === 0) continue;
      const { news } = await extractWithAI(src.name, snippets);
      for (const n of news) {
        if (!n.url?.startsWith("http")) continue;
        const blob = `${n.title}\n${n.summary}\n${(n.tags ?? []).join(" ")}`;
        if (!matchesFilters(blob, n.tags ?? [], settings)) continue;
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

    const result = { scanned: allFound.length, deduped: byUrl.size, inserted };
    await supabaseAdmin
      .from("ai_news_settings")
      .upsert({ id: "singleton", last_scanned_at: new Date().toISOString(), last_scan_result: result });

    return { ok: true as const, ...result };
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
