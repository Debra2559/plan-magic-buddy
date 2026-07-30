import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useHydrated } from "@tanstack/react-router";
import { useSylva, todayLocal } from "@/lib/sylva-store";
import { useCalendarViewMode } from "@/lib/calendar-view";
import { CalendarTextEditor } from "@/components/CalendarTextEditor";
import { ChevronLeft, ChevronRight, Check, Clock, LayoutGrid, AlignLeft, CalendarDays } from "lucide-react";


export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "日历 · Sylva" },
      { name: "description", content: "Sylva 日历客户端：按月查看与勾选你的日程、待办与提醒。" },
      { property: "og:title", content: "日历 · Sylva" },
      { property: "og:description", content: "Sylva 日历客户端：按月查看与勾选你的日程、待办与提醒。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarClient,
});

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function CalendarClient() {
  const { items, toggleDone } = useSylva();
  const hydrated = useHydrated();
  const today = todayLocal();
  const [ty, tm] = today.split("-").map(Number);

  const [cursor, setCursor] = useState({ y: ty, m: tm });
  const [selected, setSelected] = useState<string>(today);
  const [viewMode, setViewMode] = useCalendarViewMode();


  const byDate = useMemo(() => {
    if (!hydrated) return {} as Record<string, typeof items>;
    return items.reduce<Record<string, typeof items>>((acc, it) => {
      (acc[it.date] ||= []).push(it);
      return acc;
    }, {});
  }, [items, hydrated]);

  const first = new Date(cursor.y, cursor.m - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // 周一开头
  const daysInMonth = new Date(cursor.y, cursor.m, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const shift = (delta: number) => {
    const d = new Date(cursor.y, cursor.m - 1 + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };

  const selectedItems = (byDate[selected] ?? [])
    .slice()
    .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 sticky top-0 bg-background/90 backdrop-blur z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shift(-1)}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            aria-label="上个月"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="font-display text-lg tabular-nums">
            {cursor.y} 年 {cursor.m} 月
          </h1>
          <button
            onClick={() => shift(1)}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
            aria-label="下个月"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`text-xs px-2 py-1.5 inline-flex items-center gap-1 transition-colors ${
                viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
              title="时间视图"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              时间
            </button>
            <button
              onClick={() => setViewMode("text")}
              className={`text-xs px-2 py-1.5 inline-flex items-center gap-1 transition-colors ${
                viewMode === "text" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              }`}
              title="文本视图"
            >
              <AlignLeft className="w-3.5 h-3.5" />
              文本
            </button>
          </div>
          <button
            onClick={() => {
              setCursor({ y: ty, m: tm });
              setSelected(today);
            }}
            className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
          >
            今天
          </button>

          <Link
            to="/desktop"
            className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent transition-colors inline-flex items-center gap-1"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            完整版
          </Link>
        </div>
      </header>

      {viewMode === "text" ? (
        <div className="flex-1 flex flex-col p-4 max-w-3xl w-full mx-auto">
          <div className="flex items-center justify-center gap-3 pb-3">
            <button
              onClick={() => setSelected(shiftDate(selected, -1))}
              className="p-1.5 rounded-md hover:bg-accent transition-colors"
              aria-label="前一天"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="font-display text-base tabular-nums">
              {selected.replace(/-/g, " / ")}
            </h2>
            <button
              onClick={() => setSelected(shiftDate(selected, 1))}
              className="p-1.5 rounded-md hover:bg-accent transition-colors"
              aria-label="后一天"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <CalendarTextEditor key={selected} date={selected} />
        </div>
      ) : (
      <div className="flex-1 flex flex-col lg:flex-row">

        <div className="flex-1 p-3">
          <div className="grid grid-cols-7 text-[11px] text-muted-foreground mb-1">
            {weekdays.map((d) => (
              <div key={d} className="text-center py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border/60 rounded-lg overflow-hidden">
            {Array.from({ length: totalCells }, (_, i) => {
              const day = i - startOffset + 1;
              if (day < 1 || day > daysInMonth) {
                return <div key={i} className="bg-muted/20 min-h-[86px]" />;
              }
              const key = ymd(cursor.y, cursor.m, day);
              const dayItems = byDate[key] ?? [];
              const isToday = key === today;
              const isSel = key === selected;
              return (
                <button
                  key={i}
                  onClick={() => setSelected(key)}
                  className={`bg-card min-h-[86px] p-1.5 flex flex-col gap-1 text-left overflow-hidden transition-colors hover:bg-accent/40
                    ${isSel ? "ring-2 ring-primary ring-inset" : ""}`}
                >
                  <span
                    className={`text-xs font-semibold leading-none ${
                      isToday ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {day}
                  </span>
                  {dayItems.slice(0, 3).map((it) => (
                    <span
                      key={it.id}
                      className={`text-[10px] leading-tight px-1 py-0.5 rounded bg-primary/15 text-primary truncate w-full ${
                        it.done ? "line-through opacity-50" : ""
                      }`}
                      title={it.title}
                    >
                      {it.time ? `${it.time} ` : ""}
                      {it.title}
                    </span>
                  ))}
                  {dayItems.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">+{dayItems.length - 3}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="lg:w-[340px] border-t lg:border-t-0 lg:border-l border-border/60 p-4">
          <h2 className="text-sm font-semibold mb-3">
            {selected} · {selectedItems.length} 项
          </h2>
          {selectedItems.length === 0 && (
            <p className="text-xs text-muted-foreground">这一天还没有安排。</p>
          )}
          <ul className="space-y-2">
            {selectedItems.map((it) => (
              <li
                key={it.id}
                className="flex items-start gap-2 rounded-lg border border-border/60 bg-card p-2.5"
              >
                <button
                  onClick={() => toggleDone(it.id)}
                  className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                    it.done ? "bg-primary border-primary" : "border-border hover:border-primary"
                  }`}
                  aria-label="切换完成"
                >
                  {it.done && <Check className="w-3 h-3 text-primary-foreground" />}
                </button>
                <div className="min-w-0">
                  <div className={`text-sm ${it.done ? "line-through text-muted-foreground" : ""}`}>
                    {it.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {it.time && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {it.time}
                        {it.durationMin ? ` · ${it.durationMin}分钟` : ""}
                      </span>
                    )}
                    {it.tag && <span className="px-1.5 py-px rounded bg-muted">{it.tag}</span>}
                  </div>
                  {it.note && <p className="mt-1 text-[11px] text-muted-foreground">{it.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
