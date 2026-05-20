import { Circle, CheckCircle2 } from "lucide-react";

const tasks = [
  { done: true, label: "晨起温水 · 拉伸 10 分钟", tag: "习惯" },
  { done: true, label: "回顾上周遗留事项", tag: "工作" },
  { done: false, label: "AI 工具处理重复性工作", tag: "工作" },
  { done: false, label: "泛听 15 分钟 TED", tag: "英语" },
  { done: false, label: "23:30 前放下手机", tag: "健康" },
];

const tagColor: Record<string, string> = {
  工作: "text-moss",
  英语: "text-amber-glow",
  健康: "text-accent",
  习惯: "text-foreground/50",
};

export function TodayWidget() {
  return (
    <div className="widget p-6 w-[340px]">
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-display text-3xl">保持节奏</span>
        <span className="text-xs text-muted-foreground">3 / 5</span>
      </div>
      <p className="text-xs text-muted-foreground mb-5">2026 · 5 · 19 · 周二</p>

      <div className="space-y-2.5">
        {tasks.map((t, i) => (
          <div key={i} className="flex items-start gap-3 group">
            {t.done ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-moss shrink-0" />
            ) : (
              <Circle className="w-4 h-4 mt-0.5 text-foreground/30 shrink-0 group-hover:text-foreground/60 transition" />
            )}
            <span className={`text-sm flex-1 ${t.done ? "text-foreground/40 line-through" : "text-foreground/90"}`}>
              {t.label}
            </span>
            <span className={`text-[10px] tracking-wider ${tagColor[t.tag]} shrink-0 mt-1`}>{t.tag}</span>
          </div>
        ))}
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
