import { Sparkles, ArrowUp } from "lucide-react";

export function AiInputWidget() {
  return (
    <div className="widget widget-glow p-6 w-[480px]">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-amber-glow animate-pulse-glow" />
        <span className="text-xs tracking-wider text-amber-glow/90">AI · 智能规划</span>
      </div>

      <p className="font-display text-lg text-foreground/90 leading-relaxed mb-4">
        "下周我要准备毕业答辩，同时还得跑通飞书工作提效系统，
        <span className="text-amber-glow">帮我排一下时间</span>"
      </p>

      <div className="space-y-2 mb-5">
        {[
          { d: "周一", t: "梳理答辩大纲 + 导师同步", c: "bg-moss" },
          { d: "周二", t: "答辩 PPT 主体 · 飞书 mock", c: "bg-amber-glow" },
          { d: "周三", t: "PPT 精修 · 模拟一次答辩", c: "bg-accent" },
          { d: "周四 - 五", t: "飞书系统跑通 · 收口", c: "bg-moss" },
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="text-xs text-muted-foreground w-16 shrink-0">{s.d}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${s.c}`} />
            <span className="text-foreground/80">{s.t}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 p-2 pl-4 rounded-2xl bg-foreground/5 border border-foreground/10">
        <input
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          placeholder="说一个想法，让 AI 帮你拆..."
        />
        <button className="w-8 h-8 rounded-xl bg-amber-glow text-primary-foreground flex items-center justify-center hover:scale-105 transition">
          <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
