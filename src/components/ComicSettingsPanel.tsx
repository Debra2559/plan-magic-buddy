import { useSylva } from "@/lib/sylva-store";

type Provider = "gemini" | "seedream";

const PROVIDERS: { key: Provider; title: string; subtitle: string }[] = [
  { key: "gemini", title: "Gemini (Lovable 内置)", subtitle: "无需配置，开箱即用" },
  { key: "seedream", title: "火山 Seedream", subtitle: "需要 ARK_API_KEY，画风更国风/写实" },
];

const SEEDREAM_PRESETS = [
  "doubao-seedream-5-0-lite-251015",
  "doubao-seedream-5-0-lite-250915",
  "doubao-seedream-4-0-250828",
  "doubao-seedream-3-0-t2i-250415",
];

export function ComicSettingsPanel() {
  const {
    comicProvider,
    setComicProvider,
    comicSeedreamModel,
    setComicSeedreamModel,
    comicStyle,
    setComicStyle,
  } = useSylva();

  return (
    <div className="space-y-4">
      <div className="widget overflow-hidden">
        <div className="px-4 py-3 border-b border-white/8">
          <div className="text-sm text-white/90">生成提供方</div>
          <div className="text-xs text-white/50 mt-0.5">选择默认使用的图像模型</div>
        </div>
        <div className="divide-y divide-white/8">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              onClick={() => setComicProvider(p.key)}
              className="w-full flex items-center px-4 py-3 hover:bg-white/[0.03] text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/90">{p.title}</div>
                <div className="text-xs text-white/50 mt-0.5">{p.subtitle}</div>
              </div>
              <div
                className={`w-4 h-4 rounded-full border ${
                  comicProvider === p.key
                    ? "bg-amber-glow border-amber-glow"
                    : "border-white/25"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {comicProvider === "seedream" && (
        <div className="widget p-4 space-y-3">
          <div>
            <div className="text-sm text-white/90">Seedream 模型 ID</div>
            <div className="text-xs text-white/50 mt-0.5">
              火山方舟控制台 → 模型广场，复制你已开通模型的完整 ID（通常带日期后缀）
            </div>
          </div>
          <input
            value={comicSeedreamModel}
            onChange={(e) => setComicSeedreamModel(e.target.value)}
            placeholder="doubao-seedream-5-0-lite-XXXXXX"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-glow/50 font-mono"
          />
          <div className="flex flex-wrap gap-1.5">
            {SEEDREAM_PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => setComicSeedreamModel(m)}
                className={`text-[10px] px-2 py-1 rounded-full border font-mono ${
                  comicSeedreamModel === m
                    ? "bg-amber-glow/20 border-amber-glow/40 text-amber-glow"
                    : "bg-white/5 border-white/10 text-white/55 hover:bg-white/10"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="widget p-4 space-y-2">
        <div>
          <div className="text-sm text-white/90">风格 Prompt（可选）</div>
          <div className="text-xs text-white/50 mt-0.5">
            留空使用默认的「温暖手绘水彩日记漫画」风格
          </div>
        </div>
        <textarea
          value={comicStyle}
          onChange={(e) => setComicStyle(e.target.value)}
          placeholder="例如：ghibli 风、赛博朋克、铅笔速写、极简线稿…"
          rows={3}
          maxLength={200}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-glow/50 resize-none"
        />
        <div className="text-[10px] text-white/35 text-right">{comicStyle.length}/200</div>
      </div>
    </div>
  );
}
