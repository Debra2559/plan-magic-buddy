import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway";

const PlanItemSchema = z.object({
  type: z.enum(["event", "todo", "reminder"]).describe("event=日程(有时间段), todo=待办, reminder=提醒"),
  title: z.string().describe("简洁的中文标题, 不超过 20 字"),
  date: z.string().describe("YYYY-MM-DD 格式日期, 基于今天 2026-05-19 推算"),
  time: z.string().optional().describe("HH:MM 24h 格式, event 必填, todo/reminder 可选"),
  durationMin: z.number().optional().describe("event 的时长(分钟)"),
  tag: z.enum(["工作", "学习", "健康", "生活", "英语", "习惯"]).describe("分类标签"),
  note: z.string().optional().describe("一句话备注或执行要点"),
});

const PlanSchema = z.object({
  summary: z.string().describe("用一句中文概括这次规划的整体节奏, 不超过 40 字"),
  items: z.array(PlanItemSchema).min(1).max(20),
});

export type PlanItem = z.infer<typeof PlanItemSchema>;
export type Plan = z.infer<typeof PlanSchema>;

const PlanInput = z.object({
  idea: z.string().min(1).max(2000),
  mode: z.enum(["create", "adjust", "add"]),
  existing: z.array(PlanItemSchema).optional(),
});

export const generatePlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PlanInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI 服务未配置 (LOVABLE_API_KEY 缺失)" };
    }

    const today = "2026-05-19 周二";

    const modeInstructions: Record<typeof data.mode, string> = {
      create: "用户给出一个全新的想法, 从 0 到 1 帮 ta 把这个想法拆成可执行的日程、待办、提醒。覆盖未来 1-2 周内的关键节点。",
      adjust: "用户已有一份规划(在 EXISTING 里), 现在想要调整。基于用户新的想法重新平衡时间/优先级, 输出完整的新规划。",
      add: "用户已有一份规划(在 EXISTING 里), 现在想往里追加一些新事项。只输出新增的事项, 不要重复 EXISTING 里的内容。",
    };

    const system = `你是 Sylva, 一个安静、克制、像森林一样陪伴用户的智能规划助手。
今天是 ${today}。
请把用户的想法拆解成结构化的 items 数组。规则:
- type=event 的必须有 time 和 durationMin
- type=todo / reminder 时间可选
- 标题简洁, 不要带 emoji
- 安排合理: 工作日多放工作/学习, 周末多放生活/健康
- 同一天内不要安排过满 (一天 event 总时长不超过 6 小时)
- 单次输出 3-12 条最自然`;

    const userPrompt = `${modeInstructions[data.mode]}

用户想法: ${data.idea}

${data.existing && data.existing.length ? `EXISTING (用户当前已有的规划):\n${JSON.stringify(data.existing, null, 2)}` : ""}`;

    try {
      const gateway = createLovableAiGatewayProvider(apiKey);
      const { object } = await generateObject({
        model: gateway("google/gemini-3-flash-preview"),
        schema: PlanSchema,
        system,
        prompt: userPrompt,
      });
      return { ok: true as const, plan: object };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // 友好化网关错误
      if (msg.includes("429")) return { ok: false as const, error: "请求过于频繁, 稍后再试" };
      if (msg.includes("402")) return { ok: false as const, error: "AI 额度已用完, 请到工作区充值" };
      return { ok: false as const, error: `AI 规划失败: ${msg}` };
    }
  });

// ====================================================================
// 智能目标规划 (chatPlan) - 多轮对话, 必要时联网搜资料
// ====================================================================

const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

// 注意: Gemini 对 discriminatedUnion 兼容性较差, 这里用扁平 schema + 后置校验。
const ChatStepRawSchema = z.object({
  kind: z.enum(["clarify", "research", "plan"]).describe("下一步动作"),
  question: z.string().optional().describe("kind=clarify 时的中文追问"),
  quickReplies: z.array(z.string()).max(6).optional().describe("kind=clarify 时的快捷回答按钮 (0-4)"),
  queries: z.array(z.string()).max(3).optional().describe("kind=research 时的 1-3 条搜索关键词"),
  reason: z.string().optional().describe("kind=research 时, 一句话说明为什么需要联网"),
  summary: z.string().optional().describe("kind=plan 时的一句话总结, 不超过 50 字"),
  items: z.array(PlanItemSchema).max(30).optional().describe("kind=plan 时的拆解事项 1-30 条"),
  sources: z.array(z.string()).optional().describe("kind=plan 时的参考链接"),
});

export type ChatStep =
  | { kind: "clarify"; question: string; quickReplies: string[] }
  | { kind: "research"; queries: string[]; reason: string }
  | { kind: "plan"; summary: string; items: PlanItem[]; sources?: string[] };

function normalizeChatStep(raw: z.infer<typeof ChatStepRawSchema>): ChatStep | null {
  if (raw.kind === "clarify") {
    if (!raw.question) return null;
    return { kind: "clarify", question: raw.question, quickReplies: (raw.quickReplies ?? []).slice(0, 4) };
  }
  if (raw.kind === "research") {
    const qs = (raw.queries ?? []).filter(Boolean);
    if (!qs.length) return null;
    return { kind: "research", queries: qs.slice(0, 3), reason: raw.reason ?? "" };
  }
  if (raw.kind === "plan") {
    if (!raw.items?.length) return null;
    return { kind: "plan", summary: raw.summary ?? "", items: raw.items, sources: raw.sources };
  }
  return null;
}

const ChatPlanInput = z.object({
  messages: z.array(ChatMessage).min(1),
  existing: z.array(PlanItemSchema).optional(),
});

async function firecrawlSearchSnippets(query: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return "";
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit: 5, scrapeOptions: { formats: ["markdown"] } }),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { data?: { web?: Array<{ url?: string; title?: string; markdown?: string; description?: string }> } | Array<{ url?: string; title?: string; markdown?: string; description?: string }> };
    const raw = data?.data;
    const list = Array.isArray(raw) ? raw : raw?.web ?? [];
    return list
      .slice(0, 5)
      .map((r, i) => `[${i + 1}] ${r.title ?? ""}\n${r.url ?? ""}\n${(r.markdown ?? r.description ?? "").slice(0, 600)}`)
      .join("\n\n");
  } catch {
    return "";
  }
}

export const chatPlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ChatPlanInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; step: ChatStep } | { ok: false; error: string }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false, error: "AI 服务未配置" };

    const today = "2026-05-20 周三";

    const baseSystem = `你是 Sylva, 一个智能目标规划助手。今天是 ${today}。
用户会告诉你一个目标 (比如「考雅思」「跑半马」「做副业」)。
你的工作流程:
1. 如果关键参数缺失 (考试日期/目标分数/当前水平/可用时间...), 用 kind="clarify" 问 1-2 个最关键的问题, 并给 quickReplies 让用户一键回答。最多追问 2 轮。
2. 如果需要最新外部信息 (比如最近的考位、推荐的备考资料、官方时间表), 用 kind="research" 输出 1-3 条搜索词。
3. 信息齐全后, 用 kind="plan" 输出一份完整规划: items 拆解到具体的 event/todo/reminder。要求:
   - event 必须有 time 和 durationMin
   - 关键里程碑用 reminder
   - 标题简洁不超过 20 字, 不带 emoji
   - 同一天 event 总时长不超过 6 小时
   - 总条目控制在 6-20 条最自然
   - summary 用一句话概括节奏`;

    const conversation = data.messages.map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content}`).join("\n");
    const existingBlock = data.existing && data.existing.length
      ? `\n\n用户已有的安排:\n${JSON.stringify(data.existing, null, 2)}`
      : "";

    // Step 1: ask AI what to do
    const gateway = createLovableAiGatewayProvider(apiKey);

    async function callStep(extraSystem: string, extraPrompt: string): Promise<ChatStep | { error: string }> {
      const models = ["google/gemini-3-flash-preview", "google/gemini-2.5-flash"] as const;
      let lastMsg = "";
      for (const m of models) {
        try {
          const { object } = await generateObject({
            model: gateway(m),
            schema: ChatStepRawSchema,
            system: baseSystem + extraSystem,
            prompt: extraPrompt,
          });
          const norm = normalizeChatStep(object);
          if (norm) return norm;
          lastMsg = `字段缺失 (kind=${object.kind})`;
        } catch (err: unknown) {
          lastMsg = err instanceof Error ? err.message : String(err);
          if (lastMsg.includes("429")) return { error: "请求过于频繁, 稍后再试" };
          if (lastMsg.includes("402")) return { error: "AI 额度已用完, 请到工作区充值" };
        }
      }
      return { error: `AI 失败: ${lastMsg}` };
    }

    const first = await callStep(
      "",
      `对话记录:\n${conversation}${existingBlock}\n\n请输出下一步动作 (kind 必填: clarify/research/plan, 并填齐对应字段)。`,
    );
    if ("error" in first) return { ok: false, error: first.error };

    // Step 2: if research, do it server-side and re-ask for plan
    if (first.kind === "research") {
      const snippets = (await Promise.all(first.queries.map((q) => firecrawlSearchSnippets(q)))).join("\n\n---\n\n");
      const second = await callStep(
        `\n\n现在你已经获得了联网搜索结果, 必须输出 kind="plan", 不能再 research 或 clarify。`,
        `对话记录:\n${conversation}${existingBlock}\n\n联网搜索结果 (queries=${JSON.stringify(first.queries)}):\n${snippets || "(没有可用结果, 凭常识规划)"}\n\n请直接输出完整 plan (kind="plan", items 必填)。`,
      );
      if ("error" in second) return { ok: false, error: second.error };
      if (second.kind !== "plan") return { ok: false, error: "AI 未能给出最终规划, 请再试一次" };
      return { ok: true, step: second };
    }

    return { ok: true, step: first };
  });
