import { useEffect, useState } from "react";

export type FollowUp = {
  id: string;
  title: string;
  notes?: string;
  /** 依赖的前置事件描述，例如 “等老师签字之后才能交” */
  prerequisite?: string;
  /** 截止日期 YYYY-MM-DD，可选 */
  ddl?: string;
  /** 截止前多少天开始提醒（无 ddl 时忽略，按 intervalHours 直接轮询） */
  remindBeforeDays: number;
  /** 重新询问的最小间隔（小时） */
  intervalHours: number;
  /** 上次询问时间（ms） */
  lastAskedAt?: number;
  /** 暂停到某个时间点（ms），用户点“稍后再问” */
  snoozeUntil?: number;
  createdAt: number;
  done?: boolean;
  source?: "manual" | "ocr";
};

const STORAGE_KEY = "sylva:follow-ups";
const EVT = "sylva:follow-ups-changed";

export function loadFollowUps(): FollowUp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveFollowUps(list: FollowUp[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* ignore */
  }
}

export function useFollowUps() {
  const [list, setList] = useState<FollowUp[]>(() => loadFollowUps());

  useEffect(() => {
    const on = () => setList(loadFollowUps());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const update = (next: FollowUp[]) => {
    setList(next);
    saveFollowUps(next);
  };

  const add = (item: Omit<FollowUp, "id" | "createdAt"> & Partial<Pick<FollowUp, "id" | "createdAt">>) => {
    const full: FollowUp = {
      ...item,
      id: item.id ?? `fu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: item.createdAt ?? Date.now(),
      remindBeforeDays: item.remindBeforeDays ?? 3,
      intervalHours: item.intervalHours ?? 24,
    } as FollowUp;
    update([full, ...list]);
    return full;
  };

  const patch = (id: string, p: Partial<FollowUp>) => {
    update(list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  };

  const remove = (id: string) => {
    update(list.filter((x) => x.id !== id));
  };

  return { list, add, patch, remove, replaceAll: update };
}

/** 距 ddl 还剩多少天（向下取整，负数表示已过期） */
export function daysUntil(ddl?: string): number | null {
  if (!ddl) return null;
  const [y, m, d] = ddl.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86400000);
}
