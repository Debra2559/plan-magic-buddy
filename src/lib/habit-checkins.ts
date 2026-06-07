import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface HabitCheckin {
  id: string;
  habitId: string;
  date: string; // YYYY-MM-DD
  note: string;
  images: string[];
  createdAt: string;
}

const fromRow = (r: any): HabitCheckin => ({
  id: r.id,
  habitId: r.habit_id,
  date: r.date,
  note: r.note ?? "",
  images: r.images ?? [],
  createdAt: r.created_at,
});

export function useHabitCheckins(habitId: string | null) {
  const [items, setItems] = useState<HabitCheckin[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!habitId) { setItems([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("habit_checkins")
      .select("*")
      .eq("habit_id", habitId)
      .order("created_at", { ascending: false });
    setItems((data ?? []).map(fromRow));
    setLoading(false);
  }, [habitId]);

  useEffect(() => { void reload(); }, [reload]);

  const add = useCallback(async (date: string, note: string, images: string[]) => {
    if (!habitId) return;
    const { data, error } = await supabase.from("habit_checkins").insert({
      habit_id: habitId, date, note, images,
    }).select().single();
    if (!error && data) setItems((xs) => [fromRow(data), ...xs]);
  }, [habitId]);

  const update = useCallback(async (id: string, patch: Partial<Pick<HabitCheckin, "note" | "images" | "date">>) => {
    const { data, error } = await supabase.from("habit_checkins").update(patch).eq("id", id).select().single();
    if (!error && data) setItems((xs) => xs.map((x) => x.id === id ? fromRow(data) : x));
  }, []);

  const remove = useCallback(async (id: string) => {
    await supabase.from("habit_checkins").delete().eq("id", id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  return { items, loading, add, update, remove, reload };
}

/** 全量计数（用于在卡片上显示徽标） */
export function useHabitCheckinCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("habit_checkins")
      .select("habit_id");
    const m: Record<string, number> = {};
    for (const r of (data ?? []) as { habit_id: string }[]) {
      m[r.habit_id] = (m[r.habit_id] ?? 0) + 1;
    }
    setCounts(m);
  }, []);

  useEffect(() => {
    void reload();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void reload(); });
    return () => sub.subscription.unsubscribe();
  }, [reload]);

  return { counts, reload };
}
