/**
 * 跨设备实时同步层：把 sylva-store 的本地状态镜像到 Supabase，
 * 并通过 Realtime 把其它设备的写入推回来。
 *
 * 公共共享工作区（无登录）。任何拿到链接的人都能读写。
 */
import { supabase } from "@/integrations/supabase/client";
import type { DoneItem, Note, Habit, DiaryEntry, DailyComic } from "./sylva-store";

// ---------- 行 <-> 本地模型映射 ----------

type ItemRow = {
  id: string; type: string; title: string;
  date: string | null; time: string | null; duration_min: number | null;
  tag: string | null; note: string | null; done: boolean;
  updated_at: string; deleted_at: string | null;
};
export const itemFromRow = (r: ItemRow): DoneItem => ({
  id: r.id, type: r.type as any, title: r.title,
  date: (r.date ?? "") as any, time: r.time ?? undefined,
  durationMin: r.duration_min ?? undefined,
  tag: (r.tag ?? "生活") as any, note: r.note ?? undefined,
  done: r.done,
});

export const itemToRow = (i: DoneItem) => ({
  id: i.id, type: i.type, title: i.title,
  date: i.date ?? null, time: i.time ?? null,
  duration_min: (i as any).durationMin ?? null,
  tag: i.tag ?? null, note: (i as any).note ?? null,
  done: !!i.done, deleted_at: null,
});

type NoteRow = {
  id: string; text: string; mood: string | null;
  tags: string[]; pinned: boolean; images: string[];
  created_at: string; updated_at: string; deleted_at: string | null;
};
export const noteFromRow = (r: NoteRow): Note => ({
  id: r.id, text: r.text, createdAt: r.created_at,
  mood: (r.mood as any) ?? undefined,
  tags: r.tags?.length ? r.tags : undefined,
  pinned: r.pinned || undefined,
  images: r.images?.length ? r.images : undefined,
});
export const noteToRow = (n: Note) => ({
  id: n.id, text: n.text, mood: n.mood ?? null,
  tags: n.tags ?? [], pinned: !!n.pinned, images: n.images ?? [],
  created_at: n.createdAt, deleted_at: null,
});

type HabitRow = {
  id: string; name: string; emoji: string; history: string[];
  updated_at: string; deleted_at: string | null;
};
export const habitFromRow = (r: HabitRow): Habit => ({
  id: r.id, name: r.name, emoji: r.emoji, history: r.history ?? [],
});
export const habitToRow = (h: Habit) => ({
  id: h.id, name: h.name, emoji: h.emoji, history: h.history ?? [], deleted_at: null,
});

type DiaryRow = { date: string; content: string; mood: string | null; updated_at: string };
export const diaryFromRow = (r: DiaryRow): DiaryEntry => ({
  date: r.date, content: r.content, mood: (r.mood as any) ?? undefined, updatedAt: r.updated_at,
});
export const diaryToRow = (d: DiaryEntry) => ({
  date: d.date, content: d.content, mood: d.mood ?? null,
});

type ComicRow = { date: string; image_url: string; provider: string; caption: string | null; created_at: string };
export const comicFromRow = (r: ComicRow): DailyComic => ({
  date: r.date, imageUrl: r.image_url, provider: r.provider as any,
  caption: r.caption ?? undefined, createdAt: r.created_at,
});
export const comicToRow = (c: DailyComic) => ({
  date: c.date, image_url: c.imageUrl, provider: c.provider,
  caption: c.caption ?? null, created_at: c.createdAt,
});

// ---------- 远端写入（fire-and-forget，失败不阻塞 UI） ----------

const swallow = (label: string) => (err: any) => {
  if (err) console.warn(`[cloud-sync] ${label}`, err.message ?? err);
};

export const remote = {
  // schedule_items
  async upsertItem(i: DoneItem) {
    const { error } = await supabase.from("schedule_items").upsert(itemToRow(i));
    swallow("upsertItem")(error);
  },
  async upsertItems(xs: DoneItem[]) {
    if (!xs.length) return;
    const { error } = await supabase.from("schedule_items").upsert(xs.map(itemToRow));
    swallow("upsertItems")(error);
  },
  async softDeleteItem(id: string) {
    const { error } = await supabase.from("schedule_items")
      .update({ deleted_at: new Date().toISOString() }).eq("id", id);
    swallow("softDeleteItem")(error);
  },
  async clearItems() {
    const { error } = await supabase.from("schedule_items")
      .update({ deleted_at: new Date().toISOString() }).is("deleted_at", null);
    swallow("clearItems")(error);
  },

  // notes
  async upsertNote(n: Note) {
    const { error } = await supabase.from("notes").upsert(noteToRow(n));
    swallow("upsertNote")(error);
  },
  async softDeleteNote(id: string) {
    const { error } = await supabase.from("notes")
      .update({ deleted_at: new Date().toISOString() }).eq("id", id);
    swallow("softDeleteNote")(error);
  },

  // habits
  async upsertHabit(h: Habit) {
    const { error } = await supabase.from("habits").upsert(habitToRow(h));
    swallow("upsertHabit")(error);
  },
  async upsertHabits(xs: Habit[]) {
    if (!xs.length) return;
    const { error } = await supabase.from("habits").upsert(xs.map(habitToRow));
    swallow("upsertHabits")(error);
  },
  async softDeleteHabit(id: string) {
    const { error } = await supabase.from("habits")
      .update({ deleted_at: new Date().toISOString() }).eq("id", id);
    swallow("softDeleteHabit")(error);
  },

  // diary
  async upsertDiary(d: DiaryEntry) {
    const { error } = await supabase.from("diary_entries").upsert(diaryToRow(d));
    swallow("upsertDiary")(error);
  },

  // comics
  async upsertComic(c: DailyComic) {
    const { error } = await supabase.from("comics").upsert(comicToRow(c));
    swallow("upsertComic")(error);
  },
  async removeComic(date: string) {
    const { error } = await supabase.from("comics").delete().eq("date", date);
    swallow("removeComic")(error);
  },
};


// ---------- 初次拉取 ----------

export async function fetchAllRemote() {
  const [items, notes, habits, diary, comics] = await Promise.all([
    supabase.from("schedule_items").select("*").is("deleted_at", null),
    supabase.from("notes").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("habits").select("*").is("deleted_at", null),
    supabase.from("diary_entries").select("*"),
    supabase.from("comics").select("*"),
  ]);
  return {
    items: (items.data ?? []).map(itemFromRow as any),
    notes: (notes.data ?? []).map(noteFromRow as any),
    habits: (habits.data ?? []).map(habitFromRow as any),
    diary: (diary.data ?? []).map(diaryFromRow as any),
    comics: (comics.data ?? []).map(comicFromRow as any),
    hasAny:
      !!(items.data?.length || notes.data?.length || habits.data?.length ||
         diary.data?.length || comics.data?.length),
  };
}
