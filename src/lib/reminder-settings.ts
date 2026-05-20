import { useEffect, useState } from "react";

export type ReminderSettings = {
  desktopEnabled: boolean;
  leadMinutes: number;        // 提前多少分钟提醒
  quietEnabled: boolean;
  quietStart: string;         // "HH:MM"
  quietEnd: string;           // "HH:MM"
  morningEnabled: boolean;
  morningTime: string;        // "HH:MM"
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  desktopEnabled: true,
  leadMinutes: 5,
  quietEnabled: true,
  quietStart: "22:00",
  quietEnd: "08:00",
  morningEnabled: true,
  morningTime: "07:30",
};

const STORAGE_KEY = "sylva:reminder-settings";
const EVT = "sylva:reminder-settings-changed";

export function loadReminderSettings(): ReminderSettings {
  if (typeof window === "undefined") return DEFAULT_REMINDER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_REMINDER_SETTINGS;
    return { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
}

export function saveReminderSettings(s: ReminderSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch { /* ignore */ }
}

export function useReminderSettings() {
  const [settings, setSettings] = useState<ReminderSettings>(() => loadReminderSettings());

  useEffect(() => {
    const onChange = () => setSettings(loadReminderSettings());
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = (patch: Partial<ReminderSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveReminderSettings(next);
  };

  return { settings, update };
}

/** 当前时间是否在静音时段（支持跨夜，如 22:00-08:00）。 */
export function isInQuietHours(s: ReminderSettings, now = new Date()): boolean {
  if (!s.quietEnabled) return false;
  const toMin = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (!m) return -1;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const start = toMin(s.quietStart);
  const end = toMin(s.quietEnd);
  if (start < 0 || end < 0 || start === end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return start < end
    ? cur >= start && cur < end                  // 同日窗口
    : cur >= start || cur < end;                 // 跨夜窗口
}
