import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PlanItem } from "./plan.functions";

export interface DoneItem extends PlanItem {
  id: string;
  done?: boolean;
}

export type Mood = "great" | "good" | "ok" | "down" | "tired";

export interface Note {
  id: string;
  text: string;
  createdAt: string; // ISO
  mood?: Mood;
  tags?: string[];
  pinned?: boolean;
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

interface SylvaContextValue {
  items: DoneItem[];
  notes: Note[];
  habits: Habit[];
  diary: DiaryEntry[];
  addItems: (items: PlanItem[]) => void;
  replaceItems: (items: PlanItem[]) => void;
  removeItem: (id: string) => void;
  toggleDone: (id: string) => void;
  clearItems: () => void;
  addNote: (text: string, opts?: { mood?: Mood; tags?: string[] }) => void;
  removeNote: (id: string) => void;
  updateNote: (id: string, patch: Partial<Pick<Note, "text" | "mood" | "tags" | "pinned">>) => void;
  toggleHabit: (id: string) => void;
  upsertDiary: (date: string, patch: Partial<Pick<DiaryEntry, "content" | "mood">>) => void;
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

  useEffect(() => saveLS("sylva.items", items), [items]);
  useEffect(() => saveLS("sylva.notes", notes), [notes]);
  useEffect(() => saveLS("sylva.habits", habits), [habits]);
  useEffect(() => saveLS("sylva.diary", diary), [diary]);

  const addItems = (newOnes: PlanItem[]) =>
    setItems((prev) => [...prev, ...newOnes.map((i) => ({ ...i, id: (i as any).id ?? nextId() }))]);

  const replaceItems = (newOnes: PlanItem[]) =>
    setItems(newOnes.map((i) => ({ ...i, id: nextId() })));

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  const toggleDone = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));

  const clearItems = () => setItems([]);

  const addNote: SylvaContextValue["addNote"] = (text, opts) =>
    setNotes((prev) => [
      { id: nextId(), text, createdAt: new Date().toISOString(), mood: opts?.mood, tags: opts?.tags },
      ...prev,
    ]);

  const removeNote = (id: string) =>
    setNotes((prev) => prev.filter((n) => n.id !== id));

  const updateNote: SylvaContextValue["updateNote"] = (id, patch) =>
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));

  const toggleHabit = (id: string) =>
    setHabits((prev) =>
      prev.map((h) =>
        h.id === id
          ? { ...h, doneToday: !h.doneToday, streak: !h.doneToday ? h.streak + 1 : Math.max(0, h.streak - 1) }
          : h
      )
    );

  const upsertDiary: SylvaContextValue["upsertDiary"] = (date, patch) =>
    setDiary((prev) => {
      const existing = prev.find((d) => d.date === date);
      const updatedAt = new Date().toISOString();
      if (existing) {
        return prev.map((d) => (d.date === date ? { ...d, ...patch, updatedAt } : d));
      }
      return [
        { date, content: patch.content ?? "", mood: patch.mood, updatedAt },
        ...prev,
      ];
    });

  return (
    <SylvaContext.Provider
      value={{
        items,
        notes,
        habits,
        diary,
        addItems,
        replaceItems,
        removeItem,
        toggleDone,
        clearItems,
        addNote,
        removeNote,
        updateNote,
        toggleHabit,
        upsertDiary,
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
