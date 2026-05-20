import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generatePlan, chatPlan, type Plan, type PlanItem, type ChatStep } from "@/lib/plan.functions";
import { syncToFeishu } from "@/lib/feishu.functions";
import { useSylva } from "@/lib/sylva-store";
import { HackathonInbox } from "./HackathonInbox";
import { AiNewsRadar } from "./AiNewsRadar";
import { EnterHint } from "@/components/EnterHint";
import { shouldSubmitOnKey } from "@/lib/keybinds";
import { Sparkles, ArrowUp, Loader2, Calendar, CheckSquare, Bell, Plus, RefreshCw, Wand2, Check, X, Trash2, Target, Globe, Send, Settings as SettingsIcon } from "lucide-react";

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

export function AiPlanner({ onGoSettings, onConfirmed }: { onGoSettings?: () => void; onConfirmed?: () => void } = {}) {
  const { items: confirmedFull, addItems, replaceItems, removeItem, clearItems, enterToSubmit, markRecentlySynced, setSyncSummary } = useSylva();
  const confirmed = confirmedFull;
  const [mode, setMode] = useState<Mode>("auto");
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Plan | null>(null);
  const [draftMode, setDraftMode] = useState<"create" | "adjust" | "add">("create");
  const planFn = useServerFn(generatePlan);
  const chatFn = useServerFn(chatPlan);
  const syncFn = useServerFn(syncToFeishu);
  const [syncScope, setSyncScope] = useState<"all" | "draft" | "today" | "week" | "timed">("all");
  const [syncing, setSyncing] = useState(false);

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

  const confirmDraft = () => {
    if (!draft) return;
    const counts = draft.items.reduce(
      (acc, it) => {
        acc[it.type] = (acc[it.type] ?? 0) + 1;
        return acc;
      },
      { event: 0, todo: 0, reminder: 0 } as Record<PlanItem["type"], number>,
    );
    const ids = draftMode === "add" ? addItems(draft.items) : replaceItems(draft.items);
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
    toast.success(draftMode === "add" ? "已追加到我的规划" : "规划已同步", {
      description: `${parts || `共 ${draft.items.length} 项`}　可在汇总入口快速跳转`,
      duration: 4000,
    });
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

  const [quickIdea, setQuickIdea] = useState("");
  const runQuick = async () => {
    const text = quickIdea.trim();
    if (!text || loading) return;
    setMode("auto");
    setIdea(text);
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const existing: PlanItem[] = confirmed.map(({ id: _id, done: _done, ...rest }) => rest);
      const result = await planFn({ data: { idea: text, mode: "auto", existing: existing.length ? existing : undefined } });
      if (!result.ok) setError(result.error);
      else {
        setDraft(result.plan);
        setDraftMode(result.mode);
        setQuickIdea("");
        const label = result.mode === "add" ? "追加" : result.mode === "adjust" ? "调整重排" : "全新规划";
        toast.message(`AI 识别为：${label}`, { duration: 2500 });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  const pickSyncItems = (): PlanItem[] => {
    const source = syncScope === "draft" ? (draft?.items ?? []) : confirmed.map(({ id: _id, done: _done, ...rest }) => ({ ...rest }));
    const today = new Date(); today.setHours(0,0,0,0);
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    const iso = (d: Date) => d.toISOString().slice(0,10);
    const todayIso = iso(today); const weekIso = iso(in7);
    return source.filter((it) => {
      if (syncScope === "today") return it.date === todayIso;
      if (syncScope === "week") return it.date >= todayIso && it.date <= weekIso;
      if (syncScope === "timed") return !!it.time;
      return true;
    });
  };

  const runSync = async () => {
    if (syncing) return;
    const itemsForSync = pickSyncItems();
    if (itemsForSync.length === 0) {
      toast.warning("没有可同步的事项", { description: "换个范围或先确认草稿" });
      return;
    }
    const pushable = itemsForSync.filter((i) => i.time);
    if (pushable.length === 0) {
      toast.warning("飞书只接收有时间的事件", { description: `当前 ${itemsForSync.length} 项都没有时间，请先补上时间` });
      return;
    }
    setSyncing(true);
    const tid = toast.loading(`同步 ${pushable.length} 项到飞书…`);
    try {
      const itemsWithIds = pushable.map((it, i) => ({
        id: (it as any).id ?? `plan-${Date.now()}-${i}`,
        type: it.type,
        title: it.title,
        date: it.date,
        time: it.time,
        tag: it.tag,
      }));
      const res = await syncFn({ data: { items: itemsWithIds } });
      toast.dismiss(tid);
      if (!res.ok) {
        toast.error("同步失败", {
          description: res.error,
          action: onGoSettings ? { label: "去设置", onClick: onGoSettings } : undefined,
        });
      } else if (res.errCount > 0) {
        toast.warning(`部分同步成功 · ${res.okCount} 成功 / ${res.errCount} 失败`, {
          description: "在「设置 → 飞书同步」查看详细日志",
          action: onGoSettings ? { label: "去查看", onClick: onGoSettings } : undefined,
        });
      } else {
        toast.success(`已同步 ${res.okCount} 项到飞书日历`, { description: "可在飞书日历直接查看" });
      }
    } catch (e) {
      toast.dismiss(tid);
      toast.error("同步失败", { description: e instanceof Error ? e.message : "未知错误" });
    } finally {
      setSyncing(false);
    }
  };

  const scopeMeta: Record<typeof syncScope, { label: string; desc: string }> = {
    all: { label: "全部规划", desc: "已确认的所有事项" },
    draft: { label: "仅当前草稿", desc: draft ? `共 ${draft.items.length} 项` : "（还没生成草稿）" },
    today: { label: "今天", desc: "仅今日事项" },
    week: { label: "未来 7 天", desc: "今天起 7 天内" },
    timed: { label: "仅有时间", desc: "排除无时间的待办" },
  };

  return (
    <div className="space-y-6">
      {/* Quick generate bar */}
      <div className="widget widget-glow p-5">
        <div className="flex items-center gap-2 mb-2">
          <Wand2 className="w-4 h-4 text-amber-glow" />
          <span className="text-xs tracking-wider text-amber-glow">一键生成 · 直接把想法变成完整规划</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={quickIdea}
            onChange={(e) => setQuickIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                runQuick();
              }
            }}
            placeholder="一句话描述你想做的事，例如：这周冲毕业答辩 + 每天 30 分钟英语"
            className="flex-1 bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-amber-glow/40 placeholder:text-foreground/40"
          />
          <button
            onClick={runQuick}
            disabled={loading || !quickIdea.trim()}
            className="shrink-0 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-glow text-primary-foreground text-sm font-medium hover:scale-[1.02] transition disabled:opacity-40 disabled:scale-100"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? "生成中" : "生成规划"}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">Enter 直接生成 · 生成后在下方草稿确认即可写入日历</p>
      </div>

      {/* Feishu sync bar */}
      <div className="widget p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-amber-glow" />
            <span className="text-xs tracking-wider text-amber-glow">飞书日程同步</span>
            <span className="text-[10px] text-muted-foreground">选择范围后一键推送到飞书日历</span>
          </div>
          {onGoSettings && (
            <button
              onClick={onGoSettings}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-amber-glow transition"
              title="去设置选日历 / 调方向"
            >
              <SettingsIcon className="w-3 h-3" /> 飞书设置
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(scopeMeta) as Array<keyof typeof scopeMeta>).map((k) => {
            const active = syncScope === k;
            const disabled = k === "draft" && !draft;
            return (
              <button
                key={k}
                disabled={disabled}
                onClick={() => setSyncScope(k)}
                title={scopeMeta[k].desc}
                className={`px-3 py-1.5 rounded-full text-xs border transition
                  ${active ? "bg-amber-glow/20 border-amber-glow/50 text-amber-glow" : "bg-foreground/5 border-foreground/10 text-foreground/70 hover:bg-foreground/10"}
                  ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
              >
                {scopeMeta[k].label}
              </button>
            );
          })}
          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground">{scopeMeta[syncScope].desc}</span>
          <button
            onClick={runSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-glow text-primary-foreground text-sm font-medium hover:scale-[1.02] transition disabled:opacity-40 disabled:scale-100"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {syncing ? "同步中" : "同步到飞书"}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          提示：飞书日历只接收带时间的事项；未连接飞书时请先在「设置 → 飞书同步」选好日历。
        </p>
      </div>


      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8 items-start">
      {/* LEFT: Input */}
      <div className="widget widget-glow p-7 lg:sticky lg:top-8">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-amber-glow animate-pulse-glow" />
          <span className="text-xs tracking-wider text-amber-glow">Sylva AI · 实时规划</span>
        </div>

        <h3 className="font-display text-2xl mb-4">{mode === "goal" ? "告诉我一个目标" : "说一个想法"}</h3>

        {/* Mode tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition
                  ${active ? "bg-amber-glow/20 border-amber-glow/50 text-amber-glow" : "bg-foreground/5 border-foreground/10 text-foreground/70 hover:bg-foreground/10"}
                  ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
                title={modeMeta[m].hint}
              >
                <Icon className="w-3 h-3" />
                {modeMeta[m].label}
              </button>
            );
          })}
        </div>

        {mode === "goal" ? (
          <div className="space-y-3">
            {/* Chat history */}
            {chatMessages.length > 0 && (
              <div className="max-h-[280px] overflow-auto space-y-2 pr-1">
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
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {chatStep?.kind === "research" ? (
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> 正在联网查方案…</span>
                    ) : (
                      "AI 思考中…"
                    )}
                  </div>
                )}
              </div>
            )}
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (shouldSubmitOnKey(e, enterToSubmit)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={chatMessages.length === 0 ? "例如：我要考雅思 / 想 3 个月跑下半马 / 准备申请研究生…" : "继续回答…"}
              rows={chatMessages.length === 0 ? 4 : 2}
              className="w-full bg-foreground/5 border border-foreground/10 rounded-2xl p-4 text-sm leading-relaxed resize-none outline-none focus:border-amber-glow/40 placeholder:text-foreground/40"
            />
          </div>
        ) : (
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (shouldSubmitOnKey(e, enterToSubmit)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              mode === "create"
                ? "例如：下周要准备毕业答辩，同时跑通飞书提效系统，每天还要泛听英语..."
                : mode === "adjust"
                ? "例如：周三下午突然有个会，把那天的安排往后推..."
                : "例如：再加一个每天 30 分钟的力量训练..."
            }
            rows={5}
            className="w-full bg-foreground/5 border border-foreground/10 rounded-2xl p-4 text-sm leading-relaxed resize-none outline-none focus:border-amber-glow/40 placeholder:text-foreground/40"
          />
        )}

        <div className="flex items-center justify-between mt-3 gap-2">
          <span className="text-[10px] text-muted-foreground tracking-wider flex items-center gap-3">
            {mode === "goal" && chatMessages.length > 0 ? (
              <button onClick={resetChat} className="hover:text-foreground transition">重新开始</button>
            ) : null}
            <EnterHint example={"我要在 3 个月内跑下半马 ↵（Shift+Enter）\n每周至少 4 次跑步训练"} />
          </span>
          <button
            onClick={handleSubmit}
            disabled={loading || (mode === "goal" ? !chatInput.trim() : !idea.trim())}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-glow text-primary-foreground text-sm font-medium hover:scale-[1.02] transition disabled:opacity-40 disabled:scale-100"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                AI 思考中
              </>
            ) : (
              <>
                {mode === "goal" ? (chatMessages.length === 0 ? "开始拆解" : "发送") : "让 AI 拆解"}
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-xs text-destructive-foreground">
            {error}
          </div>
        )}

        {/* Example prompts */}
        {!draft && !loading && mode !== "goal" && (
          <div className="mt-5 pt-5 border-t border-foreground/10">
            <p className="text-[10px] tracking-wider text-muted-foreground mb-2">试试看 →</p>
            <div className="flex flex-wrap gap-2">
              {[
                "下周冲一份毕业答辩 PPT",
                "三个月内雅思考到 7 分",
                "周末搬家 + 布置新家",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setIdea(s)}
                  className="text-xs px-3 py-1.5 rounded-full bg-foreground/5 border border-foreground/10 text-foreground/70 hover:bg-foreground/10 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {mode === "goal" && chatMessages.length === 0 && !loading && (
          <div className="mt-5 pt-5 border-t border-foreground/10">
            <p className="text-[10px] tracking-wider text-muted-foreground mb-2">试试看 →</p>
            <div className="flex flex-wrap gap-2">
              {["我想考雅思", "三个月跑下半马", "申请 26 fall 计算机硕士", "学钢琴入门"].map((s) => (
                <button
                  key={s}
                  onClick={() => runChat(s)}
                  className="text-xs px-3 py-1.5 rounded-full bg-foreground/5 border border-foreground/10 text-foreground/70 hover:bg-foreground/10 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Preview + Confirmed */}
      <div className="space-y-6">
        <HackathonInbox />
        <AiNewsRadar />
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
                  onClick={confirmDraft}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-moss text-primary-foreground hover:scale-[1.02] transition"
                >
                  <Check className="w-3 h-3" /> 确认 ({draft.items.length})
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
      </div>
    </div>
  );
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
