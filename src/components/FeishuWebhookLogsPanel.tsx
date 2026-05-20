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
            {rows.map((r) => {
              const isOpen = expanded[r.id];
              return (
                <div key={r.id} className="text-xs">
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => ({ ...s, [r.id]: !isOpen }))}
                    className="w-full flex items-center gap-2 p-2 hover:bg-muted/50 text-left"
                  >
                    {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    <Badge variant="outline" className={`${levelStyle[r.level]} text-[10px] px-1.5 py-0`}>
                      {r.level}
                    </Badge>
                    <span className="font-mono text-muted-foreground shrink-0">{r.step}</span>
                    {r.event_type && (
                      <span className="font-mono text-muted-foreground shrink-0 truncate max-w-[180px]">
                        {r.event_type}
                      </span>
                    )}
                    <span className="flex-1 truncate">{r.message || r.error || "—"}</span>
                    {typeof r.duration_ms === "number" && (
                      <span className="text-muted-foreground shrink-0">{r.duration_ms}ms</span>
                    )}
                    <span className="text-muted-foreground shrink-0">
                      {new Date(r.created_at).toLocaleTimeString()}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 space-y-2 bg-muted/30">
                      <div className="font-mono text-[10px] text-muted-foreground break-all">
                        request_id: {r.request_id}
                      </div>
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
