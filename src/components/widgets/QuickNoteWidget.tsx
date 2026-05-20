import { Folder, StickyNote } from "lucide-react";
import { useSylva } from "@/lib/sylva-store";

export function QuickNoteWidget() {
  const { notes } = useSylva();
  const latest = notes[0];

  return (
    <div className="widget p-5 w-[300px]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium tracking-wider text-foreground/70">记录</span>
        <StickyNote className="w-3.5 h-3.5 text-amber-glow" />
      </div>
      <div className="text-sm text-foreground/85 leading-relaxed space-y-2 font-display min-h-[60px]">
        {latest ? (
          <>
            <p className="line-clamp-3">{latest.text}</p>
            <p className="text-foreground/60 text-xs font-sans">{relTime(latest.createdAt)}</p>
          </>
        ) : (
          <p className="text-foreground/40 text-xs font-sans">还没有任何记录</p>
        )}
      </div>
      <div className="mt-4 pt-3 border-t border-foreground/10 flex items-center gap-2">
        <Folder className="w-4 h-4 text-amber-glow" />
        <span className="text-xs text-muted-foreground">收集</span>
        <span className="ml-auto text-xs text-foreground/50">{notes.length}</span>
      </div>
    </div>
  );
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.max(1, Math.round(diff / 60000));
  if (min < 60) return `${min} 分钟前`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}
