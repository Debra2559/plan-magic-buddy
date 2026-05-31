import { useEffect, useRef, useState } from "react";
import { Check, Clock, X, GitBranch, ChevronDown, ChevronUp } from "lucide-react";
import { daysUntil, loadFollowUps, saveFollowUps, type FollowUp } from "@/lib/follow-ups";
import { isInQuietHours, loadReminderSettings } from "@/lib/reminder-settings";

type Toast = { id: string; followUp: FollowUp };

function shouldAsk(f: FollowUp, now: number): boolean {
  if (f.done) return false;
  if (f.snoozeUntil && now < f.snoozeUntil) return false;
  const left = daysUntil(f.ddl);
  if (left !== null && left > f.remindBeforeDays) return false; // 还没到提醒窗口
  const last = f.lastAskedAt ?? 0;
  const intervalMs = Math.max(0.5, f.intervalHours) * 3600 * 1000;
  return now - last >= intervalMs;
}

export function FollowUpRunner() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const checkingRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const settings = loadReminderSettings();
        if (!settings.desktopEnabled) return;
        if (isInQuietHours(settings)) return;
        const now = Date.now();
        const list = loadFollowUps();
        let changed = false;
        const next = list.map((f) => {
          if (!shouldAsk(f, now)) return f;
          if (toasts.find((t) => t.id === f.id)) return f;
          setToasts((prev) => (prev.find((t) => t.id === f.id) ? prev : [...prev, { id: f.id, followUp: f }]));
          changed = true;
          return { ...f, lastAskedAt: now };
        });
        if (changed) saveFollowUps(next);
      } finally {
        checkingRef.current = false;
      }
    };
    tick();
    const t = setInterval(tick, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [toasts]);

  const dismiss = (id: string) => setToasts((p) => p.filter((t) => t.id !== id));

  const mutate = (id: string, patch: Partial<FollowUp>) => {
    const list = loadFollowUps();
    const next = list.map((f) => (f.id === id ? { ...f, ...patch } : f));
    saveFollowUps(next);
  };

  const markDone = (id: string) => { mutate(id, { done: true }); dismiss(id); };
  const snooze = (id: string, hours: number) => {
    mutate(id, { snoozeUntil: Date.now() + hours * 3600 * 1000 });
    dismiss(id);
  };
  const adjust = (id: string, ratio: number) => {
    const list = loadFollowUps();
    const f = list.find((x) => x.id === id);
    if (!f) return;
    const nextInterval = Math.max(0.5, Math.min(24 * 14, f.intervalHours * ratio));
    mutate(id, { intervalHours: nextInterval });
  };

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <FollowUpToast
          key={t.id}
          f={t.followUp}
          onDone={() => markDone(t.id)}
          onSnooze={(h) => snooze(t.id, h)}
          onSlower={() => { adjust(t.id, 2); dismiss(t.id); }}
          onFaster={() => { adjust(t.id, 0.5); dismiss(t.id); }}
          onClose={() => dismiss(t.id)}
        />
      ))}
    </div>
  );
}

function FollowUpToast({
  f, onDone, onSnooze, onSlower, onFaster, onClose,
}: {
  f: FollowUp;
  onDone: () => void;
  onSnooze: (h: number) => void;
  onSlower: () => void;
  onFaster: () => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const left = daysUntil(f.ddl);
  return (
    <div className="pointer-events-auto w-80 p-3 rounded-xl bg-background/95 backdrop-blur border border-amber-glow/40 shadow-lg shadow-amber-glow/10 animate-in slide-in-from-right-4">
      <div className="flex items-start gap-2">
        <GitBranch className="w-4 h-4 text-amber-glow shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] tracking-wider text-amber-glow">条件提醒 · 来确认下进展</p>
          <p className="text-sm text-foreground font-medium">{f.title}</p>
          {f.prerequisite && (
            <p className="text-xs text-muted-foreground mt-0.5">前置：{f.prerequisite}</p>
          )}
          {f.ddl && (
            <p className="text-[11px] text-foreground/60 mt-0.5 font-mono">
              {f.ddl}
              {left !== null && (
                <span className={left < 0 ? "text-red-400 ml-1" : "ml-1"}>
                  {left < 0 ? `已逾期 ${-left} 天` : left === 0 ? "今天到期" : `还剩 ${left} 天`}
                </span>
              )}
            </p>
          )}
          {expanded && f.notes && (
            <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap">{f.notes}</p>
          )}
        </div>
        <button onClick={onClose} className="text-foreground/40 hover:text-foreground" title="收起">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        <button
          onClick={onDone}
          className="text-[11px] px-2 py-1 rounded-md bg-amber-glow/25 border border-amber-glow/60 text-foreground inline-flex items-center gap-1 hover:bg-amber-glow/40"
        >
          <Check className="w-3 h-3" /> 已完成
        </button>
        <button
          onClick={() => onSnooze(2)}
          className="text-[11px] px-2 py-1 rounded-md bg-foreground/5 border border-border text-foreground/80 hover:bg-foreground/10 inline-flex items-center gap-1"
        >
          <Clock className="w-3 h-3" /> 2h 后再问
        </button>
        <button
          onClick={() => onSnooze(24)}
          className="text-[11px] px-2 py-1 rounded-md bg-foreground/5 border border-border text-foreground/80 hover:bg-foreground/10"
        >
          明天再问
        </button>
        <button
          onClick={onSlower}
          className="text-[11px] px-2 py-1 rounded-md bg-foreground/5 border border-border text-foreground/60 hover:bg-foreground/10"
          title="把询问间隔加倍"
        >
          少烦我
        </button>
        <button
          onClick={onFaster}
          className="text-[11px] px-2 py-1 rounded-md bg-foreground/5 border border-border text-foreground/60 hover:bg-foreground/10"
          title="把询问间隔缩半"
        >
          多催我
        </button>
        {f.notes && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] px-2 py-1 rounded-md text-foreground/50 hover:text-foreground inline-flex items-center"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );
}
