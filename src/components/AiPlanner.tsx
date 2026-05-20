import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generatePlan, chatPlan, type Plan, type PlanItem, type ChatStep } from "@/lib/plan.functions";
import { useSylva } from "@/lib/sylva-store";
import { EnterHint } from "@/components/EnterHint";
import { shouldSubmitOnKey } from "@/lib/keybinds";
import { Sparkles, ArrowUp, Loader2, Calendar, CheckSquare, Bell, Plus, RefreshCw, Wand2, Check, X, Trash2, Target, Globe, Eye } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type Mode = "auto" | "create" | "adjust" | "add" | "goal";

const modeMeta: Record<Mode, { label: string; icon: typeof Wand2; hint: string }> = {
  auto: { label: "智能识别", icon: Sparkles, hint: "不用选，AI 自动判断该新建/调整/追加" },
  create: { label: "全新规划", icon: Wand2, hint: "从 0 到 1 帮我排" },
  adjust: { label: "调整重排", icon: RefreshCw, hint: "重新平衡现有规划" },
  add: { label: "追加事项", icon: Plus, hint: "往现有规划里加" },
  goal: { label: "目标拆解", icon: Target, hint: "智能追问 + 联网找方案" },
};

type ChatMsg = { role: "user" | "assistant"; content: string; quickReplies?: string[] };

const typeMeta: Record<PlanItem["type"], { icon: typeof Calendar; color: string; label: string }> = {
  event: { icon: Calendar, color: "text-amber-glow", label: "日程" },
  todo: { icon: CheckSquare, color: "text-moss", label: "待办" },
  reminder: { icon: Bell, color: "text-accent", label: "提醒" },
};

const tagColors: Record<string, string> = {
  工作: "bg-moss/15 text-moss border-moss/30",
  学习: "bg-amber-glow/15 text-amber-glow border-amber-glow/30",
  健康: "bg-accent/15 text-accent border-accent/30",
  生活: "bg-foreground/10 text-foreground/70 border-foreground/20",
  英语: "bg-amber-glow/15 text-amber-glow border-amber-glow/30",
  习惯: "bg-moss/15 text-moss border-moss/30",
};

function ThinkingTrace({ active, variant }: { active: boolean; variant: "plan" | "goal-clarify" | "goal-research" | "goal-plan" }) {
  const stagesMap: Record<typeof variant, string[]> = {
    "plan": ["理解你的想法", "拆解关键节点", "安排时间与节奏", "检查冲突与负载", "整理最终规划"],
    "goal-clarify": ["读取你说的内容", "判断关键参数是否齐全", "想 1-2 个最关键的追问"],
    "goal-research": ["读取你说的内容", "判断需要哪些外部信息", "联网搜索最新资料", "整理可用片段"],
    "goal-plan": ["回顾完整对话", "拆解为日程 / 待办 / 提醒", "排布每日节奏", "校验冲突与负载", "整理最终规划"],
  };
  const stages = stagesMap[variant];
  const [idx, setIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!active) { setIdx(0); setElapsed(0); return; }
    startRef.current = Date.now();
    setIdx(0);
    setElapsed(0);
    const tick = setInterval(() => {
      setElapsed(Math.round((Date.now() - startRef.current) / 1000));
      setIdx((p) => Math.min(p + 1, stages.length - 1));
    }, 1600);
    return () => clearInterval(tick);
  }, [active, stages.length]);

  if (!active) return null;
  return (
    <div className="mt-3 rounded-xl border border-amber-glow/20 bg-amber-glow/[0.04] p-3 animate-in fade-in duration-300">
      <div className="flex items-center gap-2 mb-2 text-[11px] text-amber-glow/90 tracking-wider">
        <Sparkles className="w-3 h-3 animate-pulse" />
        <span>AI 思考过程</span>
        <span className="ml-auto font-mono text-amber-glow/60">{elapsed}s</span>
      </div>
      <ol className="space-y-1.5">
        {stages.map((s, i) => {
          const done = i < idx;
          const current = i === idx;
          return (
            <li key={s} className={`flex items-center gap-2 text-xs transition ${done ? "text-foreground/55" : current ? "text-foreground/95" : "text-foreground/30"}`}>
              <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                {done ? <Check className="w-3 h-3 text-moss" /> : current ? <Loader2 className="w-3 h-3 animate-spin text-amber-glow" /> : <span className="w-1.5 h-1.5 rounded-full bg-foreground/25" />}
              </span>
              <span className={current ? "font-medium" : ""}>{s}</span>
              {current && <span className="ml-1 text-amber-glow/60 animate-pulse">…</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function AiPlanner({ onGoSettings, onConfirmed }: { onGoSettings?: () => void; onConfirmed?: () => void } = {}) {
  const { items: confirmedFull, addItems, addItemsPending, replaceItems, removeItem, clearItems, enterToSubmit, markRecentlySynced, setSyncSummary } = useSylva();
  const confirmed = confirmedFull;
  const [mode, setMode] = useState<Mode>("auto");
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Plan | null>(null);
  const [draftMode, setDraftMode] = useState<"create" | "adjust" | "add">("create");
  const planFn = useServerFn(generatePlan);
  const chatFn = useServerFn(chatPlan);
  const [previewOpen, setPreviewOpen] = useState(false);


  // Goal-chat state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStep, setChatStep] = useState<ChatStep | null>(null);

  const handleSubmit = async () => {
    if (mode === "goal") {
      await runChat(chatInput.trim() || idea.trim());
      return;
    }
    if (!idea.trim() || loading) return;
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const existing: PlanItem[] = confirmed.map(({ id: _id, done: _done, ...rest }) => rest);
      const sendMode = mode as "create" | "adjust" | "add" | "auto";
      const result = await planFn({
        data: {
          idea: idea.trim(),
          mode: sendMode,
          existing: sendMode !== "create" && existing.length ? existing : undefined,
        },
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setDraft(result.plan);
        setDraftMode(result.mode);
        if (mode === "auto") {
          const label = result.mode === "add" ? "追加" : result.mode === "adjust" ? "调整重排" : "全新规划";
          toast.message(`AI 识别为：${label}`, { duration: 2500 });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  const runChat = async (text: string) => {
    if (!text || loading) return;
    const nextMessages: ChatMsg[] = [...chatMessages, { role: "user", content: text }];
    setChatMessages(nextMessages);
    setChatInput("");
    setLoading(true);
    setError(null);
    setChatStep(null);
    try {
      const existing: PlanItem[] = confirmed.map(({ id: _id, done: _done, ...rest }) => rest);
      const result = await chatFn({
        data: {
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          existing: existing.length ? existing : undefined,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setChatStep(result.step);
      if (result.step.kind === "clarify") {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.step.kind === "clarify" ? result.step.question : "", quickReplies: result.step.kind === "clarify" ? result.step.quickReplies : [] },
        ]);
      } else if (result.step.kind === "plan") {
        setDraft({ summary: result.step.summary, items: result.step.items });
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: `✅ ${result.step.kind === "plan" ? result.step.summary : ""}\n已生成 ${result.step.kind === "plan" ? result.step.items.length : 0} 条安排，请在右边确认。` },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  const resetChat = () => {
    setChatMessages([]);
    setChatInput("");
    setChatStep(null);
    setDraft(null);
    setError(null);
  };

  const openPreview = () => {
    if (!draft) return;
    setPreviewOpen(true);
  };

  const confirmDraft = () => {
    if (!draft) return;
    const counts = draft.items.reduce(
      (acc, it) => {
        acc[it.type] = (acc[it.type] ?? 0) + 1;
        return acc;
      },
      { event: 0, todo: 0, reminder: 0 } as Record<PlanItem["type"], number>,
    );
    const ids = draftMode === "add" ? addItemsPending(draft.items) : replaceItems(draft.items);
    markRecentlySynced(ids);
    // 构造带 id 的快照，供汇总弹窗展示
    const withIds = draft.items.map((it, i) => ({ ...it, id: ids[i] }));
    setSyncSummary({
      ts: Date.now(),
      ids,
      events: withIds.filter((i) => i.type === "event"),
      todos: withIds.filter((i) => i.type === "todo"),
      reminders: withIds.filter((i) => i.type === "reminder"),
      appliedMode: draftMode,
    });
    const parts = [
      counts.event ? `日程 ${counts.event}` : "",
      counts.todo ? `待办 ${counts.todo}` : "",
      counts.reminder ? `提醒 ${counts.reminder}` : "",
    ].filter(Boolean).join(" · ");
    toast.success(draftMode === "add" ? "已写入待确认，请在日程页确认" : "规划已同步", {
      description: draftMode === "add"
        ? `${parts || `共 ${draft.items.length} 项`}　日历里以虚线标记，确认后才会同步`
        : `${parts || `共 ${draft.items.length} 项`}　可在汇总入口快速跳转`,
      duration: 4000,
    });
    setPreviewOpen(false);
    setDraft(null);
    setIdea("");
    onConfirmed?.();
  };

  const discardDraft = () => setDraft(null);

  const removeConfirmed = (id: string) => {
    removeItem(id);
  };

  const grouped = groupByDate(confirmed.map((c) => ({ ...c, _key: c.id })));
  const draftGrouped = draft ? groupByDate(draft.items.map((it, i) => ({ ...it, _key: `d-${i}` }))) : null;





  return (
    <div className="space-y-6">
      {/* 统一生成面板：输入 + 模式选择 */}
      <div className="widget widget-glow p-6">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="w-4 h-4 text-amber-glow" />
          <span className="text-xs tracking-wider text-amber-glow">一键生成 · 直接把想法变成完整规划</span>
        </div>

        {mode === "goal" ? (
          <div className="space-y-3">
            {chatMessages.length > 0 && (
              <div className="max-h-[260px] overflow-auto space-y-2 pr-1">
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-amber-glow/15 border border-amber-glow/30 text-foreground/90 ml-6"
                        : "bg-foreground/5 border border-foreground/10 text-foreground/85 mr-6"
                    }`}
                  >
                    {m.content}
                    {m.quickReplies && m.quickReplies.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {m.quickReplies.map((q) => (
                          <button
                            key={q}
                            onClick={() => runChat(q)}
                            disabled={loading}
                            className="text-[11px] px-2.5 py-1 rounded-full bg-amber-glow/10 border border-amber-glow/30 text-amber-glow hover:bg-amber-glow/20 transition disabled:opacity-40"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {loading && chatStep?.kind === "research" && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> 正在联网查方案…</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (shouldSubmitOnKey(e, enterToSubmit)) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={chatMessages.length === 0 ? "告诉我一个目标，例如：我要考雅思 / 想 3 个月跑下半马" : "继续回答…"}
                rows={4}
                className="flex-1 min-h-[110px] bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-sm leading-relaxed resize-none outline-none focus:border-amber-glow/40 placeholder:text-foreground/40"
              />
              <button
                onClick={handleSubmit}
                disabled={loading || !chatInput.trim()}
                className="shrink-0 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-glow text-primary-foreground text-sm font-medium hover:scale-[1.02] transition disabled:opacity-40 disabled:scale-100"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? "思考中" : chatMessages.length === 0 ? "开始拆解" : "发送"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                mode === "create"
                  ? "例如：下周要准备毕业答辩，同时跑通飞书提效系统，每天还要泛听英语..."
                  : mode === "adjust"
                  ? "例如：周三下午突然有个会，把那天的安排往后推..."
                  : mode === "add"
                  ? "例如：再加一个每天 30 分钟的力量训练..."
                  : "一句话描述你想做的事，例如：这周冲毕业答辩 + 每天 30 分钟英语"
              }
              rows={4}
              className="flex-1 min-h-[110px] bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-sm leading-relaxed resize-none outline-none focus:border-amber-glow/40 placeholder:text-foreground/40"
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !idea.trim()}
              className="shrink-0 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-glow text-primary-foreground text-sm font-medium hover:scale-[1.02] transition disabled:opacity-40 disabled:scale-100"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? "生成中" : "生成规划"}
            </button>
          </div>
        )}

        <ThinkingTrace
          active={loading}
          variant={
            mode === "goal"
              ? chatStep?.kind === "research"
                ? "goal-research"
                : chatMessages.length >= 2
                ? "goal-plan"
                : "goal-clarify"
              : "plan"
          }
        />

        {/* Mode tabs（输入框下方） */}
        <div className="flex gap-2 mt-3 flex-wrap items-center">
          <span className="text-[10px] tracking-wider text-muted-foreground mr-1">模式</span>
          {(Object.keys(modeMeta) as Mode[]).map((m) => {
            const Icon = modeMeta[m].icon;
            const active = mode === m;
            const disabled = (m === "adjust" || m === "add") && confirmed.length === 0;
            return (
              <button
                key={m}
                disabled={disabled}
                onClick={() => {
                  setMode(m);
                  if (m === "goal") resetChat();
                }}
                title={modeMeta[m].hint}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition
                  ${active ? "bg-amber-glow/20 border-amber-glow/50 text-amber-glow" : "bg-foreground/5 border-foreground/10 text-foreground/70 hover:bg-foreground/10"}
                  ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
              >
                <Icon className="w-3 h-3" />
                {modeMeta[m].label}
              </button>
            );
          })}
          {mode === "goal" && chatMessages.length > 0 && (
            <button onClick={resetChat} className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition">重新开始</button>
          )}
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-xs text-destructive-foreground">
            {error}
          </div>
        )}

        <p className="mt-2 text-[10px] text-muted-foreground">
          {mode === "auto" ? "Enter 直接生成 · 不用选模式，AI 自动判断该新建/调整/追加" : `Enter 直接生成 · 当前：${modeMeta[mode].hint}`}
        </p>
      </div>


      {/* Preview + Confirmed */}
      <div className="space-y-6">





        {/* Draft preview */}
        {draft && draftGrouped && (
          <div className="widget widget-glow p-7 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex items-start justify-between mb-5 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Wand2 className="w-3.5 h-3.5 text-amber-glow" />
                  <span className="text-xs tracking-wider text-amber-glow">AI 拟定草稿 · 待你确认</span>
                </div>
                <p className="font-display text-lg text-foreground/90 leading-snug">{draft.summary}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={discardDraft}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-foreground/5 border border-foreground/10 text-foreground/70 hover:bg-foreground/10"
                >
                  <X className="w-3 h-3" /> 丢弃
                </button>
                <button
                  onClick={openPreview}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-moss text-primary-foreground hover:scale-[1.02] transition"
                >
                  <Eye className="w-3 h-3" /> 预览并确认 ({draft.items.length})
                </button>
              </div>
            </div>
            <ItemGroups grouped={draftGrouped} variant="draft" />
          </div>
        )}

        {/* Confirmed schedule */}
        <div className="widget p-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs tracking-widest text-muted-foreground mb-1">我的规划</p>
              <h3 className="font-display text-2xl">
                {confirmed.length === 0 ? "还没有任何安排" : `${confirmed.length} 项 · 按日期`}
              </h3>
            </div>
            {confirmed.length > 0 && (
              <button
                onClick={() => clearItems()}
                className="text-xs text-foreground/40 hover:text-destructive transition"
              >
                全部清空
              </button>
            )}
          </div>

          {confirmed.length === 0 ? (
            <div className="py-12 text-center">
              <div className="inline-flex w-14 h-14 rounded-2xl bg-foreground/5 items-center justify-center mb-3">
                <Sparkles className="w-6 h-6 text-foreground/30" />
              </div>
              <p className="text-sm text-muted-foreground">
                在左边输入一个想法 — Sylva 会自动帮你拆成日程、待办和提醒
              </p>
            </div>
          ) : (
            <ItemGroups grouped={grouped} variant="confirmed" onRemove={removeConfirmed} />
          )}
        </div>
      </div>


      {/* 预览确认弹窗 */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {draftMode === "add" ? "追加预览" : draftMode === "adjust" ? "调整重排预览" : "写入预览"}
            </DialogTitle>
            <DialogDescription>
              {draft ? <>本次将{draftMode === "adjust" ? "替换" : draftMode === "add" ? "追加" : "写入"} <b className="text-foreground">{draft.items.length}</b> 项 · {buildPreviewMeta(draft.items)}</> : null}
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-2">
                {(["event", "todo", "reminder"] as const).map((t) => {
                  const Meta = typeMeta[t];
                  const Icon = Meta.icon;
                  const c = draft.items.filter((i) => i.type === t).length;
                  return (
                    <div key={t} className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3 flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center ${Meta.color}`}>
                        <Icon className="w-4 h-4" strokeWidth={1.8} />
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">{Meta.label}</div>
                        <div className="font-display text-lg leading-none">{c}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-xl border border-amber-glow/20 bg-amber-glow/[0.06] p-3 text-xs text-foreground/80">
                <div className="text-amber-glow tracking-wider mb-1">条目明细</div>
                <ItemGroups grouped={groupByDate(draft.items.map((it, i) => ({ ...it, _key: `pv-${i}` })))} variant="draft" />
              </div>
              {draftMode === "adjust" && confirmed.length > 0 && (
                <p className="text-[11px] text-destructive/80">⚠ 调整模式会替换现有 {confirmed.length} 项规划</p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <button
              onClick={() => setPreviewOpen(false)}
              className="flex items-center gap-1 px-4 py-2 rounded-full text-xs bg-foreground/5 border border-foreground/10 text-foreground/70 hover:bg-foreground/10"
            >
              <X className="w-3 h-3" /> 返回修改
            </button>
            <button
              onClick={confirmDraft}
              className="flex items-center gap-1 px-4 py-2 rounded-full text-xs bg-moss text-primary-foreground hover:scale-[1.02] transition"
            >
              <Check className="w-3 h-3" /> 确认写入
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function buildPreviewMeta(items: PlanItem[]): string {
  const dates = items.map((i) => i.date).filter(Boolean).sort();
  if (dates.length === 0) return "无日期";
  const first = dates[0];
  const last = dates[dates.length - 1];
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return y && m && d ? `${m}月${d}日` : iso;
  };
  const range = first === last ? fmt(first) : `${fmt(first)} → ${fmt(last)}`;
  const timed = items.filter((i) => i.time).length;
  return `时间范围 ${range} · 含时间 ${timed} 项`;
}

type KeyedItem = PlanItem & { _key: string };

function groupByDate(items: KeyedItem[]) {
  const map = new Map<string, KeyedItem[]>();
  items.forEach((item) => {
    const arr = map.get(item.date) ?? [];
    arr.push(item);
    map.set(item.date, arr);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({
      date,
      entries: entries.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99")),
    }));
}

function ItemGroups({
  grouped,
  variant,
  onRemove,
}: {
  grouped: { date: string; entries: KeyedItem[] }[];
  variant: "draft" | "confirmed";
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      {grouped.map(({ date, entries }) => (
        <div key={date}>
          <div className="flex items-baseline gap-3 mb-2">
            <span className="font-display text-base text-amber-glow">{formatDate(date)}</span>
            <span className="text-[10px] text-muted-foreground tracking-wider">
              {entries.length} 项
            </span>
            <div className="flex-1 border-b border-foreground/10" />
          </div>
          <div className="space-y-1.5">
            {entries.map((item) => {
              const Type = typeMeta[item.type];
              const TypeIcon = Type.icon;
              return (
                <div
                  key={item._key}
                  className={`group flex items-start gap-3 p-3 rounded-xl border transition
                    ${variant === "draft"
                      ? "bg-amber-glow/[0.06] border-amber-glow/15"
                      : "bg-foreground/[0.03] border-foreground/[0.07] hover:border-foreground/15"}`}
                >
                  <div className={`w-7 h-7 rounded-lg bg-foreground/5 flex items-center justify-center shrink-0 ${Type.color}`}>
                    <TypeIcon className="w-3.5 h-3.5" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-foreground/90">{item.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${tagColors[item.tag] ?? "border-foreground/10 text-foreground/50"}`}>
                        {item.tag}
                      </span>
                    </div>
                    {item.note && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.note}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div>
                      {item.time && (
                        <div className="text-xs font-mono text-foreground/80">{item.time}</div>
                      )}
                      {item.durationMin && (
                        <div className="text-[10px] text-muted-foreground">{item.durationMin} 分钟</div>
                      )}
                      {!item.time && (
                        <div className="text-[10px] text-muted-foreground">{Type.label}</div>
                      )}
                    </div>
                    {variant === "confirmed" && onRemove && (
                      <button
                        onClick={() => onRemove(item._key)}
                        className="opacity-0 group-hover:opacity-100 transition text-foreground/30 hover:text-destructive p-1"
                        title="移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(iso: string) {
  // Expected YYYY-MM-DD
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${m}月${d}日 · ${weekdays[date.getDay()]}`;
}
