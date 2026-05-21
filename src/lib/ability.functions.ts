import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateObject } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "./ai-gateway";

// ---------- Static questionnaire ----------
// 30 题李克特量表（1=非常不符合, 5=非常符合）。每个能力维度 3 题（含 1 题反向计分 _inv）；
// 大五人格 2-3 题（含反向题）。反向题在分析时由模型按 dim 名自动反转。
export const ABILITY_QUESTIONS = [
  // —— planning 计划力 ——
  { id: "q1",  text: "面对一周的工作，我会主动规划好每天的重点。", dim: "planning" },
  { id: "q2",  text: "开始一个项目前，我会先拆解步骤、估算时间。", dim: "planning" },
  { id: "q3",  text: "我经常临时起意，很少为接下来的事做安排。", dim: "planning_inv" },

  // —— focus 专注力 ——
  { id: "q4",  text: "我能长时间专注于一件事而不被打断。", dim: "focus" },
  { id: "q5",  text: "工作时我会主动关闭无关的通知和页面。", dim: "focus" },
  { id: "q6",  text: "我经常一边做事一边刷手机或切换任务。", dim: "focus_inv" },

  // —— health 健康力 ——
  { id: "q7",  text: "我会规律作息，关注饮食与运动。", dim: "health" },
  { id: "q8",  text: "即使忙碌，我也会保证每天的睡眠和活动量。", dim: "health" },
  { id: "q9",  text: "我经常熬夜或久坐，很少主动运动。", dim: "health_inv" },

  // —— creativity 创造力 ——
  { id: "q10", text: "我喜欢尝试新点子、新工具、新方法。", dim: "creativity" },
  { id: "q11", text: "我常常会把不同领域的想法联系起来。", dim: "creativity" },
  { id: "q12", text: "比起新方法，我更愿意沿用已有的做法。", dim: "creativity_inv" },

  // —— social 社交力 ——
  { id: "q13", text: "我享受与他人交流，并能主动维护关系。", dim: "social" },
  { id: "q14", text: "我能比较自如地结识新朋友。", dim: "social" },
  { id: "q15", text: "需要和陌生人打交道时，我会感到明显不安。", dim: "social_inv" },

  // —— reflection 反思力 ——
  { id: "q16", text: "我经常会回顾、反思自己的状态与决策。", dim: "reflection" },
  { id: "q17", text: "遇到挫折后，我会主动复盘原因和下次改进点。", dim: "reflection" },
  { id: "q18", text: "事情过去就过去，我很少回头去想。", dim: "reflection_inv" },

  // —— Big Five · openness ——
  { id: "q19", text: "我乐于接受新的观点和不同意见。", dim: "openness" },
  { id: "q20", text: "比起新奇的体验，我更喜欢熟悉和稳定。", dim: "openness_inv" },

  // —— Big Five · conscientiousness ——
  { id: "q21", text: "我做事有计划、守承诺，不轻易拖延。", dim: "conscientiousness" },
  { id: "q22", text: "我的物品和文件经常处于杂乱状态。", dim: "conscientiousness_inv" },

  // —— Big Five · extraversion ——
  { id: "q23", text: "在团队中我倾向于主动表达想法。", dim: "extraversion" },
  { id: "q24", text: "在热闹的场合我会感到精力充沛。", dim: "extraversion" },
  { id: "q25", text: "比起聚会，我更喜欢独处或小范围相处。", dim: "extraversion_inv" },

  // —— Big Five · agreeableness ——
  { id: "q26", text: "我会优先考虑别人的感受。", dim: "agreeableness" },
  { id: "q27", text: "为了达成目标，我可以比较直接甚至强硬。", dim: "agreeableness_inv" },

  // —— Big Five · neuroticism ——
  { id: "q28", text: "未完成的任务会让我感到焦虑。", dim: "neuroticism" },
  { id: "q29", text: "我的情绪起伏比较大，容易被小事影响。", dim: "neuroticism" },
  { id: "q30", text: "面对压力，我能很快调整情绪。", dim: "neuroticism_inv" },
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
  summary: z.string(),
});
const AnalysisSchema = z.object({
  abilities: AbilitiesSchema,
  personality: PersonalitySchema,
  strengths: z.array(z.string()).min(1).max(6),
  growth_areas: z.array(z.string()).min(1).max(6),
  tagline: z.string().describe("一句话画像描述"),
});

// AI 只负责生成定性描述，定量由本地计算确定
const QualitativeSchema = z.object({
  personality_summary: z.string().min(4).max(160),
  strengths: z.array(z.string()).min(1).max(6),
  growth_areas: z.array(z.string()).min(1).max(6),
  tagline: z.string().min(4).max(80).describe("一句话画像描述"),
});

// 维度中文名映射
const DIM_LABELS: Record<string, string> = {
  planning: "计划力",
  focus: "专注力",
  health: "健康力",
  creativity: "创造力",
  social: "社交力",
  reflection: "反思力",
  openness: "开放性",
  conscientiousness: "尽责性",
  extraversion: "外向性",
  agreeableness: "宜人性",
  neuroticism: "神经质",
};

function computeScores(responses: Record<string, number>) {
  // 按 dim 基础名汇总（去掉 _inv），反向题先 6-score 反转
  const buckets: Record<string, number[]> = {};
  for (const q of ABILITY_QUESTIONS) {
    const raw = responses[q.id];
    const score = typeof raw === "number" ? Math.min(5, Math.max(1, raw)) : 3;
    const isInv = q.dim.endsWith("_inv");
    const base = isInv ? q.dim.slice(0, -4) : q.dim;
    const v = isInv ? 6 - score : score;
    (buckets[base] ??= []).push(v);
  }
  const out: Record<string, number> = {};
  for (const [k, arr] of Object.entries(buckets)) {
    const avg = arr.reduce((s, x) => s + x, 0) / arr.length; // 1..5
    out[k] = Math.round(((avg - 1) / 4) * 100); // → 0..100
  }
  const abilities = {
    planning: out.planning ?? 50,
    focus: out.focus ?? 50,
    health: out.health ?? 50,
    creativity: out.creativity ?? 50,
    social: out.social ?? 50,
    reflection: out.reflection ?? 50,
  };
  const personalityScores = {
    openness: out.openness ?? 50,
    conscientiousness: out.conscientiousness ?? 50,
    extraversion: out.extraversion ?? 50,
    agreeableness: out.agreeableness ?? 50,
    neuroticism: out.neuroticism ?? 50,
  };
  return { abilities, personalityScores };
}

const PlanActionSchema = z.object({
  title: z.string().describe("简洁动作名，不超过 20 字"),
  when: z.string().describe("具体时段，如 '周一/三/五 07:00' 或 '每天 22:30' 或 '工作日午休 12:30'"),
  durationMin: z.number().int().min(5).max(180).describe("单次执行时长（分钟）"),
  note: z.string().optional().describe("执行要点或起步技巧，一句话"),
});
const PlanMilestoneSchema = z.object({
  week: z.number().int().min(1).max(8).describe("第几周（1=本周）"),
  target: z.string().describe("该周末应达到的可衡量结果"),
});
const PlanItemSchema = z.object({
  area: z.string().describe("聚焦领域中文名，如：计划力/专注力/健康力"),
  why: z.string().describe("基于用户数据的简短诊断，引用具体数字或行为，不超过 60 字"),
  goal: z.string().describe("horizon 结束时的具体可衡量目标，避免空泛"),
  kpi: z.string().describe("如何判断目标达成的量化指标，例如：连续 14 天 22:30 前关屏"),
  actions: z.array(PlanActionSchema).min(2).max(5),
  milestones: z.array(PlanMilestoneSchema).min(1).max(4),
  pitfalls: z.array(z.string()).min(1).max(3).describe("用户最可能踩的坑及对策，每条不超过 30 字"),
  cadence: z.string().describe("一句话节奏，向后兼容用，如：每周3次/每天15分钟"),
});
const PlanSchema = z.object({
  title: z.string(),
  tagline: z.string().describe("一句教练口吻的主张，不超过 30 字"),
  diagnosis: z.string().describe("结合画像 + 行为数据 + 用户意图的整体诊断，2-4 句，先说事实再给方向"),
  focus_areas: z.array(z.string()).min(1).max(3),
  weekly_hours: z.number().min(1).max(40).describe("整份计划每周总投入小时数"),
  horizon_days: z.number().int().min(7).max(56),
  items: z.array(PlanItemSchema).min(1).max(3),
  review_questions: z.array(z.string()).min(2).max(5).describe("每周复盘要问自己的问题"),
});
type AbilityPlanDraft = z.infer<typeof PlanSchema>;

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

function cleanFocusArea(text: unknown) {
  return String(text ?? "")
    .replace(/^可以继续培养/, "")
    .replace(/^在/, "")
    .replace(/上表现突出$/, "")
    .trim();
}

function buildFallbackAbilityPlan(profile: any, activity: any): AbilityPlanDraft {
  const abilities = (profile?.abilities ?? {}) as Record<string, number>;
  const lowScoreAreas = Object.entries(abilities)
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => DIM_LABELS[key] ?? key);
  const profileGrowthAreas = Array.isArray(profile?.growth_areas)
    ? profile.growth_areas.map(cleanFocusArea).filter(Boolean)
    : [];
  const focus_areas = Array.from(new Set([...profileGrowthAreas, ...lowScoreAreas])).slice(0, 3);
  const areas = focus_areas.length > 0 ? focus_areas : ["计划力", "专注力"];
  const completion = typeof activity?.completion_rate === "number" ? activity.completion_rate : null;
  const tagline = completion === null
    ? "先建立轻量节奏，再逐步提高稳定性。"
    : completion >= 70
      ? "保持当前完成节奏，把优势沉淀成可复用习惯。"
      : "用更小的动作降低启动成本，先让计划跑起来。";

  const actionMap: Record<string, string[]> = {
    计划力: ["每天开始前写下 3 件最重要的事", "把超过 30 分钟的任务拆成下一步动作", "每晚用 5 分钟复盘明天第一件事"],
    专注力: ["每天安排 1 段 25 分钟免打扰专注块", "开始前关闭无关通知和页面", "把临时想法先记到收集箱，结束后再处理"],
    健康力: ["每天固定一个 10 分钟活动窗口", "睡前 30 分钟减少屏幕和刺激信息", "久坐 60 分钟后起身走动 3 分钟"],
    创造力: ["每周记录 3 个新点子或新工具", "把一个旧任务尝试换一种做法", "每周做一次 20 分钟跨领域素材收集"],
    社交力: ["每周主动联系 1 位朋友或同事", "重要沟通前先写下想表达的 3 个点", "对收到的帮助及时反馈和感谢"],
    反思力: ["每天记录一个有效动作和一个卡点", "每周复盘一次高耗能事件的原因", "把失败经验改写成下一次的具体规则"],
  };

  const items = areas.map((area) => ({
    area,
    goal: `在未来 7 天稳定提升${area}，先形成可持续的小循环。`,
    actions: actionMap[area] ?? ["每天选择一个最小动作完成", "完成后记录一句反馈", "周末根据实际情况调整难度"],
    cadence: area === "健康力" ? "每天10分钟" : "每周3-5次，每次15-25分钟",
  }));

  while (items.length < 2) {
    items.push({
      area: "稳定执行",
      goal: "降低计划启动成本，让成长计划持续发生。",
      actions: ["每天只承诺一个最小可完成动作", "完成后立即打勾或记录一句反馈", "连续两天中断时主动降级任务难度"],
      cadence: "每天5分钟",
    });
  }

  return {
    title: `${todayStr()} 成长计划`,
    tagline,
    focus_areas: areas.slice(0, 4),
    items: items.slice(0, 6),
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

    // 本地确定性计算 —— 不依赖 AI，避免任何 schema / 网络失败
    const { abilities, personalityScores } = computeScores(data.responses);

    const sortedAbilities = Object.entries(abilities).sort((a, b) => b[1] - a[1]);
    const topDims = sortedAbilities.slice(0, 3).map(([k]) => DIM_LABELS[k]);
    const bottomDims = sortedAbilities.slice(-3).reverse().map(([k]) => DIM_LABELS[k]);

    const p = personalityScores;
    const traits: string[] = [];
    traits.push(p.openness >= 60 ? "对新事物保持开放" : p.openness <= 40 ? "更喜欢熟悉与稳定" : "对新旧事物较为均衡");
    traits.push(p.conscientiousness >= 60 ? "做事有计划且自律" : p.conscientiousness <= 40 ? "偏随性、灵活" : "在自律与灵活间平衡");
    traits.push(p.extraversion >= 60 ? "外向、乐于表达" : p.extraversion <= 40 ? "偏内向、享受独处" : "外向与内向都能切换");
    if (p.neuroticism >= 60) traits.push("情绪较敏感，容易被外界影响");
    else if (p.neuroticism <= 40) traits.push("情绪较稳定");
    const personality_summary = traits.join("，") + "。";

    const strengths = topDims.slice(0, 3).map((d) => `在${d}上表现突出`);
    const growth_areas = bottomDims.slice(0, 3).map((d) => `可以继续培养${d}`);

    const taglineMap: Record<string, string> = {
      计划力: "井然有序的执行者",
      专注力: "心无旁骛的深耕者",
      健康力: "节奏稳健的生活家",
      创造力: "跨界连接的点子家",
      社交力: "温度十足的连接者",
      反思力: "向内生长的思考者",
    };
    const tagline = taglineMap[topDims[0]] ?? "稳步前行的成长者";

    const result = {
      abilities,
      personality: { ...personalityScores, summary: personality_summary },
      strengths,
      growth_areas,
      tagline,
    };

    const { error: upErr } = await supabaseAdmin.from("user_ability_profiles").upsert({
      user_id: userId,
      abilities: result.abilities as any,
      personality: result.personality as any,
      strengths: result.strengths,
      growth_areas: result.growth_areas,
      tagline: result.tagline,
      initial_done: true,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id" });
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin.from("ability_assessments").insert({
      user_id: userId,
      kind: data.kind,
      responses: data.responses as any,
      result: result as any,
    });

    return { ok: true, result };
  });

export const generateMyAbilityPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as any;
    const { data: profile } = await supabaseAdmin.from("user_ability_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (!profile) throw new Error("请先完成能力测评");

    const activity = await gatherActivity(userId, 14);
    let planDraft = buildFallbackAbilityPlan(profile, activity);
    const apiKey = process.env.LOVABLE_API_KEY;

    if (apiKey) {
      try {
        const gateway = createLovableAiGatewayProvider(apiKey);
        const { object } = await generateObject({
          model: gateway("google/gemini-2.5-flash"),
          schema: PlanSchema,
          system: `你是一位个人成长教练。基于用户的能力画像与最近 14 天的真实行为数据，制定一份「可执行、具体、轻量」的成长计划。聚焦 1-3 个成长领域；每个领域给 2-5 条具体动作；动作要符合用户当前能力水平（不要太激进）；明确节奏（每天/每周几次）。必须严格按 schema 输出。`,
          prompt: `用户画像：\n${JSON.stringify({ abilities: profile.abilities, personality: profile.personality, strengths: profile.strengths, growth_areas: profile.growth_areas, tagline: profile.tagline }, null, 0)}\n\n最近 14 天行为数据：\n${JSON.stringify(activity, null, 0)}`,
        });
        planDraft = object;
      } catch (error) {
        console.error("Ability plan AI generation failed, using fallback", error);
      }
    }

    // archive previous active plans
    await supabaseAdmin.from("ability_plans").update({ status: "archived" }).eq("user_id", userId).eq("status", "active");

    const { data: inserted, error } = await supabaseAdmin.from("ability_plans").insert({
      user_id: userId,
      title: planDraft.title,
      tagline: planDraft.tagline,
      focus_areas: planDraft.focus_areas,
      content: planDraft.items as any,
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
