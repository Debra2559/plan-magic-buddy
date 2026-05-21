import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
        className="fixed top-12 right-4 z-40 group flex items-center gap-1.5 px-3 py-2 rounded-full bg-card/90 hover:bg-card backdrop-blur-xl border border-border text-foreground text-xs transition shadow-lg"
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
        <div className="fixed inset-0 z-50 flex justify-end animate-fade-in" onClick={() => setOpen(false)}>
          <aside
            className="relative w-full max-w-md h-full bg-background/95 backdrop-blur-2xl border-l border-border/50 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-glow/5 blur-[100px] pointer-events-none" />

            <header className="relative flex items-center justify-between px-6 py-6 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-glow animate-pulse shadow-[0_0_10px_hsl(var(--amber-glow))]" />
                <h2 className="font-display text-2xl text-foreground font-semibold tracking-wide">AI 行为洞察</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => generateMut.mutate()}
                  disabled={generateMut.isPending}
                  className="p-2 rounded-full hover:bg-foreground/5 text-muted-foreground/70 hover:text-foreground transition disabled:opacity-50"
                  title="重新生成"
                >
                  <RefreshCw className={`w-4 h-4 ${generateMut.isPending ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-full hover:bg-foreground/5 text-muted-foreground/70 hover:text-foreground transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            <div className="relative flex-1 overflow-y-auto px-6 py-6 space-y-4 insights-scroll">
              {isLoading && <div className="text-center text-muted-foreground/70 text-sm py-12">加载中…</div>}

              {!isLoading && insights.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-amber-glow/20 blur-3xl rounded-full animate-pulse" />
                    <Sparkles className="w-14 h-14 text-amber-glow/50 relative z-10" strokeWidth={1} />
                  </div>
                  <p className="font-display text-xl text-foreground/75 mb-2 italic">星辰指引中…</p>
                  <p className="text-sm text-muted-foreground/70 mb-8 max-w-[220px] leading-relaxed">
                    让 AI 梳理你最近的行为轨迹，生成专属洞察
                  </p>
                  <button
                    onClick={() => generateMut.mutate()}
                    disabled={generateMut.isPending}
                    className="px-6 py-2.5 rounded-full bg-amber-glow text-primary-foreground font-semibold text-sm hover:scale-105 active:scale-95 transition-transform shadow-[0_0_20px_hsl(var(--amber-glow)/0.3)] disabled:opacity-60 disabled:hover:scale-100"
                  >
                    {generateMut.isPending ? "生成中…" : "刷新洞察"}
                  </button>
                </div>
              )}

              {insights.map((i: AiInsight) => {
                const meta = KIND_META[i.kind] ?? KIND_META.suggestion;
                const Icon = meta.icon;
                const slotLabel = i.slot === "morning" ? "早晨" : i.slot === "noon" ? "午间" : "傍晚";
                return (
                  <div
                    key={i.id}
                    className="group relative bg-foreground/5 border border-border rounded-2xl p-5 hover:bg-foreground/[0.08] hover:border-amber-glow/30 transition-all duration-300"
                  >
                    <button
                      onClick={() => dismissMut.mutate(i.id)}
                      className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-foreground transition-opacity"
                      title="忽略"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    <div className="flex items-start gap-4">
                      <div className={`mt-1 w-9 h-9 rounded-lg bg-foreground/5 border border-border flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0 pr-6">
                        <h3 className="text-sm font-semibold text-foreground mb-1.5 leading-tight">{i.title}</h3>
                        <p className="text-[13px] text-muted-foreground leading-relaxed">{i.content}</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between text-[10px] tracking-wider uppercase text-muted-foreground/60">
                      <span>{i.date} · {slotLabel}</span>
                      <span className={`px-2 py-0.5 rounded-full border font-medium ${
                        i.kind === "warning"
                          ? "bg-rose-500/10 border-rose-500/20 text-rose-300/80"
                          : i.kind === "encouragement"
                          ? "bg-amber-glow/10 border-amber-glow/20 text-amber-glow/80"
                          : "bg-foreground/5 border-border/50 text-muted-foreground/70"
                      }`}>
                        {meta.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <footer className="relative px-6 py-5 border-t border-border/50 bg-gradient-to-t from-black/30 to-transparent flex items-center justify-between text-[11px] text-muted-foreground/60 tracking-tight">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
                <span>每日早/午/晚自动生成</span>
              </div>
              <a
                href="#settings/insights"
                onClick={() => setOpen(false)}
                className="hover:text-amber-glow transition-colors"
              >
                洞察设置 →
              </a>
            </footer>
          </aside>

          <style>{`
            .insights-scroll::-webkit-scrollbar { width: 3px; }
            .insights-scroll::-webkit-scrollbar-track { background: transparent; }
            .insights-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
            .insights-scroll::-webkit-scrollbar-thumb:hover { background: hsl(var(--amber-glow) / 0.2); }
          `}</style>
        </div>
      )}
    </>
  );
}
