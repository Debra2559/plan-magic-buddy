import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CornerDownLeft } from "lucide-react";

interface EnterHintProps {
  /** 示例文案，悬停时显示 */
  example?: string;
  className?: string;
}

/** 输入框旁的小提示：Enter 提交 / Shift+Enter 换行，悬停展开示例。 */
export function EnterHint({ example, className = "" }: EnterHintProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 transition cursor-help select-none ${className}`}
          >
            <kbd className="px-1 py-px rounded bg-white/5 border border-white/10 text-[9px] font-mono">Enter</kbd>
            <span>提交</span>
            <span className="opacity-50">·</span>
            <kbd className="px-1 py-px rounded bg-white/5 border border-white/10 text-[9px] font-mono">Shift</kbd>
            <span className="opacity-50">+</span>
            <kbd className="px-1 py-px rounded bg-white/5 border border-white/10 text-[9px] font-mono">Enter</kbd>
            <span>换行</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              <CornerDownLeft className="w-3 h-3" /> 快捷键示例
            </div>
            <div className="text-muted-foreground">
              直接按 <kbd className="px-1 rounded bg-foreground/10 font-mono">Enter</kbd> 立即提交。
            </div>
            <div className="text-muted-foreground">
              想分段时按 <kbd className="px-1 rounded bg-foreground/10 font-mono">Shift</kbd>+<kbd className="px-1 rounded bg-foreground/10 font-mono">Enter</kbd>：
            </div>
            <pre className="bg-foreground/5 rounded px-2 py-1.5 text-[11px] leading-snug whitespace-pre-wrap font-mono">{example ?? "今天搞定了答辩 PPT ↵（Shift+Enter）\n明天要去和导师对齐节奏"}</pre>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
