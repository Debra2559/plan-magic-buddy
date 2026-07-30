import { useEffect, useState } from "react";

export type CalendarViewMode = "grid" | "text";

const KEY = "sylva.calendar.viewMode";
const EVT = "sylva:calendar-view-mode";

export function readCalendarViewMode(): CalendarViewMode {
  if (typeof window === "undefined") return "grid";
  try {
    return window.localStorage.getItem(KEY) === "text" ? "text" : "grid";
  } catch {
    return "grid";
  }
}

export function setCalendarViewMode(mode: CalendarViewMode) {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail: mode }));
}

/** 日历视图模式：grid=网格时间视图，text=自由文本编辑 */
export function useCalendarViewMode(): [CalendarViewMode, (m: CalendarViewMode) => void] {
  const [mode, setMode] = useState<CalendarViewMode>("grid");

  useEffect(() => {
    setMode(readCalendarViewMode());
    const onChange = () => setMode(readCalendarViewMode());
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return [mode, setCalendarViewMode];
}

/* ---------------- 文本 <-> 条目 互转 ---------------- */

export interface TextLineItem {
  title: string;
  time?: string;
  done?: boolean;
}

const BUCKETS: { label: string; time: string; from: number; to: number }[] = [
  { label: "上午", time: "09:00", from: 0, to: 12 },
  { label: "下午", time: "14:00", from: 12, to: 18 },
  { label: "晚上", time: "20:00", from: 18, to: 24 },
];

function bucketOf(time?: string) {
  const h = time ? Number(time.slice(0, 2)) : 9;
  return BUCKETS.find((b) => h >= b.from && h < b.to) ?? BUCKETS[0];
}

/** 把某天的条目渲染成可编辑文本 */
export function itemsToText(items: { title: string; time?: string; done?: boolean }[]): string {
  const sorted = [...items].sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  const lines: string[] = [];
  for (const b of BUCKETS) {
    const group = sorted.filter((i) => bucketOf(i.time).label === b.label);
    lines.push(`【${b.label}】`);
    group.forEach((i, idx) => {
      const mark = i.done ? "[x] " : "";
      const t = i.time ? `${i.time} ` : "";
      lines.push(`${idx + 1}、${mark}${t}${i.title}`);
    });
  }
  return lines.join("\n");
}

/** 把自由文本解析成条目 */
export function textToItems(text: string): TextLineItem[] {
  const out: TextLineItem[] = [];
  let bucket = BUCKETS[0];

  for (const raw of text.split("\n")) {
    let line = raw.trim();
    if (!line) continue;

    const header = line.match(/^[【\[(]?\s*(上午|下午|晚上|中午|早上|夜间)\s*[】\])]?[:：]?$/);
    if (header) {
      const name = header[1];
      bucket =
        name === "上午" || name === "早上"
          ? BUCKETS[0]
          : name === "下午" || name === "中午"
            ? BUCKETS[1]
            : BUCKETS[2];
      continue;
    }

    // 去掉序号 / 项目符号
    line = line.replace(/^(\d+\s*[、.．)）]|[-*·•]\s*)\s*/, "").trim();
    if (!line) continue;

    let done = false;
    const doneMatch = line.match(/^(\[x\]|\[X\]|✓|✔)\s*/);
    if (doneMatch) {
      done = true;
      line = line.slice(doneMatch[0].length).trim();
    }

    let time: string | undefined;
    const timeMatch = line.match(/^(\d{1,2})[:：](\d{2})\s*/);
    if (timeMatch) {
      time = `${String(Number(timeMatch[1])).padStart(2, "0")}:${timeMatch[2]}`;
      line = line.slice(timeMatch[0].length).trim();
    }

    if (!line) continue;
    out.push({ title: line, time: time ?? bucket.time, done });
  }
  return out;
}
