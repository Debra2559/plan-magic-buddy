import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { useSylva, todayLocal } from "@/lib/sylva-store";

const LEAD_MIN = 5;
const STORAGE_KEY = "sylva:notified-reminders";

type Toast = { id: string; title: string; time: string; minutes: number };

function loadNotified(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveNotified(set: Set<string>) {
  try {
    // 只保留最近 200 条，避免无限增长
    const arr = Array.from(set).slice(-200);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.start();
    o.stop(ctx.currentTime + 0.5);
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* ignore */
  }
}

export function ReminderRunner() {
  const { items } = useSylva();
  const notifiedRef = useRef<Set<string>>(loadNotified());
  const [toasts, setToasts] = useState<Toast[]>([]);

  // 首次有可提醒项时静默请求权限
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      const hasUpcoming = items.some(
        (it) => it.date === todayLocal() && it.time && !it.done,
      );
      if (hasUpcoming) Notification.requestPermission().catch(() => {});
    }
  }, [items]);

  useEffect(() => {
    const check = () => {
      const today = todayLocal();
      const now = new Date();
      const notified = notifiedRef.current;
      let changed = false;

      for (const it of items) {
        if (it.done) continue;
        if (it.date !== today) continue;
        if (!it.time) continue;
        const m = /^(\d{1,2}):(\d{2})$/.exec(it.time);
        if (!m) continue;
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        const start = new Date(now);
        start.setHours(hh, mm, 0, 0);
        const diffMs = start.getTime() - now.getTime();
        const diffMin = diffMs / 60000;
        // 窗口：开始前 5 分钟附近 (4.0 ~ 5.5 分钟)，给轮询留余地
        if (diffMin < 4 || diffMin > 5.5) continue;

        const key = `${it.id}:${today}:${it.time}`;
        if (notified.has(key)) continue;
        notified.add(key);
        changed = true;

        const minutes = Math.max(1, Math.round(diffMin));
        const title = `还有 ${minutes} 分钟：${it.title}`;
        const body = `${it.time} 开始${it.tag ? ` · ${it.tag}` : ""}`;

        // 浏览器通知
        try {
          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification(title, { body, tag: key, icon: "/favicon.ico" });
          }
        } catch {
          /* ignore */
        }

        // 应用内浮窗 + 提示音
        beep();
        const toast: Toast = { id: key, title: it.title, time: it.time, minutes };
        setToasts((prev) => [...prev, toast]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== key));
        }, 30000);
      }

      if (changed) saveNotified(notified);
    };

    check();
    const t = setInterval(check, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [items]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto w-72 p-3 rounded-xl bg-background/95 backdrop-blur border border-amber-glow/40 shadow-lg shadow-amber-glow/10 flex items-start gap-2 animate-in slide-in-from-right-4"
        >
          <Bell className="w-4 h-4 text-amber-glow shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-glow">还有 {t.minutes} 分钟</p>
            <p className="text-sm text-foreground font-medium truncate">{t.title}</p>
            <p className="text-[11px] text-foreground/50 font-mono">{t.time}</p>
          </div>
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
