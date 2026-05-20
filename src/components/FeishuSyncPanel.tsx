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
  pullFromFeishu,
  recordPulledMappings,
  getFeishuNotifyConfig,
  setFeishuNotifyConfig,
  testHackathonNotify,
  getDailyRecapConfig,
  setDailyRecapConfig,
  sendDailyRecapNow,
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
  Download,
  Bell,
  Send,
  XCircle,
  CheckCircle2,
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
const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Asia/Shanghai", label: "北京 / 上海 (UTC+8)" },
  { value: "Asia/Hong_Kong", label: "香港 (UTC+8)" },
  { value: "Asia/Taipei", label: "台北 (UTC+8)" },
  { value: "Asia/Tokyo", label: "东京 (UTC+9)" },
  { value: "Asia/Seoul", label: "首尔 (UTC+9)" },
  { value: "Asia/Singapore", label: "新加坡 (UTC+8)" },
  { value: "Asia/Bangkok", label: "曼谷 (UTC+7)" },
  { value: "Asia/Kolkata", label: "新德里 (UTC+5:30)" },
  { value: "Asia/Dubai", label: "迪拜 (UTC+4)" },
  { value: "Europe/London", label: "伦敦 (UTC+0/+1)" },
  { value: "Europe/Paris", label: "巴黎 / 柏林 (UTC+1/+2)" },
  { value: "Europe/Moscow", label: "莫斯科 (UTC+3)" },
  { value: "America/New_York", label: "纽约 (UTC-5/-4)" },
  { value: "America/Chicago", label: "芝加哥 (UTC-6/-5)" },
  { value: "America/Denver", label: "丹佛 (UTC-7/-6)" },
  { value: "America/Los_Angeles", label: "洛杉矶 (UTC-8/-7)" },
  { value: "America/Sao_Paulo", label: "圣保罗 (UTC-3)" },
  { value: "Australia/Sydney", label: "悉尼 (UTC+10/+11)" },
  { value: "Pacific/Auckland", label: "奥克兰 (UTC+12/+13)" },
  { value: "UTC", label: "UTC" },
];


export function FeishuSyncPanel() {
  const { items, addItems } = useSylva();
  const [state, setState] = useState<Persisted>(loadPersisted);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const lastItemSignature = useRef<string>("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [calendars, setCalendars] = useState<RealCalendar[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [calendarsError, setCalendarsError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);

  const runTest = useServerFn(testFeishuConnection);
  const runList = useServerFn(listFeishuCalendars);
  const runGetSettings = useServerFn(getFeishuSettings);
  const runSelect = useServerFn(selectFeishuCalendar);
  const runSetDir = useServerFn(setFeishuDirection);
  const runSync = useServerFn(syncToFeishu);
  const runPull = useServerFn(pullFromFeishu);
  const runRecord = useServerFn(recordPulledMappings);
  const runGetNotify = useServerFn(getFeishuNotifyConfig);
  const runSetNotify = useServerFn(setFeishuNotifyConfig);
  const runTestNotify = useServerFn(testHackathonNotify);
  const runGetRecap = useServerFn(getDailyRecapConfig);
  const runSetRecap = useServerFn(setDailyRecapConfig);
  const runSendRecapNow = useServerFn(sendDailyRecapNow);

  const [notify, setNotify] = useState<{
    receiveId: string;
    receiveIdType: "open_id" | "chat_id" | "user_id" | "email";
    notifyOnDiscover: boolean;
    notifyOnAccept: boolean;
  }>({ receiveId: "", receiveIdType: "open_id", notifyOnDiscover: true, notifyOnAccept: true });
  const [notifySaved, setNotifySaved] = useState(false);
  const [notifySending, setNotifySending] = useState(false);
  const [notifyResult, setNotifyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [recap, setRecap] = useState<{ enabled: boolean; hour: number; timezone: string }>({ enabled: false, hour: 21, timezone: "Asia/Shanghai" });
  const [recapSaved, setRecapSaved] = useState(false);
  const [recapSending, setRecapSending] = useState(false);
  const [recapResult, setRecapResult] = useState<{ ok: boolean; msg: string } | null>(null);

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

  const doPull = useCallback(async () => {
    if (!state.calendarId) return;
    setPulling(true);
    try {
      const r = await runPull();
      if (!r.ok) {
        setLogs((prev) => [mkLog("pull", "feishu", `拉取失败: ${r.error}`, "conflict"), ...prev].slice(0, 12));
        return;
      }
      if (r.newItems.length === 0) {
        setLogs((prev) => [mkLog("pull", "feishu", `无新事件 (共 ${r.total} 条)`, "ok"), ...prev].slice(0, 12));
        return;
      }
      // 用 feishu_event_id 当本地 id，方便和映射表对齐
      const itemsToAdd = r.newItems.map((it) => ({
        id: `fs-${it._feishuEventId}`,
        type: it.type,
        title: it.title,
        date: it.date,
        time: it.time,
        durationMin: it.durationMin,
        tag: it.tag,
        note: it.note,
      }));
      addItems(itemsToAdd as any);
      // 写映射表，防止下次推送时重复
      await runRecord({
        data: {
          calendarId: r.calendarId,
          records: r.newItems.map((it) => ({
            localId: `fs-${it._feishuEventId}`,
            feishuEventId: it._feishuEventId,
          })),
        },
      });
      // 更新签名，避免触发自动推送
      lastItemSignature.current = "";
      const newLogs = itemsToAdd.slice(0, 6).map((it) =>
        mkLog("create", "feishu", it.title, "ok")
      );
      if (r.newItems.length > 6) {
        newLogs.push(mkLog("pull", "feishu", `… 还有 ${r.newItems.length - 6} 条`, "ok"));
      }
      setLogs((prev) => [...newLogs, ...prev].slice(0, 12));
    } catch (e: any) {
      setLogs((prev) => [mkLog("pull", "feishu", `拉取异常: ${e?.message ?? e}`, "conflict"), ...prev].slice(0, 12));
    } finally {
      setPulling(false);
    }
  }, [state.calendarId, runPull, runRecord, addItems]);

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
          status: s.selectedCalendarId ? "connected" : prev.status,
        }));
      } catch {}
      try {
        const n = await runGetNotify();
        setNotify(n);
      } catch {}
      try {
        const rc = await runGetRecap();
        setRecap(rc);
      } catch {}
      loadCalendars();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveNotify = async () => {
    try {
      await runSetNotify({ data: notify });
      setNotifySaved(true);
      setTimeout(() => setNotifySaved(false), 1500);
    } catch (e: any) {
      setNotifyResult({ ok: false, msg: e?.message ?? "保存失败" });
    }
  };

  const saveRecap = async (next?: { enabled: boolean; hour: number; timezone: string }) => {
    const payload = next ?? recap;
    try {
      await runSetRecap({ data: payload });
      setRecapSaved(true);
      setTimeout(() => setRecapSaved(false), 1500);
    } catch (e: any) {
      setRecapResult({ ok: false, msg: e?.message ?? "保存失败" });
    }
  };

  const sendRecapNow = async () => {
    setRecapSending(true);
    setRecapResult(null);
    try {
      const r = await runSendRecapNow();
      setRecapResult(r.ok ? { ok: true, msg: "已发送提醒卡片" } : { ok: false, msg: r.error ?? "发送失败" });
    } catch (e: any) {
      setRecapResult({ ok: false, msg: e?.message ?? "发送失败" });
    } finally {
      setRecapSending(false);
    }
  };


  const sendTestNotify = async () => {
    setNotifySending(true);
    setNotifyResult(null);
    try {
      await runSetNotify({ data: notify });
      const r = await runTestNotify();
      setNotifyResult(r.ok ? { ok: true, msg: "已发送测试卡片到飞书" } : { ok: false, msg: r.error ?? "发送失败" });
    } catch (e: any) {
      setNotifyResult({ ok: false, msg: e?.message ?? "发送失败" });
    } finally {
      setNotifySending(false);
    }
  };


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
    setState((s) => ({ ...s, calendarId: c.id, status: "connected" }));
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

  // 本地有变化时，debounce 1.5s 后自动推到飞书
  useEffect(() => {
    const sig = items.map((i) => `${i.id}:${i.title}:${i.date}:${i.time ?? ""}:${i.done ? 1 : 0}`).join("|");
    if (lastItemSignature.current === "") {
      lastItemSignature.current = sig;
      return;
    }
    if (sig === lastItemSignature.current) return;
    lastItemSignature.current = sig;

    if (!state.calendarId) return;
    const t = setTimeout(() => {
      doSync("自动同步");
    }, 1500);
    return () => clearTimeout(t);
  }, [items, state.calendarId, doSync]);

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
    await doSync("立即同步");
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
                <div className="text-sm text-white/90 truncate">
                  {selected ? selected.name : "已选日历"}
                </div>
                <div className="text-[11px] text-white/50">
                  {state.lastSyncAt ? `上次同步 ${fmtTime(state.lastSyncAt)}` : "尚未同步"}
                  {syncing && <span className="ml-2 text-amber-glow/80">同步中…</span>}
                </div>
              </div>
              <button
                onClick={doPull}
                disabled={pulling}
                className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 disabled:opacity-50 flex items-center gap-1.5"
                title="从飞书拉取选中日历的事件到本地"
              >
                {pulling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                拉取
              </button>
              <button
                onClick={syncNow}
                disabled={syncing}
                className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 disabled:opacity-50 flex items-center gap-1.5"
              >
                {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                立即同步
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
                <div className="text-sm text-white/90">从下方挑一个飞书日历开始同步</div>
                <div className="text-[11px] text-white/50">选中后会自动把本地日程推到该日历</div>
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

      {/* 黑客松通知配置 */}
      <div className="widget mt-3 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="w-3.5 h-3.5 text-amber-glow" />
          <h4 className="text-sm text-white/90">黑客松雷达 · 飞书推送</h4>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <select
            value={notify.receiveIdType}
            onChange={(e) => setNotify({ ...notify, receiveIdType: e.target.value as any })}
            className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-white/80 outline-none"
          >
            <option value="open_id">open_id</option>
            <option value="user_id">user_id</option>
            <option value="chat_id">chat_id</option>
            <option value="email">email</option>
          </select>
          <input
            value={notify.receiveId}
            onChange={(e) => setNotify({ ...notify, receiveId: e.target.value })}
            placeholder="接收人 ID（推荐 open_id 或群 chat_id）"
            className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-white/90 placeholder:text-white/30 outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px] text-white/70">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={notify.notifyOnDiscover} onChange={(e) => setNotify({ ...notify, notifyOnDiscover: e.target.checked })} /> 发现新比赛时推送
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={notify.notifyOnAccept} onChange={(e) => setNotify({ ...notify, notifyOnAccept: e.target.checked })} /> 加入日程后推回执
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveNotify} className="text-[11px] px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80 hover:bg-white/10">
            {notifySaved ? "已保存 ✓" : "保存"}
          </button>
          <button
            onClick={sendTestNotify}
            disabled={notifySending || !notify.receiveId}
            className="text-[11px] px-3 py-1 rounded-full bg-amber-glow/90 text-primary-foreground font-medium hover:brightness-110 disabled:opacity-50 flex items-center gap-1"
          >
            {notifySending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} 发送测试卡片
          </button>
          {notifyResult && (
            <span className={`text-[11px] ${notifyResult.ok ? "text-emerald-300" : "text-rose-300"}`}>
              {notifyResult.ok ? "✓ " : "✗ "}{notifyResult.msg}
            </span>
          )}
        </div>
        <p className="text-[10px] text-white/40 mt-2 leading-relaxed">
          飞书后台需为应用开启 <code>im:message</code> 权限，并把「事件订阅 · 卡片回调」指向 <code>/api/public/feishu/webhook</code>。点击卡片「参加」会自动加入选中日历的日程。
        </p>
      </div>

      {/* 每日小结提醒 */}
      <div className="widget mt-3 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="w-3.5 h-3.5 text-indigo-300" />
          <h4 className="text-sm text-white/90">每日小结提醒</h4>
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px] text-white/70">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={recap.enabled}
              onChange={(e) => {
                const next = { ...recap, enabled: e.target.checked };
                setRecap(next);
                saveRecap(next);
              }}
            /> 每天定时提醒填写今日小结 + 日记
          </label>
          <label className="flex items-center gap-1.5">
            时间
            <select
              value={recap.hour}
              onChange={(e) => {
                const next = { ...recap, hour: Number(e.target.value) };
                setRecap(next);
                saveRecap(next);
              }}
              className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-white/80 outline-none"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            时区
            <select
              value={recap.timezone}
              onChange={(e) => {
                const next = { ...recap, timezone: e.target.value };
                setRecap(next);
                saveRecap(next);
              }}
              className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-white/80 outline-none max-w-[200px]"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
              {!TIMEZONE_OPTIONS.some((t) => t.value === recap.timezone) && (
                <option value={recap.timezone}>{recap.timezone}（自定义）</option>
              )}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => saveRecap()}
            className="text-[11px] px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
          >
            {recapSaved ? "已保存 ✓" : "保存"}
          </button>
          <button
            onClick={sendRecapNow}
            disabled={recapSending || !notify.receiveId}
            className="text-[11px] px-3 py-1 rounded-full bg-indigo-400/90 text-primary-foreground font-medium hover:brightness-110 disabled:opacity-50 flex items-center gap-1"
          >
            {recapSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} 立即发送一次
          </button>
          {recapResult && (
            <span className={`text-[11px] ${recapResult.ok ? "text-emerald-300" : "text-rose-300"}`}>
              {recapResult.ok ? "✓ " : "✗ "}{recapResult.msg}
            </span>
          )}
        </div>
        <p className="text-[10px] text-white/40 mt-2 leading-relaxed">
          每天到点会通过飞书发一张卡片，点「去 Sylva 填写」直接跳到「随手记 · 今日小结/日记」。复用上方的接收人配置。
        </p>
      </div>




      <div className="mt-2 flex items-start gap-1.5 text-[11px] text-white/40">
        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          已接入真接口：本地新增/修改/删除 1.5 秒后自动推到飞书；点「拉取」把飞书最近 60 天事件抓回本地（实时回流需另配 Encrypt Key + 订阅事件）。
        </span>
      </div>
    </div>
  );
}

function mkLog(
  op: SyncLog["op"],
  source: SyncLog["source"],
  title: string,
  status: SyncLog["status"] = "ok"
): SyncLog {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    op,
    source,
    title,
    status,
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
