import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CornerDownLeft } from "lucide-react";
import { useSylva } from "@/lib/sylva-store";

interface EnterHintProps {
  /** 示例文案，悬停时显示 */
  example?: string;
  className?: string;
}

/** 输入框旁的小提示徽章：显示当前键位模式，点击可在两种模式间切换。 */
export function EnterHint({ example, className = "" }: EnterHintProps) {
  const { enterToSubmit, setEnterToSubmit } = useSylva();
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘" : "Ctrl";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setEnterToSubmit(!enterToSubmit)}
            title="点击切换 Enter 直接发送 / 仅修饰键发送"
            className={`inline-flex items-center gap-1 text-[10px] text-white/40 hover:text-white/80 transition cursor-pointer select-none ${className}`}
          >
            {enterToSubmit ? (
              <>
                <kbd className="px-1 py-px rounded bg-white/5 border border-white/10 text-[9px] font-mono">Enter</kbd>
                <span>提交</span>
                <span className="opacity-50">·</span>
                <kbd className="px-1 py-px rounded bg-white/5 border border-white/10 text-[9px] font-mono">Shift</kbd>
                <span className="opacity-50">+</span>
                <kbd className="px-1 py-px rounded bg-white/5 border border-white/10 text-[9px] font-mono">Enter</kbd>
                <span>换行</span>
              </>
            ) : (
              <>
                <kbd className="px-1 py-px rounded bg-white/5 border border-white/10 text-[9px] font-mono">{mod}</kbd>
                <span className="opacity-50">+</span>
                <kbd className="px-1 py-px rounded bg-white/5 border border-white/10 text-[9px] font-mono">Enter</kbd>
                <span>提交</span>
                <span className="opacity-50">·</span>
                <kbd className="px-1 py-px rounded bg-white/5 border border-white/10 text-[9px] font-mono">Enter</kbd>
                <span>换行</span>
              </>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              <CornerDownLeft className="w-3 h-3" />
              当前模式：{enterToSubmit ? "Enter 直接发送" : `${mod}+Enter 才发送`}
            </div>
            <div className="text-muted-foreground">
              点击徽章可切换。当前发送键示例：
            </div>
            <pre className="bg-foreground/5 rounded px-2 py-1.5 text-[11px] leading-snug whitespace-pre-wrap font-mono">
{enterToSubmit
  ? (example ?? "今天搞定了答辩 PPT ↵Shift+Enter\n明天要去和导师对齐节奏\n↵Enter 发送")
  : (example ?? `今天搞定了答辩 PPT ↵Enter\n明天要去和导师对齐节奏\n↵${mod}+Enter 发送`)}
            </pre>
            <div className="text-[10px] text-muted-foreground/80">
              切换后会全站生效（设置保存在本地）。
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
