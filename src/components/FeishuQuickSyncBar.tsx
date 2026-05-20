import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { syncToFeishu } from "@/lib/feishu.functions";
import { useSylva } from "@/lib/sylva-store";
import { Send, Loader2, Settings as SettingsIcon } from "lucide-react";

type Scope = "all" | "today" | "week" | "timed";

const scopeMeta: Record<Scope, { label: string; desc: string }> = {
  all: { label: "全部规划", desc: "已确认的所有事项" },
  today: { label: "今天", desc: "仅今日事项" },
  week: { label: "未来 7 天", desc: "今天起 7 天内" },
  timed: { label: "仅有时间", desc: "排除无时间的待办" },
};

export function FeishuQuickSyncBar({ onGoSettings }: { onGoSettings?: () => void } = {}) {
  const { items } = useSylva();
  const syncFn = useServerFn(syncToFeishu);
  const [syncScope, setSyncScope] = useState<Scope>("all");
  const [syncing, setSyncing] = useState(false);

  const pickItems = () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const todayIso = iso(today); const weekIso = iso(in7);
    return items.filter((it) => {
      if (syncScope === "today") return it.date === todayIso;
      if (syncScope === "week") return it.date >= todayIso && it.date <= weekIso;
      if (syncScope === "timed") return !!it.time;
      return true;
    });
  };

  const runSync = async () => {
    if (syncing) return;
    const itemsForSync = pickItems();
    if (itemsForSync.length === 0) {
      toast.warning("没有可同步的事项", { description: "换个范围试试" });
      return;
    }
    const pushable = itemsForSync.filter((i) => i.time);
    if (pushable.length === 0) {
      toast.warning("飞书只接收有时间的事件", { description: `当前 ${itemsForSync.length} 项都没有时间，请先补上时间` });
      return;
    }
    setSyncing(true);
    const tid = toast.loading(`同步 ${pushable.length} 项到飞书…`);
    try {
      const itemsWithIds = pushable.map((it, i) => ({
        id: it.id ?? `plan-${Date.now()}-${i}`,
        type: it.type,
        title: it.title,
        date: it.date,
        time: it.time,
        tag: it.tag,
      }));
      const res = await syncFn({ data: { items: itemsWithIds } });
      toast.dismiss(tid);
      if (!res.ok) {
        toast.error("同步失败", {
          description: res.error,
          action: onGoSettings ? { label: "去设置", onClick: onGoSettings } : undefined,
        });
      } else if (res.errCount > 0) {
        toast.warning(`部分同步成功 · ${res.okCount} 成功 / ${res.errCount} 失败`, {
          description: "在「设置 → 飞书同步」查看详细日志",
          action: onGoSettings ? { label: "去查看", onClick: onGoSettings } : undefined,
        });
      } else {
        toast.success(`已同步 ${res.okCount} 项到飞书日历`);
      }
    } catch (e) {
      toast.dismiss(tid);
      toast.error("同步失败", { description: e instanceof Error ? e.message : "未知错误" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="widget p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-amber-glow" />
          <span className="text-xs tracking-wider text-amber-glow">飞书日程同步</span>
          <span className="text-[10px] text-muted-foreground">选择范围后一键推送到飞书日历</span>
        </div>
        {onGoSettings && (
          <button
            onClick={onGoSettings}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-amber-glow transition"
            title="去设置选日历 / 调方向"
          >
            <SettingsIcon className="w-3 h-3" /> 飞书设置
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(scopeMeta) as Scope[]).map((k) => {
          const active = syncScope === k;
          return (
            <button
              key={k}
              onClick={() => setSyncScope(k)}
              title={scopeMeta[k].desc}
              className={`px-3 py-1.5 rounded-full text-xs border transition
                ${active ? "bg-amber-glow/20 border-amber-glow/50 text-amber-glow" : "bg-foreground/5 border-foreground/10 text-foreground/70 hover:bg-foreground/10"}`}
            >
              {scopeMeta[k].label}
            </button>
          );
        })}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">{scopeMeta[syncScope].desc}</span>
        <button
          onClick={runSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-glow text-primary-foreground text-sm font-medium hover:scale-[1.02] transition disabled:opacity-40 disabled:scale-100"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {syncing ? "同步中" : "同步到飞书"}
        </button>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        提示：飞书日历只接收带时间的事项；未连接飞书时请先在「设置 → 飞书同步」选好日历。
      </p>
    </div>
  );
}
