import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listFeishuWebhookLogs } from "@/lib/feishu-logs.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { toast } from "sonner";

type LogRow = {
  id: string;
  request_id: string;
  step: string;
  level: "info" | "warn" | "error";
  event_type: string | null;
  status: number | null;
  duration_ms: number | null;
  message: string | null;
  error: string | null;
  payload: any;
  created_at: string;
};

const levelStyle: Record<LogRow["level"], string> = {
  info: "bg-muted text-foreground",
  warn: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  error: "bg-destructive/15 text-destructive",
};

const STEP_LABEL: Record<string, { name: string; desc: string }> = {
  rx: { name: "接收", desc: "收到飞书回调（通常为加密负载）" },
  parse: { name: "解析", desc: "JSON 解析请求体" },
  decrypt: { name: "解密", desc: "用 ENCRYPT_KEY 解密 encrypt 字段" },
  url_verification: { name: "URL 校验", desc: "回应飞书 challenge" },
  dispatch: { name: "派发", desc: "按 event_type 路由到处理器" },
  handler: { name: "处理", desc: "业务处理（命令 / 卡片回调等）" },
  capture_open_id: { name: "捕获 open_id", desc: "记录发送者 open_id 以便后续推送" },
  ack: { name: "应答", desc: "返回 200 给飞书" },
  send_message: { name: "发送消息", desc: "调用飞书 API 发送消息" },
};

function stepMeta(step: string) {
  return STEP_LABEL[step] ?? { name: step, desc: "" };
}

// 简短摘要，避免直接展示加密 base64
function summarize(r: LogRow): string {
  if (r.error) return r.error;
  if (r.step === "rx") {
    const bytes = r.payload?.size ?? r.payload?.bytes ?? r.payload?.length;
    return bytes ? `已接收 ${bytes} 字节（加密）` : "已接收回调（加密）";
  }
  if (r.step === "decrypt" && r.level === "info") return "解密成功";
  if (r.step === "dispatch") return `派发：${r.event_type ?? "未知事件"}`;
  if (r.step === "ack") return `应答 ${r.status ?? 200}`;
  return r.message || "—";
}

type Thread = {
  request_id: string;
  startedAt: string;
  level: LogRow["level"];
  event_type: string | null;
  duration_ms: number | null;
  status: number | null;
  ok: boolean;
  rows: LogRow[];
};

function groupByRequest(rows: LogRow[]): Thread[] {
  const m = new Map<string, Thread>();
  // rows 来自后端按 created_at desc，按 request_id 聚合，组内按时间正序方便阅读
  for (const r of rows) {
    const key = r.request_id || r.id;
    let t = m.get(key);
    if (!t) {
      t = {
        request_id: key,
        startedAt: r.created_at,
        level: r.level,
        event_type: r.event_type,
        duration_ms: null,
        status: null,
        ok: true,
        rows: [],
      };
      m.set(key, t);
    }
    t.rows.push(r);
    if (r.event_type && !t.event_type) t.event_type = r.event_type;
    if (typeof r.duration_ms === "number") t.duration_ms = r.duration_ms;
    if (typeof r.status === "number") t.status = r.status;
    if (r.level === "error") { t.level = "error"; t.ok = false; }
    else if (r.level === "warn" && t.level !== "error") t.level = "warn";
    // 起始时间取最早一条
    if (new Date(r.created_at).getTime() < new Date(t.startedAt).getTime()) t.startedAt = r.created_at;
  }
  for (const t of m.values()) t.rows.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  return Array.from(m.values()).sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
}

export function FeishuWebhookLogsPanel() {
  const fetchLogs = useServerFn(listFeishuWebhookLogs);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState<"all" | "info" | "warn" | "error">("all");
  const [requestId, setRequestId] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const sendTest = async () => {
    setTesting(true);
    const challenge = `test-${Date.now().toString(36)}`;
    try {
      const res = await fetch("/api/public/feishu/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "url_verification", challenge, token: "test", uuid: `test-${challenge}` }),
      });
      const text = await res.text();
      if (res.ok && text.includes(challenge)) {
        toast.success("测试回调已发送 ✓", { description: "刷新查看日志" });
      } else {
        toast.error("测试失败", { description: `HTTP ${res.status} · ${text.slice(0, 120)}` });
      }
      // 等数据库写入，再刷新
      setTimeout(() => refresh(), 600);
    } catch (e: any) {
      toast.error("测试失败", { description: e?.message ?? "网络错误" });
    } finally {
      setTesting(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchLogs({
        data: { limit: 100, level, requestId: requestId.trim() || undefined },
      });
      setRows((res.rows ?? []) as LogRow[]);
      if (res.error) setErr(res.error);
    } catch (e: any) {
      setErr(e?.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  const errorCount = useMemo(() => rows.filter((r) => r.level === "error").length, [rows]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">飞书 Webhook 日志</h3>
          <p className="text-xs text-muted-foreground">
            记录每次回调的接收 / 解密 / 派发 / 处理结果，便于排查 — 最近 100 条
            {errorCount > 0 && (
              <span className="ml-2 text-destructive">· 错误 {errorCount}</span>
            )}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={level} onValueChange={(v: any) => setLevel(v)}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部级别</SelectItem>
            <SelectItem value="error">仅错误</SelectItem>
            <SelectItem value="warn">仅警告</SelectItem>
            <SelectItem value="info">仅信息</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={requestId}
          onChange={(e) => setRequestId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && refresh()}
          placeholder="按 request_id 过滤"
          className="h-8 text-xs flex-1 min-w-[180px]"
        />
        <Button size="sm" variant="outline" onClick={sendTest} disabled={testing}>
          <Zap className={`h-3.5 w-3.5 mr-1 ${testing ? "animate-pulse" : ""}`} />
          测试一次
        </Button>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          刷新
        </Button>
      </div>




      {err && (
        <div className="text-xs text-destructive bg-destructive/10 rounded p-2">{err}</div>
      )}

      <div className="border border-border rounded overflow-hidden">
        {rows.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 text-center">
            {loading ? "加载中…" : "暂无日志"}
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[480px] overflow-auto">
            {groupByRequest(rows).map((t) => {
              const tOpen = expanded[t.request_id] ?? false;
              return (
                <div key={t.request_id} className="text-xs">
                  {/* 会话标题：一个 request_id 一组 */}
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => ({ ...s, [t.request_id]: !tOpen }))}
                    className="w-full flex items-center gap-2 p-2 hover:bg-muted/50 text-left"
                  >
                    {tOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    <Badge variant="outline" className={`${levelStyle[t.level]} text-[10px] px-1.5 py-0`}>
                      {t.ok ? "成功" : t.level === "error" ? "失败" : "警告"}
                    </Badge>
                    <span className="font-medium shrink-0">{t.event_type ?? "—"}</span>
                    <span className="flex-1 truncate text-muted-foreground">
                      共 {t.rows.length} 步 · {summarize(t.rows[t.rows.length - 1])}
                    </span>
                    {typeof t.duration_ms === "number" && (
                      <span className="text-muted-foreground shrink-0">{t.duration_ms}ms</span>
                    )}
                    <span className="text-muted-foreground shrink-0">
                      {new Date(t.startedAt).toLocaleTimeString()}
                    </span>
                  </button>

                  {/* 步骤时间线 */}
                  {tOpen && (
                    <div className="px-3 pb-3 pt-1 bg-muted/20 space-y-2">
                      <div className="font-mono text-[10px] text-muted-foreground break-all">
                        request_id: {t.request_id}
                      </div>
                      <ol className="relative border-l border-border/70 ml-2 pl-3 space-y-2">
                        {t.rows.map((r, idx) => {
                          const meta = stepMeta(r.step);
                          const rowOpen = expanded[r.id] ?? false;
                          const prev = idx > 0 ? t.rows[idx - 1] : null;
                          const delta = prev ? +new Date(r.created_at) - +new Date(prev.created_at) : 0;
                          return (
                            <li key={r.id} className="relative">
                              <span
                                className={`absolute -left-[17px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                                  r.level === "error"
                                    ? "bg-destructive"
                                    : r.level === "warn"
                                    ? "bg-yellow-500"
                                    : "bg-foreground/60"
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => setExpanded((s) => ({ ...s, [r.id]: !rowOpen }))}
                                className="w-full flex items-baseline gap-2 text-left hover:bg-muted/40 rounded px-1.5 py-1"
                              >
                                <span className="font-medium text-foreground shrink-0">{meta.name}</span>
                                <span className="text-muted-foreground/80 shrink-0 text-[10px]">{meta.desc}</span>
                                <span className="flex-1 truncate">{summarize(r)}</span>
                                {delta > 0 && (
                                  <span className="text-muted-foreground shrink-0 text-[10px]">+{delta}ms</span>
                                )}
                                <span className="text-muted-foreground shrink-0 text-[10px]">
                                  {new Date(r.created_at).toLocaleTimeString()}
                                </span>
                              </button>
                              {rowOpen && (
                                <div className="mt-1 space-y-2 pl-1.5">
                                  {r.error && (
                                    <pre className="text-[11px] text-destructive whitespace-pre-wrap break-all bg-destructive/5 p-2 rounded">
                                      {r.error}
                                    </pre>
                                  )}
                                  {r.payload && (
                                    <pre className="text-[11px] whitespace-pre-wrap break-all bg-background p-2 rounded border border-border max-h-64 overflow-auto">
                                      {JSON.stringify(r.payload, null, 2)}
                                    </pre>
                                  )}
                                  {!r.error && !r.payload && (
                                    <div className="text-[10px] text-muted-foreground">无附加数据</div>
                                  )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
