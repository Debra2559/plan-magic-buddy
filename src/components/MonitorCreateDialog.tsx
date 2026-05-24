import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { X, Sparkles, Loader2, Brain, ChevronRight, Check, Calendar, Trophy, Newspaper, RefreshCw, Trash2, Plus, Pencil } from "lucide-react";
import {
  analyzeMonitorTopic,
  finalizeMonitorPlan,
  getHackathonSettings,
  updateHackathonSettings,
} from "@/lib/hackathons.functions";
import { getAiNewsSettings, updateAiNewsSettings } from "@/lib/ai-news.functions";

type Kind = "activity" | "ai-news";

interface Question {
  id: string;
  label: string;
  hint: string;
  suggestions: string[];
}

interface PlanSource {
  name: string;
  query: string;
  rationale: string;
}

interface Plan {
  thinking: string[];
  name: string;
  interval_hours: number;
  sources: PlanSource[];
  tips: string[];
}

type Stage = "analyze" | "questions" | "plan" | "saving" | "done";

interface Props {
  open: boolean;
  initialPrompt: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

export function MonitorCreateDialog({ open, initialPrompt, onClose, onSaved }: Props) {
  const analyzeFn = useServerFn(analyzeMonitorTopic);
  const finalizeFn = useServerFn(finalizeMonitorPlan);
  const getHack = useServerFn(getHackathonSettings);
  const updHack = useServerFn(updateHackathonSettings);
  const getAi = useServerFn(getAiNewsSettings);
  const updAi = useServerFn(updateAiNewsSettings);

  const [stage, setStage] = useState<Stage>("analyze");
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [analyzeThinking, setAnalyzeThinking] = useState<string[]>([]);
  const [visibleThinking, setVisibleThinking] = useState(0);
  const [kind, setKind] = useState<Kind>("activity");
  const [topicSummary, setTopicSummary] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<Plan | null>(null);
  const ranRef = useRef(false);

  // Reset every open
  useEffect(() => {
    if (!open) return;
    ranRef.current = false;
    setStage("analyze");
    setError(null);
    setPrompt(initialPrompt);
    setAnalyzeThinking([]);
    setVisibleThinking(0);
    setQuestions([]);
    setAnswers({});
    setPlan(null);
    setTopicSummary("");
  }, [open, initialPrompt]);

  // Drip thinking lines for that "AI typing" feel
  useEffect(() => {
    if (analyzeThinking.length === 0) return;
    if (visibleThinking >= analyzeThinking.length) return;
    const t = setTimeout(() => setVisibleThinking((n) => n + 1), 380);
    return () => clearTimeout(t);
  }, [analyzeThinking, visibleThinking]);

  // Auto-run analyze when dialog opens
  useEffect(() => {
    if (!open || ranRef.current) return;
    ranRef.current = true;
    void runAnalyze(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function runAnalyze(p: string) {
    setStage("analyze");
    setError(null);
    setAnalyzeThinking([]);
    setVisibleThinking(0);
    try {
      const r = await analyzeFn({ data: { prompt: p } });
      if (!r.ok) { setError("AI 分析失败"); return; }
      setKind(r.kind);
      setTopicSummary(r.topic_summary);
      setAnalyzeThinking(r.thinking);
      setQuestions(r.questions);
      // After thinking dripped out, move to questions
      const totalDelay = r.thinking.length * 380 + 600;
      setTimeout(() => setStage("questions"), totalDelay);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runFinalize() {
    setStage("plan");
    setError(null);
    try {
      const r = await finalizeFn({ data: { prompt, kind, answers } });
      if (!r.ok) { setError("AI 规划失败"); return; }
      setPlan({
        thinking: r.thinking,
        name: r.name,
        interval_hours: r.interval_hours,
        sources: r.sources,
        tips: r.tips,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function save() {
    if (!plan) return;
    setStage("saving");
    setError(null);
    try {
      if (kind === "activity") {
        const cur = await getHack();
        if (!cur.ok || !cur.settings) { setError("加载设置失败"); setStage("plan"); return; }
        const existing = new Set(cur.settings.sources.map((s) => s.query));
        const additions = plan.sources
          .filter((s) => !existing.has(s.query))
          .map((s) => ({ name: s.name, query: s.query, enabled: true }));
        const r = await updHack({
          data: {
            sources: [...cur.settings.sources, ...additions],
            scan_interval_hours: plan.interval_hours,
          },
        });
        if (!r.ok) { setError(r.error); setStage("plan"); return; }
        onSaved(`🏔️ ${plan.name} · 新增 ${additions.length} 个来源 · 每 ${plan.interval_hours}h 扫一次`);
      } else {
        const cur = await getAi();
        if (!cur.ok) { setError("加载设置失败"); setStage("plan"); return; }
        const existing = new Set(cur.settings.sources.map((s) => s.query));
        const additions = plan.sources
          .filter((s) => !existing.has(s.query))
          .map((s) => ({ name: s.name, query: s.query, enabled: true }));
        const r = await updAi({
          data: {
            enabled: cur.settings.enabled,
            sources: [...cur.settings.sources, ...additions],
            include_keywords: cur.settings.include_keywords,
            exclude_keywords: cur.settings.exclude_keywords,
            tag_filters: cur.settings.tag_filters,
            scan_interval_hours: plan.interval_hours,
            time_window: cur.settings.time_window,
            per_source_limit: cur.settings.per_source_limit,
          },
        });
        if (!r.ok) { setError(r.error); setStage("plan"); return; }
        onSaved(`📰 ${plan.name} · 新增 ${additions.length} 个来源 · 每 ${plan.interval_hours}h 扫一次`);
      }
      setStage("done");
      setTimeout(onClose, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("plan");
    }
  }

  if (!open) return null;

  const kindLabel = kind === "activity" ? "活动/赛事雷达" : "AI 动态雷达";
  const KindIcon = kind === "activity" ? Trophy : Newspaper;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-auto rounded-2xl bg-card border border-amber-glow/30 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 bg-card/95 backdrop-blur border-b border-foreground/10">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-amber-glow" />
            <span className="text-sm font-medium text-foreground">新建监控 · AI 帮你想清楚</span>
            {topicSummary && (
              <span className="text-[11px] text-foreground/55 ml-2 flex items-center gap-1">
                <KindIcon className="w-3 h-3" /> {kindLabel}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Original prompt */}
          <div className="text-[11px] text-foreground/50">
            <span className="text-foreground/40">你的诉求 · </span>
            <span className="text-foreground/80">{prompt}</span>
          </div>

          {/* Thinking panel */}
          {analyzeThinking.length > 0 && (
            <div className="rounded-xl bg-amber-glow/5 border border-amber-glow/20 p-3.5">
              <div className="flex items-center gap-1.5 mb-2 text-[10.5px] tracking-wider text-amber-glow">
                <Brain className="w-3 h-3" />
                AI 思考
                {stage === "analyze" && visibleThinking < analyzeThinking.length && (
                  <Loader2 className="w-3 h-3 animate-spin ml-auto" />
                )}
              </div>
              <ul className="space-y-1.5">
                {analyzeThinking.slice(0, visibleThinking).map((t, i) => (
                  <li key={i} className="text-[12px] text-foreground/75 leading-relaxed flex gap-2 animate-in fade-in slide-in-from-left-1 duration-300">
                    <ChevronRight className="w-3 h-3 mt-1 shrink-0 text-amber-glow/70" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Loading first analyze */}
          {stage === "analyze" && analyzeThinking.length === 0 && !error && (
            <div className="flex items-center justify-center py-10 text-foreground/60 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> AI 正在分析这个主题…
            </div>
          )}

          {/* Questions */}
          {stage === "questions" && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="text-[11px] text-foreground/55">
                先回答 {questions.length} 个小问题，可多选；AI 会把答案揉进搜索关键词里。可以跳过。
              </div>
              {questions.map((q) => {
                const raw = answers[q.id] ?? "";
                const selected = raw.split(",").map((s) => s.trim()).filter(Boolean);
                const toggle = (s: string) => {
                  const next = selected.includes(s)
                    ? selected.filter((x) => x !== s)
                    : [...selected, s];
                  setAnswers((a) => ({ ...a, [q.id]: next.join(", ") }));
                };
                return (
                <div key={q.id} className="rounded-xl bg-foreground/[0.03] border border-foreground/10 p-3">
                  <div className="text-[12px] text-foreground mb-0.5">{q.label}</div>
                  <div className="text-[10.5px] text-foreground/45 mb-2">{q.hint} · 可多选</div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {q.suggestions.map((s) => {
                      const active = selected.includes(s);
                      return (
                        <button
                          key={s}
                          onClick={() => toggle(s)}
                          className={`text-[11px] px-2 py-1 rounded-full border transition ${
                            active
                              ? "bg-amber-glow/20 border-amber-glow/50 text-amber-glow"
                              : "bg-background/40 border-foreground/15 text-foreground/65 hover:border-foreground/30"
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={raw}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    placeholder="或者自己写，用逗号分隔多个…"
                    className="w-full bg-background/40 border border-foreground/10 rounded-md px-2.5 py-1.5 text-[11.5px] text-foreground placeholder:text-foreground/30 focus:border-amber-glow/50 focus:outline-none"
                  />
                </div>
                );
              })}
              <div className="flex justify-between items-center pt-1">
                <button
                  onClick={() => void runAnalyze(prompt)}
                  className="text-[11px] text-foreground/50 hover:text-foreground flex items-center gap-1 transition"
                >
                  <RefreshCw className="w-3 h-3" /> AI 再想一次
                </button>
                <button
                  onClick={runFinalize}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs bg-amber-glow text-background hover:scale-[1.02] transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  让 AI 生成方案
                </button>
              </div>
            </div>
          )}

          {/* Plan loading */}
          {stage === "plan" && !plan && (
            <div className="flex items-center justify-center py-10 text-foreground/60 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> AI 正在根据你的回答规划来源…
            </div>
          )}

          {/* Plan preview */}
          {plan && (stage === "plan" || stage === "saving") && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="rounded-xl bg-amber-glow/5 border border-amber-glow/20 p-3.5">
                <div className="flex items-center gap-1.5 mb-2 text-[10.5px] tracking-wider text-amber-glow">
                  <Brain className="w-3 h-3" /> AI 规划思路
                </div>
                <ul className="space-y-1.5">
                  {plan.thinking.map((t, i) => (
                    <li key={i} className="text-[12px] text-foreground/75 leading-relaxed flex gap-2">
                      <ChevronRight className="w-3 h-3 mt-1 shrink-0 text-amber-glow/70" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-foreground/[0.03] border border-foreground/10 p-3.5 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Pencil className="w-3 h-3 text-foreground/40" />
                    <input
                      value={plan.name}
                      onChange={(e) => setPlan({ ...plan, name: e.target.value })}
                      className="flex-1 bg-transparent border-b border-foreground/10 focus:border-amber-glow/60 outline-none text-[13px] font-medium text-foreground py-0.5"
                    />
                  </div>
                  <div className="text-[10.5px] text-foreground/50 flex items-center gap-1.5 flex-wrap">
                    <KindIcon className="w-3 h-3" /> {kindLabel}
                    <span className="opacity-40">·</span>
                    <Calendar className="w-3 h-3" />
                    <span>每</span>
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={plan.interval_hours}
                      onChange={(e) => setPlan({ ...plan, interval_hours: Math.max(1, Math.min(168, Number(e.target.value) || 1)) })}
                      className="w-12 bg-background/40 border border-foreground/10 rounded px-1.5 py-0.5 text-[11px] text-foreground focus:border-amber-glow/60 outline-none"
                    />
                    <span>h 扫一次</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="text-[10.5px] tracking-wider text-foreground/45">推荐来源 ({plan.sources.length}) · 可编辑</div>
                    <button
                      onClick={() => setPlan({ ...plan, sources: [...plan.sources, { name: "自定义来源", query: "", rationale: "手动添加" }] })}
                      className="text-[10.5px] text-amber-glow/80 hover:text-amber-glow flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> 加一条
                    </button>
                  </div>
                  {plan.sources.map((s, i) => (
                    <div key={i} className="rounded-lg bg-background/40 border border-foreground/10 p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          value={s.name}
                          onChange={(e) => {
                            const next = [...plan.sources];
                            next[i] = { ...next[i], name: e.target.value };
                            setPlan({ ...plan, sources: next });
                          }}
                          placeholder="来源名"
                          className="flex-1 bg-transparent border-b border-transparent hover:border-foreground/10 focus:border-amber-glow/50 outline-none text-[12px] font-medium text-foreground py-0.5"
                        />
                        <button
                          onClick={() => setPlan({ ...plan, sources: plan.sources.filter((_, idx) => idx !== i) })}
                          className="text-foreground/30 hover:text-destructive transition shrink-0"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        value={s.query}
                        onChange={(e) => {
                          const next = [...plan.sources];
                          next[i] = { ...next[i], query: e.target.value };
                          setPlan({ ...plan, sources: next });
                        }}
                        placeholder="搜索关键词 / site: 语法"
                        className="w-full bg-background/60 border border-foreground/10 rounded px-2 py-1 text-[10.5px] text-foreground/80 placeholder:text-foreground/30 focus:border-amber-glow/50 outline-none"
                      />
                      <div className="text-[10.5px] text-foreground/45 leading-snug">{s.rationale}</div>
                    </div>
                  ))}
                </div>

                {plan.tips.length > 0 && (
                  <div className="pt-2 border-t border-foreground/5">
                    <div className="text-[10.5px] tracking-wider text-foreground/45 mb-1.5">小贴士</div>
                    <ul className="space-y-1">
                      {plan.tips.map((t, i) => (
                        <li key={i} className="text-[11px] text-foreground/60 flex gap-1.5">
                          <span className="text-amber-glow/60">·</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center">
                <button
                  onClick={() => setStage("questions")}
                  className="text-[11px] text-foreground/50 hover:text-foreground transition"
                >
                  ← 改一下回答
                </button>
                <button
                  onClick={save}
                  disabled={stage === "saving"}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs bg-amber-glow text-background hover:scale-[1.02] transition disabled:opacity-40"
                >
                  {stage === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {stage === "saving" ? "保存中…" : "就用这套方案"}
                </button>
              </div>
            </div>
          )}

          {stage === "done" && (
            <div className="flex items-center justify-center py-8 text-amber-glow text-sm gap-2 animate-in fade-in">
              <Check className="w-5 h-5" /> 已加入监控
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded-lg bg-destructive/15 border border-destructive/30 text-[11px] text-destructive-foreground">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
