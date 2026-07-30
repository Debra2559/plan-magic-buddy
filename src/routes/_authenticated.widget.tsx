import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useHydrated } from "@tanstack/react-router";
import { useSylva, todayLocal } from "@/lib/sylva-store";
import { CheckCircle2, Circle, Flag, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/widget")({
  head: () => ({
    meta: [
      { title: "桌面组件 · Sylva" },
      { name: "description", content: "Sylva 桌面组件：在 macOS 桌面上悬浮显示今日待办、日程与关键节点。" },
      { property: "og:title", content: "桌面组件 · Sylva" },
      { property: "og:description", content: "Sylva 桌面组件：在 macOS 桌面上悬浮显示今日待办、日程与关键节点。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    kind: (s.kind as string) === "milestones" || (s.kind as string) === "agenda" ? (s.kind as string) : "today",
  }),
  component: WidgetSurface,
});

function dayDiff(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const [ty, tm, td] = todayLocal().split("-").map(Number);
  const base = new Date(ty, tm - 1, td).getTime();
  return Math.round((target - base) / 86400000);
}

function WidgetSurface() {
  const { kind } = Route.useSearch();
  const { items, toggleDone } = useSylva();
  const hydrated = useHydrated();
  const today = todayLocal();

  const list = useMemo(() => {
    if (!hydrated) return [];
    const sorted = [...items].sort(
      (a, b) => a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99"),
    );
    if (kind === "milestones") {
      return sorted.filter((i) => i.type === "milestone" && i.date >= today).slice(0, 8);
    }
    if (kind === "agenda") {
      return sorted.filter((i) => i.date >= today).slice(0, 10);
    }
    return sorted.filter((i) => i.date === today).slice(0, 10);
  }, [items, hydrated, kind, today]);

  const title = kind === "milestones" ? "关键节点" : kind === "agenda" ? "接下来" : "今天";
  const doneCount = list.filter((i) => i.done).length;

  return (
    <div className="min-h-screen bg-background/80 backdrop-blur-xl text-foreground select-none">
      <div
        className="flex items-baseline justify-between px-4 pt-3 pb-2"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="font-display text-lg">{title}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {kind === "today" ? `${doneCount} / ${list.length}` : today}
        </span>
      </div>

      <div className="px-4 pb-4 space-y-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground/70">暂无内容</p>
        ) : (
          list.map((it) => (
            <button
              key={it.id}
              onClick={() => toggleDone(it.id)}
              className="flex items-start gap-2.5 w-full text-left group"
            >
              {it.type === "milestone" ? (
                <Flag className="w-3.5 h-3.5 mt-0.5 text-destructive shrink-0" />
              ) : it.done ? (
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-moss shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 mt-0.5 text-foreground/30 shrink-0 group-hover:text-foreground/60 transition" />
              )}
              <span className={`text-[13px] flex-1 leading-snug ${it.done ? "text-foreground/40 line-through" : ""}`}>
                {it.title}
              </span>
              {it.time ? (
                <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {it.time}
                </span>
              ) : kind !== "today" ? (
                <span className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                  {dayDiff(it.date) === 0 ? "今天" : `D-${dayDiff(it.date)}`}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
