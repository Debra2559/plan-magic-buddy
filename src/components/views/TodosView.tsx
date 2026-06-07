import { useState, useMemo, useEffect } from "react";
import { useSylva } from "@/lib/sylva-store";
import { useFocusTimer } from "@/lib/focus-sessions";
import { CheckCircle2, Circle, Trash2, Filter, Calendar, Clock, Tag, FileText, Play } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const tagColor: Record<string, string> = {
  工作: "text-moss",
  学习: "text-amber-glow",
  健康: "text-accent",
  生活: "text-muted-foreground",
  英语: "text-amber-glow",
  习惯: "text-moss",
};

export function TodosView({ initialFilter = "all", filterKey }: { initialFilter?: "all" | "todo" | "reminder" | "event"; filterKey?: string } = {}) {
  const { items, toggleDone, removeItem, updateItem, isRecentlySynced } = useSylva();
  const { start: startFocus, state: focusState } = useFocusTimer();
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailItem = detailId ? items.find((i) => i.id === detailId) ?? null : null;
  const [draftNote, setDraftNote] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  useEffect(() => {
    if (detailItem) {
      setDraftNote(detailItem.note ?? "");
      setDraftTitle(detailItem.title);
    }
  }, [detailId]);
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

  const total = todos.length;
  const done = todos.filter((i) => i.done).length;

  return (
    <div className="p-7 overflow-auto h-full">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-[10px] tracking-widest text-amber-glow mb-1">所有待办</p>
          <h2 className="font-display text-3xl text-foreground">
            完成 {done} / {total}
          </h2>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground/70 mb-1">今日完成率</div>
          <div className="w-40 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-moss to-amber-glow"
              style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-muted-foreground/70" />
        <button
          onClick={() => setTagFilter("all")}
          className={`text-xs px-3 py-1 rounded-full border ${
            tagFilter === "all"
              ? "bg-foreground/10 border-border text-foreground"
              : "border-border text-muted-foreground hover:bg-foreground/5"
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
                ? "bg-foreground/15 border-border text-foreground"
                : "border-border text-muted-foreground hover:bg-foreground/5"
            }`}
          >
            {t}
          </button>
        ))}
      </div>



      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground/70 text-sm">没有匹配的事项</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, list]) => (
            <div key={date}>
              <h3 className="font-display text-amber-glow text-base mb-2">{formatDate(date)}</h3>
              <div className="space-y-1">
                {list.map((it) => (
                  <div
                    key={it.id}
                    onClick={() => setDetailId(it.id)}
                    className={`group flex items-center gap-3 p-3 rounded-xl bg-foreground/[0.04] border transition cursor-pointer ${
                      isRecentlySynced(it.id)
                        ? "border-amber-glow/60 bg-amber-glow/10 ring-1 ring-amber-glow/40 animate-pulse-glow"
                        : "border-white/[0.07] hover:border-border"
                    }`}
                  >
                    <button onClick={(e) => { e.stopPropagation(); toggleDone(it.id); }} className="shrink-0">
                      {it.done ? (
                        <CheckCircle2 className="w-4 h-4 text-moss" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground/60 hover:text-muted-foreground" />
                      )}
                    </button>
                    <span className={`flex-1 min-w-0 text-sm truncate ${it.done ? "text-muted-foreground/70 line-through" : "text-foreground"}`}>
                      {it.title}
                    </span>
                    {it.note && <FileText className="w-3 h-3 text-muted-foreground/60 shrink-0" />}
                    {it.time && <span className="text-xs font-mono text-muted-foreground">{it.time}</span>}
                    <span className={`text-[10px] tracking-wider ${tagColor[it.tag] ?? "text-muted-foreground"}`}>
                      {it.tag}
                    </span>
                    {!it.done && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (focusState) return;
                          startFocus({ mode: "pomodoro", plannedMin: 25, linkedItemId: it.id, title: it.title, tag: it.tag });
                        }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground/70 hover:text-amber-glow p-1 transition"
                        title="开始番茄钟"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeItem(it.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-destructive p-1 transition"
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

      <Dialog open={!!detailItem} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle className="sr-only">事项详情</DialogTitle>
          {detailItem && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] tracking-widest text-amber-glow mb-1.5">事项详情</p>
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={() => {
                    const t = draftTitle.trim();
                    if (t && t !== detailItem.title) updateItem(detailItem.id, { title: t });
                    else setDraftTitle(detailItem.title);
                  }}
                  className="w-full bg-transparent border-none text-xl font-display text-foreground focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formatDate(detailItem.date)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="font-mono">{detailItem.time ?? "未指定"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Tag className="w-3.5 h-3.5" />
                  <span className={tagColor[detailItem.tag] ?? ""}>{detailItem.tag}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-[10px] uppercase tracking-wider">{detailItem.type}</span>
                  {detailItem.done && <span className="text-moss text-[10px]">· 已完成</span>}
                </div>
              </div>

              <div>
                <label className="text-[10px] tracking-widest text-muted-foreground/80 mb-1.5 block">备注</label>
                <textarea
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  onBlur={() => {
                    if (draftNote !== (detailItem.note ?? "")) {
                      updateItem(detailItem.id, { note: draftNote || undefined });
                    }
                  }}
                  placeholder="加点备注，例如链接、上下文、要点……"
                  rows={4}
                  className="w-full bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-glow/50 resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <button
                  onClick={() => toggleDone(detailItem.id)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border text-foreground hover:bg-foreground/5"
                >
                  {detailItem.done ? "标记未完成" : "标记完成"}
                </button>
                <button
                  onClick={() => { removeItem(detailItem.id); setDetailId(null); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3" /> 删除
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const w = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${m} 月 ${d} 日 · ${w}`;
}
