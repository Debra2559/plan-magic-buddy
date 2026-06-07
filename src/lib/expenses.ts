import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Expense {
  id: string;
  amount: number; // 分
  category: string;
  note?: string;
  date: string; // YYYY-MM-DD
  paymentMethod?: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  month: string; // YYYY-MM
  category: string | null;
  amount: number; // 分
}

export const EXPENSE_CATEGORIES = [
  "餐饮", "交通", "购物", "娱乐", "居住", "医疗", "学习", "人情", "其他",
] as const;

const fromRow = (r: any): Expense => ({
  id: r.id,
  amount: r.amount,
  category: r.category,
  note: r.note ?? undefined,
  date: r.date,
  paymentMethod: r.payment_method ?? undefined,
  createdAt: r.created_at,
});

const budgetFromRow = (r: any): Budget => ({
  id: r.id,
  month: r.month,
  category: r.category,
  amount: r.amount,
});

export function useExpenses() {
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("expenses").select("*").order("date", { ascending: false }).order("created_at", { ascending: false });
    setItems((data ?? []).map(fromRow));
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void reload(); });
    return () => sub.subscription.unsubscribe();
  }, [reload]);

  const add = useCallback(async (e: Omit<Expense, "id" | "createdAt">) => {
    const { data, error } = await supabase.from("expenses").insert({
      amount: e.amount, category: e.category, note: e.note ?? null,
      date: e.date, payment_method: e.paymentMethod ?? null,
    }).select().single();
    if (!error && data) setItems((xs) => [fromRow(data), ...xs]);
  }, []);

  const addMany = useCallback(async (list: Omit<Expense, "id" | "createdAt">[]) => {
    if (list.length === 0) return 0;
    const rows = list.map((e) => ({
      amount: e.amount, category: e.category, note: e.note ?? null,
      date: e.date, payment_method: e.paymentMethod ?? null,
    }));
    const { data, error } = await supabase.from("expenses").insert(rows).select();
    if (error || !data) return 0;
    setItems((xs) => [...data.map(fromRow), ...xs]);
    return data.length;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<Expense>) => {
    const payload: any = {};
    if (patch.amount !== undefined) payload.amount = patch.amount;
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.note !== undefined) payload.note = patch.note;
    if (patch.date !== undefined) payload.date = patch.date;
    if (patch.paymentMethod !== undefined) payload.payment_method = patch.paymentMethod;
    const { data, error } = await supabase.from("expenses").update(payload).eq("id", id).select().single();
    if (!error && data) setItems((xs) => xs.map((x) => x.id === id ? fromRow(data) : x));
  }, []);

  const remove = useCallback(async (id: string) => {
    await supabase.from("expenses").delete().eq("id", id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  return { items, loading, add, addMany, update, remove, reload };
}

export function useBudgets() {
  const [items, setItems] = useState<Budget[]>([]);

  const reload = useCallback(async () => {
    const { data } = await supabase.from("budgets").select("*");
    setItems((data ?? []).map(budgetFromRow));
  }, []);

  useEffect(() => {
    void reload();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void reload(); });
    return () => sub.subscription.unsubscribe();
  }, [reload]);

  const setBudget = useCallback(async (month: string, category: string | null, amount: number) => {
    const { data, error } = await supabase
      .from("budgets")
      .upsert({ month, category, amount }, { onConflict: "user_id,month,category" })
      .select().single();
    if (!error && data) {
      const b = budgetFromRow(data);
      setItems((xs) => {
        const without = xs.filter((x) => !(x.month === b.month && x.category === b.category));
        return [...without, b];
      });
    }
  }, []);

  const removeBudget = useCallback(async (id: string) => {
    await supabase.from("budgets").delete().eq("id", id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  return { items, setBudget, removeBudget, reload };
}

export function fenToYuan(fen: number): string {
  return (fen / 100).toFixed(2);
}

export function yuanToFen(yuan: string | number): number {
  const n = typeof yuan === "string" ? parseFloat(yuan) : yuan;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
