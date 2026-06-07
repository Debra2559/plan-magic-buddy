import { useFocusTimer } from "@/lib/focus-sessions";
import { Pause, Play, X, SkipForward, Timer, Coffee } from "lucide-react";
import { useState } from "react";

export function FocusTimerOverlay() {
  const { state, pause, resume, cancel, skip, todayFocusMin } = useFocusTimer();
  const [collapsed, setCollapsed] = useState(false);
  if (!state) return null;

  const totalSec = state.mode === "pomodoro"
    ? (state.phase === "focus" ? state.plannedMin * 60 : 5 * 60)
    : 0;
  const displaySec = state.mode === "pomodoro" ? state.remainingSec : state.remainingSec;
  const m = Math.floor(displaySec / 60);
  const s = displaySec % 60;
  const pct = state.mode === "pomodoro" ? ((totalSec - state.remainingSec) / totalSec) * 100 : 0;

  const isBreak = state.mode === "pomodoro" && state.phase === "break";

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-3 py-2 rounded-full bg-background/95 border border-amber-glow/40 backdrop-blur-md shadow-2xl hover:bg-foreground/5"
      >
        {isBreak ? <Coffee className="w-4 h-4 text-moss" /> : <Timer className="w-4 h-4 text-amber-glow" />}
        <span className="font-mono text-sm tabular-nums text-foreground">
          {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[60] w-[300px] rounded-2xl border border-border bg-background/95 backdrop-blur-md shadow-2xl shadow-black/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-foreground/5">
        <div className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase">
          {isBreak ? <Coffee className="w-3 h-3 text-moss" /> : <Timer className="w-3 h-3 text-amber-glow" />}
          <span className={isBreak ? "text-moss" : "text-amber-glow"}>
            {state.mode === "pomodoro" ? (isBreak ? "休息中" : `番茄 #${state.pomoCycle + 1}`) : "自由计时"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCollapsed(true)} className="text-muted-foreground hover:text-foreground text-xs px-1.5">收起</button>
          <button onClick={cancel} className="text-muted-foreground hover:text-destructive p-1" title="结束">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="px-5 py-5 text-center">
        {state.title && (
          <div className="text-xs text-muted-foreground mb-2 truncate">{state.title}</div>
        )}
        <div className="font-mono text-5xl tabular-nums text-foreground tracking-tight">
          {String(m).padStart(2, "0")}<span className="text-amber-glow">:</span>{String(s).padStart(2, "0")}
        </div>
        {state.mode === "pomodoro" && (
          <div className="mt-3 h-1 bg-foreground/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${isBreak ? "bg-moss" : "bg-gradient-to-r from-amber-glow to-moss"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <div className="text-[10px] text-muted-foreground mt-2">今日已专注 {todayFocusMin} 分钟</div>
      </div>
      <div className="flex items-center justify-center gap-2 px-3 pb-3">
        {state.paused ? (
          <button onClick={resume} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-glow text-background text-xs font-medium hover:opacity-90">
            <Play className="w-3.5 h-3.5" /> 继续
          </button>
        ) : (
          <button onClick={pause} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-foreground/10 text-foreground text-xs font-medium hover:bg-foreground/15">
            <Pause className="w-3.5 h-3.5" /> 暂停
          </button>
        )}
        <button onClick={skip} className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-border text-muted-foreground text-xs hover:bg-foreground/5">
          <SkipForward className="w-3.5 h-3.5" /> {state.mode === "free" ? "完成" : "跳过"}
        </button>
      </div>
    </div>
  );
}

/** 启动器：用在「无具体任务」入口（如视图工具栏） */
export function FocusTimerStarter() {
  const { state, start } = useFocusTimer();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"pomodoro" | "free">("pomodoro");
  const [mins, setMins] = useState(25);
  if (state) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs text-foreground hover:bg-foreground/5"
      >
        <Timer className="w-3.5 h-3.5 text-amber-glow" /> 专注
      </button>
      {open && (
        <div className="absolute right-0 mt-2 z-50 w-64 rounded-xl border border-border bg-popover backdrop-blur-md shadow-xl p-3 space-y-3">
          <div className="flex gap-1.5">
            <button
              onClick={() => setMode("pomodoro")}
              className={`flex-1 text-xs py-1.5 rounded-md ${mode === "pomodoro" ? "bg-amber-glow/20 text-amber-glow" : "bg-foreground/5 text-muted-foreground"}`}
            >番茄钟</button>
            <button
              onClick={() => setMode("free")}
              className={`flex-1 text-xs py-1.5 rounded-md ${mode === "free" ? "bg-amber-glow/20 text-amber-glow" : "bg-foreground/5 text-muted-foreground"}`}
            >自由计时</button>
          </div>
          {mode === "pomodoro" && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1.5">时长（分钟）</div>
              <div className="flex gap-1">
                {[15, 25, 45, 90].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMins(m)}
                    className={`flex-1 text-xs py-1 rounded ${mins === m ? "bg-foreground/15 text-foreground" : "bg-foreground/5 text-muted-foreground hover:text-foreground"}`}
                  >{m}</button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => { start({ mode, plannedMin: mins }); setOpen(false); }}
            className="w-full py-2 rounded-md bg-amber-glow text-background text-xs font-medium hover:opacity-90"
          >开始</button>
        </div>
      )}
    </div>
  );
}
