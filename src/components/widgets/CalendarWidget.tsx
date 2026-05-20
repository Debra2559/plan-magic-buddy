import { Pin } from "lucide-react";
import { useSylva } from "@/lib/sylva-store";
import { useHydrated } from "@tanstack/react-router";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

export function CalendarWidget() {
  const { items } = useSylva();
  const hydrated = useHydrated();
  // May 2026: 1st is Friday → Mon-first offset 4
  const startOffset = 4;
  const daysInMonth = 31;
  const totalCells = 35;

  const itemsByDay = hydrated
    ? items.reduce<Record<number, typeof items>>((acc, it) => {
        const [y, m, d] = it.date.split("-").map(Number);
        if (y === 2026 && m === 5) (acc[d] ||= []).push(it);
        return acc;
      }, {})
    : {};

  return (
    <div className="widget p-5 w-[420px]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Pin className="w-3.5 h-3.5 text-amber-glow rotate-45" />
          <span className="font-display text-lg">2026年 5月</span>
        </div>
        <span className="text-xs text-muted-foreground tracking-widest">星期二 · 农历四月初三</span>
      </div>
      <div className="grid grid-cols-7 gap-px text-[10px] text-muted-foreground/70 mb-1">
        {weekdays.map((d) => (
          <div key={d} className="text-center py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-foreground/8 rounded-lg overflow-hidden">
        {Array.from({ length: totalCells }, (_, i) => {
          const day = i - startOffset + 1;
          if (day < 1 || day > daysInMonth) {
            return <div key={i} className="bg-background/40 h-[52px]" />;
          }
          const dayItems = itemsByDay[day] ?? [];
          const isToday = day === 19;
          return (
            <div
              key={i}
              className={`bg-background/60 h-[52px] p-1 flex flex-col gap-0.5 overflow-hidden text-left
                ${isToday ? "ring-1 ring-amber-glow/60 bg-amber-glow/5" : ""}`}
            >
              <div className={`text-[10px] leading-none ${isToday ? "text-amber-glow font-bold" : "text-foreground/70"}`}>
                {day}
              </div>
              {dayItems.slice(0, 2).map((it) => (
                <div
                  key={it.id}
                  className="text-[8px] leading-tight px-1 py-px rounded bg-amber-glow/25 text-amber-glow truncate"
                  title={it.title}
                >
                  {it.title}
                </div>
              ))}
              {dayItems.length > 2 && (
                <div className="text-[8px] text-muted-foreground leading-none">+{dayItems.length - 2}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
