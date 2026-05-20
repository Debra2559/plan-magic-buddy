import { Pin } from "lucide-react";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const today = 19;

export function CalendarWidget() {
  const days = Array.from({ length: 35 }, (_, i) => i - 3); // May 2026 starts Friday

  return (
    <div className="widget p-6 w-[420px]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Pin className="w-3.5 h-3.5 text-amber-glow rotate-45" />
          <span className="font-display text-lg">2026年 5月</span>
        </div>
        <span className="text-xs text-muted-foreground tracking-widest">星期二 · 农历四月初三</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] text-muted-foreground/70 mb-2">
        {weekdays.map((d) => (
          <div key={d} className="text-center py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const isToday = d === today;
          const hasEvent = [12, 21, 26].includes(d);
          const inMonth = d >= 1 && d <= 31;
          return (
            <div
              key={i}
              className={`aspect-square flex flex-col items-center justify-center text-xs rounded-lg relative transition-colors
                ${!inMonth ? "text-foreground/20" : "text-foreground/85"}
                ${isToday ? "bg-amber-glow/15 ring-1 ring-amber-glow/60 text-amber-glow font-medium" : "hover:bg-foreground/5"}
              `}
            >
              {inMonth ? d : ""}
              {hasEvent && inMonth && !isToday && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-moss" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-foreground/10 space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-glow" />
          <span className="text-foreground/80">准备毕业答辩 PPT</span>
          <span className="ml-auto text-muted-foreground">14:00</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-moss" />
          <span className="text-foreground/80">vibecoding 规划产品</span>
          <span className="ml-auto text-muted-foreground">16:30</span>
        </div>
      </div>
    </div>
  );
}
