import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  date: z.string().min(8).max(10),
  summary: z.string().min(1).max(4000),
  provider: z.enum(["gemini", "seedream"]),
  style: z.string().max(200).optional(),
});

function buildPrompt(summary: string, style?: string) {
  const styleLine =
    style?.trim() ||
    "warm, cozy, hand-drawn watercolor diary comic, soft amber & moss palette, gentle linework, slight grain";
  return [
    `Create a daily life comic that visually narrates the user's day.`,
    `Decide the number of panels yourself based on how rich the day is — use 2-3 panels for a quiet day, 4-6 for a typical day, and up to 9 for an eventful one. Choose whatever count best tells the story.`,
    `Each panel should clearly read as a sequential moment (morning → day → evening / reflection).`,
    `Lay the panels out on a single image in a clean grid with thin gutters.`,
    `Add a short, legible English or Chinese caption inside each panel if helpful — keep typography minimal.`,
    `Style: ${styleLine}.`,
    `The user's day summary (do not include this text verbatim, interpret it visually):`,
    summary,
  ].join("\n\n");
}

export const generateDailyComic = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof Input>) => Input.parse(d))
  .handler(async ({ data }) => {
    const prompt = buildPrompt(data.summary, data.style);

    if (data.provider === "gemini") {
      const key = process.env.LOVABLE_API_KEY;
      if (!key) throw new Error("LOVABLE_API_KEY 未配置");
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        if (res.status === 429) throw new Error("Gemini 限流，请稍后再试");
        if (res.status === 402) throw new Error("Lovable AI 额度不足，请在工作区充值");
        throw new Error(`Gemini 失败 [${res.status}]: ${t.slice(0, 200)}`);
      }
      const j: any = await res.json();
      const msg = j?.choices?.[0]?.message;
      const url: string | undefined =
        msg?.images?.[0]?.image_url?.url ||
        msg?.images?.[0]?.url ||
        (Array.isArray(msg?.content)
          ? msg.content.find((c: any) => c?.image_url?.url)?.image_url?.url
          : undefined);
      if (!url) throw new Error("Gemini 没返回图片");
      const caption =
        (typeof msg?.content === "string" ? msg.content : "") ||
        msg?.content?.find?.((c: any) => c?.type === "text")?.text ||
        "";
      return { imageUrl: url, caption, provider: "gemini" as const };
    }

    // Seedream via 火山引擎 ARK
    const ark = process.env.ARK_API_KEY;
    if (!ark) {
      throw new Error(
        "Seedream 需要 ARK_API_KEY：在设置里添加火山引擎方舟的 API Key 后再试",
      );
    }
    const res = await fetch(
      "https://ark.cn-beijing.volces.com/api/v3/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ark}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "doubao-seedream-4-0-250828",
          prompt,
          size: "2K",
          response_format: "url",
          watermark: false,
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Seedream 失败 [${res.status}]: ${t.slice(0, 200)}`);
    }
    const j: any = await res.json();
    const url: string | undefined = j?.data?.[0]?.url || j?.data?.[0]?.b64_json
      ? (j.data[0].url ?? `data:image/png;base64,${j.data[0].b64_json}`)
      : undefined;
    if (!url) throw new Error("Seedream 没返回图片");
    return { imageUrl: url, caption: "", provider: "seedream" as const };
  });
