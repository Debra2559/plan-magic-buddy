import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway";

const Input = z.object({
  personaPrompt: z.string().min(1).max(4000),
  displayName: z.string().min(1).max(64),
});

const MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
];

export const tryPersonaLine = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI 服务未配置" };

    const gateway = createLovableAiGatewayProvider(apiKey);
    const system = `${data.personaPrompt}\n\n你现在要用上述人设给「${data.displayName}」说一句早安问候，并极简介绍你能帮 ${data.displayName} 做什么。要求：50 字以内，一句话，口语化，不要列表，不要分点，不要 emoji 满天飞。`;
    const prompt = `请说这一句话。`;

    let lastErr: unknown;
    for (const m of MODELS) {
      try {
        const { text } = await generateText({
          model: gateway(m),
          system,
          prompt,
        });
        const line = text.trim().replace(/^["「『]|["」』]$/g, "");
        if (line) return { ok: true as const, line };
      } catch (e) {
        lastErr = e;
      }
    }
    return {
      ok: false as const,
      error: `试一句失败：${(lastErr as Error)?.message ?? "未知错误"}`,
    };
  });
