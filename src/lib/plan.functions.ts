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
