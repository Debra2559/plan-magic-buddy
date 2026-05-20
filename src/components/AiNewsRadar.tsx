import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listPendingAiNews,
  saveAiNews,
  dismissAiNews,
  scanAiNewsNow,
  type AiNewsRow,
} from "@/lib/ai-news.functions";
import { Sparkles, X, Bookmark, RefreshCw, Loader2, ExternalLink, Calendar as CalIcon, ListPlus, Check } from "lucide-react";
import { useSylva, todayLocal } from "@/lib/sylva-store";

export function AiNewsRadar() {
  const [items, setItems] = useState<AiNewsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const listFn = useServerFn(listPendingAiNews);
  const saveFn = useServerFn(saveAiNews);
  const dismissFn = useServerFn(dismissAiNews);
  const scanFn = useServerFn(scanAiNewsNow);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listFn();
      if (r.ok) setItems(r.items);
      else setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [listFn]);

  useEffect(() => {
    void load();
  }, [load]);

  const onScan = async () => {
    setScanning(true);
    setError(null);
    try {
      await scanFn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  const onSave = async (id: string) => {
    setBusyId(id);
    try {
      const r = await saveFn({ data: { id } });
      if (r.ok) setItems((p) => p.filter((i) => i.id !== id));
      else setError(r.error);
    } finally {
      setBusyId(null);
    }
  };

  const onDismiss = async (id: string) => {
    setBusyId(id);
    try {
      const r = await dismissFn({ data: { id } });
      if (r.ok) setItems((p) => p.filter((i) => i.id !== id));
      else setError(r.error);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="widget p-5">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 text-left">
          <Sparkles className="w-4 h-4 text-amber-glow" />
          <span className="text-xs tracking-wider text-amber-glow">AI 动态雷达</span>
          {items.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-glow/20 text-amber-glow">
              {items.length} 条待看
            </span>
          )}
        </button>
        <button
          onClick={onScan}
          disabled={scanning}
          className="flex items-center gap-1 text-[11px] text-foreground/60 hover:text-foreground transition disabled:opacity-40"
          title="立即扫描"
        >
          {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {scanning ? "扫描中" : "扫描"}
        </button>
      </div>

      {!collapsed && (
        <>
          <p className="text-[11px] text-muted-foreground mb-3">
            每天扫一遍 Hacker News / TechCrunch / The Verge / arXiv / 机器之心 / 量子位，挑出真正重要的 AI 动态。
          </p>

          {error && (
            <div className="mb-3 p-2 rounded-lg bg-destructive/15 border border-destructive/30 text-[11px] text-destructive-foreground">
              {error}
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin inline-block mr-1" /> 加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              暂时没有新的 AI 动态。点「扫描」可立即去找。
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-auto pr-1">
              {items.map((n) => (
                <div
                  key={n.id}
                  className="p-3 rounded-xl bg-foreground/5 border border-foreground/10 hover:border-amber-glow/30 transition"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/60">
                      {n.source}
                    </span>
                    {n.tags?.slice(0, 3).map((t) => (
                      <span key={t} className="text-[10px] text-foreground/40">#{t}</span>
                    ))}
                  </div>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-foreground hover:text-amber-glow transition flex items-center gap-1 group"
                  >
                    <span className="line-clamp-2">{n.title}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 shrink-0" />
                  </a>
                  {n.summary && (
                    <p className="text-[11px] text-foreground/60 line-clamp-3 mt-1 mb-2">{n.summary}</p>
                  )}
                  {n.published_at && (
                    <div className="flex items-center gap-1 text-[10px] text-foreground/50 mb-2">
                      <CalIcon className="w-3 h-3" /> {n.published_at}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSave(n.id)}
                      disabled={busyId === n.id}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-xs bg-moss text-primary-foreground hover:scale-[1.02] transition disabled:opacity-40"
                    >
                      <Bookmark className="w-3 h-3" /> 收藏
                    </button>
                    <button
                      onClick={() => onDismiss(n.id)}
                      disabled={busyId === n.id}
                      className="px-3 py-1.5 rounded-full text-xs bg-foreground/5 border border-foreground/10 text-foreground/60 hover:bg-foreground/10 disabled:opacity-40"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
