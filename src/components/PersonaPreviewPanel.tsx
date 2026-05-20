import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Sunrise, Coffee, ListChecks, Moon } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { previewPersonaScenarios } from "@/lib/persona-preview.functions";

type Scenarios = {
  morning: string;
  procrastination: string;
  planning: string;
  evening: string;
};

const SCENES: Array<{ key: keyof Scenarios; label: string; user: string; Icon: typeof Sunrise }> = [
  { key: "morning", label: "早安问候", user: "早上好～", Icon: Sunrise },
  { key: "procrastination", label: "我想躺平", user: "今天不想干活想躺着…", Icon: Coffee },
  { key: "planning", label: "帮我排日程", user: "帮我安排今天该做什么", Icon: ListChecks },
  { key: "evening", label: "晚间复盘", user: "今天结束了，复盘一下吧", Icon: Moon },
];

export function PersonaPreviewPanel({
  personaPrompt,
  displayName,
  aiNickname,
}: {
  personaPrompt: string;
  displayName: string;
  aiNickname: string;
}) {
  const previewFn = useServerFn(previewPersonaScenarios);
  const [scenarios, setScenarios] = useState<Scenarios | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const fetchPreview = async () => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const r = await previewFn({
        data: {
          personaPrompt,
          displayName: displayName || "你",
        },
      });
      if (my !== seq.current) return;
      if (r.ok) setScenarios(r.scenarios as Scenarios);
      else setError(r.error);
    } catch (e: any) {
      if (my === seq.current) setError(e?.message ?? "预览失败");
    } finally {
      if (my === seq.current) setLoading(false);
    }
  };

  // 防抖：人设变化后 1.2s 自动刷新
  useEffect(() => {
    if (!auto) return;
    if (!personaPrompt?.trim()) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetchPreview();
    }, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaPrompt, displayName, auto]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-foreground/85 font-medium">
          实时预览 · AI 在不同场景下会怎么说
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground select-none cursor-pointer">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="accent-amber-glow"
            />
            自动刷新
          </label>
          <button
            type="button"
            onClick={fetchPreview}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-foreground/5 border border-border hover:border-amber-glow/50 text-[11px] text-foreground/80 disabled:opacity-50"
            title="重新生成预览"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-rose-300/90 px-2 py-1.5 rounded border border-rose-400/30 bg-rose-400/5">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {SCENES.map(({ key, label, user, Icon }) => {
          const reply = scenarios?.[key];
          const isLoading = loading && !reply;
          return (
            <div
              key={key}
              className="rounded-xl border border-border bg-background/40 p-3 space-y-2 hover:border-amber-glow/30 transition"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-amber-glow/90 font-medium">
                <Icon className="w-3.5 h-3.5" />
                {label}
              </div>
              {/* 用户气泡 */}
              <div className="flex justify-end">
                <div className="max-w-[85%] px-2.5 py-1.5 rounded-2xl rounded-tr-sm bg-foreground/10 text-[11px] text-foreground/80">
                  {user}
                </div>
              </div>
              {/* AI 气泡 */}
              <div className="flex items-start gap-1.5">
                <div className="shrink-0 w-5 h-5 rounded-full bg-amber-glow/20 border border-amber-glow/40 flex items-center justify-center text-[9px] text-amber-glow font-medium">
                  {(aiNickname || "AI").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0 px-2.5 py-1.5 rounded-2xl rounded-tl-sm bg-amber-glow/10 border border-amber-glow/25 text-[12px] leading-relaxed text-foreground/95 whitespace-pre-wrap">
                  {isLoading ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      生成中…
                    </span>
                  ) : reply ? (
                    reply
                  ) : (
                    <span className="text-muted-foreground/70 italic">
                      调整人设后会自动生成…
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
