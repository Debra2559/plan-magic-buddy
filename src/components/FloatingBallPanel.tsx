import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, RotateCcw, Eye, EyeOff } from "lucide-react";
import {
  setFloatingBallEnabled,
  resetFloatingBallPosition,
  getFloatingBallEnabled,
} from "@/components/FloatingBall";

export function FloatingBallPanel() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(getFloatingBallEnabled());
    const onUpdate = () => setEnabled(getFloatingBallEnabled());
    window.addEventListener("floating-ball:update", onUpdate);
    return () => window.removeEventListener("floating-ball:update", onUpdate);
  }, []);

  const toggle = (v: boolean) => {
    setEnabled(v);
    setFloatingBallEnabled(v);
    toast.success(v ? "已显示悬浮球" : "已隐藏悬浮球");
  };

  const reset = () => {
    resetFloatingBallPosition();
    setEnabled(true);
    toast.success("已重置悬浮球位置");
  };

  return (
    <div className="space-y-4">
      <div className="widget p-4 flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-glow via-orange-400 to-moss flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm text-foreground">显示悬浮球</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              桌面右侧的 AI 快捷入口，可拖拽贴边
            </div>
          </div>
        </div>
        <button
          onClick={() => toggle(!enabled)}
          className={`relative w-11 h-6 rounded-full transition shrink-0 ${
            enabled ? "bg-amber-glow" : "bg-foreground/15"
          }`}
          aria-label="切换悬浮球"
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="widget p-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-foreground">重置位置</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            把悬浮球放回屏幕右侧中部
          </div>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-border text-xs text-foreground/85"
        >
          <RotateCcw className="w-3.5 h-3.5" /> 重置
        </button>
      </div>

      <div className="rounded-xl border border-border/70 bg-foreground/[0.03] p-3 text-[11px] text-muted-foreground leading-relaxed">
        <div className="flex items-center gap-1.5 text-foreground/70 mb-1">
          {enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          小提示
        </div>
        悬浮球可以拖动并自动贴边；单击展开速记 / 新建事件 / 跟 AI 聊聊 等快捷动作。
      </div>
    </div>
  );
}
