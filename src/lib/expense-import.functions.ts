import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway";

const CATEGORIES = ["餐饮", "交通", "购物", "娱乐", "居住", "医疗", "学习", "人情", "其他"] as const;

const ExtractedExpenseSchema = z.object({
  amount: z.number().describe("金额，单位元（精确到分，例如 12.50）。仅支出，收入忽略。"),
  category: z.enum(CATEGORIES).describe("分类，必须从给定枚举中选一个。"),
  note: z.string().optional().describe("简短备注：商户名 / 商品描述，10 字以内最佳"),
  date: z
    .string()
    .describe("交易日期 YYYY-MM-DD。若图中只写月-日没有年份，按今年计算；只写「今天/昨天」按今天换算。"),
  paymentMethod: z.string().optional().describe("支付方式，例如「微信」「支付宝」「招行信用卡」"),
});

const SchemaOut = z.object({
  expenses: z.array(ExtractedExpenseSchema).max(80).describe("从图中识别出的支出条目，按时间倒序"),
});

export const extractExpensesFromImage = createServerFn({ method: "POST" })
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

    const { object } = await generateObject({
      model: provider("google/gemini-2.5-pro"),
      schema: SchemaOut,
      messages: [
        {
          role: "system",
          content:
            `你是账单识别助手。输入是微信/支付宝/银行/记账软件的账单截图（常为长截图）。\n` +
            `任务：抽取每一笔【支出】（收入、转入、退款、理财收益请忽略）。\n` +
            `今天是 ${todayStr}。日期缺年份按今年，若是「今天/昨天/前天」请换算成 YYYY-MM-DD。\n` +
            `金额单位是元，保留两位小数；分类必须从枚举里选最贴近的：${CATEGORIES.join("、")}。\n` +
            `note 写商户/商品（如「美团-肯德基」「滴滴」「淘宝-XX店」），别复制完整长文本。\n` +
            `paymentMethod 若能看出来就填（微信 / 支付宝 / 银行卡名等），看不出就留空。\n` +
            `如果没识别到支出，返回空数组。`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: data.hint ? `补充说明：${data.hint}` : "请识别这张账单截图。" },
            { type: "image", image: data.imageDataUrl },
          ],
        },
      ],
    });

    return { expenses: object.expenses ?? [] };
  });
