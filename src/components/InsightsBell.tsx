import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, X, RefreshCw, Bell, Lightbulb, AlertTriangle, Heart, TrendingUp, Clock } from "lucide-react";
import { listMyInsights, generateMyInsightsNow, dismissInsight, type AiInsight } from "@/lib/insights.functions";

const KIND_META: Record<string, { icon: typeof Sparkles; label: string; tone: string }> = {
  reminder: { icon: Clock, label: "提醒", tone: "text-amber-glow" },
  suggestion: { icon: Lightbulb, label: "建议", tone: "text-sky-300" },
  pattern: { icon: TrendingUp, label: "洞察", tone: "text-emerald-300" },
  encouragement: { icon: Heart, label: "鼓励", tone: "text-pink-300" },
  warning: { icon: AlertTriangle, label: "提示", tone: "text-rose-300" },
};

export function InsightsBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fetchInsights = useServerFn(listMyInsights);
  const generate = useServerFn(generateMyInsightsNow);
  const dismiss = useServerFn(dismissInsight);

  const { data, isLoading } = useQuery({
    queryKey: ["my-insights"],
    queryFn: () => fetchInsights(),
    refetchInterval: 5 * 60_000,
  });

  const generateMut = useMutation({
    mutationFn: () => generate({ data: { slot: "auto" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-insights"] }),
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => dismiss({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-insights"] }),
  });

  const insights = (data?.insights ?? []).filter((i: AiInsight) => !i.dismissed);
  const unreadCount = insights.length;

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  return (
    <>
      {/* Floating bell */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-12 right-4 z-40 group flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-white/15 text-white text-xs transition shadow-lg"
        aria-label="AI 行为洞察"
      >
        <Sparkles className="w-3.5 h-3.5 text-amber-glow" />
        <span className="font-medium">AI 提示</span>
        {unreadCount > 0 && (
          <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-glow text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md h-full bg-black/85 backdrop-blur-2xl border-l border-white/10 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-glow" />
                <h2 className="font-display text-base text-white">AI 行为洞察</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => generateMut.mutate()}
                  disabled={generateMut.isPending}
                  className="p-2 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition disabled:opacity-50"
                  title="重新生成"
                >
                  <RefreshCw className={`w-4 h-4 ${generateMut.isPending ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoading && <div className="text-center text-white/50 text-sm py-8">加载中…</div>}
              {!isLoading && insights.length === 0 && (
                <div className="text-center py-12">
                  <Bell className="w-10 h-10 mx-auto text-white/20 mb-3" />
                  <p className="text-white/50 text-sm">暂时没有新的提示</p>
                  <button
                    onClick={() => generateMut.mutate()}
                    disabled={generateMut.isPending}
                    className="mt-4 px-4 py-2 rounded-full bg-amber-glow/90 hover:bg-amber-glow text-primary-foreground text-xs font-medium transition disabled:opacity-50"
                  >
                    {generateMut.isPending ? "生成中…" : "让 AI 看看我最近的行为"}
                  </button>
                </div>
              )}

              {insights.map((i: AiInsight) => {
                const meta = KIND_META[i.kind] ?? KIND_META.suggestion;
                const Icon = meta.icon;
                return (
                  <div key={i.id} className="group relative rounded-xl bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 p-4 transition">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center ${meta.tone}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-white text-sm leading-tight">{i.title}</h3>
                          <span className="text-[10px] uppercase tracking-wider text-white/35">{meta.label}</span>
                        </div>
                        <p className="text-[13px] text-white/75 leading-relaxed">{i.content}</p>
                        <div className="mt-2 text-[10px] text-white/35">
                          {i.date} · {i.slot === "morning" ? "早晨" : i.slot === "noon" ? "午间" : "傍晚"}
                        </div>
                      </div>
                      <button
                        onClick={() => dismissMut.mutate(i.id)}
                        className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/80"
                        title="忽略"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <footer className="px-5 py-3 border-t border-white/8 text-[11px] text-white/40 flex items-center justify-between">
              <span>每日早/午/晚自动生成</span>
              <a href="#settings/insights" onClick={() => setOpen(false)} className="text-white/60 hover:text-amber-glow transition">设置 →</a>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
