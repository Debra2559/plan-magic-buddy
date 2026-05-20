import { useState, useEffect, useRef } from "react";
import { useSylva } from "@/lib/sylva-store";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, Bell, Plus, Trash2, X } from "lucide-react";
import type { PlanItem } from "@/lib/plan.functions";


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
  const { items, addItems, updateItem, removeItem } = useSylva();
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
                className={`min-h-[110px] p-2 text-left transition relative overflow-hidden
                  ${isSelected ? "bg-amber-glow/15 ring-2 ring-amber-glow/60 z-10" : "bg-black/30 hover:bg-black/40"}`}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <span className={`text-sm ${isToday ? "text-amber-glow font-bold" : "text-white/85"}`}>
                    {cell.day}
                  </span>
                  {isToday && <span className="text-[9px] text-amber-glow">今</span>}
                </div>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map((it) => (
                    <div
                      key={it.id}
                      className={`text-[10px] px-1.5 py-0.5 rounded truncate border ${
                        tagColor[it.tag] ?? "bg-white/10 text-white/70 border-white/15"
                      }`}
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

        {selectedItems.length === 0 ? (
          <div className="text-center py-10 text-xs text-white/40">这一天还没有安排</div>
        ) : (
          <div className="space-y-2">
            {selectedItems.map((it) => {
              const Icon = typeIcon[it.type];
              return (
                <div key={it.id} className="p-3 rounded-xl bg-white/5 border border-white/8">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5 text-amber-glow" />
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${tagColor[it.tag]}`}>
                      {it.tag}
                    </span>
                    {it.time && <span className="text-xs text-white/60 font-mono ml-auto">{it.time}</span>}
                  </div>
                  <p className="text-sm text-white/90 leading-snug">{it.title}</p>
                  {it.note && <p className="text-xs text-white/50 mt-1">{it.note}</p>}
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}

function formatLong(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const w = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${m} 月 ${d} 日 · ${w}`;
}
