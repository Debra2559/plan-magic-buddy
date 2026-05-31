import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway";

const ExtractedTaskSchema = z.object({
  title: z.string().describe("简洁的任务标题，10-30 字"),
  notes: z.string().optional().describe("补充信息：地点、联系人、要求等"),
  ddl: z
    .string()
    .optional()
    .describe("截止日期 YYYY-MM-DD；若图中只说“明天/星期五”等相对时间，请基于当前日期计算后再返回。无法确定则留空"),
  prerequisite: z.string().optional().describe("是否依赖前置条件，如“等老师签字”"),
  remindBeforeDays: z
    .number()
    .int()
    .min(0)
    .max(30)
    .optional()
    .describe("建议提前几天开始提醒，默认 3"),
});

const SchemaOut = z.object({
  tasks: z.array(ExtractedTaskSchema).max(10).describe("从图中识别出的待办事项，0-10 条"),
});

export const extractTasksFromImage = createServerFn({ method: "POST" })
  .inputValidator((input: { imageDataUrl: string; hint?: string }) => {
    if (!input?.imageDataUrl?.startsWith("data:image/")) {
      throw new Error("imageDataUrl 必须是 data:image/... 形式");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("缺少 LOVABLE_API_KEY");

    const provider = createLovableAiGatewayProvider(apiKey);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const weekday = ["日", "一", "二", "三", "四", "五", "六"][today.getDay()];

    const { object } = await generateObject({
      model: provider("google/gemini-2.5-flash"),
      schema: SchemaOut,
      messages: [
        {
          role: "system",
          content:
            `你是一个待办抽取助手。读取图中（通常是聊天截图/通知/作业群消息），抽取“我需要做的事情”。\n` +
            `今天是 ${todayStr}（星期${weekday}）。若图中出现“明天/后天/星期X/本周X”等相对时间，请换算为绝对日期 YYYY-MM-DD。\n` +
            `若是发送方在说他自己的安排（例如老师说自己在上课），不要当作我的待办，但可以作为前置条件 prerequisite。\n` +
            `若图里没有真正的待办，返回空数组。`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: data.hint ? `补充：${data.hint}` : "请识别图中的待办。" },
            { type: "image", image: data.imageDataUrl },
          ],
        },
      ],
    });

    return { tasks: object.tasks ?? [] };
  });
