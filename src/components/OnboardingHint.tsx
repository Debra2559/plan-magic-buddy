import { useState } from "react";
import { Sparkles, Calendar as CalIcon, CheckSquare, BookHeart, X, ArrowRight } from "lucide-react";

const steps = [
  { icon: Sparkles, title: "用自然语言规划", desc: "在 AI Planner 里说一句话，比如「明天上午 10 点和小李喝咖啡」，Sylva 会自动写入日程。" },
  { icon: CalIcon, title: "日程视图", desc: "确认后的事件会出现在「日程」里，可拖动、可改时间、可一键完成。" },
  { icon: CheckSquare, title: "待办与习惯", desc: "「待办」与「习惯」自动同步，无需手动维护。" },
  { icon: BookHeart, title: "你的人设由你掌控", desc: "在「设置」里随时调整你的偏好与每日节奏。" },
];

export function OnboardingHint({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = steps[i];
  const Icon = step.icon;
  const isLast = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md widget p-6 space-y-5 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-md hover:bg-foreground/10 text-foreground/50"
          aria-label="关闭"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-glow/20 flex items-center justify-center text-amber-glow">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-foreground/50">新手引导 · {i + 1} / {steps.length}</p>
            <h3 className="font-display text-lg leading-tight">{step.title}</h3>
          </div>
        </div>

        <p className="text-sm text-foreground/75 leading-relaxed">{step.desc}</p>

        <div className="flex gap-1.5">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`h-1 flex-1 rounded-full transition-colors ${idx <= i ? "bg-amber-glow" : "bg-foreground/10"}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onClose}
            className="text-xs text-foreground/50 hover:text-foreground/80"
          >
            跳过引导
          </button>
          <button
            onClick={() => (isLast ? onClose() : setI(i + 1))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-glow text-primary-foreground text-sm font-medium hover:brightness-110 transition"
          >
            {isLast ? "开始使用" : "下一步"}
            {!isLast && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
