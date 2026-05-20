import { useSylva } from "@/lib/sylva-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Calendar as CalIcon, CheckSquare, Bell, ArrowRight, Sparkles, X } from "lucide-react";
import type { DoneItem } from "@/lib/sylva-store";

const tagColor: Record<string, string> = {
  工作: "bg-moss/15 text-moss border-moss/30",
  学习: "bg-amber-glow/15 text-amber-glow border-amber-glow/30",
  健康: "bg-accent/15 text-accent border-accent/30",
  生活: "bg-foreground/10 text-foreground/70 border-foreground/20",
  英语: "bg-amber-glow/15 text-amber-glow border-amber-glow/30",
  习惯: "bg-moss/15 text-moss border-moss/30",
};

export function SyncSummaryModal() {
  const { syncSummary, setSyncSummary, navigateTo } = useSylva();
  const open = !!syncSummary;
  const close = () => setSyncSummary(null);

  if (!syncSummary) return null;
  const { events, todos, reminders, appliedMode } = syncSummary;
  const total = events.length + todos.length + reminders.length;
  const modeLabel = appliedMode === "add" ? "已追加" : appliedMode === "adjust" ? "已重排" : "已生成";

  const go = (view: "schedule" | "todos", filter?: "todo" | "reminder" | "event") => {
    navigateTo(view, filter ? { todosFilter: filter } : undefined);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl w-[95vw] bg-zinc-950/95 backdrop-blur-xl border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-glow">
            <Sparkles className="w-4 h-4" /> {modeLabel} {total} 项 · 汇总入口
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            已写入对应列表，点击下方分组可直接跳转，新条目会高亮提示。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          <SummaryBlock
            icon={CalIcon}
            label="日程"
            count={events.length}
            items={events}
            onGo={() => go("schedule")}
            goLabel="去日程视图"
          />
          <SummaryBlock
            icon={CheckSquare}
            label="待办"
            count={todos.length}
            items={todos}
            onGo={() => go("todos", "todo")}
            goLabel="去待办列表"
          />
          <SummaryBlock
            icon={Bell}
            label="提醒"
            count={reminders.length}
            items={reminders}
            onGo={() => go("todos", "reminder")}
            goLabel="去提醒列表"
          />
        </div>

        <div className="flex items-center justify-between mt-2 pt-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground/70">高亮提示将在 12 秒后自动消失</p>
          <button
            onClick={close}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-foreground/5 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> 留在当前页
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryBlock({
  icon: Icon,
  label,
  count,
  items,
  onGo,
  goLabel,
}: {
  icon: typeof CalIcon;
  label: string;
  count: number;
  items: DoneItem[];
  onGo: () => void;
  goLabel: string;
}) {
  if (count === 0) {
    return (
      <div className="p-3 rounded-xl border border-border/70 bg-foreground/[0.03] flex items-center gap-2 opacity-50">
        <Icon className="w-3.5 h-3.5 text-muted-foreground/70" />
        <span className="text-xs text-muted-foreground/70">{label} · 本次无新增</span>
      </div>
    );
  }
  return (
    <div className="p-3 rounded-xl border border-amber-glow/25 bg-amber-glow/[0.04]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-amber-glow" />
          <span className="text-xs tracking-wider text-amber-glow font-medium">
            {label} · {count} 项
          </span>
        </div>
        <button
          onClick={onGo}
          className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-amber-glow text-primary-foreground hover:scale-[1.03] transition"
        >
          {goLabel} <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="space-y-1 max-h-32 overflow-auto pr-1">
        {items.slice(0, 6).map((it) => (
          <div key={it.id} className="flex items-center gap-2 text-[11px] text-foreground/85">
            {it.time && <span className="font-mono text-muted-foreground shrink-0 w-10">{it.time}</span>}
            <span className="flex-1 truncate">{it.title}</span>
            <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[9px] ${tagColor[it.tag] ?? "bg-foreground/10 text-foreground/75 border-border"}`}>
              {it.tag}
            </span>
          </div>
        ))}
        {items.length > 6 && (
          <div className="text-[10px] text-muted-foreground/70 pt-1">还有 {items.length - 6} 项…</div>
        )}
      </div>
    </div>
  );
}
