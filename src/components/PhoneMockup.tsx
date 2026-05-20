import { Sparkles, Calendar, CheckCircle2, Circle, Mic } from "lucide-react";

export function PhoneMockup() {
  return (
    <div className="relative w-[300px] h-[620px] rounded-[3rem] bg-gradient-to-b from-bark/40 to-background border border-foreground/15 shadow-2xl p-3 animate-float">
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-6 bg-background rounded-full z-10" />
      <div className="w-full h-full rounded-[2.5rem] overflow-hidden bg-background relative">
        {/* Status bar */}
        <div className="flex justify-between items-center px-7 pt-4 pb-2 text-[11px] text-foreground/70">
          <span>9:41</span>
          <span>•••</span>
        </div>

        <div className="px-5 pt-8 pb-4">
          <p className="text-[10px] tracking-widest text-muted-foreground">5月19日 · 周二</p>
          <h3 className="font-display text-3xl mt-1 mb-4">保持节奏</h3>

          <div className="widget p-3 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3 h-3 text-amber-glow" />
              <span className="text-[10px] tracking-wider text-amber-glow">AI 建议</span>
            </div>
            <p className="text-xs text-foreground/85 leading-relaxed">
              下午 14:00 有 2 小时空档，建议先把答辩 PPT 主体跑通。
            </p>
          </div>

          <div className="space-y-2.5">
            {[
              { d: true, t: "晨起温水 + 拉伸", time: "07:00" },
              { d: true, t: "回顾上周遗留", time: "09:30" },
              { d: false, t: "毕业答辩 PPT 主体", time: "14:00", hot: true },
              { d: false, t: "泛听 TED 15min", time: "通勤" },
              { d: false, t: "23:30 前放下手机", time: "夜" },
            ].map((t, i) => (
              <div key={i} className={`flex items-center gap-2.5 p-2 rounded-xl ${t.hot ? "bg-amber-glow/10 ring-1 ring-amber-glow/30" : ""}`}>
                {t.d ? <CheckCircle2 className="w-3.5 h-3.5 text-moss" /> : <Circle className="w-3.5 h-3.5 text-foreground/30" />}
                <span className={`text-xs flex-1 ${t.d ? "line-through text-foreground/40" : "text-foreground/85"}`}>{t.t}</span>
                <span className="text-[10px] text-muted-foreground">{t.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom input bar */}
        <div className="absolute bottom-4 left-3 right-3 flex items-center gap-2 p-2 pl-4 rounded-full bg-foreground/[0.08] backdrop-blur border border-foreground/10">
          <Calendar className="w-4 h-4 text-foreground/50" />
          <input className="flex-1 bg-transparent text-xs outline-none placeholder:text-foreground/40" placeholder="说一个想法..." />
          <button className="w-7 h-7 rounded-full bg-amber-glow flex items-center justify-center">
            <Mic className="w-3.5 h-3.5 text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
