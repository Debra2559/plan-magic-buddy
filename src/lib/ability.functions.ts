import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateObject } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "./ai-gateway";

// ---------- Static questionnaire ----------
export const ABILITY_QUESTIONS = [
  { id: "q1", text: "面对一周的工作，我会主动规划好每天的重点。", dim: "planning" },
  { id: "q2", text: "我能长时间专注于一件事而不被打断。", dim: "focus" },
  { id: "q3", text: "我会规律作息，关注饮食与运动。", dim: "health" },
  { id: "q4", text: "我喜欢尝试新点子、新工具、新方法。", dim: "creativity" },
  { id: "q5", text: "我享受与他人交流，并能主动维护关系。", dim: "social" },
  { id: "q6", text: "我经常会回顾、反思自己的状态与决策。", dim: "reflection" },
  { id: "q7", text: "未完成的任务会让我感到焦虑。", dim: "neuroticism" },
  { id: "q8", text: "我乐于接受新的观点和不同意见。", dim: "openness" },
  { id: "q9", text: "我做事有计划、守承诺，不轻易拖延。", dim: "conscientiousness" },
  { id: "q10", text: "在团队中我倾向于主动表达想法。", dim: "extraversion" },
  { id: "q11", text: "我会优先考虑别人的感受。", dim: "agreeableness" },
  { id: "q12", text: "面对压力，我能很快调整情绪。", dim: "neuroticism_inv" },
] as const;

// ---------- Schemas ----------
const AbilitiesSchema = z.object({
  planning: z.number().min(0).max(100),
  focus: z.number().min(0).max(100),
  health: z.number().min(0).max(100),
  creativity: z.number().min(0).max(100),
  social: z.number().min(0).max(100),
  reflection: z.number().min(0).max(100),
});
const PersonalitySchema = z.object({
  openness: z.number().min(0).max(100),
  conscientiousness: z.number().min(0).max(100),
  extraversion: z.number().min(0).max(100),
  agreeableness: z.number().min(0).max(100),
  neuroticism: z.number().min(0).max(100),
  summary: z.string().max(280),
});
const AnalysisSchema = z.object({
  abilities: AbilitiesSchema,
  personality: PersonalitySchema,
  strengths: z.array(z.string().max(20)).min(1).max(4),
  growth_areas: z.array(z.string().max(20)).min(1).max(4),
  tagline: z.string().max(40).describe("一句话画像描述"),
});

const PlanItemSchema = z.object({
  area: z.string().max(20),
  goal: z.string().max(60),
  actions: z.array(z.string().max(80)).min(2).max(5),
  cadence: z.string().max(30).describe("如：每周3次 / 每天15分钟"),
});
const PlanSchema = z.object({
  title: z.string().max(30),
  tagline: z.string().max(60),
  focus_areas: z.array(z.string().max(20)).min(1).max(3),
  items: z.array(PlanItemSchema).min(2).max(5),
});

// ---------- Helpers ----------
function todayStr(d = new Date()): string {
  const cn = new Date(d.getTime() + 8 * 3600_000);
  return cn.toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  return todayStr(new Date(Date.now() - n * 86400_000));
}

async function gatherActivity(userId: string, lookbackDays = 14) {
  const since = daysAgo(lookbackDays);
  const [schedule, notes, habits, diaries] = await Promise.all([
    supabaseAdmin.from("schedule_items").select("title,type,date,done,tag").eq("user_id", userId).is("deleted_at", null).gte("date", since).limit(120),
    supabaseAdmin.from("notes").select("text,mood,tags,created_at").eq("user_id", userId).is("deleted_at", null).gte("created_at", since).limit(40),
    supabaseAdmin.from("habits").select("name,emoji,history").eq("user_id", userId).is("deleted_at", null).limit(20),
    supabaseAdmin.from("diary_entries").select("date,content,mood").eq("user_id", userId).gte("date", since).limit(20),
  ]);
  const sch = schedule.data ?? [];
  const total = sch.length;
  const doneCount = sch.filter((s: any) => s.done).length;
  const completion = total > 0 ? Math.round((doneCount / total) * 100) : null;
  const habitStats = (habits.data ?? []).map((h: any) => {
    const hist: string[] = h.history ?? [];
    const last14 = hist.filter((d) => d >= since).length;
    return { name: h.name, last14days: last14 };
  });
  return {
    since,
    schedule_total: total,
    schedule_done: doneCount,
    completion_rate: completion,
    recent_notes: (notes.data ?? []).map((n: any) => ({ text: (n.text ?? "").slice(0, 120), mood: n.mood, tags: n.tags })),
    recent_diaries: diaries.data ?? [],
    habits: habitStats,
  };
}

// ---------- Server functions ----------

export const getMyAbilityProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: profile } = await supabase.from("user_ability_profiles").select("*").eq("user_id", userId).maybeSingle();
    const { data: plans } = await supabase.from("ability_plans").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
    const { data: assessments } = await supabase.from("ability_assessments").select("id,kind,created_at,result").eq("user_id", userId).order("created_at", { ascending: false }).limit(5);
    return { profile: profile ?? null, plans: plans ?? [], assessments: assessments ?? [], questions: ABILITY_QUESTIONS };
  });

export const submitAbilityAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      responses: z.record(z.string(), z.number().int().min(1).max(5)),
      kind: z.enum(["initial", "recheck"]).default("initial"),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context as any;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI 网关未配置");

    const gateway = createLovableAiGatewayProvider(apiKey);

    const qaPairs = ABILITY_QUESTIONS.map((q) => ({
      question: q.text,
      dimension: q.dim,
      score_1_to_5: data.responses[q.id] ?? 3,
    }));

    const { object } = await generateObject({
      model: gateway("google/gemini-2.5-flash"),
      schema: AnalysisSchema,
      system: `你是专业的能力测评分析师。基于用户对 12 道李克特量表题（1=非常不符合, 5=非常符合）的作答，输出 6 维能力分（planning 计划力, focus 专注力, health 健康力, creativity 创造力, social 社交力, reflection 反思力）与大五人格分（0-100），并给出 1-3 个优势、1-3 个成长方向，以及一句温度感的画像 tagline。所有分数尽量分散，不要全部集中在 50-60。`,
      prompt: `用户作答数据：\n${JSON.stringify(qaPairs, null, 0)}\n请基于每题的 dimension 与分数综合判断（如 neuroticism_inv 反向计分）。`,
    });

    // upsert profile
    const { error: upErr } = await supabaseAdmin.from("user_ability_profiles").upsert({
      user_id: userId,
      abilities: object.abilities as any,
      personality: object.personality as any,
      strengths: object.strengths,
      growth_areas: object.growth_areas,
      tagline: object.tagline,
      initial_done: true,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id" });
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin.from("ability_assessments").insert({
      user_id: userId,
      kind: data.kind,
      responses: data.responses as any,
      result: object as any,
    });

    return { ok: true, result: object };
  });

export const generateMyAbilityPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as any;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI 网关未配置");

    const { data: profile } = await supabaseAdmin.from("user_ability_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (!profile) throw new Error("请先完成能力测评");

    const activity = await gatherActivity(userId, 14);

    const gateway = createLovableAiGatewayProvider(apiKey);
    const { object } = await generateObject({
      model: gateway("google/gemini-2.5-flash"),
      schema: PlanSchema,
      system: `你是一位个人成长教练。基于用户的能力画像与最近 14 天的真实行为数据，制定一份「可执行、具体、轻量」的成长计划。聚焦 1-3 个成长领域；每个领域给 2-5 条具体动作；动作要符合用户当前能力水平（不要太激进）；明确节奏（每天/每周几次）。`,
      prompt: `用户画像：\n${JSON.stringify({ abilities: profile.abilities, personality: profile.personality, strengths: profile.strengths, growth_areas: profile.growth_areas, tagline: profile.tagline }, null, 0)}\n\n最近 14 天行为数据：\n${JSON.stringify(activity, null, 0)}`,
    });

    // archive previous active plans
    await supabaseAdmin.from("ability_plans").update({ status: "archived" }).eq("user_id", userId).eq("status", "active");

    const { data: inserted, error } = await supabaseAdmin.from("ability_plans").insert({
      user_id: userId,
      title: object.title,
      tagline: object.tagline,
      focus_areas: object.focus_areas,
      content: object.items as any,
      status: "active",
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { ok: true, plan: inserted };
  });

export const recomputeAbilityFromActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as any;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI 网关未配置");

    const { data: profile } = await supabaseAdmin.from("user_ability_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (!profile) throw new Error("请先完成能力测评");

    const activity = await gatherActivity(userId, 14);
    const gateway = createLovableAiGatewayProvider(apiKey);

    const AdjustSchema = z.object({
      abilities: AbilitiesSchema,
      personality: PersonalitySchema,
      delta_summary: z.string().max(200).describe("简述本次更新原因"),
    });

    const { object } = await generateObject({
      model: gateway("google/gemini-2.5-flash"),
      schema: AdjustSchema,
      system: `你需要在用户已有能力画像基础上，根据最近 14 天的真实表现进行小幅调整（每个维度变化 ≤ 10 分）。完成率高、习惯坚持好 → 提升 planning/focus/health；持续记录与反思 → 提升 reflection；新尝试多 → 提升 creativity；社交活动多 → 提升 social。保持画像稳定，不要剧烈波动。`,
      prompt: `当前画像：\n${JSON.stringify({ abilities: profile.abilities, personality: profile.personality }, null, 0)}\n最近 14 天数据：\n${JSON.stringify(activity, null, 0)}`,
    });

    await supabaseAdmin.from("user_ability_profiles").update({
      abilities: object.abilities as any,
      personality: object.personality as any,
      version: (profile.version ?? 1) + 1,
      updated_at: new Date().toISOString(),
    } as any).eq("user_id", userId);

    await supabaseAdmin.from("ability_assessments").insert({
      user_id: userId,
      kind: "auto",
      responses: { source: "activity_recompute" } as any,
      result: object as any,
    });

    return { ok: true, summary: object.delta_summary, abilities: object.abilities, personality: object.personality };
  });
