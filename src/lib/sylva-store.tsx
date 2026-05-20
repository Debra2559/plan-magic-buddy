import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PlanItem } from "./plan.functions";
import { getRecapDoneDates, getDailyRecap, unmarkRecapDone as unmarkRecapDoneFn, syncToFeishu } from "./feishu.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  remote, fetchAllRemote,
  itemFromRow, noteFromRow, habitFromRow, diaryFromRow, comicFromRow,
} from "./cloud-sync";


export interface DoneItem extends PlanItem {
  id: string;
  done?: boolean;
  /** AI 新增规划写入但尚未由用户确认，仅本地展示，不入云端 / 飞书 */
  pending?: boolean;
}

export type Mood = "great" | "good" | "ok" | "down" | "tired";

export type NoteKind = "log" | "reflection";

export interface Note {
  id: string;
  text: string;
  createdAt: string; // ISO
  /** log = 事件流水；reflection = 感受 / 思考 / 反思 */
  kind?: NoteKind;
  mood?: Mood;
  tags?: string[];
  pinned?: boolean;
  /** 内嵌的图片附件（data URL，已在客户端压缩） */
  images?: string[];
  /** 视频附件 URL（存放在 note-media 存储桶） */
  videos?: string[];
  /** 语音附件 URL（存放在 note-media 存储桶） */
  audios?: string[];
}

export interface DailyComic {
  date: string;
  imageUrl: string;
  provider: "gemini" | "seedream";
  caption?: string;
  createdAt: string;
}

export interface ComicHistoryItem {
  id: string;
  date: string;
  imageUrl: string;
  provider: "gemini" | "seedream";
  caption?: string;
  createdAt: string;
}

export interface DiaryEntry {
  date: string; // YYYY-MM-DD
  content: string;
  mood?: Mood;
  updatedAt: string;
}

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  /** 历史打卡日期，YYYY-MM-DD，倒序去重 */
  history: string[];
  /** @deprecated 仍保留以兼容旧数据；新逻辑用 history 计算 */
  streak?: number;
  /** @deprecated 用 isHabitDoneOn(h, today) 代替 */
  doneToday?: boolean;
}

/** 本地日期 YYYY-MM-DD */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function isHabitDoneOn(h: Habit, date: string): boolean {
  return (h.history ?? []).includes(date);
}

/** 截至 `today` 仍在保持的连续天数。
 *  规则：如果今天打了 → 从今天往前数；如果今天没打但昨天打了 → 算上昨天（仍“未中断”）；否则 0。 */
export function habitStreak(h: Habit, today: string = todayLocal()): number {
  const set = new Set(h.history ?? []);
  let cursor = today;
  if (!set.has(cursor)) {
    const y = addDays(today, -1);
    if (!set.has(y)) return 0;
    cursor = y;
  }
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** 距离上次打卡过了几天（0 = 今天已打；1 = 昨天；…；Infinity = 从未打过） */
export function habitDaysSinceLast(h: Habit, today: string = todayLocal()): number {
  const set = new Set(h.history ?? []);
  if (!set.size) return Infinity;
  let cursor = today;
  for (let i = 0; i < 365; i++) {
    if (set.has(cursor)) return i;
    cursor = addDays(cursor, -1);
  }
  return Infinity;
}

/** 迁移老数据：把 streak+doneToday 反推成 history */
function migrateHabit(h: any): Habit {
  if (Array.isArray(h.history)) return h as Habit;
  const today = todayLocal();
  const lastDay = h.doneToday ? today : addDays(today, -1);
  const n = Math.max(0, Number(h.streak ?? 0));
  const history: string[] = [];
  for (let i = 0; i < n; i++) history.push(addDays(lastDay, -i));
  return { id: h.id, name: h.name, emoji: h.emoji, history };
}

export type RecapBackfillStrategy = "overwrite" | "merge" | "fill-empty";

export interface SyncSummary {
  ts: number;
  ids: string[];
  events: DoneItem[];
  todos: DoneItem[];
  reminders: DoneItem[];
  appliedMode: "create" | "adjust" | "add";
}

export type NavigateView = "ai" | "schedule" | "todos" | "notes" | "habits" | "journal" | "settings";

interface SylvaContextValue {
  items: DoneItem[];
  notes: Note[];
  habits: Habit[];
  diary: DiaryEntry[];
  comics: DailyComic[];
  setComic: (c: DailyComic) => void;
  removeComic: (date: string) => void;
  comicHistory: ComicHistoryItem[];
  addComicHistory: (item: Omit<ComicHistoryItem, "id">) => void;
  removeComicHistory: (id: string) => void;
  addItems: (items: PlanItem[]) => string[];
  /** 写入待确认项（仅本地，不上云、不同步飞书），返回 id 列表 */
  addItemsPending: (items: PlanItem[]) => string[];
  confirmPending: (ids: string[]) => void;
  revertPending: (ids: string[]) => void;
  pendingIds: string[];
  replaceItems: (items: PlanItem[]) => string[];
  removeItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<PlanItem>) => void;
  toggleDone: (id: string) => void;
  clearItems: () => void;
  addNote: (text: string, opts?: { mood?: Mood; tags?: string[]; images?: string[]; videos?: string[]; audios?: string[]; kind?: NoteKind }) => void;
  removeNote: (id: string) => void;
  updateNote: (id: string, patch: Partial<Pick<Note, "text" | "mood" | "tags" | "pinned" | "videos" | "audios" | "kind">>) => void;
  toggleHabit: (id: string) => void;
  toggleHabitOn: (id: string, date: string) => void;
  addHabit: (input: { name: string; emoji?: string }) => void;
  updateHabit: (id: string, patch: Partial<Pick<Habit, "name" | "emoji">>) => void;
  removeHabit: (id: string) => void;
  upsertDiary: (date: string, patch: Partial<Pick<DiaryEntry, "content" | "mood">>) => void;
  recapDoneDates: Set<string>;
  isRecapDone: (date: string) => boolean;
  refreshRecapDoneDates: () => Promise<void>;
  unmarkRecapDone: (date: string) => Promise<void>;
  recapBackfillStrategy: RecapBackfillStrategy;
  setRecapBackfillStrategy: (s: RecapBackfillStrategy) => void;
  enterToSubmit: boolean;
  setEnterToSubmit: (v: boolean) => void;
  dateFlashEnabled: boolean;
  setDateFlashEnabled: (v: boolean) => void;
  dateFlashDurationMs: number;
  setDateFlashDurationMs: (v: number) => void;
  // ---- 漫画生成设置 ----
  comicProvider: "gemini" | "seedream";
  setComicProvider: (v: "gemini" | "seedream") => void;
  comicSeedreamModel: string;
  setComicSeedreamModel: (v: string) => void;
  comicStyle: string;
  setComicStyle: (v: string) => void;
  comicStylePreset: string;
  setComicStylePreset: (v: string) => void;
  comicProtagonistUrl: string | null;
  setComicProtagonistUrl: (v: string | null) => void;
  // ---- AI 同步高亮 & 汇总 ----
  recentlySyncedIds: Set<string>;
  isRecentlySynced: (id: string) => boolean;
  markRecentlySynced: (ids: string[]) => void;
  clearRecentlySynced: () => void;
  syncSummary: SyncSummary | null;
  setSyncSummary: (s: SyncSummary | null) => void;
  // 视图跳转（desktop.tsx 在挂载时注册）
  registerNavigate: (fn: (view: NavigateView, opts?: { todosFilter?: "todo" | "reminder" | "event" }) => void) => void;
  navigateTo: (view: NavigateView, opts?: { todosFilter?: "todo" | "reminder" | "event" }) => void;
}

const SylvaContext = createContext<SylvaContextValue | null>(null);

function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveLS<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const initialItems: DoneItem[] = [
  { id: "seed-1", type: "event", title: "准备毕业答辩的 PPT", date: "2026-05-19", time: "10:00", durationMin: 120, tag: "学习" },
  { id: "seed-2", type: "todo", title: "vibecoding 规划产品", date: "2026-05-19", tag: "工作" },
  { id: "seed-3", type: "todo", title: "准备 Coding Agent 可能问的问题 & 答案", date: "2026-05-19", tag: "工作" },
  { id: "seed-4", type: "event", title: "和导师对齐答辩节奏", date: "2026-05-20", time: "14:00", durationMin: 60, tag: "学习" },
  { id: "seed-5", type: "reminder", title: "提交答辩材料预审", date: "2026-05-21", time: "18:00", tag: "学习" },
  { id: "seed-6", type: "todo", title: "泛听 15 分钟 TED", date: "2026-05-19", tag: "英语" },
  { id: "seed-7", type: "todo", title: "23:30 前放下手机", date: "2026-05-19", tag: "健康", done: false },
];

const initialNotes: Note[] = [
  { id: "n1", text: "答辩开场可以引一段森林徒步的比喻——研究像走山路，不是冲刺。", createdAt: "2026-05-19T09:12:00" },
  { id: "n2", text: "Coding Agent 演示要先抛痛点 30s，再看 demo。", createdAt: "2026-05-19T11:40:00" },
];

function seedHabit(id: string, name: string, emoji: string, streak: number, doneToday: boolean): Habit {
  const today = todayLocal();
  const lastDay = doneToday ? today : addDays(today, -1);
  const history: string[] = [];
  for (let i = 0; i < streak; i++) history.push(addDays(lastDay, -i));
  return { id, name, emoji, history };
}

const initialHabits: Habit[] = [
  seedHabit("h1", "早起", "🌅", 12, true),
  seedHabit("h2", "冥想", "🧘", 5, true),
  seedHabit("h3", "阅读", "📖", 23, false),
  seedHabit("h4", "运动", "🏃", 7, false),
  seedHabit("h5", "英语", "🇬🇧", 18, true),
  seedHabit("h6", "早睡", "🌙", 3, false),
];

let idCounter = 1000;
const nextId = () => `i-${++idCounter}`;

export function SylvaProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DoneItem[]>(() => loadLS("sylva.items", initialItems));
  const [notes, setNotes] = useState<Note[]>(() => loadLS("sylva.notes", initialNotes));
  const [habits, setHabits] = useState<Habit[]>(() =>
    loadLS<any[]>("sylva.habits", initialHabits as any).map(migrateHabit)
  );
  const [diary, setDiary] = useState<DiaryEntry[]>(() => loadLS<DiaryEntry[]>("sylva.diary", []));
  const [comics, setComics] = useState<DailyComic[]>(() => loadLS<DailyComic[]>("sylva.comics", []));
  const [comicHistory, setComicHistory] = useState<ComicHistoryItem[]>(() =>
    loadLS<ComicHistoryItem[]>("sylva.comicHistory", []),
  );

  useEffect(() => saveLS("sylva.items", items), [items]);
  useEffect(() => saveLS("sylva.notes", notes), [notes]);
  useEffect(() => saveLS("sylva.habits", habits), [habits]);
  useEffect(() => saveLS("sylva.diary", diary), [diary]);
  useEffect(() => saveLS("sylva.comics", comics), [comics]);
  useEffect(() => saveLS("sylva.comicHistory", comicHistory), [comicHistory]);

  // 自动同步：任何带时间的、非待确认事项变动，5 秒后静默推送到飞书日历
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSyncSigRef = useRef<string>("");
  useEffect(() => {
    const timed = items
      .filter((i) => !!i.time && !i.pending)
      .map((i) => ({
        id: i.id,
        type: i.type,
        title: i.title,
        date: i.date,
        time: i.time,
        tag: i.tag,
        done: i.done,
      }));
    const sig = JSON.stringify(timed);
    if (sig === autoSyncSigRef.current) return;
    autoSyncSigRef.current = sig;
    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = setTimeout(() => {
      if (timed.length === 0) return;
      void syncToFeishu({ data: { items: timed as any } }).catch(() => {
        /* 静默：未配置飞书或网络错误时不打扰用户 */
      });
    }, 5000);
    return () => {
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    };
  }, [items]);

  const setComic = (c: DailyComic) => {
    setComics((prev) => [c, ...prev.filter((p) => p.date !== c.date)]);
    void remote.upsertComic(c);
  };
  const removeComic = (date: string) => {
    setComics((prev) => prev.filter((p) => p.date !== date));
    void remote.removeComic(date);
  };


  const addComicHistory: SylvaContextValue["addComicHistory"] = (item) =>
    setComicHistory((prev) =>
      [{ ...item, id: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }, ...prev].slice(0, 80),
    );
  const removeComicHistory = (id: string) =>
    setComicHistory((prev) => prev.filter((p) => p.id !== id));

  const addItems = (newOnes: PlanItem[]): string[] => {
    const withIds = newOnes.map((i) => ({ ...i, id: (i as any).id ?? nextId() }));
    setItems((prev) => [...prev, ...withIds]);
    void remote.upsertItems(withIds as DoneItem[]);
    return withIds.map((i) => i.id);
  };

  const addItemsPending = (newOnes: PlanItem[]): string[] => {
    const withIds = newOnes.map((i) => ({ ...i, id: nextId(), pending: true as const }));
    setItems((prev) => [...prev, ...withIds as DoneItem[]]);
    // 故意不调用 remote.upsertItems：待用户确认后再上云
    return withIds.map((i) => i.id);
  };

  const confirmPending = (ids: string[]) => {
    setItems((prev) => {
      const idSet = new Set(ids);
      const next = prev.map((i) => (idSet.has(i.id) && i.pending ? { ...i, pending: undefined } : i));
      const toPush = next.filter((i) => idSet.has(i.id) && !i.pending);
      if (toPush.length) void remote.upsertItems(toPush as DoneItem[]);
      return next;
    });
  };

  const revertPending = (ids: string[]) => {
    const idSet = new Set(ids);
    setItems((prev) => prev.filter((i) => !(idSet.has(i.id) && i.pending)));
    // 未上云，无需 remote 删除
  };


  const replaceItems = (newOnes: PlanItem[]): string[] => {
    const withIds = newOnes.map((i) => ({ ...i, id: nextId() }));
    setItems(withIds);
    void remote.clearItems().then(() => remote.upsertItems(withIds as DoneItem[]));
    return withIds.map((i) => i.id);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    void remote.softDeleteItem(id);
  };

  const updateItem: SylvaContextValue["updateItem"] = (id, patch) => {
    setItems((prev) => {
      const next = prev.map((i) => (i.id === id ? { ...i, ...patch } : i));
      const updated = next.find((i) => i.id === id);
      // 待确认项的编辑保持在本地，不同步到云端/飞书，直到用户点确认
      if (updated && !updated.pending) void remote.upsertItem(updated);
      return next;
    });
  };

  const toggleDone = (id: string) => {
    setItems((prev) => {
      const next = prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
      const updated = next.find((i) => i.id === id);
      if (updated) void remote.upsertItem(updated);
      return next;
    });
  };

  const clearItems = () => {
    setItems([]);
    void remote.clearItems();
  };

  const addNote: SylvaContextValue["addNote"] = (text, opts) => {
    const n: Note = {
      id: nextId(), text, createdAt: new Date().toISOString(),
      kind: opts?.kind ?? "log",
      mood: opts?.mood, tags: opts?.tags, images: opts?.images,
      videos: opts?.videos, audios: opts?.audios,
    };
    setNotes((prev) => [n, ...prev]);
    void remote.upsertNote(n);
  };

  const removeNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    void remote.softDeleteNote(id);
  };

  const updateNote: SylvaContextValue["updateNote"] = (id, patch) => {
    setNotes((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, ...patch } : n));
      const updated = next.find((n) => n.id === id);
      if (updated) void remote.upsertNote(updated);
      return next;
    });
  };

  const toggleHabit = (id: string) => toggleHabitOn(id, todayLocal());

  const toggleHabitOn = (id: string, date: string) =>
    setHabits((prev) => {
      const next = prev.map((h) => {
        if (h.id !== id) return h;
        const hist = h.history ?? [];
        const has = hist.includes(date);
        const nextHist = has
          ? hist.filter((d) => d !== date)
          : [date, ...hist].sort((a, b) => b.localeCompare(a));
        return { ...h, history: nextHist };
      });
      const updated = next.find((h) => h.id === id);
      if (updated) void remote.upsertHabit(updated);
      return next;
    });

  const addHabit: SylvaContextValue["addHabit"] = ({ name, emoji }) => {
    const h: Habit = { id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || "新习惯", emoji: emoji?.trim() || "✨", history: [] };
    setHabits((prev) => [...prev, h]);
    void remote.upsertHabit(h);
  };

  const updateHabit: SylvaContextValue["updateHabit"] = (id, patch) =>
    setHabits((prev) => {
      const next = prev.map((h) => (h.id === id ? { ...h, ...patch } : h));
      const updated = next.find((h) => h.id === id);
      if (updated) void remote.upsertHabit(updated);
      return next;
    });

  const removeHabit: SylvaContextValue["removeHabit"] = (id) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    void remote.softDeleteHabit(id);
  };


  const upsertDiary: SylvaContextValue["upsertDiary"] = (date, patch) =>
    setDiary((prev) => {
      const existing = prev.find((d) => d.date === date);
      const updatedAt = new Date().toISOString();
      let next: DiaryEntry[];
      let updatedRow: DiaryEntry;
      if (existing) {
        updatedRow = { ...existing, ...patch, updatedAt };
        next = prev.map((d) => (d.date === date ? updatedRow : d));
      } else {
        updatedRow = { date, content: patch.content ?? "", mood: patch.mood, updatedAt };
        next = [updatedRow, ...prev];
      }
      void remote.upsertDiary(updatedRow);
      return next;
    });


  // 远端：飞书卡片已提交完成的日期集合（轮询同步）
  const [recapDoneDates, setRecapDoneDates] = useState<Set<string>>(() => new Set());

  // 飞书回填策略：覆盖 / 合并 / 仅在为空时更新
  const [recapBackfillStrategy, setRecapBackfillStrategyState] = useState<RecapBackfillStrategy>(
    () => loadLS<RecapBackfillStrategy>("sylva.recapBackfillStrategy", "fill-empty")
  );
  const setRecapBackfillStrategy = useCallback((s: RecapBackfillStrategy) => {
    setRecapBackfillStrategyState(s);
    saveLS("sylva.recapBackfillStrategy", s);
  }, []);
  const strategyRef = useRef<RecapBackfillStrategy>(recapBackfillStrategy);
  useEffect(() => { strategyRef.current = recapBackfillStrategy; }, [recapBackfillStrategy]);

  // 全局输入行为：Enter 直接发送 vs 仅 ⌘/Ctrl+Enter 发送
  const [enterToSubmit, setEnterToSubmitState] = useState<boolean>(
    () => loadLS<boolean>("sylva.enterToSubmit", true)
  );
  const setEnterToSubmit = useCallback((v: boolean) => {
    setEnterToSubmitState(v);
    saveLS("sylva.enterToSubmit", v);
  }, []);

  // 日期卡片高亮闪烁开关 & 持续时间（ms）
  const [dateFlashEnabled, setDateFlashEnabledState] = useState<boolean>(
    () => loadLS<boolean>("sylva.dateFlashEnabled", true)
  );
  const setDateFlashEnabled = useCallback((v: boolean) => {
    setDateFlashEnabledState(v);
    saveLS("sylva.dateFlashEnabled", v);
  }, []);
  const [dateFlashDurationMs, setDateFlashDurationMsState] = useState<number>(
    () => loadLS<number>("sylva.dateFlashDurationMs", 1200)
  );
  const setDateFlashDurationMs = useCallback((v: number) => {
    const clamped = Math.max(200, Math.min(5000, Math.round(v)));
    setDateFlashDurationMsState(clamped);
    saveLS("sylva.dateFlashDurationMs", clamped);
  }, []);

  // ---- 漫画生成设置 ----
  const [comicProvider, setComicProviderState] = useState<"gemini" | "seedream">(
    () => loadLS<"gemini" | "seedream">("sylva.comicProvider", "gemini")
  );
  const setComicProvider = useCallback((v: "gemini" | "seedream") => {
    setComicProviderState(v);
    saveLS("sylva.comicProvider", v);
  }, []);
  const [comicSeedreamModel, setComicSeedreamModelState] = useState<string>(
    () => loadLS<string>("sylva.comicSeedreamModel", "doubao-seedream-5-0-lite-251015")
  );
  const setComicSeedreamModel = useCallback((v: string) => {
    setComicSeedreamModelState(v.trim());
    saveLS("sylva.comicSeedreamModel", v.trim());
  }, []);
  const [comicStyle, setComicStyleState] = useState<string>(
    () => loadLS<string>("sylva.comicStyle", "")
  );
  const setComicStyle = useCallback((v: string) => {
    setComicStyleState(v);
    saveLS("sylva.comicStyle", v);
  }, []);
  const [comicStylePreset, setComicStylePresetState] = useState<string>(
    () => loadLS<string>("sylva.comicStylePreset", "watercolor")
  );
  const setComicStylePreset = useCallback((v: string) => {
    setComicStylePresetState(v);
    saveLS("sylva.comicStylePreset", v);
  }, []);
  const [comicProtagonistUrl, setComicProtagonistUrlState] = useState<string | null>(
    () => loadLS<string | null>("sylva.comicProtagonistUrl", null)
  );
  const setComicProtagonistUrl = useCallback((v: string | null) => {
    setComicProtagonistUrlState(v);
    saveLS("sylva.comicProtagonistUrl", v);
  }, []);

  // ---- AI 同步高亮 & 汇总 ----
  const [recentlySyncedIds, setRecentlySyncedIds] = useState<Set<string>>(() => new Set());
  const recentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markRecentlySynced = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setRecentlySyncedIds(new Set(ids));
    if (recentTimer.current) clearTimeout(recentTimer.current);
    recentTimer.current = setTimeout(() => setRecentlySyncedIds(new Set()), 12_000);
  }, []);
  const clearRecentlySynced = useCallback(() => {
    if (recentTimer.current) clearTimeout(recentTimer.current);
    setRecentlySyncedIds(new Set());
  }, []);
  const isRecentlySynced = useCallback((id: string) => recentlySyncedIds.has(id), [recentlySyncedIds]);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);

  // 视图跳转：desktop.tsx 注册回调
  const navigateRef = useRef<((view: NavigateView, opts?: { todosFilter?: "todo" | "reminder" | "event" }) => void) | null>(null);
  const registerNavigate = useCallback((fn: (view: NavigateView, opts?: { todosFilter?: "todo" | "reminder" | "event" }) => void) => {
    navigateRef.current = fn;
  }, []);
  const navigateTo = useCallback((view: NavigateView, opts?: { todosFilter?: "todo" | "reminder" | "event" }) => {
    navigateRef.current?.(view, opts);
  }, []);

  const refreshRecapDoneDates = useCallback(async () => {
    try {
      const res = await getRecapDoneDates();
      const nextSet = new Set(res.dates);
      setRecapDoneDates((prev) => {
        const newlyDone = res.dates.filter((d) => !prev.has(d));
        if (newlyDone.length) {
          const newlyDoneSet = new Set(newlyDone);
          setItems((its) =>
            its.map((i) =>
              i.date && newlyDoneSet.has(i.date) && !i.done ? { ...i, done: true } : i
            )
          );
        }
        return nextSet;
      });
      // 按策略把今天的远端 recap 内容回填到本地 diary
      const today = todayLocal();
      if (res.dates.includes(today)) {
        const row = await getDailyRecap({ data: { date: today } });
        if (row) {
          const remote = [row.summary, row.diary].filter(Boolean).join("\n\n").trim();
          const remoteMood = (row.mood as Mood | undefined) || undefined;
          const strategy = strategyRef.current;
          setDiary((prev) => {
            const existing = prev.find((d) => d.date === today);
            const localContent = (existing?.content ?? "").trim();
            const localMood = existing?.mood;
            const updatedAt = new Date().toISOString();

            let nextContent = existing?.content ?? "";
            let nextMood = localMood;
            if (strategy === "overwrite") {
              if (remote) nextContent = remote;
              if (remoteMood) nextMood = remoteMood;
            } else if (strategy === "merge") {
              if (remote && !localContent.includes(remote)) {
                nextContent = localContent ? `${localContent}\n\n${remote}` : remote;
              }
              if (!localMood && remoteMood) nextMood = remoteMood;
            } else {
              // fill-empty：只在本地为空时填
              if (remote && !localContent) nextContent = remote;
              if (!localMood && remoteMood) nextMood = remoteMood;
            }

            const changed = nextContent !== (existing?.content ?? "") || nextMood !== localMood;
            if (!existing && !nextContent && !nextMood) return prev;
            if (!changed && existing) return prev;
            if (existing) {
              return prev.map((d) => d.date === today ? { ...d, content: nextContent, mood: nextMood, updatedAt } : d);
            }
            return [{ date: today, content: nextContent, mood: nextMood, updatedAt }, ...prev];
          });
        }
      }
    } catch {}
  }, []);



  // ---- 跨设备实时同步：首次拉远端 + Realtime 推送合并 ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const r = await fetchAllRemote();
        if (cancelled) return;
        if (r.hasAny) {
          // 远端有数据 → 用远端覆盖本地
          if (r.items.length) setItems(r.items);
          if (r.notes.length) setNotes(r.notes);
          if (r.habits.length) setHabits(r.habits);
          if (r.diary.length) setDiary(r.diary);
          if (r.comics.length) setComics(r.comics);
        } else {
          // 远端为空 → 把本地 seed/历史一次性推上去
          void remote.upsertItems(items);
          void remote.upsertHabits(habits);
          for (const n of notes) void remote.upsertNote(n);
          for (const d of diary) void remote.upsertDiary(d);
          for (const c of comics) void remote.upsertComic(c);
        }
      } catch (e) {
        console.warn("[cloud-sync] initial fetch failed", e);
      }
    })();

    const ch = supabase
      .channel("sylva-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_items" }, (p) => {
        const row: any = p.new ?? p.old;
        if (!row?.id) return;
        if (p.eventType === "DELETE" || row.deleted_at) {
          setItems((prev) => prev.filter((i) => i.id !== row.id));
        } else {
          const mapped = itemFromRow(row);
          setItems((prev) => {
            const idx = prev.findIndex((i) => i.id === mapped.id);
            if (idx < 0) return [...prev, mapped];
            const next = prev.slice();
            next[idx] = mapped;
            return next;
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, (p) => {
        const row: any = p.new ?? p.old;
        if (!row?.id) return;
        if (p.eventType === "DELETE" || row.deleted_at) {
          setNotes((prev) => prev.filter((n) => n.id !== row.id));
        } else {
          const mapped = noteFromRow(row);
          setNotes((prev) => {
            const idx = prev.findIndex((n) => n.id === mapped.id);
            if (idx < 0) return [mapped, ...prev];
            const next = prev.slice();
            next[idx] = mapped;
            return next;
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "habits" }, (p) => {
        const row: any = p.new ?? p.old;
        if (!row?.id) return;
        if (p.eventType === "DELETE" || row.deleted_at) {
          setHabits((prev) => prev.filter((h) => h.id !== row.id));
        } else {
          const mapped = habitFromRow(row);
          setHabits((prev) => {
            const idx = prev.findIndex((h) => h.id === mapped.id);
            if (idx < 0) return [...prev, mapped];
            const next = prev.slice();
            next[idx] = mapped;
            return next;
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "diary_entries" }, (p) => {
        const row: any = p.new ?? p.old;
        if (!row?.date) return;
        if (p.eventType === "DELETE") {
          setDiary((prev) => prev.filter((d) => d.date !== row.date));
        } else {
          const mapped = diaryFromRow(row);
          setDiary((prev) => {
            const idx = prev.findIndex((d) => d.date === mapped.date);
            if (idx < 0) return [mapped, ...prev];
            const next = prev.slice();
            next[idx] = mapped;
            return next;
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "comics" }, (p) => {
        const row: any = p.new ?? p.old;
        if (!row?.date) return;
        if (p.eventType === "DELETE") {
          setComics((prev) => prev.filter((c) => c.date !== row.date));
        } else {
          const mapped = comicFromRow(row);
          setComics((prev) => {
            const idx = prev.findIndex((c) => c.date === mapped.date);
            if (idx < 0) return [mapped, ...prev];
            const next = prev.slice();
            next[idx] = mapped;
            return next;
          });
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    refreshRecapDoneDates();
    const onFocus = () => refreshRecapDoneDates();
    const t = setInterval(refreshRecapDoneDates, 60_000);
    if (typeof window !== "undefined") window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
    };
  }, [refreshRecapDoneDates]);

  const isRecapDone = useCallback((date: string) => recapDoneDates.has(date), [recapDoneDates]);

  const unmarkRecapDone = useCallback(async (date: string) => {
    // 乐观更新
    setRecapDoneDates((prev) => {
      if (!prev.has(date)) return prev;
      const next = new Set(prev);
      next.delete(date);
      return next;
    });
    // 清掉对应当天 diary（如果是从飞书同步过来的，里面没有用户后续新加的内容时直接清空）
    setDiary((prev) => prev.filter((d) => d.date !== date));
    try {
      await unmarkRecapDoneFn({ data: { date } });
    } catch (e) {
      // 失败时回滚
      await refreshRecapDoneDates();
      throw e;
    }
  }, [refreshRecapDoneDates]);

  return (
    <SylvaContext.Provider
      value={{
        items,
        notes,
        habits,
        diary,
        comics,
        setComic,
        removeComic,
        comicHistory,
        addComicHistory,
        removeComicHistory,
        addItems,
        addItemsPending,
        confirmPending,
        revertPending,
        pendingIds: items.filter((i) => i.pending).map((i) => i.id),
        replaceItems,
        removeItem,
        updateItem,
        toggleDone,
        clearItems,
        addNote,
        removeNote,
        updateNote,
        toggleHabit,
        toggleHabitOn,
        addHabit,
        updateHabit,
        removeHabit,
        upsertDiary,
        recapDoneDates,
        isRecapDone,
        refreshRecapDoneDates,
        unmarkRecapDone,
        recapBackfillStrategy,
        setRecapBackfillStrategy,
        enterToSubmit,
        setEnterToSubmit,
        dateFlashEnabled,
        setDateFlashEnabled,
        dateFlashDurationMs,
        setDateFlashDurationMs,
        comicProvider,
        setComicProvider,
        comicSeedreamModel,
        setComicSeedreamModel,
        comicStyle,
        setComicStyle,
        recentlySyncedIds,
        isRecentlySynced,
        markRecentlySynced,
        clearRecentlySynced,
        syncSummary,
        setSyncSummary,
        registerNavigate,
        navigateTo,
      }}
    >
      {children}
    </SylvaContext.Provider>
  );
}


export function useSylva() {
  const ctx = useContext(SylvaContext);
  if (!ctx) throw new Error("useSylva must be used within SylvaProvider");
  return ctx;
}
