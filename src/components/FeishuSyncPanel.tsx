import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSylva } from "@/lib/sylva-store";
import { useServerFn } from "@tanstack/react-start";
import {
  testFeishuConnection,
  listFeishuCalendars,
  getFeishuSettings,
  selectFeishuCalendar,
  setFeishuDirection,
  syncToFeishu,
} from "@/lib/feishu.functions";
import {
  Check,
  RefreshCw,
  Link2,
  Unlink,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  AlertTriangle,
  Loader2,
  Zap,
} from "lucide-react";

type Status = "disconnected" | "connecting" | "connected";
type Direction = "two-way" | "push-only";

interface RealCalendar {
  id: string;
  name: string;
  role: string;
  type: string;
}

// 飞书日历没颜色，给一组固定色循环用
const CAL_COLORS = ["#f5b942", "#7dd3fc", "#a78bfa", "#86efac", "#fb7185", "#fbbf24", "#60a5fa"];

interface SyncLog {
  id: string;
  at: string;
  op: "create" | "update" | "delete" | "pull";
  source: "sylva" | "feishu";
  title: string;
  status: "ok" | "pending" | "conflict";
}

const STORAGE_KEY = "sylva.feishu.mock.v1";
interface Persisted {
  status: Status;
  calendarId: string | null;
  direction: Direction;
  lastSyncAt: string | null;
}

const loadPersisted = (): Persisted => {
  if (typeof window === "undefined")
    return { status: "disconnected", calendarId: null, direction: "two-way", lastSyncAt: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Persisted;
  } catch {}
  return { status: "disconnected", calendarId: null, direction: "two-way", lastSyncAt: null };
};

export function FeishuSyncPanel() {
  const { items } = useSylva();
  const [state, setState] = useState<Persisted>(loadPersisted);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const lastItemSignature = useRef<string>("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [calendars, setCalendars] = useState<RealCalendar[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [calendarsError, setCalendarsError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const runTest = useServerFn(testFeishuConnection);
  const runList = useServerFn(listFeishuCalendars);
  const runGetSettings = useServerFn(getFeishuSettings);
  const runSelect = useServerFn(selectFeishuCalendar);
  const runSetDir = useServerFn(setFeishuDirection);
  const runSync = useServerFn(syncToFeishu);

  const doSync = useCallback(
    async (reason: string) => {
      if (!state.calendarId) return;
      setSyncing(true);
      try {
        const r = await runSync({
          data: {
            items: items.map((i) => ({
              id: i.id,
              type: i.type,
              title: i.title,
              date: i.date,
              time: i.time,
              durationMin: i.durationMin,
              tag: i.tag,
              note: i.note,
              done: i.done,
            })),
          },
        });
        if (!r.ok) {
          setLogs((prev) => [mkLog("update", "sylva", `同步失败: ${r.error}`, "conflict"), ...prev].slice(0, 12));
          return;
        }
        const newLogs: SyncLog[] = r.entries.slice(0, 8).map((e) =>
          mkLog(
            e.op === "delete" ? "delete" : e.op === "update" ? "update" : "create",
            "sylva",
            e.status === "ok" ? e.title : `${e.title} · ${e.error ?? "失败"}`,
            e.status === "ok" ? "ok" : "conflict"
          )
        );
        if (r.entries.length === 0) {
          newLogs.push(mkLog("pull", "feishu", `${reason} · 无需同步`, "ok"));
        }
        setLogs((prev) => [...newLogs, ...prev].slice(0, 12));
        setState((s) => ({ ...s, lastSyncAt: new Date().toISOString() }));
      } finally {
        setSyncing(false);
      }
    },
    [items, runSync, state.calendarId]
  );

  const loadCalendars = useCallback(async () => {
    setLoadingCalendars(true);
    setCalendarsError(null);
    try {
      const r = await runList();
      if (r.ok) setCalendars(r.calendars);
      else setCalendarsError(r.error);
    } catch (e: any) {
      setCalendarsError(e?.message ?? "请求失败");
    } finally {
      setLoadingCalendars(false);
    }
  }, [runList]);

  // 首次加载：从数据库读设置 + 拉日历列表
  useEffect(() => {
    (async () => {
      try {
        const s = await runGetSettings();
        setState((prev) => ({
          ...prev,
          calendarId: s.selectedCalendarId ?? prev.calendarId,
          direction: s.direction,
          lastSyncAt: s.lastSyncAt ?? prev.lastSyncAt,
        }));
      } catch {}
      loadCalendars();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await runTest();
      if (r.ok) {
        setTestResult({ ok: true, msg: `凭证有效 · token 有效期 ${r.expire}s` });
        loadCalendars();
      } else setTestResult({ ok: false, msg: r.error });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message ?? "请求失败" });
    } finally {
      setTesting(false);
    }
  };

  const onSelectCalendar = async (c: RealCalendar) => {
    setState((s) => ({ ...s, calendarId: c.id }));
    try {
      await runSelect({ data: { calendarId: c.id, calendarName: c.name } });
    } catch (e) {
      console.error("select calendar failed", e);
    }
  };

  const onSetDirection = async (direction: Direction) => {
    setState((s) => ({ ...s, direction }));
    try {
      await runSetDir({ data: { direction } });
    } catch (e) {
      console.error("set direction failed", e);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  useEffect(() => {
    const sig = items.map((i) => `${i.id}:${i.title}:${i.date}:${i.time ?? ""}:${i.done ? 1 : 0}`).join("|");
    if (lastItemSignature.current === "") {
      lastItemSignature.current = sig;
      return;
    }
    if (sig === lastItemSignature.current) return;

    if (state.status === "connected" && state.calendarId) {
      const prev = new Set(lastItemSignature.current.split("|").map((s) => s.split(":")[0]));
      const curr = new Set(items.map((i) => i.id));
      const added = [...curr].filter((id) => !prev.has(id));
      const removed = [...prev].filter((id) => !curr.has(id));
      const changed = items.filter((i) => prev.has(i.id) && !added.includes(i.id));

      const entries: SyncLog[] = [];
      added.forEach((id) => {
        const it = items.find((x) => x.id === id);
        if (it && it.type !== "todo") entries.push(mkLog("create", "sylva", it.title));
      });
      removed.forEach((id) => entries.push(mkLog("delete", "sylva", `已删除条目 ${id.slice(-4)}`)));
      changed.slice(0, 2).forEach((it) => {
        if (it.type !== "todo") entries.push(mkLog("update", "sylva", it.title));
      });

      if (entries.length) {
        setLogs((prev) => [...entries, ...prev].slice(0, 12));
        setState((s) => ({ ...s, lastSyncAt: new Date().toISOString() }));
      }
    }
    lastItemSignature.current = sig;
  }, [items, state.status, state.calendarId]);

  const selected = useMemo(
    () => calendars.find((c) => c.id === state.calendarId) ?? null,
    [calendars, state.calendarId]
  );

  const connect = async () => {
    setState((s) => ({ ...s, status: "connecting" }));
    await new Promise((r) => setTimeout(r, 900));
    setState((s) => ({
      ...s,
      status: "connected",
      calendarId: s.calendarId ?? "cal_primary",
      lastSyncAt: new Date().toISOString(),
    }));
    setLogs([
      mkLog("pull", "feishu", "已拉取近 30 天日程 · 模拟"),
      mkLog("create", "sylva", "首次全量推送 · 模拟"),
    ]);
  };

  const disconnect = () => {
    setState({ status: "disconnected", calendarId: null, direction: state.direction, lastSyncAt: null });
    setLogs([]);
  };

  const syncNow = async () => {
    if (state.status !== "connected") return;
    setLogs((prev) => [mkLog("pull", "feishu", "手动同步 · 拉取远端变更"), ...prev].slice(0, 12));
    await new Promise((r) => setTimeout(r, 600));
    setState((s) => ({ ...s, lastSyncAt: new Date().toISOString() }));
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-4 h-4 rounded bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-[9px] font-bold text-white">飞</div>
        <h3 className="font-display text-lg text-white">飞书日程同步</h3>
        <span
          className={`ml-2 text-[10px] px-2 py-0.5 rounded-full border ${
            state.status === "connected"
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
              : state.status === "connecting"
              ? "bg-amber-400/15 text-amber-300 border-amber-400/30"
              : "bg-white/5 text-white/50 border-white/10"
          }`}
        >
          {state.status === "connected" ? "已连接" : state.status === "connecting" ? "连接中…" : "未连接"}
        </span>
        <button
          onClick={onTest}
          disabled={testing}
          className="ml-auto text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 disabled:opacity-50 flex items-center gap-1.5"
          title="用 App ID/Secret 换 tenant_access_token，验证凭证"
        >
          {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          测试连接
        </button>
      </div>

      {testResult && (
        <div
          className={`mb-3 px-3 py-2 rounded-lg text-[11px] border ${
            testResult.ok
              ? "bg-emerald-500/10 border-emerald-400/30 text-emerald-200"
              : "bg-rose-500/10 border-rose-400/30 text-rose-200"
          }`}
        >
          {testResult.ok ? "✓ " : "✗ "}
          {testResult.msg}
        </div>
      )}

      <div className="widget overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-3 border-b border-white/8">
          {state.status === "connected" ? (
            <>
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="w-4 h-4 text-emerald-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/90">飞书工作台 · sylva@dev</div>
                <div className="text-[11px] text-white/50">
                  {state.lastSyncAt ? `上次同步 ${fmtTime(state.lastSyncAt)}` : "尚未同步"}
                  {" · "}
                  <span className="text-amber-glow/80">Mock 模式</span>
                </div>
              </div>
              <button
                onClick={syncNow}
                className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" /> 立即同步
              </button>
              <button
                onClick={disconnect}
                className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-rose-300 flex items-center gap-1.5"
              >
                <Unlink className="w-3 h-3" /> 断开
              </button>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <Link2 className="w-4 h-4 text-white/50" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-white/90">连接飞书账号开始双向同步</div>
                <div className="text-[11px] text-white/50">将打开飞书授权 · 当前为 Mock 流程</div>
              </div>
              <button
                onClick={connect}
                disabled={state.status === "connecting"}
                className="text-xs px-3.5 py-1.5 rounded-full bg-amber-glow/90 text-primary-foreground font-medium hover:brightness-110 disabled:opacity-60 flex items-center gap-1.5"
              >
                {state.status === "connecting" ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> 授权中…
                  </>
                ) : (
                  <>
                    <Link2 className="w-3 h-3" /> 连接飞书
                  </>
                )}
              </button>
            </>
          )}
        </div>

        <div className="px-4 py-3 border-b border-white/8">
          <div className="text-[11px] text-white/50 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> 选择要同步的日历
            </span>
            <button
              onClick={loadCalendars}
              disabled={loadingCalendars}
              className="text-white/40 hover:text-white/70 flex items-center gap-1 disabled:opacity-50"
            >
              {loadingCalendars ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              刷新
            </button>
          </div>

          {calendarsError ? (
            <div className="text-[11px] text-rose-300 py-2">读取失败：{calendarsError}</div>
          ) : loadingCalendars && calendars.length === 0 ? (
            <div className="text-[11px] text-white/40 py-4 text-center flex items-center justify-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> 正在拉取飞书日历…
            </div>
          ) : calendars.length === 0 ? (
            <div className="text-[11px] text-white/40 py-4 text-center">
              没有可见日历。请到飞书后台「权限管理」给应用开通 calendar:calendar 权限并把日历分享给应用。
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {calendars.map((c, i) => {
                const active = state.calendarId === c.id;
                const color = CAL_COLORS[i % CAL_COLORS.length];
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelectCalendar(c)}
                    className={`text-left px-3 py-2 rounded-lg border transition flex items-center gap-2.5 ${
                      active
                        ? "bg-amber-glow/15 border-amber-glow/40"
                        : "bg-white/[0.03] border-white/8 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white/90 truncate">{c.name}</div>
                      <div className="text-[10px] text-white/40 truncate">
                        {c.role || c.type || "日历"}
                      </div>
                    </div>
                    {active && <Check className="w-3.5 h-3.5 text-amber-glow shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-b border-white/8 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm text-white/90">同步方向</div>
            <div className="text-[11px] text-white/50">
              {state.direction === "two-way"
                ? "两端任意修改互相覆盖（最后修改者胜）"
                : "Sylva 的变更推送到飞书，远端改动不回流"}
            </div>
          </div>
          <div className="flex bg-white/5 border border-white/10 rounded-full p-0.5 text-[11px]">
            <button
              onClick={() => onSetDirection("two-way")}
              className={`px-3 py-1 rounded-full flex items-center gap-1 transition ${
                state.direction === "two-way" ? "bg-white/10 text-white" : "text-white/50"
              }`}
            >
              <ArrowUpDown className="w-3 h-3" /> 双向
            </button>
            <button
              onClick={() => onSetDirection("push-only")}
              className={`px-3 py-1 rounded-full flex items-center gap-1 transition ${
                state.direction === "push-only" ? "bg-white/10 text-white" : "text-white/50"
              }`}
            >
              <ArrowUp className="w-3 h-3" /> 仅推送
            </button>
          </div>
        </div>

        <div className="px-4 py-3">
          <div className="text-[11px] text-white/50 mb-2 flex items-center justify-between">
            <span>同步记录</span>
            {selected && (
              <span className="text-white/40">→ {selected.name}</span>
            )}
          </div>
          {logs.length === 0 ? (
            <div className="text-xs text-white/40 py-4 text-center">
              {state.status === "connected"
                ? "在 AI 规划里新增或调整日程后会出现在这里"
                : "连接飞书后将记录每一次同步动作"}
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-44 overflow-auto pr-1">
              {logs.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    l.status === "ok" ? "bg-emerald-400" : l.status === "pending" ? "bg-amber-400" : "bg-rose-400"
                  }`} />
                  <span className="text-white/40 tabular-nums shrink-0">{fmtClock(l.at)}</span>
                  <span className="text-white/50 shrink-0">{opLabel(l.op)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                    l.source === "sylva" ? "bg-amber-glow/15 text-amber-glow" : "bg-sky-400/15 text-sky-300"
                  }`}>
                    {l.source === "sylva" ? "Sylva→飞书" : "飞书→Sylva"}
                  </span>
                  <span className="text-white/80 truncate">{l.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-start gap-1.5 text-[11px] text-white/40">
        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          当前为 Mock 模式：所有同步动作仅在本地模拟。拿到飞书 App ID / Secret 后，告诉我即可切到真接口。
        </span>
      </div>
    </div>
  );
}

function mkLog(op: SyncLog["op"], source: SyncLog["source"], title: string): SyncLog {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    op,
    source,
    title,
    status: "ok",
  };
}

function opLabel(op: SyncLog["op"]) {
  return op === "create" ? "新增" : op === "update" ? "更新" : op === "delete" ? "删除" : "拉取";
}

function fmtClock(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  return d.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
