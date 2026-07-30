import { useState, useEffect, useRef } from "react";
import { useCalendarViewMode } from "@/lib/calendar-view";
import { CalendarTextEditor } from "@/components/CalendarTextEditor";
import { useSylva, isHabitDoneOn } from "@/lib/sylva-store";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, Bell, Plus, Trash2, X, CheckCircle2, RotateCcw, Check, Sparkles, Flame, BookHeart, StickyNote, ImageIcon, TrendingUp, Flag } from "lucide-react";
import type { PlanItem } from "@/lib/plan.functions";
import { TimePicker } from "@/components/ui/time-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AiPlanner } from "@/components/AiPlanner";
import { FollowUpsPanel } from "@/components/FollowUpsPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";




const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

const tagColor: Record<string, string> = {
  工作: "bg-moss/60 text-white border-moss",
  学习: "bg-amber-glow/70 text-background border-amber-glow font-medium",
  健康: "bg-accent/70 text-background border-accent font-medium",
  生活: "bg-foreground/25 text-foreground border-foreground/40",
  英语: "bg-amber-glow/70 text-background border-amber-glow font-medium",
  习惯: "bg-moss/60 text-white border-moss",
};

const typeIcon = { event: CalIcon, todo: Clock, reminder: Bell, milestone: Flag } as const;

/** 距今天数：负数=已过去 */
function daysFromToday(iso: string) {
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - t) / 86400000);
}
function dLabel(iso: string) {
  const n = daysFromToday(iso);
  if (n === 0) return "今天";
  if (n > 0) return `D-${n}`;
  return `已过 ${-n} 天`;
}

export function ScheduleView({ onGoPlan, onGoSettings }: { onGoPlan?: () => void; onGoSettings?: () => void } = {}) {
  const { items, habits, notes, comics, navigateTo, toggleHabitOn, addItems, updateItem, removeItem, toggleDone, isRecapDone, unmarkRecapDone, isRecentlySynced, markRecentlySynced, pendingIds, confirmPending, revertPending, addNote } = useSylva();
  const [cursor, setCursor] = useState(new Date(2026, 4, 1)); // May 2026
  const [selected, setSelected] = useState("2026-05-19");
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [editorAnchor, setEditorAnchor] = useState<{ x: number; y: number } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  type PendingFilter = { kind: "all" } | { kind: "type"; value: string } | { kind: "date"; value: string };
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>({ kind: "all" });
  useEffect(() => {
    if (pendingIds.length === 0 && pendingFilter.kind !== "all") setPendingFilter({ kind: "all" });
  }, [pendingIds.length, pendingFilter.kind]);

  const confirmAndFocus = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const targets = items.filter((i) => idSet.has(i.id));
    const dated = targets.filter((i) => i.date).map((i) => i.date!).sort();
    const focusDate = dated[0];
    confirmPending(ids);
    markRecentlySynced(ids);
    if (focusDate) {
      setSelected(focusDate);
      const [y, m] = focusDate.split("-").map(Number);
      setCursor(new Date(y, m - 1, 1));
    }
    setPendingFilter({ kind: "all" });
  };


  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  // Convert to Mon-first index
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    return { day: dayNum, iso };
  });

  const itemsByDate = items.reduce<Record<string, typeof items>>((acc, it) => {
    (acc[it.date] ||= []).push(it);
    return acc;
  }, {});

  const selectedItems = (itemsByDate[selected] ?? []).sort((a, b) =>
    (a.time ?? "99:99").localeCompare(b.time ?? "99:99")
  );

  return (
    <div className="flex h-full">
      {/* Calendar grid */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-3xl text-foreground">
              {year} 年 {month + 1} 月
            </h2>
            <span className="text-xs text-muted-foreground/70 tracking-widest">日程视图</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAiOpen(true)}
              className="mr-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-primary-foreground bg-amber-glow/85 hover:bg-amber-glow transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              新建日程
            </button>
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="p-2 rounded-lg hover:bg-foreground/10 text-foreground/75"
              aria-label="上一个月"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="p-2 rounded-lg hover:bg-foreground/10 text-foreground/75"
              aria-label="下一个月"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {(() => {
              const today = new Date();
              const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
              if (isCurrentMonth) return null;
              return (
                <button
                  onClick={() => setCursor(new Date())}
                  className="ml-1 px-2.5 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition"
                >
                  回到今天
                </button>
              );
            })()}
          </div>

        </div>

        {pendingIds.length > 0 && (() => {
          const pendingItems = items.filter((i) => i.pending);
          const typeCount = pendingItems.reduce<Record<string, number>>((acc, it) => {
            acc[it.type] = (acc[it.type] ?? 0) + 1;
            return acc;
          }, {});
          const dateCount = pendingItems.reduce<Record<string, number>>((acc, it) => {
            const k = it.date ?? "未排期";
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
          }, {});
          const dates = Object.keys(dateCount).sort();
          const typeLabel: Record<string, string> = { event: "日程", todo: "待办", reminder: "提醒" };
          const matchFilter = (it: typeof pendingItems[number]) => {
            if (pendingFilter.kind === "all") return true;
            if (pendingFilter.kind === "type") return it.type === pendingFilter.value;
            return (it.date ?? "未排期") === pendingFilter.value;
          };
          const filteredIds = pendingItems.filter(matchFilter).map((i) => i.id);
          const fmtDate = (d: string) => {
            if (d === "未排期") return "未排期";
            const [, m, day] = d.split("-");
            return `${Number(m)}/${Number(day)}`;
          };
          return (
            <div className="mb-3 px-3 py-2 rounded-xl border border-amber-glow/40 bg-amber-glow/10 text-amber-glow text-xs space-y-2">
              <div className="flex items-center gap-3">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">
                  AI 新增 <b>{pendingIds.length}</b> 项待确认（当前选中 <b>{filteredIds.length}</b>），确认后才会同步到云端 / 飞书
                </span>
                <button
                  onClick={() => revertPending(filteredIds)}
                  disabled={filteredIds.length === 0}
                  className="px-2.5 py-1 rounded-md border border-border text-foreground/75 hover:text-foreground hover:bg-foreground/10 text-[11px] disabled:opacity-40"
                >
                  撤销选中
                </button>
                <button
                  onClick={() => confirmAndFocus(filteredIds)}
                  disabled={filteredIds.length === 0}
                  className="px-2.5 py-1 rounded-md bg-amber-glow text-primary-foreground hover:brightness-110 text-[11px] inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <Check className="w-3 h-3" /> 确认选中
                </button>
              </div>
              <div className="flex items-center flex-wrap gap-1.5 pt-1 border-t border-amber-glow/20">
                <span className="text-[10px] text-amber-glow/60 mr-1">筛选：</span>
                <FilterChip active={pendingFilter.kind === "all"} onClick={() => setPendingFilter({ kind: "all" })}>
                  全部 {pendingIds.length}
                </FilterChip>
                {Object.entries(typeCount).map(([t, n]) => (
                  <FilterChip
                    key={`t-${t}`}
                    active={pendingFilter.kind === "type" && pendingFilter.value === t}
                    onClick={() => setPendingFilter({ kind: "type", value: t })}
                  >
                    {typeLabel[t] ?? t} {n}
                  </FilterChip>
                ))}
                <span className="w-px h-3 bg-amber-glow/20 mx-1" />
                {dates.map((d) => (
                  <FilterChip
                    key={`d-${d}`}
                    active={pendingFilter.kind === "date" && pendingFilter.value === d}
                    onClick={() => setPendingFilter({ kind: "date", value: d })}
                  >
                    {fmtDate(d)} {dateCount[d]}
                  </FilterChip>
                ))}
              </div>
            </div>
          );
        })()}



        <div className="grid grid-cols-7 gap-px bg-foreground/10 rounded-xl overflow-hidden border border-border">
          {weekdays.map((d) => (
            <div key={d} className="bg-background/50 py-2 text-center text-[11px] text-muted-foreground tracking-wider">
              星期{d}
            </div>
          ))}
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} className="bg-background/30 min-h-[110px]" />;
            const rawDayItems = itemsByDate[cell.iso] ?? [];
            // 关键节点置顶显示
            const dayItems = [...rawDayItems].sort(
              (a, b) => (a.type === "milestone" ? 0 : 1) - (b.type === "milestone" ? 0 : 1),
            );
            const hasMilestone = dayItems.some((it) => it.type === "milestone");
            const isSelected = cell.iso === selected;
            const isToday = cell.iso === "2026-05-19";
            return (
              <button
                key={i}
                onClick={() => setSelected(cell.iso)}
                onDoubleClick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setSelected(cell.iso);
                  setEditorDate(cell.iso);
                  setEditorAnchor({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                }}
                title="双击编辑这一天"
                className={`block min-h-[110px] p-2 text-left align-top transition relative overflow-hidden
                  ${isSelected ? "bg-amber-glow/15 ring-2 ring-amber-glow/60 z-10" : hasMilestone ? "bg-rose-500/[0.07] hover:bg-rose-500/10" : "bg-background/50 hover:bg-background/60"}`}
              >
                {hasMilestone && <span className="absolute inset-y-0 left-0 w-[3px] bg-rose-400/80" />}
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between h-5">
                  <span className={`text-sm leading-5 font-semibold ${isToday ? "text-amber-glow" : "text-foreground/85"}`}>
                    {cell.day}
                  </span>
                  <div className="flex items-center gap-1">
                    {hasMilestone && <Flag className="w-3 h-3 text-rose-400" aria-label="有关键节点" />}
                    {dayItems.length > 0 && dayItems.every((it) => it.done) && (
                      <CheckCircle2 className="w-3 h-3 text-moss" aria-label="今日日程全部完成" />
                    )}
                    {isRecapDone(cell.iso) && (
                      <BookHeart className="w-3 h-3 text-amber-glow/80" aria-label="今日小结已提交" />
                    )}
                    {isToday && <span className="text-[9px] text-amber-glow">今</span>}
                  </div>
                </div>
                <div className="space-y-1 pt-7">
                  {dayItems.slice(0, 3).map((it) => (
                    <div
                      key={it.id}
                      className={`text-[11px] leading-tight px-1.5 py-1 rounded-md truncate border shadow-sm ${
                        it.type === "milestone"
                          ? "bg-rose-500/25 text-rose-100 border-rose-400/60 font-medium"
                          : tagColor[it.tag] ?? "bg-foreground/20 text-foreground border-foreground/30"
                      } ${it.done ? "opacity-50 line-through" : ""} ${
                        it.pending ? "border-dashed border-amber-glow/70 text-amber-glow bg-amber-glow/10" : ""
                      } ${
                        isRecentlySynced(it.id) ? "ring-1 ring-amber-glow/70 shadow-[0_0_8px_rgba(245,184,67,0.4)]" : ""
                      }`}
                      title={it.pending ? `${it.title}（待确认）` : it.title}
                    >
                      {it.type === "milestone" && <span className="mr-1">🚩</span>}
                      {it.time && <span className="font-mono mr-1 opacity-80">{it.time}</span>}
                      {it.title}
                    </div>
                  ))}
                  {dayItems.length > 3 && (
                    <div className="text-[10px] text-foreground/70 px-1.5 font-medium">+{dayItems.length - 3} 项</div>
                  )}
                </div>
                {habits.length > 0 && (() => {
                  const doneCount = habits.filter((h) => isHabitDoneOn(h, cell.iso)).length;
                  const emojis = habits.filter((h) => isHabitDoneOn(h, cell.iso)).slice(0, 3).map((h) => h.emoji).join("");
                  return (
                    <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center gap-1 text-[9px] text-moss/85">
                      <span className="truncate">{emojis || "·"}</span>
                      <span className="ml-auto font-mono tabular-nums opacity-80">{doneCount}/{habits.length}</span>
                    </div>
                  );
                })()}
              </button>
            );
          })}
        </div>

      </div>


      {/* Right detail */}
      <aside className="w-80 shrink-0 bg-card/40 border-l border-border p-5 overflow-auto space-y-5">
        <div>
          <p className="text-[10px] tracking-widest text-amber-glow mb-1">所选日期</p>
          <h3 className="font-display text-2xl text-foreground mb-1">{formatLong(selected)}</h3>
          <p className="text-xs text-muted-foreground/70">{selectedItems.length} 项安排</p>
        </div>

        {/* Day stats strip */}
        <DayStats items={selectedItems} habits={habits} selected={selected} />

        {isRecapDone(selected) && (
          <div className="p-3 rounded-xl bg-moss/15 border border-moss/30 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-moss shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-moss font-medium">今日小结 · 已完成</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">已通过飞书卡片提交并同步到日历</p>
            </div>
            <button
              onClick={async () => {
                if (!confirm(`撤销 ${selected} 的「已完成」标记？\n这会清掉当天回执，同时取消待办与日历里的完成状态。`)) return;
                try { await unmarkRecapDone(selected); } catch (e: any) { alert(e?.message ?? "撤销失败"); }
              }}
              title="撤销「已完成」标记"
              className="p-1 rounded-full text-moss/80 hover:text-moss hover:bg-moss/20 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <MilestonesPanel
          items={items}
          selected={selected}
          onAdd={(item) => addItems([item])}
          onDelete={(id) => removeItem(id)}
          onJump={(iso) => {
            setSelected(iso);
            const [yy, mm] = iso.split("-").map(Number);
            setCursor(new Date(yy, mm - 1, 1));
          }}
        />

        <section>
          <SectionHeader icon={CalIcon} title="日程" count={selectedItems.length} accent="amber" />
          {selectedItems.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground/70 rounded-xl border border-dashed border-border">这一天还没有安排</div>
          ) : (
            <div className="space-y-2">
              {selectedItems.map((it) => (
                <ItemCard
                  key={it.id}
                  item={it}
                  onChange={(patch) => updateItem(it.id, patch)}
                  onToggleDone={() => toggleDone(it.id)}
                  onDelete={() => removeItem(it.id)}
                  onConfirm={it.pending ? () => confirmAndFocus([it.id]) : undefined}
                  onRevert={it.pending ? () => revertPending([it.id]) : undefined}
                />
              ))}
            </div>
          )}
          <QuickAdd date={selected} onAdd={(item) => addItems([item])} />
        </section>

        {habits.length > 0 && (
          <section>
            <SectionHeader
              icon={Flame}
              title="习惯打卡"
              count={`${habits.filter((h) => isHabitDoneOn(h, selected)).length}/${habits.length}`}
              accent="moss"
            />
            <div className="space-y-1.5">
              {habits.map((h) => {
                const done = isHabitDoneOn(h, selected);
                return (
                  <button
                    key={h.id}
                    onClick={() => toggleHabitOn(h.id, selected)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition ${
                      done
                        ? "bg-moss/15 border-moss/40 text-foreground"
                        : "bg-foreground/[0.04] border-border text-foreground/75 hover:bg-foreground/[0.08]"
                    }`}
                  >
                    <span className="text-base">{h.emoji}</span>
                    <span className="flex-1 text-xs truncate">{h.name}</span>
                    {done ? (
                      <Check className="w-3.5 h-3.5 text-moss" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-border" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <DayNotesCard date={selected} notes={notes} onAdd={(text) => addNote(text)} onOpen={() => navigateTo?.("notes")} />

        <DayComicCard date={selected} comics={comics} onOpen={() => navigateTo?.("journal")} />
      </aside>


      {editorDate && (
        <DayEditor
          date={editorDate}
          anchor={editorAnchor}
          items={(itemsByDate[editorDate] ?? []).sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"))}
          onClose={() => setEditorDate(null)}
          onUpdate={(id, patch) => updateItem(id, patch)}
          onToggleDone={(id) => toggleDone(id)}
          onDelete={(id) => removeItem(id)}
          onAdd={(item) => addItems([item])}
        />
      )}

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-auto bg-background/95 backdrop-blur-xl border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-glow">
              <Sparkles className="w-4 h-4" /> 新增日程
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              用自然语言让 AI 排期，或上传截图 / 手动添加条件提醒，统一汇入日程。
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="ai" className="mt-2">
            <TabsList className="bg-foreground/5">
              <TabsTrigger value="ai">AI 规划</TabsTrigger>
              <TabsTrigger value="follow">截图 / 条件提醒</TabsTrigger>
            </TabsList>
            <TabsContent value="ai" className="mt-3">
              <AiPlanner />
            </TabsContent>
            <TabsContent value="follow" className="mt-3">
              <FollowUpsPanel />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuickAdd({ date, onAdd }: { date: string; onAdd: (item: PlanItem) => void }) {
  const [draft, setDraft] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const submit = () => {
    const title = draft.trim();
    if (!title) return;
    onAdd({
      type: draftTime ? "event" : "todo",
      title,
      date,
      time: draftTime || undefined,
      tag: "生活",
    });
    setDraft("");
    setDraftTime("");
  };
  return (
    <div className="mt-3 p-2 rounded-xl bg-foreground/[0.04] border border-border flex items-center gap-1.5">
      <TimePicker value={draftTime} onChange={setDraftTime} size="sm" />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="新增安排…（Enter）"
        className="flex-1 min-w-0 bg-transparent border-none px-1 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
      />
      <button
        onClick={submit}
        className="p-1.5 rounded bg-amber-glow/80 text-primary-foreground hover:bg-amber-glow shrink-0"
        title="添加（Enter）"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function DayEditor({
  date,
  anchor,
  items,
  onClose,
  onUpdate,
  onToggleDone,
  onDelete,
  onAdd,
}: {
  date: string;
  anchor: { x: number; y: number } | null;
  items: Array<PlanItem & { id: string; done?: boolean }>;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<PlanItem>) => void;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (item: PlanItem) => void;
}) {
  const [draft, setDraft] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [viewMode] = useCalendarViewMode();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const [y, m, d] = date.split("-").map(Number);
  const headerLabel = `${y}年${m}月${d}日`;

  const submit = () => {
    const title = draft.trim();
    if (!title) return;
    onAdd({
      type: draftTime ? "event" : "todo",
      title,
      date,
      time: draftTime || undefined,
      tag: "生活",
    });
    setDraft("");
    setDraftTime("");
  };

  // Position the popup near the anchor, clamped to viewport
  const width = viewMode === "text" ? 420 : 320;
  const height = viewMode === "text" ? 460 : 360;
  const margin = 12;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const x = anchor ? Math.max(margin, Math.min(anchor.x - width / 2, vw - width - margin)) : (vw - width) / 2;
  const yPos = anchor ? Math.max(margin, Math.min(anchor.y - 40, vh - height - margin)) : (vh - height) / 2;

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left: x, top: yPos, width, maxHeight: height, zIndex: 100 }}
      className="rounded-xl shadow-2xl border border-border bg-card/95 backdrop-blur-2xl flex flex-col overflow-hidden text-foreground"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="h-9 shrink-0 flex items-center px-3 border-b border-border bg-background/50">
        <button onClick={onClose} title="关闭" className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110" />
        <div className="flex-1 text-center text-xs font-medium text-white/85">{headerLabel}</div>
        <span className="w-3 h-3" />
      </div>

      {viewMode === "text" ? (
        <div className="flex-1 overflow-auto p-3">
          <CalendarTextEditor key={date} date={date} />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto p-3 space-y-1.5">
            {items.length === 0 && (
              <div className="text-[11px] text-muted-foreground/70 text-center py-6">这一天还没有安排，下方添加</div>
            )}
            {items.map((it) => (
              <EditableRow
                key={it.id}
                item={it}
                onChange={(patch) => onUpdate(it.id, patch)}
                onToggleDone={() => onToggleDone(it.id)}
                onDelete={() => onDelete(it.id)}
              />
            ))}
          </div>

          <div className="shrink-0 border-t border-border p-2 flex items-center gap-1.5 bg-background/30">
            <TimePicker value={draftTime} onChange={setDraftTime} size="sm" />
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="添加一条安排…（Enter 提交）"
              title="Enter 提交 · 单行输入框不支持换行"
              className="flex-1 bg-foreground/5 border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-amber-glow/50"
            />
            <button
              onClick={submit}
              className="p-1.5 rounded bg-amber-glow/80 text-primary-foreground hover:bg-amber-glow"
              title="添加（Enter）"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function EditableRow({
  item,
  onChange,
  onToggleDone,
  onDelete,
}: {
  item: PlanItem & { id: string; done?: boolean };
  onChange: (patch: Partial<PlanItem>) => void;
  onToggleDone: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [time, setTime] = useState(item.time ?? "");
  const done = !!item.done;

  const commit = () => {
    const t = title.trim();
    if (t && (t !== item.title || time !== (item.time ?? ""))) {
      onChange({ title: t, time: time || undefined });
    } else {
      setTitle(item.title);
      setTime(item.time ?? "");
    }
    setEditing(false);
  };

  return (
    <div className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition min-w-0 ${done ? "bg-moss/10 border-moss/25" : "bg-foreground/5 border-border hover:border-border"}`}>
      <DoneCheckbox done={done} onToggle={onToggleDone} size="sm" />
      {editing ? (
        <>
          <TimePicker value={time} onChange={setTime} size="sm" />
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") { setTitle(item.title); setTime(item.time ?? ""); setEditing(false); }
            }}
            title="Enter 保存 · Esc 取消"
            className="flex-1 min-w-0 bg-background/50 border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
          />
        </>
      ) : (
        <>
          <TimePicker
            value={item.time ?? ""}
            onChange={(v) => onChange({ time: v || undefined })}
            size="sm"
          />
          <button
            onClick={() => setEditing(true)}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
            title="点击编辑标题"
          >
            <span className={`text-xs truncate block w-full ${done ? "text-muted-foreground/70 line-through" : "text-foreground"}`}>{item.title}</span>
          </button>
        </>

      )}
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
        title="删除"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function DoneCheckbox({ done, onToggle, size = "md" }: { done: boolean; onToggle: () => void; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const iconDim = size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={done ? "标记为未完成" : "标记为已完成"}
      className={`shrink-0 ${dim} rounded-md flex items-center justify-center border transition ${
        done
          ? "bg-moss border-moss text-primary-foreground"
          : "bg-foreground/5 border-border hover:border-white/60 text-transparent"
      }`}
    >
      <Check className={`${iconDim}`} strokeWidth={3} />
    </button>
  );
}

/* ---------- Editable Card (aside) ---------- */
function ItemCard({
  item,
  onChange,
  onToggleDone,
  onDelete,
  onConfirm,
  onRevert,
}: {
  item: PlanItem & { id: string; done?: boolean; pending?: boolean };
  onChange: (patch: Partial<PlanItem>) => void;
  onToggleDone: () => void;
  onDelete: () => void;
  onConfirm?: () => void;
  onRevert?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const Icon = typeIcon[item.type];
  const done = !!item.done;
  const pending = !!item.pending;

  const commit = () => {
    const t = title.trim();
    if (t && t !== item.title) onChange({ title: t });
    else setTitle(item.title);
    setEditing(false);
  };

  return (
    <div className={`group relative p-3 rounded-xl border transition ${
      pending
        ? "bg-amber-glow/10 border-dashed border-amber-glow/60"
        : done
          ? "bg-moss/10 border-moss/30"
          : "bg-foreground/[0.05] border-border hover:border-border"
    }`}>
      {pending && (
        <div className="absolute -top-2 left-3 px-1.5 py-0.5 rounded-full text-[9px] tracking-wider bg-amber-glow text-primary-foreground font-bold">
          待确认
        </div>
      )}
      <div className="flex items-center gap-2 mb-1.5">
        <DoneCheckbox done={done} onToggle={onToggleDone} />
        <Icon className="w-3.5 h-3.5 text-amber-glow/80 shrink-0" />
        <span className={`relative text-[10px] px-1.5 py-0.5 rounded-md border ${tagColor[item.tag] ?? "bg-foreground/10 text-foreground/75 border-border"} ${pending ? "cursor-pointer" : ""}`}>
          {item.tag}
          {pending && (
            <select
              value={item.tag}
              onChange={(e) => onChange({ tag: e.target.value as PlanItem["tag"] })}
              className="absolute inset-0 opacity-0 cursor-pointer"
              title="点击修改标签"
            >
              {["工作", "学习", "健康", "生活", "英语", "习惯"].map((t) => (
                <option key={t} value={t} className="bg-background text-foreground">{t}</option>
              ))}
            </select>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <TimePicker
            value={item.time ?? ""}
            onChange={(v) => onChange({ time: v || undefined })}
            size="sm"
          />
          {pending && onConfirm && (
            <button
              onClick={onConfirm}
              className="p-1 rounded hover:bg-amber-glow/20 text-amber-glow"
              title="确认此项"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          {pending && onRevert && (
            <button
              onClick={onRevert}
              className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-destructive"
              title="撤销此项"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {!pending && (
            <button
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-foreground/10 text-muted-foreground/70 hover:text-destructive"
              title="删除"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setTitle(item.title); setEditing(false); }
          }}
          className="w-full bg-background/50 border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:border-amber-glow/50"
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          title="点击编辑"
          className={`text-sm leading-snug cursor-text ${done ? "text-muted-foreground/80 line-through" : "text-foreground"}`}
        >
          {item.title}
        </div>
      )}
    </div>
  );
}



function formatLong(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const w = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${m} 月 ${d} 日 · ${w}`;
}

/* ---------- Drag-to-time Day Timeline ---------- */
const HOUR_START = 6;
const HOUR_END = 24; // exclusive
const ROW_H = 36; // px per hour

function DayTimeline({
  items,
  onSetTime,
  onClearTime,
}: {
  items: Array<PlanItem & { id: string }>;
  onSetTime: (id: string, time: string) => void;
  onClearTime: (id: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const unscheduled = items.filter((it) => !it.time);
  const scheduled = items.filter((it) => !!it.time);

  const onDragStart = (id: string) => (e: React.DragEvent) => {
    setDragId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragEnd = () => { setDragId(null); setHoverHour(null); };

  const hourFromEvent = (e: React.DragEvent, baseHour: number) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const frac = Math.max(0, Math.min(1, offsetY / rect.height));
    // snap to 15min
    const minutes = Math.round((frac * 60) / 15) * 15;
    const hh = baseHour + Math.floor(minutes / 60);
    const mm = minutes % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };

  const onHourDrop = (hour: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    if (!id) return;
    const time = hourFromEvent(e, hour);
    onSetTime(id, time);
    onDragEnd();
  };

  const onTrayDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    if (!id) return;
    onClearTime(id);
    onDragEnd();
  };

  if (items.length === 0) {
    return <div className="text-center py-10 text-xs text-muted-foreground/70">这一天还没有安排</div>;
  }

  return (
    <div>
      {/* Unscheduled tray */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={onTrayDrop}
        className="mb-3 p-2 rounded-xl border border-dashed border-border bg-foreground/[0.04]"
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] tracking-widest text-muted-foreground/70">未排时</span>
          <span className="text-[10px] text-muted-foreground/60">{unscheduled.length} 项 · 拖到下方时间轴</span>
        </div>
        {unscheduled.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/60 text-center py-2">把已排时的拖回这里可清除时间</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((it) => (
              <TimelineChip key={it.id} item={it} dragging={dragId === it.id}
                onDragStart={onDragStart(it.id)} onDragEnd={onDragEnd} />
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="relative rounded-xl border border-border bg-background/30 overflow-hidden">
        {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => {
          const hour = HOUR_START + i;
          const isHover = hoverHour === hour;
          return (
            <div
              key={hour}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setHoverHour(hour); }}
              onDragLeave={() => setHoverHour((h) => (h === hour ? null : h))}
              onDrop={onHourDrop(hour)}
              style={{ height: ROW_H }}
              className={`relative flex items-start border-t border-border/50 transition ${
                isHover ? "bg-amber-glow/10" : "hover:bg-foreground/[0.03]"
              }`}
            >
              <span className="text-[10px] font-mono text-muted-foreground/70 w-10 pl-2 pt-1 select-none">
                {String(hour).padStart(2, "0")}:00
              </span>
            </div>
          );
        })}

        {/* Scheduled items absolutely positioned */}
        {scheduled.map((it) => {
          const [hh, mm] = (it.time ?? "00:00").split(":").map(Number);
          const minutesFromStart = (hh - HOUR_START) * 60 + (mm || 0);
          if (minutesFromStart < 0 || hh >= HOUR_END) return null;
          const top = (minutesFromStart / 60) * ROW_H;
          return (
            <div
              key={it.id}
              draggable
              onDragStart={onDragStart(it.id)}
              onDragEnd={onDragEnd}
              style={{ top, left: 48, right: 8, opacity: dragId === it.id ? 0.4 : 1 }}
              className={`absolute cursor-grab active:cursor-grabbing rounded-md border px-1.5 py-1 text-[11px] leading-tight ${
                tagColor[it.tag] ?? "bg-foreground/10 text-foreground/85 border-border"
              }`}
              title={`${it.time} · ${it.title}（拖动改时间）`}
            >
              <span className="font-mono mr-1 opacity-70">{it.time}</span>
              <span className="truncate">{it.title}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/60 mt-2 text-center">提示：拖到 15 分钟刻度，松手即设置时间</p>
    </div>
  );
}

function TimelineChip({
  item,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  item: PlanItem & { id: string };
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const Icon = typeIcon[item.type];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab active:cursor-grabbing flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] ${
        tagColor[item.tag] ?? "bg-foreground/10 text-foreground/85 border-border"
      } ${dragging ? "opacity-40" : ""}`}
      title="拖到右侧时间轴排进某个时段"
    >
      <Icon className="w-3 h-3 opacity-70" />
      <span className="truncate max-w-[140px]">{item.title}</span>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full text-[10px] border transition ${
        active
          ? "bg-amber-glow text-primary-foreground border-amber-glow"
          : "border-amber-glow/30 text-amber-glow/80 hover:border-amber-glow/60 hover:text-amber-glow"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------- Right-panel rich modules ---------- */

function SectionHeader({ icon: Icon, title, count, accent = "amber" }: { icon: any; title: string; count?: number | string; accent?: "amber" | "moss" | "accent" }) {
  const color = accent === "moss" ? "text-moss" : accent === "accent" ? "text-accent" : "text-amber-glow";
  return (
    <div className="flex items-center justify-between mb-2">
      <div className={`flex items-center gap-1.5 text-[10px] tracking-widest ${color}`}>
        <Icon className="w-3 h-3" />
        {title}
      </div>
      {count !== undefined && <span className="text-[10px] text-muted-foreground/70 font-mono">{count}</span>}
    </div>
  );
}

function DayStats({ items, habits, selected }: { items: any[]; habits: any[]; selected: string }) {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const byType = {
    event: items.filter((i) => i.type === "event").length,
    todo: items.filter((i) => i.type === "todo").length,
    reminder: items.filter((i) => i.type === "reminder").length,
  };
  const habitDone = habits.filter((h) => isHabitDoneOn(h, selected)).length;
  const focusMin = items.filter((i) => i.done).reduce((s, i) => s + (i.duration_min ?? 0), 0);

  return (
    <div className="rounded-xl border border-border bg-foreground/[0.04] p-3.5 space-y-3">
      <div>
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" />完成进度</span>
          <span className="text-amber-glow font-mono">{done}/{total} · {pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-glow to-moss transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-center">
        <Stat label="事件" value={byType.event} />
        <Stat label="待办" value={byType.todo} />
        <Stat label="提醒" value={byType.reminder} />
        <Stat label="习惯" value={`${habitDone}/${habits.length}`} />
      </div>
      {focusMin > 0 && (
        <div className="text-[10px] text-muted-foreground/80 text-center">已聚焦 <span className="text-moss font-mono">{focusMin}</span> 分钟</div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-foreground/[0.05] py-1.5">
      <div className="text-sm font-mono text-foreground">{value}</div>
      <div className="text-[9px] text-muted-foreground/70 tracking-wider">{label}</div>
    </div>
  );
}

const moodEmoji: Record<string, string> = { great: "😄", good: "🙂", normal: "😐", down: "😕", bad: "😣" };

function DayNotesCard({ date, notes, onAdd, onOpen }: { date: string; notes: any[]; onAdd: (text: string) => void; onOpen: () => void }) {
  const dayNotes = notes
    .filter((n) => typeof n.createdAt === "string" && n.createdAt.slice(0, 10) === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    onAdd(v);
    setDraft("");
  };
  return (
    <section>
      <SectionHeader icon={StickyNote} title="当日记录" count={dayNotes.length || undefined} />

      <div className="rounded-xl border border-border bg-foreground/[0.04] focus-within:border-amber-glow/40 focus-within:bg-foreground/[0.06] transition p-2.5 mb-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !composing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="写一条记录…（⌘/Ctrl + Enter 保存）"
          rows={2}
          className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 outline-none resize-none leading-relaxed"
        />
        <div className="flex items-center justify-between mt-1.5">
          <button onClick={onOpen} className="text-[10px] text-muted-foreground/70 hover:text-amber-glow transition">查看全部 →</button>
          <button
            onClick={submit}
            disabled={!draft.trim()}
            className="text-[11px] px-2.5 py-1 rounded-md bg-amber-glow/20 text-amber-glow border border-amber-glow/30 hover:bg-amber-glow/30 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            保存
          </button>
        </div>
      </div>

      {dayNotes.length === 0 ? (
        <div className="w-full text-xs text-muted-foreground/80 text-center py-3 rounded-xl border border-dashed border-border">
          这一天还没有记录
        </div>
      ) : (
        <div className="space-y-1.5">
          {dayNotes.map((n) => (
            <button
              key={n.id}
              onClick={onOpen}
              className="w-full text-left rounded-lg border border-border bg-foreground/[0.04] hover:bg-foreground/[0.08] p-2.5 transition"
            >
              <div className="flex items-center gap-1.5 mb-1">
                {n.mood && <span className="text-[11px]">{moodEmoji[n.mood] ?? "•"}</span>}
                {(n.tags ?? []).slice(0, 2).map((t: string) => (
                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-white/8 text-muted-foreground">{t}</span>
                ))}
                <span className="ml-auto text-[9px] text-muted-foreground/60 font-mono">{n.createdAt.slice(11, 16)}</span>
              </div>
              <p className="text-[11px] text-foreground/80 line-clamp-2 leading-relaxed">{n.text}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}


function DayComicCard({ date, comics, onOpen }: { date: string; comics: any[]; onOpen: () => void }) {
  const comic = comics.find((c) => c.date === date);
  if (!comic) return null;
  return (
    <section>
      <SectionHeader icon={ImageIcon} title="当日漫画" />
      <button
        onClick={onOpen}
        className="block w-full rounded-xl overflow-hidden border border-amber-glow/25 bg-background/60 hover:border-amber-glow/50 transition group"
      >
        <div className="aspect-square w-full overflow-hidden bg-background/60">
          <img src={comic.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition" />
        </div>
        {comic.caption && (
          <div className="px-3 py-2 text-[11px] text-foreground/75 line-clamp-2 leading-relaxed">{comic.caption}</div>
        )}
      </button>
    </section>
  );
}
