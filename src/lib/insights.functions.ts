import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateObject } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "./ai-gateway";
import { sendCardToFeishu } from "./feishu.functions";

// ---------- Schema ----------

const InsightSchema = z.object({
  kind: z.enum(["reminder", "suggestion", "pattern", "encouragement", "warning"])
    .describe("reminder=待办提醒, suggestion=优化建议, pattern=行为洞察, encouragement=鼓励, warning=风险提示"),
  title: z.string().max(40).describe("简洁中文标题，≤20字"),
  content: z.string().max(200).describe("一两句中文建议，亲切自然，不要套话"),
  priority: z.number().int().min(1).max(5).describe("1=低 5=高"),
});

const InsightsBatch = z.object({
  insights: z.array(InsightSchema).min(1).max(5),
});

export type AiInsight = {
  id: string;
  date: string;
  slot: string;
  kind: string;
  title: string;
  content: string;
  priority: number;
  dismissed: boolean;
  created_at: string;
};

// ---------- Helpers ----------

const DEFAULT_TZ = "Asia/Shanghai";

function tzParts(d: Date, tz: string): { year: string; month: string; day: string; hour: number } {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
    return {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: Number(parts.hour) % 24,
    };
  } catch {
    // Fallback to Asia/Shanghai if invalid tz
    return tzParts(d, DEFAULT_TZ);
  }
}

function currentSlot(d = new Date(), tz: string = DEFAULT_TZ): "morning" | "noon" | "evening" {
  const { hour } = tzParts(d, tz);
  if (hour < 11) return "morning";
  if (hour < 17) return "noon";
  return "evening";
}

function todayStr(d = new Date(), tz: string = DEFAULT_TZ): string {
  const { year, month, day } = tzParts(d, tz);
  return `${year}-${month}-${day}`;
}

function daysAgo(n: number, tz: string = DEFAULT_TZ): string {
  return todayStr(new Date(Date.now() - n * 86400_000), tz);
}


async function gatherUserContext(userId: string, lookbackDays: number, tz: string = DEFAULT_TZ) {
  const since = daysAgo(lookbackDays, tz);
  const today = todayStr(new Date(), tz);


  const [schedule, notes, diaries, habits, profile] = await Promise.all([
    supabaseAdmin
      .from("schedule_items")
      .select("title,type,date,time,duration_min,tag,note,done")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .gte("date", since)
      .order("date", { ascending: true })
      .limit(80),
    supabaseAdmin
      .from("notes")
      .select("text,mood,tags,created_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(40),
    supabaseAdmin
      .from("diary_entries")
      .select("date,content,mood")
      .eq("user_id", userId)
      .gte("date", since)
      .order("date", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("habits")
      .select("name,emoji,history")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(30),
    supabaseAdmin
      .from("user_profiles")
      .select("display_name,persona_prompt")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const habitSummary = (habits.data ?? []).map((h: any) => {
    const hist: string[] = h.history ?? [];
    const last7 = hist.filter((d) => d >= daysAgo(7, tz)).length;
    const lastDate = hist[hist.length - 1] ?? null;
    const streak = (() => {
      let s = 0;
      for (let i = 0; ; i++) {
        if (hist.includes(daysAgo(i, tz))) s++;
        else break;
      }
      return s;
    })();
    return { name: h.name, emoji: h.emoji, last7days: last7, streak, lastDate };
  });


  return { today, since, schedule: schedule.data ?? [], notes: notes.data ?? [], diaries: diaries.data ?? [], habits: habitSummary, profile: profile.data ?? null };
}

// ---------- Core generation ----------

async function generateForUser(userId: string, slot: string) {
  const settingsRes = await supabaseAdmin
    .from("ai_insights_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const settings = settingsRes.data ?? { enabled: true, scope: ["schedule", "notes", "habits", "insights"], lookback_days: 2, push_feishu: false, slots: ["morning", "noon", "evening"], timezone: DEFAULT_TZ };
  if (!settings.enabled) return { ok: false as const, reason: "disabled" };

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { ok: false as const, reason: "no_api_key" };

  const tz = (settings as any).timezone || DEFAULT_TZ;
  const ctx = await gatherUserContext(userId, settings.lookback_days ?? 2, tz);


  const slotName = slot === "morning" ? "早晨" : slot === "noon" ? "午间" : "傍晚";
  const persona = ctx.profile?.persona_prompt ?? "你是用户的私人 AI 助理，亲切自然。";
  const displayName = ctx.profile?.display_name ?? "主人";

  const system = `${persona}
今天是 ${ctx.today}，当前是${slotName}。
你正在为「${displayName}」生成贴心的行为洞察提示。基于下面的真实数据，输出 2-4 条最有价值的提示。
原则：
- 优先关注：未完成的待办、即将到来的日程、断签风险的习惯、情绪/状态变化、最近反复出现的关键词
- 不要泛泛而谈，要引用具体内容（例如"昨天提到的XX"）
- 语气符合人设，简洁有温度
- 不要重复已有的日程标题作为提示
- ${slot}时段的提示风格：${slot === "morning" ? "梳理今日重点、给予能量" : slot === "noon" ? "进度检查、节奏调整" : "回顾收尾、明日预告、休息提醒"}`;

  const prompt = `用户数据（仅限参考，不要原样复述）：
日程（含已完成/未完成）：
${JSON.stringify(ctx.schedule, null, 0)}

最近随手记：
${JSON.stringify(ctx.notes.map((n: any) => ({ text: n.text?.slice(0, 200), mood: n.mood, tags: n.tags, at: n.created_at })), null, 0)}

最近日记：
${JSON.stringify(ctx.diaries, null, 0)}

习惯打卡概况：
${JSON.stringify(ctx.habits, null, 0)}

请输出 2-4 条提示。`;

  const gateway = createLovableAiGatewayProvider(apiKey);

  let insights: z.infer<typeof InsightSchema>[] = [];
  try {
    const { object } = await generateObject({
      model: gateway("google/gemini-2.5-flash"),
      schema: InsightsBatch,
      system,
      prompt,
    });
    insights = object.insights;
  } catch (e: any) {
    return { ok: false as const, reason: `ai_error:${e?.message ?? "unknown"}` };
  }

  if (!insights.length) return { ok: true as const, count: 0 };

  const rows = insights.map((i) => ({
    user_id: userId,
    date: ctx.today,
    slot,
    kind: i.kind,
    title: i.title,
    content: i.content,
    priority: i.priority,
  }));
  const ins = await supabaseAdmin.from("ai_insights").insert(rows).select("*");
  if (ins.error) return { ok: false as const, reason: ins.error.message };

  await supabaseAdmin
    .from("ai_insights_settings")
    .upsert({ user_id: userId, last_generated_at: new Date().toISOString(), last_slot: slot, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" });

  // Optional feishu push
  if (settings.push_feishu) {
    try {
      const card = {
        config: { wide_screen_mode: true },
        header: {
          template: "blue",
          title: { tag: "plain_text", content: `✨ ${slotName}提示 · ${ctx.today}` },
        },
        elements: insights.flatMap((i) => [
          { tag: "div", text: { tag: "lark_md", content: `**${i.title}**\n${i.content}` } },
          { tag: "hr" },
        ]).slice(0, -1),
      };
      const r = await sendCardToFeishu(card);
      if (r.ok) {
        await supabaseAdmin
          .from("ai_insights")
          .update({ pushed_feishu: true })
          .in("id", (ins.data ?? []).map((x: any) => x.id));
      }
    } catch {
      // swallow
    }
  }

  return { ok: true as const, count: insights.length };
}

// ---------- Server functions ----------

export const listMyInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const since = daysAgo(2);
    const { data, error } = await supabase
      .from("ai_insights")
      .select("*")
      .eq("user_id", userId)
      .gte("date", since)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { insights: (data ?? []) as AiInsight[] };
  });

export const generateMyInsightsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ slot: z.enum(["morning", "noon", "evening", "auto"]).default("auto") }).parse(input))
  .handler(async ({ context, data }) => {
    const { userId } = context as any;
    const slot = data.slot === "auto" ? currentSlot() : data.slot;
    const r = await generateForUser(userId, slot);
    return r;
  });

export const dismissInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("ai_insights")
      .update({ dismissed: true })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearMyInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const today = todayStr();
    const { error } = await supabase
      .from("ai_insights")
      .update({ dismissed: true })
      .eq("user_id", userId)
      .gte("date", today);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyInsightsSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase.from("ai_insights_settings").select("*").eq("user_id", userId).maybeSingle();
    return {
      settings: data ?? {
        user_id: userId,
        enabled: true,
        slots: ["morning", "noon", "evening"],
        push_feishu: false,
        scope: ["schedule", "notes", "habits", "insights"],
        lookback_days: 2,
        last_generated_at: null,
        last_slot: null,
      },
    };
  });

export const updateMyInsightsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      enabled: z.boolean().optional(),
      slots: z.array(z.enum(["morning", "noon", "evening"])).optional(),
      push_feishu: z.boolean().optional(),
      scope: z.array(z.enum(["schedule", "notes", "habits", "insights"])).optional(),
      lookback_days: z.number().int().min(1).max(14).optional(),
      timezone: z.string().min(1).max(64).optional(),
    }).parse(input),
  )

  .handler(async ({ context, data }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("ai_insights_settings")
      .upsert({ user_id: userId, ...data, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Cron (called from public hook) ----------

export async function runScheduledInsights(): Promise<{ processed: number; generated: number; errors: number }> {
  const nowSlot = currentSlot();
  const today = todayStr();
  // Find all users with enabled settings, whose slots include current, and who haven't generated this slot today
  const { data: users, error } = await supabaseAdmin
    .from("ai_insights_settings")
    .select("user_id, slots, enabled, last_generated_at, last_slot");
  if (error) return { processed: 0, generated: 0, errors: 1 };

  let processed = 0;
  let generated = 0;
  let errors = 0;
  for (const u of users ?? []) {
    if (!u.enabled) continue;
    const slots: string[] = u.slots ?? [];
    if (!slots.includes(nowSlot)) continue;
    // Skip if already generated this slot today
    if (u.last_slot === nowSlot && u.last_generated_at && (u.last_generated_at as string).slice(0, 10) === today) continue;
    processed++;
    try {
      const r = await generateForUser(u.user_id, nowSlot);
      if (r.ok && (r as any).count > 0) generated++;
      else if (!r.ok) errors++;
    } catch {
      errors++;
    }
  }
  return { processed, generated, errors };
}
