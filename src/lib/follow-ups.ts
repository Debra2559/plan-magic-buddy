import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FollowUp = {
  id: string;
  title: string;
  notes?: string;
  /** 依赖的前置事件描述（人类可读），例如 "等老师签字之后才能交" */
  prerequisite?: string;
  /** 前置依赖的目标 id：可以是另一个 FollowUp.id，也可以是 sylva-store DoneItem.id */
  prerequisiteId?: string;
  /** 关联到主 store DoneItem.id（reminder/todo），用于双向同步 */
  linkedItemId?: string;
  /** 截止日期 YYYY-MM-DD，可选 */
  ddl?: string;
  remindBeforeDays: number;
  intervalHours: number;
  lastAskedAt?: number;
  snoozeUntil?: number;
  createdAt: number;
  done?: boolean;
  source?: "manual" | "ocr";
};

const STORAGE_KEY = "sylva:follow-ups";
const EVT = "sylva:follow-ups-changed";

// ---------- local cache（读取保持同步，给 FollowUpRunner 等用）----------
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

function writeCache(list: FollowUp[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* ignore */
  }
}

export function saveFollowUps(list: FollowUp[]) {
  const prev = loadFollowUps();
  writeCache(list);
  // 写穿到云端（fire-and-forget）
  void syncToCloud(prev, list);
}

// ---------- 行 <-> 对象 ----------
type Row = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  prerequisite: string | null;
  prerequisite_id: string | null;
  linked_item_id: string | null;
  ddl: string | null;
  remind_before_days: number;
  interval_hours: number;
  last_asked_at: number | null;
  snooze_until: number | null;
  created_at_ms: number;
  done: boolean;
  source: string;
};

function rowToFollowUp(r: Row): FollowUp {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes ?? undefined,
    prerequisite: r.prerequisite ?? undefined,
    prerequisiteId: r.prerequisite_id ?? undefined,
    linkedItemId: r.linked_item_id ?? undefined,
    ddl: r.ddl ?? undefined,
    remindBeforeDays: r.remind_before_days,
    intervalHours: Number(r.interval_hours),
    lastAskedAt: r.last_asked_at ?? undefined,
    snoozeUntil: r.snooze_until ?? undefined,
    createdAt: Number(r.created_at_ms),
    done: r.done,
    source: (r.source as "manual" | "ocr") ?? "manual",
  };
}

function followUpToRow(f: FollowUp, userId: string) {
  return {
    id: f.id,
    user_id: userId,
    title: f.title,
    notes: f.notes ?? null,
    prerequisite: f.prerequisite ?? null,
    prerequisite_id: f.prerequisiteId ?? null,
    linked_item_id: f.linkedItemId ?? null,
    ddl: f.ddl ?? null,
    remind_before_days: f.remindBeforeDays,
    interval_hours: f.intervalHours,
    last_asked_at: f.lastAskedAt ?? null,
    snooze_until: f.snoozeUntil ?? null,
    created_at_ms: f.createdAt,
    done: !!f.done,
    source: f.source ?? "manual",
  };
}

// ---------- 云端同步 ----------
let hydratedFor: string | null = null;

export async function hydrateFollowUpsFromCloud(force = false): Promise<void> {
  if (typeof window === "undefined") return;
  const { data: u } = await supabase.auth.getUser();
  const user = u.user;
  if (!user) {
    hydratedFor = null;
    return;
  }
  if (!force && hydratedFor === user.id) return;
  hydratedFor = user.id;
  const { data, error } = await supabase
    .from("follow_ups")
    .select("*")
    .order("created_at_ms", { ascending: false });
  if (error || !data) return;
  const list = (data as Row[]).map(rowToFollowUp);
  writeCache(list);
}

async function syncToCloud(prev: FollowUp[], next: FollowUp[]) {
  try {
    const { data: u } = await supabase.auth.getUser();
    const user = u.user;
    if (!user) return;
    const prevMap = new Map(prev.map((f) => [f.id, f]));
    const nextMap = new Map(next.map((f) => [f.id, f]));
    const upserts: ReturnType<typeof followUpToRow>[] = [];
    for (const f of next) {
      const p = prevMap.get(f.id);
      if (!p || JSON.stringify(p) !== JSON.stringify(f)) {
        upserts.push(followUpToRow(f, user.id));
      }
    }
    const removes: string[] = [];
    for (const f of prev) if (!nextMap.has(f.id)) removes.push(f.id);
    if (upserts.length) {
      await supabase.from("follow_ups").upsert(upserts, { onConflict: "id" });
    }
    if (removes.length) {
      await supabase.from("follow_ups").delete().in("id", removes);
    }
  } catch {
    /* 离线时静默失败，下次写入会重试 */
  }
}

// ---------- hook ----------
export function useFollowUps() {
  const [list, setList] = useState<FollowUp[]>(() => loadFollowUps());

  useEffect(() => {
    const on = () => setList(loadFollowUps());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    // 首次挂载触发一次拉取
    void hydrateFollowUpsFromCloud();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void hydrateFollowUpsFromCloud(true);
    });
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
      sub.subscription.unsubscribe();
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

/** 距 ddl 还剩多少天 */
export function daysUntil(ddl?: string): number | null {
  if (!ddl) return null;
  const [y, m, d] = ddl.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86400000);
}
