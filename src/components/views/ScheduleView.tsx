import { useState, useEffect, useRef } from "react";
import { useSylva } from "@/lib/sylva-store";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, Bell, Plus, Trash2, X, CheckCircle2, RotateCcw, Check } from "lucide-react";
import type { PlanItem } from "@/lib/plan.functions";
import { TimePicker } from "@/components/ui/time-picker";


const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

const tagColor: Record<string, string> = {
  工作: "bg-moss/30 text-moss border-moss/40",
  学习: "bg-amber-glow/25 text-amber-glow border-amber-glow/40",
  健康: "bg-accent/25 text-accent border-accent/40",
  生活: "bg-foreground/10 text-foreground/70 border-foreground/20",
  英语: "bg-amber-glow/25 text-amber-glow border-amber-glow/40",
  习惯: "bg-moss/30 text-moss border-moss/40",
};

const typeIcon = { event: CalIcon, todo: Clock, reminder: Bell } as const;

export function ScheduleView() {
  const { items, addItems, updateItem, removeItem, toggleDone, isRecapDone, unmarkRecapDone } = useSylva();
  const [cursor, setCursor] = useState(new Date(2026, 4, 1)); // May 2026
  const [selected, setSelected] = useState("2026-05-19");
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [editorAnchor, setEditorAnchor] = useState<{ x: number; y: number } | null>(null);


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
            <h2 className="font-display text-3xl text-white">
              {year} 年 {month + 1} 月
            </h2>
            <span className="text-xs text-white/40 tracking-widest">日程视图</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="p-2 rounded-lg hover:bg-white/10 text-white/70"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCursor(new Date(2026, 4, 1))}
              className="px-3 py-1.5 rounded-lg hover:bg-white/10 text-xs text-white/70"
            >
              今天
            </button>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="p-2 rounded-lg hover:bg-white/10 text-white/70"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-white/10 rounded-xl overflow-hidden border border-white/10">
          {weekdays.map((d) => (
            <div key={d} className="bg-black/30 py-2 text-center text-[11px] text-white/50 tracking-wider">
              星期{d}
            </div>
          ))}
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} className="bg-black/20 min-h-[110px]" />;
            const dayItems = itemsByDate[cell.iso] ?? [];
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
                className={`min-h-[110px] p-2 text-left transition relative overflow-hidden
                  ${isSelected ? "bg-amber-glow/15 ring-2 ring-amber-glow/60 z-10" : "bg-black/30 hover:bg-black/40"}`}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <span className={`text-sm ${isToday ? "text-amber-glow font-bold" : "text-white/85"}`}>
                    {cell.day}
                  </span>
                  <div className="flex items-center gap-1">
                    {isRecapDone(cell.iso) && (
                      <CheckCircle2 className="w-3 h-3 text-moss" aria-label="今日小结已提交" />
                    )}
                    {isToday && <span className="text-[9px] text-amber-glow">今</span>}
                  </div>
                </div>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map((it) => (
                    <div
                      key={it.id}
                      className={`text-[10px] px-1.5 py-0.5 rounded truncate border ${
                        tagColor[it.tag] ?? "bg-white/10 text-white/70 border-white/15"
                      } ${it.done ? "opacity-50 line-through" : ""}`}
                      title={it.title}
                    >
                      {it.time && <span className="font-mono mr-1 opacity-70">{it.time}</span>}
                      {it.title}
                    </div>
                  ))}
                  {dayItems.length > 3 && (
                    <div className="text-[9px] text-white/50 px-1.5">+{dayItems.length - 3} 项</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right detail */}
      <aside className="w-72 shrink-0 bg-black/30 border-l border-white/10 p-5 overflow-auto">
        <p className="text-[10px] tracking-widest text-amber-glow mb-1">所选日期</p>
        <h3 className="font-display text-2xl text-white mb-1">{formatLong(selected)}</h3>
        <p className="text-xs text-white/40 mb-5">{selectedItems.length} 项安排</p>

        {isRecapDone(selected) && (
          <div className="p-3 rounded-xl bg-moss/15 border border-moss/30 mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-moss shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-moss font-medium">今日小结 · 已完成</p>
              <p className="text-[10px] text-white/50 mt-0.5">已通过飞书卡片提交并同步到日历</p>
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

        {selectedItems.length === 0 ? (
          <div className="text-center py-10 text-xs text-white/40">这一天还没有安排</div>
        ) : (
          <div className="space-y-2">
            {selectedItems.map((it) => (
              <ItemCard
                key={it.id}
                item={it}
                onChange={(patch) => updateItem(it.id, patch)}
                onToggleDone={() => toggleDone(it.id)}
                onDelete={() => removeItem(it.id)}
              />
            ))}
          </div>
        )}

        <QuickAdd date={selected} onAdd={(item) => addItems([item])} />
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
    <div className="mt-3 p-2 rounded-xl bg-white/[0.03] border border-white/10 flex items-center gap-1.5">
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
        className="flex-1 min-w-0 bg-transparent border-none px-1 py-1 text-xs text-white placeholder:text-white/30 focus:outline-none"
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
  const width = 320;
  const height = 360;
  const margin = 12;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const x = anchor ? Math.max(margin, Math.min(anchor.x - width / 2, vw - width - margin)) : (vw - width) / 2;
  const yPos = anchor ? Math.max(margin, Math.min(anchor.y - 40, vh - height - margin)) : (vh - height) / 2;

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left: x, top: yPos, width, maxHeight: height, zIndex: 100 }}
      className="rounded-xl shadow-2xl border border-white/15 bg-[#1d1d1f]/95 backdrop-blur-2xl flex flex-col overflow-hidden text-white"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="h-9 shrink-0 flex items-center px-3 border-b border-white/10 bg-black/30">
        <button onClick={onClose} title="关闭" className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110" />
        <div className="flex-1 text-center text-xs font-medium text-white/85">{headerLabel}</div>
        <span className="w-3 h-3" />
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-1.5">
        {items.length === 0 && (
          <div className="text-[11px] text-white/40 text-center py-6">这一天还没有安排，下方添加</div>
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

      <div className="shrink-0 border-t border-white/10 p-2 flex items-center gap-1.5 bg-black/20">
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
          className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber-glow/50"
        />
        <button
          onClick={submit}
          className="p-1.5 rounded bg-amber-glow/80 text-primary-foreground hover:bg-amber-glow"
          title="添加（Enter）"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
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
    <div className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition ${done ? "bg-moss/10 border-moss/25" : "bg-white/5 border-white/10 hover:border-white/20"}`}>
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
            className="flex-1 bg-black/30 border border-white/15 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
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
            className="flex-1 flex items-center gap-1.5 text-left"
            title="点击编辑标题"
          >
            <span className={`text-xs truncate ${done ? "text-white/40 line-through" : "text-white/90"}`}>{item.title}</span>
          </button>
        </>

      )}
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/90"
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
          : "bg-white/5 border-white/25 hover:border-white/60 text-transparent"
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
}: {
  item: PlanItem & { id: string; done?: boolean };
  onChange: (patch: Partial<PlanItem>) => void;
  onToggleDone: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const Icon = typeIcon[item.type];
  const done = !!item.done;

  const commit = () => {
    const t = title.trim();
    if (t && t !== item.title) onChange({ title: t });
    else setTitle(item.title);
    setEditing(false);
  };

  return (
    <div className={`group relative p-3 rounded-xl border transition ${done ? "bg-moss/10 border-moss/30" : "bg-white/[0.04] border-white/10 hover:border-white/20"}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <DoneCheckbox done={done} onToggle={onToggleDone} />
        <Icon className="w-3.5 h-3.5 text-amber-glow/80 shrink-0" />
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${tagColor[item.tag] ?? "bg-white/10 text-white/70 border-white/15"}`}>
          {item.tag}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <TimePicker
            value={item.time ?? ""}
            onChange={(v) => onChange({ time: v || undefined })}
            size="sm"
          />
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-white/10 text-white/40 hover:text-destructive"
            title="删除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
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
          className="w-full bg-black/30 border border-white/15 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-glow/50"
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          title="点击编辑"
          className={`text-sm leading-snug cursor-text ${done ? "text-white/45 line-through" : "text-white/90"}`}
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
    return <div className="text-center py-10 text-xs text-white/40">这一天还没有安排</div>;
  }

  return (
    <div>
      {/* Unscheduled tray */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={onTrayDrop}
        className="mb-3 p-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03]"
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] tracking-widest text-white/40">未排时</span>
          <span className="text-[10px] text-white/30">{unscheduled.length} 项 · 拖到下方时间轴</span>
        </div>
        {unscheduled.length === 0 ? (
          <div className="text-[11px] text-white/30 text-center py-2">把已排时的拖回这里可清除时间</div>
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
      <div className="relative rounded-xl border border-white/10 bg-black/20 overflow-hidden">
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
              className={`relative flex items-start border-t border-white/5 transition ${
                isHover ? "bg-amber-glow/10" : "hover:bg-white/[0.02]"
              }`}
            >
              <span className="text-[10px] font-mono text-white/35 w-10 pl-2 pt-1 select-none">
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
                tagColor[it.tag] ?? "bg-white/10 text-white/80 border-white/15"
              }`}
              title={`${it.time} · ${it.title}（拖动改时间）`}
            >
              <span className="font-mono mr-1 opacity-70">{it.time}</span>
              <span className="truncate">{it.title}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-white/30 mt-2 text-center">提示：拖到 15 分钟刻度，松手即设置时间</p>
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
        tagColor[item.tag] ?? "bg-white/10 text-white/80 border-white/15"
      } ${dragging ? "opacity-40" : ""}`}
      title="拖到右侧时间轴排进某个时段"
    >
      <Icon className="w-3 h-3 opacity-70" />
      <span className="truncate max-w-[140px]">{item.title}</span>
    </div>
  );
}
