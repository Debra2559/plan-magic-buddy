import { createFileRoute } from "@tanstack/react-router";
import { streamText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { fetchMemoryBlockForUser } from "@/lib/memories.functions";

/** ---- helpers ---- */

function todayISO(tz = "Asia/Shanghai") {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function nowMs() { return Date.now(); }
function uuid() { return crypto.randomUUID(); }

async function authenticate(request: Request): Promise<string> {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("unauthorized");
  const token = auth.slice(7);
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("unauthorized");
  return data.user.id;
}

/** ---- snapshot: what the agent knows before your message ---- */

async function buildSnapshot(userId: string) {
  const today = todayISO();
  const in7 = addDaysISO(today, 7);
  const in30 = addDaysISO(today, 30);
  const wkAgo = addDaysISO(today, -7);

  const [sched, todos, habits, exp, journal, fups, notes, persona] = await Promise.all([
    supabaseAdmin.from("schedule_items").select("id,title,type,date,time,duration_min,tag,done,note")
      .eq("user_id", userId).is("deleted_at", null)
      .in("type", ["event", "reminder"])
      .gte("date", today).lte("date", in7)
      .order("date").order("time").limit(40),
    supabaseAdmin.from("schedule_items").select("id,title,date,tag,done,note")
      .eq("user_id", userId).is("deleted_at", null).eq("type", "todo").eq("done", false)
      .order("date", { nullsFirst: false }).limit(30),
    supabaseAdmin.from("habits").select("id,name,emoji,history")
      .eq("user_id", userId).is("deleted_at", null).limit(20),
    supabaseAdmin.from("expenses").select("amount,category,date,note")
      .eq("user_id", userId).gte("date", wkAgo).order("date", { ascending: false }).limit(40),
    supabaseAdmin.from("diary_entries").select("date,mood,content")
      .eq("user_id", userId).order("date", { ascending: false }).limit(3),
    supabaseAdmin.from("follow_ups").select("id,title,ddl,notes,done")
      .eq("user_id", userId).eq("done", false).order("created_at_ms", { ascending: false }).limit(15),
    supabaseAdmin.from("notes").select("id,text,tags,updated_at")
      .eq("user_id", userId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(8),
    supabaseAdmin.from("user_profiles").select("ai_nickname,tone,user_nickname").eq("user_id", userId).maybeSingle(),
  ]);

  const memBlock = await fetchMemoryBlockForUser(userId, 20);

  const wkExpense = (exp.data ?? []).reduce((s, e) => s + Number(e.amount || 0), 0);
  const streaks = (habits.data ?? []).map((h) => {
    const hist = (h.history ?? []) as string[];
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const day = addDaysISO(today, -i);
      if (hist.includes(day)) streak++;
      else if (i === 0) continue; // today may not be checked yet
      else break;
    }
    return { name: `${h.emoji} ${h.name}`, streak, todayDone: hist.includes(today) };
  });

  return {
    today,
    persona: persona.data,
    memory: memBlock,
    schedule_next7: sched.data ?? [],
    todos_open: todos.data ?? [],
    habits: streaks,
    expenses_last7: {
      total: wkExpense,
      count: exp.data?.length ?? 0,
      items: (exp.data ?? []).slice(0, 15),
    },
    journal_recent: journal.data ?? [],
    followups_open: fups.data ?? [],
    notes_recent: (notes.data ?? []).map((n) => ({
      id: n.id, snippet: (n.text || "").slice(0, 140), tags: n.tags,
    })),
  };
}

function systemPrompt(snapshot: Awaited<ReturnType<typeof buildSnapshot>>) {
  const name = snapshot.persona?.ai_nickname || "Sylva";
  const user = snapshot.persona?.user_nickname || "主人";
  const tone = snapshot.persona?.tone || "温暖、克制、直接";
  return [
    `你是 ${name}，${user} 的贴身生活 agent。`,
    `语气：${tone}。简洁直接，用中文。不要客套。回答里禁止用"作为AI"这种自我提示。`,
    ``,
    `你的能力：你可以调用工具直接读取和修改 ${user} 的生活数据——日程、待办、习惯、记账、跟进、笔记、长期记忆。`,
    `原则：`,
    `1. 尽量用工具而不是要求用户手动去某个页面。用户说"提醒我明天9点开会"就直接 addScheduleItem。`,
    `2. 建议前先看数据：模糊/时间相关的问题先调用 searchSchedule 或 weekLedgerSummary。`,
    `3. 写入类工具执行成功后要用一句话向用户确认结果，不要重复罗列参数。`,
    `4. 发现有价值的长期事实（喜好、目标、关系、习惯）主动调用 rememberFact 存入长期记忆。`,
    `5. 需要用户确认的高风险操作（删除、批量修改）先用一句话征询，再动手。`,
    ``,
    snapshot.memory || "",
    ``,
    `【今日快照】今天是 ${snapshot.today}`,
    `- 未来7天日程 ${snapshot.schedule_next7.length} 条；活跃待办 ${snapshot.todos_open.length} 条；未完成跟进 ${snapshot.followups_open.length} 条`,
    `- 习惯：${snapshot.habits.map((h) => `${h.name}(连${h.streak}天${h.todayDone ? "✓" : ""})`).join("、") || "无"}`,
    `- 近7天记账：¥${snapshot.expenses_last7.total.toFixed(2)} / ${snapshot.expenses_last7.count} 笔`,
    snapshot.journal_recent[0] ? `- 最近日记(${snapshot.journal_recent[0].date} ${snapshot.journal_recent[0].mood ?? ""})：${(snapshot.journal_recent[0].content || "").slice(0, 120)}` : "",
    ``,
    `【最近笔记摘要】`,
    ...snapshot.notes_recent.slice(0, 5).map((n) => `- ${n.snippet}`),
    ``,
    `完整数据在需要时用工具再拉。开始对话吧。`,
  ].filter(Boolean).join("\n");
}

/** ---- tools ---- */

function buildTools(userId: string) {
  return {
    searchSchedule: tool({
      description: "按日期区间查询日程/待办/提醒。返回精简列表。",
      inputSchema: z.object({
        from: z.string().describe("YYYY-MM-DD，含"),
        to: z.string().describe("YYYY-MM-DD，含"),
        type: z.enum(["event", "todo", "reminder", "any"]).default("any"),
      }),
      execute: async ({ from, to, type }) => {
        let q = supabaseAdmin.from("schedule_items")
          .select("id,title,type,date,time,duration_min,tag,done,note")
          .eq("user_id", userId).is("deleted_at", null)
          .gte("date", from).lte("date", to)
          .order("date").order("time").limit(80);
        if (type !== "any") q = q.eq("type", type);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { count: data?.length ?? 0, items: data ?? [] };
      },
    }),

    addScheduleItem: tool({
      description: "新增一条日程/待办/提醒。event 需要 date+time，todo 可以只给 date，reminder 需要 date+time。",
      inputSchema: z.object({
        type: z.enum(["event", "todo", "reminder"]),
        title: z.string().min(1).max(80),
        date: z.string().describe("YYYY-MM-DD"),
        time: z.string().optional().describe("HH:MM 24h"),
        durationMin: z.number().int().min(5).max(720).optional(),
        tag: z.string().max(20).optional(),
        note: z.string().max(500).optional(),
      }),
      execute: async (a) => {
        const id = uuid();
        const { error } = await supabaseAdmin.from("schedule_items").insert({
          id, user_id: userId, title: a.title, type: a.type,
          date: a.date, time: a.time ?? null, duration_min: a.durationMin ?? null,
          tag: a.tag ?? null, note: a.note ?? null, done: false,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, id, ...a };
      },
    }),

    completeScheduleItem: tool({
      description: "把一条日程/待办标记为完成。需要 id。",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const { error } = await supabaseAdmin.from("schedule_items")
          .update({ done: true, updated_at: new Date().toISOString() })
          .eq("user_id", userId).eq("id", id);
        return error ? { ok: false, error: error.message } : { ok: true };
      },
    }),

    addExpense: tool({
      description: "记一笔花销。金额正数为支出。",
      inputSchema: z.object({
        amount: z.number().positive(),
        category: z.string().default("其它"),
        date: z.string().describe("YYYY-MM-DD"),
        note: z.string().max(200).optional(),
        paymentMethod: z.string().max(30).optional(),
      }),
      execute: async (a) => {
        const { data, error } = await supabaseAdmin.from("expenses").insert({
          user_id: userId, amount: a.amount, category: a.category,
          date: a.date, note: a.note ?? null, payment_method: a.paymentMethod ?? null,
        }).select("id").single();
        return error ? { ok: false, error: error.message } : { ok: true, id: data.id, ...a };
      },
    }),

    weekLedgerSummary: tool({
      description: "按分类汇总最近 N 天的花销（默认7天）。",
      inputSchema: z.object({ days: z.number().int().min(1).max(90).default(7) }),
      execute: async ({ days }) => {
        const from = addDaysISO(todayISO(), -days + 1);
        const { data, error } = await supabaseAdmin.from("expenses")
          .select("amount,category,date").eq("user_id", userId).gte("date", from);
        if (error) return { error: error.message };
        const byCat: Record<string, number> = {};
        let total = 0;
        for (const e of data ?? []) {
          const a = Number(e.amount || 0);
          total += a;
          byCat[e.category] = (byCat[e.category] || 0) + a;
        }
        return { days, total, count: data?.length ?? 0, byCategory: byCat };
      },
    }),

    addFollowUp: tool({
      description: "新增一个跟进事项（用于持续 nudging 直到用户处理）。",
      inputSchema: z.object({
        title: z.string().min(1).max(80),
        ddl: z.string().optional().describe("YYYY-MM-DD，可选截止"),
        intervalHours: z.number().int().min(1).max(720).default(24),
        notes: z.string().max(500).optional(),
      }),
      execute: async (a) => {
        const id = uuid();
        const { error } = await supabaseAdmin.from("follow_ups").insert({
          id, user_id: userId, title: a.title, ddl: a.ddl ?? null,
          interval_hours: a.intervalHours, notes: a.notes ?? null,
          created_at_ms: nowMs(), done: false, source: "life-agent",
          remind_before_days: 1,
        });
        return error ? { ok: false, error: error.message } : { ok: true, id };
      },
    }),

    checkinHabit: tool({
      description: "把今天的习惯打卡。传入 habit 名称的模糊匹配即可。",
      inputSchema: z.object({ nameContains: z.string() }),
      execute: async ({ nameContains }) => {
        const { data: habits } = await supabaseAdmin.from("habits")
          .select("id,name,history").eq("user_id", userId).is("deleted_at", null);
        const h = (habits ?? []).find((x) => x.name.toLowerCase().includes(nameContains.toLowerCase()));
        if (!h) return { ok: false, error: `找不到含"${nameContains}"的习惯` };
        const today = todayISO();
        const hist = new Set([...(h.history ?? []), today]);
        const { error } = await supabaseAdmin.from("habits")
          .update({ history: Array.from(hist), updated_at: new Date().toISOString() })
          .eq("id", h.id).eq("user_id", userId);
        return error ? { ok: false, error: error.message } : { ok: true, habit: h.name };
      },
    }),

    searchNotes: tool({
      description: "全文关键字搜索用户笔记（简单 ILIKE）。",
      inputSchema: z.object({ q: z.string().min(1) }),
      execute: async ({ q }) => {
        const { data, error } = await supabaseAdmin.from("notes")
          .select("id,text,tags,updated_at").eq("user_id", userId).is("deleted_at", null)
          .ilike("text", `%${q}%`).order("updated_at", { ascending: false }).limit(8);
        if (error) return { error: error.message };
        return {
          count: data?.length ?? 0,
          items: (data ?? []).map((n) => ({ id: n.id, snippet: (n.text || "").slice(0, 200), tags: n.tags })),
        };
      },
    }),

    rememberFact: tool({
      description: "把关于用户的一条重要长期事实/偏好/目标存入长期记忆。语句化，第三人称，例如：'用户在周三通常远程办公'。",
      inputSchema: z.object({
        content: z.string().min(3).max(400),
        kind: z.enum(["fact", "preference", "relation", "goal", "routine", "other"]).default("fact"),
        importance: z.number().int().min(1).max(5).default(3),
      }),
      execute: async (a) => {
        const { data, error } = await supabaseAdmin.from("ai_memories").insert({
          user_id: userId, content: a.content, kind: a.kind, importance: a.importance,
          status: "active", source: "life-agent",
        }).select("id").single();
        return error ? { ok: false, error: error.message } : { ok: true, id: data.id };
      },
    }),
  };
}

/** ---- route ---- */

export const Route = createFileRoute("/api/life-agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const userId = await authenticate(request);
          const body = await request.json().catch(() => ({}));
          const messages = Array.isArray(body.messages) ? body.messages : [];
          if (!messages.length) {
            return new Response("no messages", { status: 400 });
          }

          const snapshot = await buildSnapshot(userId);
          const sys = systemPrompt(snapshot);

          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response("missing LOVABLE_API_KEY", { status: 500 });
          const gw = createLovableAiGatewayProvider(key);

          const result = streamText({
            model: gw("google/gemini-2.5-flash"),
            system: sys,
            messages,
            tools: buildTools(userId),
            stopWhen: stepCountIs(12),
            temperature: 0.6,
          });

          return result.toTextStreamResponse();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const status = msg === "unauthorized" ? 401 : 500;
          return new Response(JSON.stringify({ error: msg }), {
            status, headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
