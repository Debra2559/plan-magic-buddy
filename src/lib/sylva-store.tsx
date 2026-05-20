import { createContext, useContext, useState, type ReactNode } from "react";
import type { PlanItem } from "./plan.functions";

export interface DoneItem extends PlanItem {
  id: string;
  done?: boolean;
}

export interface Note {
  id: string;
  text: string;
  createdAt: string; // ISO
}

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  streak: number;
  doneToday: boolean;
}

interface SylvaContextValue {
  items: DoneItem[];
  notes: Note[];
  habits: Habit[];
  addItems: (items: PlanItem[]) => void;
  replaceItems: (items: PlanItem[]) => void;
  removeItem: (id: string) => void;
  toggleDone: (id: string) => void;
  clearItems: () => void;
  addNote: (text: string) => void;
  removeNote: (id: string) => void;
  toggleHabit: (id: string) => void;
}

const SylvaContext = createContext<SylvaContextValue | null>(null);

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

const initialHabits: Habit[] = [
  { id: "h1", name: "早起", emoji: "🌅", streak: 12, doneToday: true },
  { id: "h2", name: "冥想", emoji: "🧘", streak: 5, doneToday: true },
  { id: "h3", name: "阅读", emoji: "📖", streak: 23, doneToday: false },
  { id: "h4", name: "运动", emoji: "🏃", streak: 7, doneToday: false },
  { id: "h5", name: "英语", emoji: "🇬🇧", streak: 18, doneToday: true },
  { id: "h6", name: "早睡", emoji: "🌙", streak: 3, doneToday: false },
];

let idCounter = 1000;
const nextId = () => `i-${++idCounter}`;

export function SylvaProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DoneItem[]>(initialItems);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [habits, setHabits] = useState<Habit[]>(initialHabits);

  const addItems = (newOnes: PlanItem[]) =>
    setItems((prev) => [...prev, ...newOnes.map((i) => ({ ...i, id: (i as any).id ?? nextId() }))]);

  const replaceItems = (newOnes: PlanItem[]) =>
    setItems(newOnes.map((i) => ({ ...i, id: nextId() })));

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  const toggleDone = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));

  const clearItems = () => setItems([]);

  const addNote = (text: string) =>
    setNotes((prev) => [
      { id: nextId(), text, createdAt: new Date().toISOString() },
      ...prev,
    ]);

  const removeNote = (id: string) =>
    setNotes((prev) => prev.filter((n) => n.id !== id));

  const toggleHabit = (id: string) =>
    setHabits((prev) =>
      prev.map((h) =>
        h.id === id
          ? { ...h, doneToday: !h.doneToday, streak: !h.doneToday ? h.streak + 1 : Math.max(0, h.streak - 1) }
          : h
      )
    );

  return (
    <SylvaContext.Provider
      value={{
        items,
        notes,
        habits,
        addItems,
        replaceItems,
        removeItem,
        toggleDone,
        clearItems,
        addNote,
        removeNote,
        toggleHabit,
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
