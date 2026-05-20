import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway";

const Input = z.object({
  personaPrompt: z.string().min(1).max(4000),
  displayName: z.string().min(1).max(64),
});

const Schema = z.object({
  morning: z.string().min(1).max(140).describe("早安问候 + 今日重点：一句话，口语化，≤50字"),
  procrastination: z.string().min(1).max(160).describe("用户说『不想干活想躺着』时的回复：一句戳破+一个最小可执行动作，≤60字"),
  planning: z.string().min(1).max(200).describe("用户说『帮我安排今天』时的口吻示范：先一句态度，再用「· 」列 2-3 个时段建议，整体≤80字"),
  evening: z.string().min(1).max(160).describe("晚间复盘的开场：一句温度感的反问/总结，引导用户回顾，≤50字"),
});

const MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
];

export const previewPersonaScenarios = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI 服务未配置" };

    const gateway = createLovableAiGatewayProvider(apiKey);
    const system = `${data.personaPrompt}\n\n你正在为「${data.displayName}」展示 4 个场景下你会怎么说话。严格按 schema 输出，每段都要鲜明体现上面的人设（幽默/贱度/专业度/啰嗦度都要落到字面上）。不要使用 markdown 加粗，不要写场景标题。`;
    const prompt = `请生成 4 个场景的示范回复。`;

    let lastErr: unknown;
    for (const m of MODELS) {
      try {
        const { experimental_output } = await generateText({
          model: gateway(m),
          system,
          prompt,
          experimental_output: Output.object({ schema: Schema }),
        });
        return { ok: true as const, scenarios: experimental_output };
      } catch (e) {
        lastErr = e;
      }
    }
    return {
      ok: false as const,
      error: `预览失败：${(lastErr as Error)?.message ?? "未知错误"}`,
    };
  });
