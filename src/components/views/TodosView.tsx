import { useState, useMemo, useEffect } from "react";
import { useSylva } from "@/lib/sylva-store";
import { CheckCircle2, Circle, Trash2, Filter } from "lucide-react";

const tagColor: Record<string, string> = {
  工作: "text-moss",
  学习: "text-amber-glow",
  健康: "text-accent",
  生活: "text-white/60",
  英语: "text-amber-glow",
  习惯: "text-moss",
};

export function TodosView({ initialFilter = "all", filterKey }: { initialFilter?: "all" | "todo" | "reminder" | "event"; filterKey?: string } = {}) {
  const { items, toggleDone, removeItem, isRecentlySynced } = useSylva();
  const [filter, setFilter] = useState<"all" | "todo" | "reminder" | "event">(initialFilter);
  useEffect(() => { setFilter(initialFilter); }, [initialFilter, filterKey]);
  const [tagFilter, setTagFilter] = useState<string>("all");

  const todos = useMemo(() => {
    return items
      .filter((i) => (filter === "all" ? true : i.type === filter))
      .filter((i) => (tagFilter === "all" ? true : i.tag === tagFilter))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  }, [items, filter, tagFilter]);

  const grouped = todos.reduce<Record<string, typeof todos>>((acc, it) => {
    (acc[it.date] ||= []).push(it);
    return acc;
  }, {});

  const allTags = Array.from(new Set(items.map((i) => i.tag)));

  const total = items.filter((i) => i.type === "todo").length;
  const done = items.filter((i) => i.type === "todo" && i.done).length;

  return (
    <div className="p-7 overflow-auto h-full">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-[10px] tracking-widest text-amber-glow mb-1">所有待办</p>
          <h2 className="font-display text-3xl text-white">
            完成 {done} / {total}
          </h2>
        </div>
        <div className="text-right">
          <div className="text-xs text-white/40 mb-1">今日完成率</div>
          <div className="w-40 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-moss to-amber-glow"
              style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-white/40" />
        {(["all", "todo", "event", "reminder"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-full border ${
              filter === f
                ? "bg-amber-glow/20 border-amber-glow/50 text-amber-glow"
                : "border-white/10 text-white/60 hover:bg-white/5"
            }`}
          >
            {f === "all" ? "全部" : f === "todo" ? "待办" : f === "event" ? "日程" : "提醒"}
          </button>
        ))}
        <div className="w-px h-4 bg-white/15 mx-2" />
        <button
          onClick={() => setTagFilter("all")}
          className={`text-xs px-3 py-1 rounded-full border ${
            tagFilter === "all"
              ? "bg-white/10 border-white/20 text-white"
              : "border-white/10 text-white/60 hover:bg-white/5"
          }`}
        >
          全部标签
        </button>
        {allTags.map((t) => (
          <button
            key={t}
            onClick={() => setTagFilter(t)}
            className={`text-xs px-3 py-1 rounded-full border ${
              tagFilter === t
                ? "bg-white/15 border-white/25 text-white"
                : "border-white/10 text-white/60 hover:bg-white/5"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-white/40 text-sm">没有匹配的事项</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, list]) => (
            <div key={date}>
              <h3 className="font-display text-amber-glow text-base mb-2">{formatDate(date)}</h3>
              <div className="space-y-1">
                {list.map((it) => (
                  <div
                    key={it.id}
                    className={`group flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border transition ${
                      isRecentlySynced(it.id)
                        ? "border-amber-glow/60 bg-amber-glow/10 ring-1 ring-amber-glow/40 animate-pulse-glow"
                        : "border-white/[0.07] hover:border-white/15"
                    }`}
                  >
                    <button onClick={() => toggleDone(it.id)} className="shrink-0">
                      {it.done ? (
                        <CheckCircle2 className="w-4 h-4 text-moss" />
                      ) : (
                        <Circle className="w-4 h-4 text-white/30 hover:text-white/60" />
                      )}
                    </button>
                    <span className={`flex-1 text-sm ${it.done ? "text-white/40 line-through" : "text-white/90"}`}>
                      {it.title}
                    </span>
                    {it.time && <span className="text-xs font-mono text-white/60">{it.time}</span>}
                    <span className={`text-[10px] tracking-wider ${tagColor[it.tag] ?? "text-white/50"}`}>
                      {it.tag}
                    </span>
                    <button
                      onClick={() => removeItem(it.id)}
                      className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-destructive p-1 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const w = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${m} 月 ${d} 日 · ${w}`;
}
