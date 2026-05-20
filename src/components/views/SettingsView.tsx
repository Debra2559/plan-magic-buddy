import { useEffect, useMemo, useState } from "react";
import { Bell, Cloud, Palette, Keyboard, User, Info, Sparkles, Bot, Webhook, ChevronRight, ChevronDown, LogOut, Lightbulb, Wand2 } from "lucide-react";
import { ComicSettingsPanel } from "@/components/ComicSettingsPanel";
import { InsightsSettingsPanel } from "@/components/InsightsSettingsPanel";
import { FeishuSyncPanel } from "@/components/FeishuSyncPanel";
import { FeishuWebhookLogsPanel } from "@/components/FeishuWebhookLogsPanel";
import { AiPersonaPanel } from "@/components/AiPersonaPanel";
import { RemindersPanel } from "@/components/RemindersPanel";
import { useSylva } from "@/lib/sylva-store";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth-context";
import { usePersona } from "@/lib/persona";
import { useNavigate } from "@tanstack/react-router";


type SimpleRow = { label: string; value: string; action: string };

const simpleSections: Record<string, { rows: SimpleRow[] }> = {
  reminders: {
    rows: [
      { label: "桌面通知", value: "开启 · 不打扰：22:00 - 08:00", action: "调整" },
      { label: "AI 早安总结", value: "每天 7:30", action: "更改" },
    ],
  },
  appearance: {
    rows: [
      { label: "桌面壁纸", value: "Redwood Forest", action: "更换" },
      { label: "字体", value: "DM Serif · Plus Jakarta", action: "调整" },
    ],
  },
  shortcuts: {
    rows: [
      { label: "唤起 AI 输入", value: "⌘ + ⇧ + Space", action: "改键" },
      { label: "添加记录", value: "⌘ + N", action: "改键" },
    ],
  },
};

function AccountPanel() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const email = user?.email ?? (loading ? "加载中…" : "未登录");
  const provider = (user?.app_metadata?.provider as string | undefined) ?? "email";
  const providerLabel = provider === "google" ? "Google 账号" : provider === "email" ? "邮箱登录" : provider;
  const created = user?.created_at ? new Date(user.created_at).toLocaleDateString("zh-CN") : "—";

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="widget overflow-hidden divide-y divide-border/70">
      <div className="flex items-center px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-foreground">登录账户</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{email}</div>
        </div>
        {user && (
          <button
            onClick={handleSignOut}
            className="text-xs px-3 py-1 rounded-full bg-foreground/5 border border-border text-foreground/80 hover:bg-foreground/10 inline-flex items-center gap-1"
          >
            <LogOut className="w-3 h-3" />
            退出登录
          </button>
        )}
        {!user && !loading && (
          <button
            onClick={() => navigate({ to: "/login" })}
            className="text-xs px-3 py-1 rounded-full bg-amber-glow/20 border border-amber-glow/40 text-amber-glow hover:bg-amber-glow/30"
          >
            去登录
          </button>
        )}
      </div>
      <div className="flex items-center px-4 py-3">
        <div className="flex-1">
          <div className="text-sm text-foreground">登录方式</div>
          <div className="text-xs text-muted-foreground mt-0.5">{providerLabel}</div>
        </div>
      </div>
      <div className="flex items-center px-4 py-3">
        <div className="flex-1">
          <div className="text-sm text-foreground">注册时间</div>
          <div className="text-xs text-muted-foreground mt-0.5">{created}</div>
        </div>
      </div>
      <div className="flex items-center px-4 py-3">
        <div className="flex-1">
          <div className="text-sm text-foreground">界面语言</div>
          <div className="text-xs text-muted-foreground mt-0.5">简体中文</div>
        </div>
        <button className="text-xs px-3 py-1 rounded-full bg-foreground/5 border border-border text-foreground/80 hover:bg-foreground/10">切换</button>
      </div>
    </div>
  );
}


function RowList({ rows }: { rows: SimpleRow[] }) {
  return (
    <div className="widget overflow-hidden divide-y divide-border/70">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center px-4 py-3 hover:bg-foreground/[0.04]">
          <div className="flex-1">
            <div className="text-sm text-foreground">{row.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{row.value}</div>
          </div>
          <button className="text-xs px-3 py-1 rounded-full bg-foreground/5 border border-border text-foreground/80 hover:bg-foreground/10">
            {row.action}
          </button>
        </div>
      ))}
    </div>
  );
}

function DateFlashPanel() {
  const { dateFlashEnabled, setDateFlashEnabled, dateFlashDurationMs, setDateFlashDurationMs } = useSylva();
  return (
    <div className="widget overflow-hidden divide-y divide-border/70">
      <div className="flex items-center px-4 py-3">
        <div className="flex-1">
          <div className="text-sm text-foreground">切换日期时闪烁高亮</div>
          <div className="text-xs text-muted-foreground mt-0.5">选中日期卡片会短暂发光以确认定位</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={dateFlashEnabled}
          onClick={() => setDateFlashEnabled(!dateFlashEnabled)}
          className={`relative h-6 w-11 rounded-full transition border ${
            dateFlashEnabled
              ? "bg-amber-glow/40 border-amber-glow/60"
              : "bg-foreground/10 border-border"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              dateFlashEnabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      <div className={`px-4 py-3 ${!dateFlashEnabled ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-foreground">闪烁持续时间</div>
          <div className="text-xs text-muted-foreground tabular-nums">{(dateFlashDurationMs / 1000).toFixed(1)}s</div>
        </div>
        <input
          type="range"
          min={200}
          max={3000}
          step={100}
          value={dateFlashDurationMs}
          onChange={(e) => setDateFlashDurationMs(Number(e.target.value))}
          className="w-full accent-amber-glow"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/70 mt-1">
          <span>0.2s</span>
          <span>3.0s</span>
        </div>
      </div>
    </div>
  );
}

type NavKey = "general" | "persona" | "insights" | "comic" | "feishu" | "webhook" | "reminders" | "appearance" | "shortcuts" | "about";
type NavGroup = { label: string; items: { key: NavKey; title: string; icon: typeof User; subtitle?: string }[] };

const NAV: NavGroup[] = [
  {
    label: "账户",
    items: [
      { key: "general", title: "通用", icon: User },
      { key: "persona", title: "AI 人格", icon: Bot },
      { key: "insights", title: "AI 行为洞察", icon: Lightbulb },
      { key: "comic", title: "漫画生成", icon: Wand2 },
    ],
  },
  {
    label: "同步",
    items: [
      { key: "feishu", title: "飞书同步", icon: Cloud },
      { key: "webhook", title: "Webhook 日志", icon: Webhook },
    ],
  },
  {
    label: "外观与体验",
    items: [
      { key: "appearance", title: "外观", icon: Palette },
      { key: "reminders", title: "提醒", icon: Bell },
      { key: "shortcuts", title: "快捷键", icon: Keyboard },
    ],
  },
  {
    label: "其它",
    items: [
      { key: "about", title: "关于", icon: Info },
    ],
  },
];

const TITLES: Record<NavKey, { title: string; desc: string }> = {
  general: { title: "通用", desc: "账户、语言、主题等基础偏好" },
  persona: { title: "AI 人格", desc: "调整 AI 的说话风格与语气" },
  insights: { title: "AI 行为洞察", desc: "AI 根据你的日程、记录、习惯行为生成的贴心提示" },
  comic: { title: "漫画生成", desc: "选择默认图像模型与画面风格" },
  feishu: { title: "飞书同步", desc: "日历推送、接收人捕获与诊断" },
  webhook: { title: "Webhook 日志", desc: "查看最近的飞书事件回调" },
  reminders: { title: "提醒", desc: "桌面通知与每日总结" },
  appearance: { title: "外观", desc: "壁纸、字体、主题与手帐日期高亮" },
  shortcuts: { title: "快捷键", desc: "常用操作的键盘绑定" },
  about: { title: "关于", desc: "版本与项目信息" },
};

const ALL_KEYS = NAV.flatMap((g) => g.items.map((i) => i.key));
const STORAGE_KEY = "sylva:settings:expanded-groups";
const HASH_PREFIX = "#settings/";

function groupOfKey(key: NavKey): string {
  return NAV.find((g) => g.items.some((i) => i.key === key))?.label ?? NAV[0].label;
}

function readHashKey(): NavKey | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash;
  if (!h.startsWith(HASH_PREFIX)) return null;
  const k = h.slice(HASH_PREFIX.length) as NavKey;
  return ALL_KEYS.includes(k) ? k : null;
}

export function SettingsView() {
  const [active, setActive] = useState<NavKey>(() => readHashKey() ?? "general");
  const { persona } = usePersona();
  const aiName = (persona?.ai_nickname || "").trim() || "Sylva";
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV.forEach((g) => { initial[g.label] = true; });
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) Object.assign(initial, JSON.parse(raw));
      } catch { /* ignore */ }
    }
    // 保证当前激活项所在分组保持展开
    initial[groupOfKey(active)] = true;
    return initial;
  });

  const meta = TITLES[active];

  // 持久化展开状态
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded)); } catch { /* ignore */ }
  }, [expanded]);

  // active -> URL hash 同步
  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = `${HASH_PREFIX}${active}`;
    if (window.location.hash !== target) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${target}`);
    }
  }, [active]);

  // 监听浏览器前进后退 / 外部 hash 改变
  useEffect(() => {
    const onHash = () => {
      const k = readHashKey();
      if (k && k !== active) {
        setActive(k);
        setExpanded((prev) => ({ ...prev, [groupOfKey(k)]: true }));
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [active]);

  const select = (key: NavKey) => {
    setActive(key);
    setExpanded((prev) => ({ ...prev, [groupOfKey(key)]: true }));
  };

  const toggleGroup = (label: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      // 当前激活项所在分组不可折叠
      if (label === groupOfKey(active)) next[label] = true;
      return next;
    });
  };

  const renderContent = useMemo(() => {
    switch (active) {
      case "general": return <AccountPanel />;
      case "persona": return <AiPersonaPanel />;
      case "insights": return <InsightsSettingsPanel />;
      case "comic": return <ComicSettingsPanel />;
      case "feishu": return <FeishuSyncPanel />;
      case "webhook": return <FeishuWebhookLogsPanel />;
      case "reminders": return <RemindersPanel />;
      case "appearance": return (
        <div className="space-y-4">
          <div className="widget p-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-foreground">主题模式</div>
              <div className="text-xs text-muted-foreground mt-0.5">切换亮色 / 暗色外观</div>
            </div>
            <ThemeToggle />
          </div>
          <RowList rows={simpleSections.appearance.rows} />
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-2 px-1 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-glow" />
              手帐 · 日期高亮
            </div>
            <DateFlashPanel />
          </div>
        </div>
      );
      case "shortcuts": return <RowList rows={simpleSections.shortcuts.rows} />;
      case "about":
        return (
          <div className="widget p-5 text-sm text-foreground/80 space-y-2">
            <div className="text-foreground font-medium">Sylva v0.9.0</div>
            <div>像森林一样陪你长出节奏。</div>
            <div className="text-xs text-muted-foreground/70 pt-2">© Sylva — 私人 AI 工作台</div>
          </div>
        );
    }
  }, [active]);

  return (
    <div className="h-full overflow-hidden">
      <div className="h-full max-w-6xl mx-auto px-4 sm:px-6 py-6 flex gap-5">
        {/* 左侧导航 */}
        <aside className="w-56 shrink-0 hidden md:flex flex-col gap-5 overflow-y-auto pr-1">
          <div>
            <p className="text-[10px] tracking-widest text-amber-glow mb-1">偏好设置</p>
            <h2 className="font-display text-2xl text-foreground leading-tight">让 {aiName}<br/>长成你的样子。</h2>
          </div>
          <nav className="flex flex-col gap-3">
            {NAV.map((group) => {
              const isOpen = expanded[group.label] ?? true;
              const isActiveGroup = groupOfKey(active) === group.label;
              return (
                <div key={group.label}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    className="w-full flex items-center gap-1 px-2 mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground/70 hover:text-muted-foreground transition"
                  >
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"} ${
                        isActiveGroup ? "text-amber-glow/70" : ""
                      }`}
                    />
                    <span className="flex-1 text-left">{group.label}</span>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = active === item.key;
                        return (
                          <a
                            key={item.key}
                            href={`${HASH_PREFIX}${item.key}`}
                            onClick={(e) => { e.preventDefault(); select(item.key); }}
                            className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition border ${
                              isActive
                                ? "bg-foreground/[0.08] border-border text-foreground"
                                : "border-transparent text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
                            }`}
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-amber-glow" : "text-muted-foreground"}`} />
                            <span className="flex-1 text-left truncate">{item.title}</span>
                            {isActive && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70" />}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* 移动端：横向 Tab */}
        <div className="md:hidden absolute left-0 right-0 px-4">
          <select
            value={active}
            onChange={(e) => select(e.target.value as NavKey)}
            className="w-full bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
          >
            {NAV.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((i) => (
                  <option key={i.key} value={i.key}>{i.title}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* 右侧内容 */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <header className="mb-5 pb-4 border-b border-border/70">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{groupOfKey(active)}</div>
            <h3 className="font-display text-2xl text-foreground">{meta.title}</h3>
            <p className="text-xs text-muted-foreground mt-1">{meta.desc}</p>
          </header>
          <div className="pb-10">
            {renderContent}
          </div>
        </main>
      </div>
    </div>
  );
}
