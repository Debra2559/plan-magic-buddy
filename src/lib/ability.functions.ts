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

function buildFallbackAbilityPlan(
  profile: any,
  activity: any,
  intent: string,
  weeklyHours: number,
  horizonDays: number,
): AbilityPlanDraft {
  const abilities = (profile?.abilities ?? {}) as Record<string, number>;
  const lowScoreAreas = Object.entries(abilities)
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => DIM_LABELS[key] ?? key);
  const profileGrowthAreas = Array.isArray(profile?.growth_areas)
    ? profile.growth_areas.map(cleanFocusArea).filter(Boolean)
    : [];
  const focus_areas = Array.from(new Set([...profileGrowthAreas, ...lowScoreAreas])).slice(0, 2);
  const areas = focus_areas.length > 0 ? focus_areas : ["计划力", "专注力"];
  const completion = typeof activity?.completion_rate === "number" ? activity.completion_rate : null;
  const tagline = completion === null
    ? "先建立轻量节奏，再逐步提高稳定性。"
    : completion >= 70
      ? "保持当前完成节奏，把优势沉淀成可复用习惯。"
      : "用更小的动作降低启动成本，先让计划跑起来。";

  const presets: Record<string, { actions: { title: string; when: string; durationMin: number; note?: string }[]; kpi: string; pitfalls: string[] }> = {
    计划力: {
      actions: [
        { title: "每天 3 件最重要的事", when: "每天 08:30", durationMin: 10, note: "写在固定位置，序号 1/2/3" },
        { title: "晚间 5 分钟次日规划", when: "每天 22:00", durationMin: 5 },
        { title: "周日周计划", when: "周日 20:00", durationMin: 25 },
      ],
      kpi: "连续 14 天每天产出 3 件 MIT 并完成 ≥ 2 件",
      pitfalls: ["计划过多 → 单日上限 3 件", "只列不做 → 每条标注下一步动作"],
    },
    专注力: {
      actions: [
        { title: "深度专注块 25 分钟", when: "工作日 10:00", durationMin: 25, note: "手机离开桌面" },
        { title: "深度专注块 25 分钟", when: "工作日 15:00", durationMin: 25 },
        { title: "干扰记录复盘", when: "每天 21:30", durationMin: 5 },
      ],
      kpi: "工作日每天完成 ≥ 2 个 25 分钟专注块",
      pitfalls: ["边做边刷消息 → 番茄期间消息免打扰", "起步太长 → 先从 1 个 25min 起"],
    },
    健康力: {
      actions: [
        { title: "晨间拉伸", when: "每天 07:30", durationMin: 10 },
        { title: "午后散步", when: "每天 12:30", durationMin: 15 },
        { title: "22:30 关屏", when: "每天 22:30", durationMin: 5, note: "手机放卧室外" },
      ],
      kpi: "每周 ≥ 5 天 22:30 前关屏 + 每天 ≥ 6000 步",
      pitfalls: ["周末节奏崩 → 周末保留最小动作", "晚上加练 → 移到早晨"],
    },
    创造力: {
      actions: [
        { title: "灵感卡片 3 张", when: "每天 21:00", durationMin: 15 },
        { title: "跨领域素材收集", when: "周三 20:00", durationMin: 30 },
      ],
      kpi: "每周产出 ≥ 15 张灵感卡 + 1 篇跨界笔记",
      pitfalls: ["输入过载不输出 → 每天必输出 1 句话"],
    },
    社交力: {
      actions: [
        { title: "主动联系 1 位老朋友", when: "周二 20:30", durationMin: 15 },
        { title: "沟通前写下 3 个要点", when: "每天 09:00", durationMin: 5 },
      ],
      kpi: "每周主动发起 ≥ 2 次有效对话",
      pitfalls: ["想太多不发 → 限时 3 分钟必发出"],
    },
    反思力: {
      actions: [
        { title: "睡前 3 行日记", when: "每天 22:45", durationMin: 5, note: "做了什么 / 卡在哪 / 明天第一步" },
        { title: "周复盘", when: "周日 21:00", durationMin: 20 },
      ],
      kpi: "每周完成 7 次日记 + 1 次复盘",
      pitfalls: ["写太长断更 → 每条 ≤ 1 句"],
    },
  };

  const items = areas.slice(0, 2).map((area) => {
    const p = presets[area] ?? presets["计划力"];
    return {
      area,
      why: `当前${area}评分 ${abilities[Object.entries(DIM_LABELS).find(([, v]) => v === area)?.[0] ?? ""] ?? "—"}，近期完成率 ${completion ?? "暂无"}%`,
      goal: `${horizonDays} 天后在${area}上建立稳定的小循环，达成 KPI`,
      kpi: p.kpi,
      actions: p.actions.slice(0, 3),
      milestones: [
        { week: 1, target: `跑通最小动作，完成率 ≥ 50%` },
        { week: 2, target: `完成率 ≥ 70%，并完成 1 次复盘` },
        { week: Math.max(3, Math.ceil(horizonDays / 7)), target: p.kpi },
      ],
      pitfalls: p.pitfalls,
      cadence: area === "健康力" ? "每天 10-15 分钟" : "每周 3-5 次，每次 15-25 分钟",
    };
  });

  return {
    title: `${todayStr()} 成长计划`,
    tagline,
    diagnosis: intent
      ? `你想：${intent}。结合画像短板（${areas.join("、")}）与近 14 天完成率 ${completion ?? "—"}%，先用 ${weeklyHours} 小时/周的轻量负荷起步。`
      : `结合画像短板（${areas.join("、")}）与近 14 天完成率 ${completion ?? "—"}%，本轮以稳定执行为先，先求"在做"再求"做好"。`,
    focus_areas: areas,
    weekly_hours: weeklyHours,
    horizon_days: horizonDays,
    items,
    review_questions: [
      "本周哪个动作让我感觉最值得？",
      "卡点出现在执行链路的哪一步？",
      "下周需要把哪一条降级或升级？",
    ],
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

const GeneratePlanInput = z.object({
  intent: z.string().max(500).optional().describe("用户本轮想要聚焦的目标或处境"),
  weeklyHours: z.number().min(1).max(40).optional(),
  horizonDays: z.number().int().min(7).max(56).optional(),
}).default({});

export const generateMyAbilityPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GeneratePlanInput.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    const { userId } = context as any;
    const { data: profile } = await supabaseAdmin.from("user_ability_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (!profile) throw new Error("请先完成能力测评");

    const intent = (data.intent ?? "").trim();
    const weeklyHours = data.weeklyHours ?? 6;
    const horizonDays = data.horizonDays ?? 28;

    const activity = await gatherActivity(userId, 14);
    const memoryBlock = await fetchMemoryBlockForUser(userId).catch(() => "");

    let planDraft = buildFallbackAbilityPlan(profile, activity, intent, weeklyHours, horizonDays);
    const apiKey = process.env.LOVABLE_API_KEY;

    if (apiKey) {
      const gateway = createLovableAiGatewayProvider(apiKey);
      const system = `你是一位资深个人成长教练 + 行为设计师。
任务：基于「用户画像 + 近 14 天真实行为 + 长期记忆 + 本轮意图」，输出一份高度个性化、可执行、可衡量的 ${horizonDays} 天成长计划，每周投入约 ${weeklyHours} 小时。

硬性要求：
1. **diagnosis** 必须引用具体数字或行为（如完成率、习惯打卡天数、最近情绪、画像分数），先描述事实再给方向，禁止空话。
2. **focus_areas 最多 2 个**（少而精胜过铺开）；针对用户当前能力水平，不要太激进。
3. 每个 area 的 **why** 必须解释"为什么选这个领域"——引用画像分数/行为数据/用户意图至少一项。
4. 每个 area 的 **goal** 必须是 ${horizonDays} 天后的具体结果，**kpi** 必须可量化（带数字 + 时间窗口）。
5. **actions** 每条都必须有真实可排期的 when（如"周一/三/五 07:00"或"工作日 22:30"），避免"有空就做"。
6. **milestones** 按周递进，第 1 周低门槛先跑通，最后一周对齐 KPI。
7. **pitfalls** 必须针对该用户可能的失败模式（结合行为数据/人格分数），并给出对策。
8. **总投入** ≈ weeklyHours，不要堆动作；如果用户完成率低则进一步降级。
9. **review_questions** 是用户每周复盘要问自己的问题，2-4 条。
10. 标题不带 emoji；语言简洁直接，像教练而不是 AI。`;

      const userCtx = {
        intent: intent || "(用户未填写本轮意图，请基于画像与行为给出最有杠杆的方向)",
        weekly_hours_budget: weeklyHours,
        horizon_days: horizonDays,
        profile: {
          abilities: profile.abilities,
          personality: profile.personality,
          strengths: profile.strengths,
          growth_areas: profile.growth_areas,
          tagline: profile.tagline,
        },
        recent_14d: activity,
        long_term_memory: memoryBlock || "(无)",
      };

      const models = ["google/gemini-2.5-pro", "openai/gpt-5-mini", "google/gemini-2.5-flash"] as const;
      for (const m of models) {
        try {
          const { object } = await generateObject({
            model: gateway(m),
            schema: PlanSchema,
            system,
            prompt: `请基于以下上下文输出 ${horizonDays} 天个性化成长计划：\n\n${JSON.stringify(userCtx, null, 2)}`,
          });
          planDraft = object;
          break;
        } catch (error) {
          console.error(`[generateMyAbilityPlan] model ${m} failed`, error);
        }
      }
    }

    await supabaseAdmin.from("ability_plans").update({ status: "archived" }).eq("user_id", userId).eq("status", "active");

    const { data: inserted, error } = await supabaseAdmin.from("ability_plans").insert({
      user_id: userId,
      title: planDraft.title,
      tagline: planDraft.tagline,
      focus_areas: planDraft.focus_areas,
      content: {
        diagnosis: planDraft.diagnosis,
        weekly_hours: planDraft.weekly_hours,
        horizon_days: planDraft.horizon_days,
        review_questions: planDraft.review_questions,
        items: planDraft.items,
      } as any,
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
