import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getMyAdminStatus,
  adminListUsers,
  adminSetUserRole,
  adminDeleteUser,
  adminListContent,
  adminDeleteContent,
  adminGetSettings,
  adminUpdateSettings,
  adminGetStats,
  adminListLogs,
} from "@/lib/admin.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Shield,
  Users,
  Database,
  Settings as SettingsIcon,
  Activity,
  ChevronLeft,
  Trash2,
  ShieldCheck,
  ShieldOff,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  head: () => ({
    meta: [{ title: "Sylva 后台 · 超级管理员" }],
  }),
});

function AdminPage() {
  const checkAdmin = useServerFn(getMyAdminStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => checkAdmin({}),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e1014] text-foreground/75">
        正在验证管理员身份…
      </div>
    );
  }
  if (!data?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e1014] text-foreground/85">
        <div className="text-center space-y-4">
          <Shield className="w-10 h-10 mx-auto text-red-400" />
          <p>你没有访问后台的权限。</p>
          <Link to="/desktop" className="text-amber-glow underline text-sm">
            返回 Sylva
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e1014] text-foreground">
      <header className="border-b border-border/70 bg-background/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link to="/desktop" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="w-3.5 h-3.5" /> 返回桌面
          </Link>
          <div className="ml-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-glow" />
            <h1 className="font-display text-lg">Sylva 后台</h1>
          </div>
          <Badge variant="outline" className="ml-2 border-amber-glow/40 text-amber-glow text-[10px]">
            超级管理员
          </Badge>
          <span className="ml-auto text-[11px] text-muted-foreground/70 font-mono">{data.userId}</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-foreground/5 border border-border">
            <TabsTrigger value="overview"><Activity className="w-3.5 h-3.5 mr-1.5" />概览</TabsTrigger>
            <TabsTrigger value="users"><Users className="w-3.5 h-3.5 mr-1.5" />用户</TabsTrigger>
            <TabsTrigger value="content"><Database className="w-3.5 h-3.5 mr-1.5" />内容</TabsTrigger>
            <TabsTrigger value="settings"><SettingsIcon className="w-3.5 h-3.5 mr-1.5" />配置</TabsTrigger>
            <TabsTrigger value="logs"><Activity className="w-3.5 h-3.5 mr-1.5" />日志</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-5"><OverviewTab /></TabsContent>
          <TabsContent value="users" className="mt-5"><UsersTab currentUserId={data.userId} /></TabsContent>
          <TabsContent value="content" className="mt-5"><ContentTab /></TabsContent>
          <TabsContent value="settings" className="mt-5"><SettingsTab /></TabsContent>
          <TabsContent value="logs" className="mt-5"><LogsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ----------------- Overview -----------------

function OverviewTab() {
  const fn = useServerFn(adminGetStats);
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => fn({}),
  });
  const labels: Record<string, string> = {
    schedule_items: "日程",
    notes: "随手记",
    diary_entries: "日记",
    comics: "漫画",
    habits: "习惯",
    user_profiles: "用户资料",
    ai_news: "AI 新闻",
    hackathons: "黑客松",
    feishu_webhook_logs: "飞书日志",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">全站数据概览</p>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isRefetching ? "animate-spin" : ""}`} />刷新
        </Button>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground/70 text-sm">加载中…</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="注册用户" value={data?.totalUsers ?? "—"} accent />
          {data && Object.entries(data.counts).map(([k, v]) => (
            <StatCard key={k} label={labels[k] ?? k} value={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "bg-amber-glow/10 border-amber-glow/30" : "bg-foreground/5 border-border"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-display ${accent ? "text-amber-glow" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

// ----------------- Users -----------------

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const listFn = useServerFn(adminListUsers);
  const setRoleFn = useServerFn(adminSetUserRole);
  const delFn = useServerFn(adminDeleteUser);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listFn({}),
  });
  const setRole = useMutation({
    mutationFn: (v: { targetUserId: string; role: "admin" | "user"; grant: boolean }) =>
      setRoleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const del = useMutation({
    mutationFn: (targetUserId: string) => delFn({ data: { targetUserId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  if (isLoading) return <p className="text-muted-foreground/70 text-sm">加载中…</p>;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-foreground/5 text-muted-foreground text-xs">
          <tr>
            <th className="text-left px-3 py-2">用户</th>
            <th className="text-left px-3 py-2">角色</th>
            <th className="text-left px-3 py-2">注册</th>
            <th className="text-left px-3 py-2">最近登录</th>
            <th className="text-right px-3 py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {data?.users.map((u: any) => {
            const isAdmin = u.roles.includes("admin");
            const isSelf = u.id === currentUserId;
            return (
              <tr key={u.id} className="border-t border-border/70 hover:bg-white/3">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center text-[11px]">
                        {(u.display_name ?? u.email ?? "?").slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <div className="font-medium">{u.display_name ?? u.email ?? u.id}</div>
                      <div className="text-[11px] text-muted-foreground/80">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {isAdmin && <Badge className="bg-amber-glow/20 text-amber-glow border-amber-glow/40">admin</Badge>}
                    {u.roles.includes("user") && <Badge variant="outline" className="border-border text-muted-foreground">user</Badge>}
                    {u.roles.length === 0 && <span className="text-[11px] text-muted-foreground/60">—</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    {isAdmin ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isSelf || setRole.isPending}
                        onClick={() => setRole.mutate({ targetUserId: u.id, role: "admin", grant: false })}
                        title={isSelf ? "不能撤销自己" : "撤销管理员"}
                      >
                        <ShieldOff className="w-3.5 h-3.5 mr-1" />撤管理员
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={setRole.isPending}
                        onClick={() => setRole.mutate({ targetUserId: u.id, role: "admin", grant: true })}
                      >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" />设管理员
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                      disabled={isSelf || del.isPending}
                      onClick={() => {
                        if (confirm(`确定删除用户 ${u.email ?? u.id}？此操作不可撤销。`)) {
                          del.mutate(u.id);
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ----------------- Content -----------------

const CONTENT_TABS = [
  { key: "schedule_items", label: "日程" },
  { key: "notes", label: "随手记" },
  { key: "diary_entries", label: "日记" },
  { key: "comics", label: "漫画" },
  { key: "habits", label: "习惯" },
  { key: "canvas_documents", label: "画布" },
] as const;

function ContentTab() {
  const [active, setActive] = useState<(typeof CONTENT_TABS)[number]["key"]>("schedule_items");
  const listFn = useServerFn(adminListContent);
  const delFn = useServerFn(adminDeleteContent);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "content", active],
    queryFn: () => listFn({ data: { table: active, limit: 100 } }),
  });
  const del = useMutation({
    mutationFn: (input: any) => delFn({ data: { table: active, ...input } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "content", active] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {CONTENT_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-3 py-1 rounded-full text-xs border ${
              active === t.key
                ? "bg-amber-glow/20 text-amber-glow border-amber-glow/40"
                : "bg-foreground/5 text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <p className="p-4 text-muted-foreground/70 text-sm">加载中…</p>
        ) : !data?.rows.length ? (
          <p className="p-4 text-muted-foreground/70 text-sm">没有数据</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-foreground/5 text-muted-foreground text-xs">
              <tr>
                {Object.keys(data.rows[0]).map((k) => (
                  <th key={k} className="text-left px-3 py-2 whitespace-nowrap">{k}</th>
                ))}
                <th className="text-right px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row: any, i: number) => (
                <tr key={i} className="border-t border-border/70 hover:bg-white/3">
                  {Object.entries(row).map(([k, v]) => (
                    <td key={k} className="px-3 py-2 text-xs max-w-[260px] truncate text-foreground/80">
                      {typeof v === "string" && v.startsWith("http") ? (
                        <a href={v} target="_blank" rel="noreferrer" className="text-amber-glow underline">链接</a>
                      ) : (
                        String(v ?? "—")
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                      disabled={del.isPending}
                      onClick={() => {
                        if (!confirm("确认删除？")) return;
                        if (active === "diary_entries" || active === "comics") {
                          del.mutate({ compositeKey: { date: row.date, user_id: row.user_id } });
                        } else {
                          del.mutate({ id: row.id });
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ----------------- Settings -----------------

function SettingsTab() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <SettingsCard table="ai_news_settings" title="AI 新闻雷达" />
      <SettingsCard table="hackathon_settings" title="黑客松雷达" />
    </div>
  );
}

function SettingsCard({ table, title }: { table: "ai_news_settings" | "hackathon_settings"; title: string }) {
  const getFn = useServerFn(adminGetSettings);
  const updFn = useServerFn(adminUpdateSettings);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings", table],
    queryFn: () => getFn({ data: { table } }),
  });
  const upd = useMutation({
    mutationFn: (patch: any) => updFn({ data: { table, patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "settings", table] }),
  });
  const [interval, setInterval] = useState<string>("");

  if (isLoading) return <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground/70">加载中…</div>;
  const row: any = data?.row ?? {};

  return (
    <div className="rounded-xl border border-border bg-white/3 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display">{title}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          启用
          <Switch
            checked={!!row.enabled}
            onCheckedChange={(v) => upd.mutate({ enabled: v })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <Stat label="扫描间隔(小时)" value={row.scan_interval_hours} />
        <Stat label="数据源数量" value={Array.isArray(row.sources) ? row.sources.length : 0} />
        {table === "ai_news_settings" && (
          <>
            <Stat label="每源条数上限" value={row.per_source_limit} />
            <Stat label="时间窗口" value={row.time_window} />
          </>
        )}
        <Stat label="上次扫描" value={row.last_scanned_at ? new Date(row.last_scanned_at).toLocaleString() : "从未"} />
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={168}
          placeholder={`新扫描间隔（小时）当前 ${row.scan_interval_hours ?? "-"}`}
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          className="bg-background/50 border-border text-sm"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!interval || upd.isPending}
          onClick={() => {
            const n = Number(interval);
            if (!Number.isFinite(n) || n < 1) return;
            upd.mutate({ scan_interval_hours: Math.floor(n) });
            setInterval("");
          }}
        >
          保存
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground/70">
        数据源等复杂结构请到对应功能页（AI 新闻 / 黑客松）的编辑器里维护。
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg bg-background/50 border border-border/70 px-3 py-2">
      <div className="text-[10px] text-muted-foreground/80">{label}</div>
      <div className="text-white/85 truncate">{String(value ?? "—")}</div>
    </div>
  );
}

// ----------------- Logs -----------------

function LogsTab() {
  const fn = useServerFn(adminListLogs);
  const [level, setLevel] = useState<"all" | "info" | "warn" | "error">("all");
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin", "logs", level],
    queryFn: () => fn({ data: { level, limit: 200 } }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(["all", "info", "warn", "error"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={`px-3 py-1 rounded-full text-xs border ${
              level === l
                ? "bg-amber-glow/20 text-amber-glow border-amber-glow/40"
                : "bg-foreground/5 text-muted-foreground border-border"
            }`}
          >
            {l}
          </button>
        ))}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isRefetching ? "animate-spin" : ""}`} />刷新
        </Button>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <p className="p-4 text-muted-foreground/70 text-sm">加载中…</p>
        ) : !data?.rows.length ? (
          <p className="p-4 text-muted-foreground/70 text-sm">暂无日志</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-foreground/5 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">时间</th>
                <th className="text-left px-3 py-2">级别</th>
                <th className="text-left px-3 py-2">事件</th>
                <th className="text-left px-3 py-2">步骤</th>
                <th className="text-left px-3 py-2">耗时</th>
                <th className="text-left px-3 py-2">信息</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t border-border/70 hover:bg-white/3 align-top">
                  <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleTimeString()}</td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      r.level === "error" ? "bg-red-500/20 text-red-300" :
                      r.level === "warn" ? "bg-amber-500/20 text-amber-300" :
                      "bg-foreground/10 text-muted-foreground"
                    }`}>{r.level}</span>
                  </td>
                  <td className="px-3 py-1.5 text-foreground/75">{r.event_type ?? "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.step ?? "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.duration_ms ? `${r.duration_ms}ms` : "—"}</td>
                  <td className="px-3 py-1.5 text-foreground/80 max-w-[420px] truncate" title={r.error ?? r.message ?? ""}>
                    {r.error ?? r.message ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
