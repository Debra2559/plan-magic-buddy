import { Settings, Folder } from "lucide-react";

export function QuickNoteWidget() {
  return (
    <div className="widget p-5 w-[300px]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium tracking-wider text-foreground/70">随手记</span>
        <Settings className="w-3.5 h-3.5 text-foreground/40" />
      </div>
      <div className="text-sm text-foreground/85 leading-relaxed space-y-2 font-display">
        <p>把今天的三件事弄完 ——</p>
        <p className="text-foreground/60 text-xs font-sans">17 分钟前</p>
      </div>
      <div className="mt-4 pt-3 border-t border-foreground/10 flex items-center gap-2">
        <Folder className="w-4 h-4 text-amber-glow" />
        <span className="text-xs text-muted-foreground">本周收集</span>
        <span className="ml-auto text-xs text-foreground/50">12</span>
      </div>
    </div>
  );
}
