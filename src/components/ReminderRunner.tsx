import { useEffect, useRef, useState } from "react";
import { Bell, Sunrise, X } from "lucide-react";
import { useSylva, todayLocal } from "@/lib/sylva-store";
import { isInQuietHours, useReminderSettings } from "@/lib/reminder-settings";

const STORAGE_KEY = "sylva:notified-reminders";
const MORNING_KEY = "sylva:morning-summary-last";

type Toast =
  | { kind: "item"; id: string; title: string; time: string; minutes: number }
  | { kind: "morning"; id: string; title: string; lines: string[] };

function loadNotified(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}
function saveNotified(set: Set<string>) {
  try {
    const arr = Array.from(set).slice(-200);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

function beep() {
  try {
    const Ctx = window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.start(); o.stop(ctx.currentTime + 0.5);
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch { /* ignore */ }
}

function tryNotify(title: string, body: string, tag: string) {
  try {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, tag, icon: "/favicon.ico" });
    }
  } catch { /* ignore */ }
}

export function ReminderRunner() {
  const { items } = useSylva();
  const { settings } = useReminderSettings();
  const notifiedRef = useRef<Set<string>>(loadNotified());
  const [toasts, setToasts] = useState<Toast[]>([]);

  // 首次有可提醒项时静默请求权限
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (!settings.desktopEnabled) return;
    if (Notification.permission === "default") {
      const hasUpcoming = items.some((it) => it.date === todayLocal() && it.time && !it.done);
      if (hasUpcoming || settings.morningEnabled) Notification.requestPermission().catch(() => {});
    }
  }, [items, settings.desktopEnabled, settings.morningEnabled]);

  useEffect(() => {
    const check = () => {
      const today = todayLocal();
      const now = new Date();
      const quiet = isInQuietHours(settings, now);
      const notified = notifiedRef.current;
      let changed = false;

      // —— 1) 每日早安总结 ——
      if (settings.morningEnabled && !quiet) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(settings.morningTime);
        if (m) {
          const sh = Number(m[1]); const sm = Number(m[2]);
          const target = new Date(now); target.setHours(sh, sm, 0, 0);
          const diffMin = (now.getTime() - target.getTime()) / 60000;
          const lastDate = localStorage.getItem(MORNING_KEY);
          // 命中目标后 15 分钟内、且今天还没发过：发送
          if (diffMin >= 0 && diffMin <= 15 && lastDate !== today) {
            const todays = items.filter((it) => it.date === today && !it.done);
            const sorted = [...todays].sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
            const lines = sorted.slice(0, 4).map((it) =>
              `${it.time ? it.time + " " : ""}${it.title}`,
            );
            const summary = todays.length === 0
              ? "今天日程是空的，慢慢来 ☀️"
              : `今天有 ${todays.length} 件事${sorted[0]?.time ? `，最近一项 ${sorted[0].time}` : ""}`;
            tryNotify("早安 · 今日小结", `${summary}\n${lines.join("\n")}`, `morning:${today}`);
            beep();
            setToasts((prev) => [
              ...prev,
              { kind: "morning", id: `morning:${today}`, title: summary, lines },
            ]);
            setTimeout(() => {
              setToasts((prev) => prev.filter((t) => t.id !== `morning:${today}`));
            }, 60000);
            try { localStorage.setItem(MORNING_KEY, today); } catch { /* ignore */ }
          }
        }
      }

      // —— 2) 日程项提前提醒 ——
      const lead = Math.max(1, Math.min(120, settings.leadMinutes || 5));
      for (const it of items) {
        if (it.done) continue;
        if (it.date !== today) continue;
        if (!it.time) continue;
        const mt = /^(\d{1,2}):(\d{2})$/.exec(it.time);
        if (!mt) continue;
        const start = new Date(now);
        start.setHours(Number(mt[1]), Number(mt[2]), 0, 0);
        const diffMin = (start.getTime() - now.getTime()) / 60000;
        // 窗口：[lead-1, lead+0.5]，给 30s 轮询留余地
        if (diffMin < lead - 1 || diffMin > lead + 0.5) continue;

        const key = `${it.id}:${today}:${it.time}:${lead}`;
        if (notified.has(key)) continue;
        notified.add(key); changed = true;

        if (quiet || !settings.desktopEnabled) continue;

        const minutes = Math.max(1, Math.round(diffMin));
        const title = `还有 ${minutes} 分钟：${it.title}`;
        const body = `${it.time} 开始${it.tag ? ` · ${it.tag}` : ""}`;
        tryNotify(title, body, key);
        beep();
        const toast: Toast = { kind: "item", id: key, title: it.title, time: it.time, minutes };
        setToasts((prev) => [...prev, toast]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== key));
        }, 30000);
      }

      if (changed) saveNotified(notified);
    };

    check();
    const t = setInterval(check, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [items, settings]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto w-72 p-3 rounded-xl bg-background/95 backdrop-blur border border-amber-glow/40 shadow-lg shadow-amber-glow/10 flex items-start gap-2 animate-in slide-in-from-right-4"
        >
          {t.kind === "morning" ? (
            <>
              <Sunrise className="w-4 h-4 text-amber-glow shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-glow">早安 · 今日小结</p>
                <p className="text-sm text-foreground font-medium">{t.title}</p>
                {t.lines.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {t.lines.map((l, i) => (
                      <li key={i} className="text-[11px] text-foreground/70 truncate">· {l}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <>
              <Bell className="w-4 h-4 text-amber-glow shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-glow">还有 {t.minutes} 分钟</p>
                <p className="text-sm text-foreground font-medium truncate">{t.title}</p>
                <p className="text-[11px] text-foreground/50 font-mono">{t.time}</p>
              </div>
            </>
          )}
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="text-foreground/40 hover:text-foreground transition"
            title="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
