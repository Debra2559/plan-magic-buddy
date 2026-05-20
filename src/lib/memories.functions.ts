import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "./ai-gateway";

// ---------- 类型与 Schema ----------

export const MEMORY_KINDS = ["fact", "preference", "relation", "goal", "routine", "other"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_STATUSES = ["pending", "active", "archived"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export type Memory = {
  id: string;
  user_id: string;
  content: string;
  kind: MemoryKind;
  source: string;
  status: MemoryStatus;
  pinned: boolean;
  importance: number;
  tags: string[];
  context: string;
  source_ref: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- 公共 helper：给 system prompt 拼接当前记忆块 ----------

/**
 * 根据用户 id 取出最重要的活跃记忆，拼成可注入到 system prompt 的纯文本块。
 * 限制：最多 N 条 + 总字符数限制，避免 prompt 过长。
 */
export async function fetchMemoryBlockForUser(userId: string, max = 18): Promise<string> {
  if (!userId) return "";
  try {
    const { data } = await supabaseAdmin
      .from("ai_memories")
      .select("content,kind,pinned,importance")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("pinned", { ascending: false })
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(max);
    return formatMemoryBlock((data ?? []) as Pick<Memory, "content" | "kind" | "pinned" | "importance">[]);
  } catch {
    return "";
  }
}

export function formatMemoryBlock(
  rows: Pick<Memory, "content" | "kind" | "pinned" | "importance">[],
): string {
  if (!rows.length) return "";
  const lines = rows.map((m) => {
    const mark = m.pinned ? "★" : "·";
    const tag = labelOfKind(m.kind);
    return `${mark} [${tag}] ${m.content.trim()}`;
  });
  return [
    "【关于用户的长期记忆】（来自用户授权的记忆库，回应时请自然地考虑这些事实，不要原样背诵，更不要主动提"记忆"二字）：",
    ...lines,
  ].join("\n");
}

export function labelOfKind(k: string): string {
  switch (k) {
    case "fact": return "事实";
    case "preference": return "偏好";
    case "relation": return "关系";
    case "goal": return "目标";
    case "routine": return "习惯";
    default: return "其它";
  }
}

// ---------- CRUD（用户态） ----------

const UpsertInput = z.object({
  id: z.string().uuid().optional(),
  content: z.string().min(1).max(1000),
  kind: z.enum(MEMORY_KINDS).default("fact"),
  status: z.enum(MEMORY_STATUSES).default("active"),
  pinned: z.boolean().default(false),
  importance: z.number().int().min(1).max(5).default(3),
  tags: z.array(z.string().min(1).max(40)).max(10).default([]),
  context: z.string().max(2000).default(""),
  source: z.string().max(40).default("manual"),
  source_ref: z.string().max(120).nullable().optional(),
});

export const listMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(MEMORY_STATUSES).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("ai_memories")
      .select("*")
      .order("pinned", { ascending: false })
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { memories: (rows ?? []) as Memory[] };
  });

export const upsertMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = { ...data, user_id: userId };
    const { data: row, error } = await supabase
      .from("ai_memories")
      .upsert(payload as any, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { memory: row as Memory };
  });

export const setMemoryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(MEMORY_STATUSES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("ai_memories")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setMemoryPinned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), pinned: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("ai_memories")
      .update({ pinned: data.pinned })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("ai_memories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- AI 提取候选记忆 ----------

const CandidateSchema = z.object({
  content: z.string().min(4).max(200).describe("第一人称、客观、简洁的一句话事实/偏好/关系/目标"),
  kind: z.enum(MEMORY_KINDS).describe("分类"),
  importance: z.number().int().min(1).max(5).default(3),
  tags: z.array(z.string().min(1).max(20)).max(5).default([]),
});
const Candidates = z.object({ items: z.array(CandidateSchema).max(8) });

export const extractMemoryCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        lookbackDays: z.number().int().min(1).max(30).default(7),
        extraText: z.string().max(8000).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI 服务未配置 (LOVABLE_API_KEY 缺失)" };

    const { supabase, userId } = context;
    const since = new Date(Date.now() - data.lookbackDays * 86400_000).toISOString();

    const [notesRes, diaryRes, existingRes] = await Promise.all([
      supabase
        .from("notes")
        .select("text,mood,tags,created_at")
        .gte("created_at", since)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("diary_entries")
        .select("date,content,mood")
        .order("date", { ascending: false })
        .limit(10),
      supabase
        .from("ai_memories")
        .select("content")
        .in("status", ["active", "pending"])
        .limit(80),
    ]);

    const notesText = (notesRes.data ?? [])
      .map((n: any) => `- (${n.mood ?? ""}) ${String(n.text ?? "").slice(0, 300)}`)
      .join("\n");
    const diaryText = (diaryRes.data ?? [])
      .map((d: any) => `[${d.date}] ${String(d.content ?? "").slice(0, 400)}`)
      .join("\n");
    const existingList = (existingRes.data ?? []).map((m: any) => `- ${m.content}`).join("\n");

    const corpus = [
      data.extraText ? `【补充文本】\n${data.extraText}` : "",
      notesText ? `【最近 ${data.lookbackDays} 天的随手记】\n${notesText}` : "",
      diaryText ? `【最近的日记】\n${diaryText}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!corpus.trim()) return { ok: true as const, inserted: 0, message: "最近没有可提取的素材" };

    const gateway = createLovableAiGatewayProvider(apiKey);
    let items: z.infer<typeof CandidateSchema>[] = [];
    try {
      const { object } = await generateObject({
        model: gateway("google/gemini-2.5-flash"),
        schema: Candidates,
        system: `你是一个为「私人 AI 助理」维护长期记忆的助手。
任务：从用户最近的随手记 / 日记 / 自述文本中，提取出对未来对话「值得长期记住」的关键事实、偏好、关系、目标、习惯。
要求：
- 每条用第一人称客观陈述，例如「我喜欢喝燕麦拿铁、不加糖」「我有一只叫毛豆的橘猫」「我目标在 6 月前完成产品答辩」。
- 跳过情绪宣泄、一次性事件、明显短期的内容（如今天加班、刚吃完饭）。
- 不要重复或与「已存在记忆」语义相同的条目。
- 重要度 1-5：1=日常琐事；3=长期相关；5=家人/重大目标/强烈偏好。
- 最多 6 条；没有合适的就返回空数组。`,
        prompt: `已存在的记忆（不要重复）：
${existingList || "(暂无)"}

待分析的原始素材：
${corpus}`,
      });
      items = object.items ?? [];
    } catch (e: any) {
      const msg = e?.message ?? "unknown";
      if (msg.includes("429")) return { ok: false as const, error: "请求过于频繁, 稍后再试" };
      if (msg.includes("402")) return { ok: false as const, error: "AI 额度已用完, 请到工作区充值" };
      return { ok: false as const, error: `提取失败: ${msg}` };
    }

    if (!items.length) return { ok: true as const, inserted: 0, message: "本次没有提取到新的记忆候选" };

    // 简单去重：与现有内容字符串相等的直接跳过
    const existingSet = new Set((existingRes.data ?? []).map((m: any) => String(m.content).trim()));
    const rows = items
      .filter((c) => !existingSet.has(c.content.trim()))
      .map((c) => ({
        user_id: userId,
        content: c.content.trim(),
        kind: c.kind,
        status: "pending" as MemoryStatus,
        importance: c.importance ?? 3,
        tags: c.tags ?? [],
        source: "ai" as const,
        context: "",
      }));
    if (!rows.length) return { ok: true as const, inserted: 0, message: "提取到的内容已经在记忆库里了" };

    const { error: insErr } = await supabase.from("ai_memories").insert(rows as any);
    if (insErr) return { ok: false as const, error: insErr.message };
    return { ok: true as const, inserted: rows.length };
  });
