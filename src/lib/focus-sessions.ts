import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode, createElement } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FocusSession {
  id: string;
  mode: "pomodoro" | "free";
  plannedMin: number;
  actualMin: number;
  startedAt: string;
  endedAt?: string;
  completed: boolean;
  linkedItemId?: string;
  title?: string;
  tag?: string;
}

interface TimerState {
  running: boolean;
  paused: boolean;
  mode: "pomodoro" | "free";
  phase: "focus" | "break";
  plannedMin: number;
  remainingSec: number; // for pomodoro phase, or elapsed for free
  startedAtMs: number;
  linkedItemId?: string;
  title?: string;
  tag?: string;
  pomoCycle: number; // completed focus cycles in this run
}

interface FocusTimerCtx {
  state: TimerState | null;
  start: (opts: { mode: "pomodoro" | "free"; plannedMin?: number; linkedItemId?: string; title?: string; tag?: string }) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  skip: () => void; // finish current phase early
  sessions: FocusSession[];
  todayFocusMin: number;
}

const Ctx = createContext<FocusTimerCtx | null>(null);

export function useFocusTimer() {
  const v = useContext(Ctx);
  if (!v) throw new Error("FocusTimerProvider missing");
  return v;
}

async function saveSession(s: FocusSession) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from("focus_sessions").insert({
    mode: s.mode,
    planned_min: s.plannedMin,
    actual_min: s.actualMin,
    started_at: s.startedAt,
    ended_at: s.endedAt ?? null,
    completed: s.completed,
    linked_item_id: s.linkedItemId ?? null,
    title: s.title ?? null,
    tag: s.tag ?? null,
  });
}

async function fetchSessions(): Promise<FocusSession[]> {
  const { data, error } = await supabase
    .from("focus_sessions")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    mode: r.mode,
    plannedMin: r.planned_min,
    actualMin: r.actual_min,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? undefined,
    completed: r.completed,
    linkedItemId: r.linked_item_id ?? undefined,
    title: r.title ?? undefined,
    tag: r.tag ?? undefined,
  }));
}

export function FocusTimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TimerState | null>(null);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const tickRef = useRef<number | null>(null);

  // hydrate
  useEffect(() => {
    let alive = true;
    fetchSessions().then((s) => { if (alive) setSessions(s); });
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchSessions().then((s) => setSessions(s));
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const tick = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.paused) return prev;
      if (prev.mode === "free") {
        return { ...prev, remainingSec: prev.remainingSec + 1 };
      }
      const next = prev.remainingSec - 1;
      if (next <= 0) {
        // phase end
        if (prev.phase === "focus") {
          // log completed focus session
          const startedIso = new Date(prev.startedAtMs).toISOString();
          const s: FocusSession = {
            id: crypto.randomUUID(),
            mode: "pomodoro",
            plannedMin: prev.plannedMin,
            actualMin: prev.plannedMin,
            startedAt: startedIso,
            endedAt: new Date().toISOString(),
            completed: true,
            linkedItemId: prev.linkedItemId,
            title: prev.title,
            tag: prev.tag,
          };
          void saveSession(s).then(() => fetchSessions().then(setSessions));
          setSessions((xs) => [s, ...xs]);
          toast.success("🍅 一个番茄完成，休息 5 分钟");
          try { new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play().catch(()=>{}); } catch {}
          return {
            ...prev,
            phase: "break",
            remainingSec: 5 * 60,
            pomoCycle: prev.pomoCycle + 1,
            startedAtMs: Date.now(),
          };
        } else {
          toast("☕ 休息结束，开始下一个番茄");
          return {
            ...prev,
            phase: "focus",
            remainingSec: prev.plannedMin * 60,
            startedAtMs: Date.now(),
          };
        }
      }
      return { ...prev, remainingSec: next };
    });
  }, []);

  useEffect(() => {
    if (!state || state.paused) {
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    tickRef.current = window.setInterval(tick, 1000);
    return () => { if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; } };
  }, [state?.running, state?.paused, tick]);

  const start: FocusTimerCtx["start"] = (opts) => {
    const plannedMin = opts.plannedMin ?? (opts.mode === "pomodoro" ? 25 : 25);
    setState({
      running: true,
      paused: false,
      mode: opts.mode,
      phase: "focus",
      plannedMin,
      remainingSec: opts.mode === "pomodoro" ? plannedMin * 60 : 0,
      startedAtMs: Date.now(),
      linkedItemId: opts.linkedItemId,
      title: opts.title,
      tag: opts.tag,
      pomoCycle: 0,
    });
  };

  const pause = () => setState((s) => s ? { ...s, paused: true } : s);
  const resume = () => setState((s) => s ? { ...s, paused: false } : s);

  const finishFree = (st: TimerState, completed: boolean) => {
    const actualMin = Math.max(0, Math.round(st.remainingSec / 60));
    if (actualMin < 1) return; // ignore < 1 min
    const s: FocusSession = {
      id: crypto.randomUUID(),
      mode: "free",
      plannedMin: actualMin,
      actualMin,
      startedAt: new Date(st.startedAtMs).toISOString(),
      endedAt: new Date().toISOString(),
      completed,
      linkedItemId: st.linkedItemId,
      title: st.title,
      tag: st.tag,
    };
    void saveSession(s).then(() => fetchSessions().then(setSessions));
    setSessions((xs) => [s, ...xs]);
    toast.success(`⏱️ 专注 ${actualMin} 分钟已记录`);
  };

  const cancel = () => {
    setState((st) => {
      if (st && st.mode === "free") finishFree(st, false);
      else if (st && st.mode === "pomodoro" && st.phase === "focus") {
        const elapsedMin = Math.round((st.plannedMin * 60 - st.remainingSec) / 60);
        if (elapsedMin >= 1) {
          const s: FocusSession = {
            id: crypto.randomUUID(),
            mode: "pomodoro",
            plannedMin: st.plannedMin,
            actualMin: elapsedMin,
            startedAt: new Date(st.startedAtMs).toISOString(),
            endedAt: new Date().toISOString(),
            completed: false,
            linkedItemId: st.linkedItemId,
            title: st.title,
            tag: st.tag,
          };
          void saveSession(s).then(() => fetchSessions().then(setSessions));
          setSessions((xs) => [s, ...xs]);
          toast(`⏸️ 中止：已记录 ${elapsedMin} 分钟`);
        }
      }
      return null;
    });
  };

  const skip = () => {
    setState((prev) => {
      if (!prev) return prev;
      if (prev.mode === "free") {
        finishFree(prev, true);
        return null;
      }
      // pomodoro: short-circuit phase
      return { ...prev, remainingSec: 1 };
    });
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayFocusMin = sessions
    .filter((s) => s.startedAt.slice(0, 10) === todayStr && (s.mode === "free" || (s.mode === "pomodoro" && s.completed)))
    .reduce((sum, s) => sum + s.actualMin, 0);

  return createElement(Ctx.Provider, { value: { state, start, pause, resume, cancel, skip, sessions, todayFocusMin } }, children);
}
