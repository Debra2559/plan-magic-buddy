import { Circle, CheckCircle2 } from "lucide-react";
import { useSylva } from "@/lib/sylva-store";

const tagColor: Record<string, string> = {
  工作: "text-moss",
  学习: "text-amber-glow",
  英语: "text-amber-glow",
  健康: "text-accent",
  习惯: "text-foreground/50",
  生活: "text-foreground/50",
};

export function TodayWidget() {
  const { items, toggleDone } = useSylva();
  const today = items
    .filter((i) => i.date === "2026-05-19" && (i.type === "todo" || i.type === "reminder"))
    .slice(0, 6);
  const doneCount = today.filter((i) => i.done).length;

  return (
    <div className="widget p-6 w-[340px]">
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-display text-3xl">保持节奏</span>
        <span className="text-xs text-muted-foreground">{doneCount} / {today.length}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-5">2026 · 5 · 19 · 周二</p>

      <div className="space-y-2.5 min-h-[120px]">
        {today.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">今天没有待办</p>
        ) : (
          today.map((t) => (
            <button
              key={t.id}
              onClick={() => toggleDone(t.id)}
              className="flex items-start gap-3 group w-full text-left"
            >
              {t.done ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-moss shrink-0" />
              ) : (
                <Circle className="w-4 h-4 mt-0.5 text-foreground/30 shrink-0 group-hover:text-foreground/60 transition" />
              )}
              <span className={`text-sm flex-1 ${t.done ? "text-foreground/40 line-through" : "text-foreground/90"}`}>
                {t.title}
              </span>
              <span className={`text-[10px] tracking-wider ${tagColor[t.tag] ?? "text-foreground/50"} shrink-0 mt-1`}>
                {t.tag}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-foreground/10">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">2026 年度进度</span>
          <span className="text-amber-glow">38%</span>
        </div>
        <div className="mt-2 h-1 bg-foreground/10 rounded-full overflow-hidden">
          <div className="h-full w-[38%] bg-gradient-to-r from-moss to-amber-glow rounded-full" />
        </div>
      </div>
    </div>
  );
}
