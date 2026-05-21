import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listPendingHackathons,
  acceptHackathon,
  dismissHackathon,
  scanHackathonsNow,
  getHackathonSettings,
  updateHackathonSettings,
  planMonitoringSources,
  type HackathonRow,
  type HackathonSettings,
} from "@/lib/hackathons.functions";
import { useSylva } from "@/lib/sylva-store";
import {
  Trophy, X, Check, RefreshCw, Loader2, ExternalLink, MapPin, Calendar as CalIcon, Gift,
  Settings as SettingsIcon, Save, Sparkles, Plus, Clock,
} from "lucide-react";
import { SourcesEditor } from "@/components/SourcesEditor";

type PlannedSource = { name: string; query: string; rationale: string; enabled: boolean };
type SourcePlan = {
  topic: string;
  summary: string;
  update_rhythm: string;
  suggested_interval_hours: number;
  sources: PlannedSource[];
  tips: string[];
};

export function HackathonInbox() {
  const { addItems } = useSylva();
  const [items, setItems] = useState<HackathonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<HackathonSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const listFn = useServerFn(listPendingHackathons);
  const acceptFn = useServerFn(acceptHackathon);
  const dismissFn = useServerFn(dismissHackathon);
  const scanFn = useServerFn(scanHackathonsNow);
  const getSettingsFn = useServerFn(getHackathonSettings);
  const updateSettingsFn = useServerFn(updateHackathonSettings);
  const planSourcesFn = useServerFn(planMonitoringSources);

  // —— AI 主题来源规划 Agent 状态 ——
  const [topic, setTopic] = useState("");
  const [topicNotes, setTopicNotes] = useState("");
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<SourcePlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planSelected, setPlanSelected] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listFn();
      if (r.ok) setItems(r.items);
      else setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [listFn]);

  useEffect(() => { void load(); }, [load]);

  const openSettings = async () => {
    setSettingsOpen(true);
    if (settings) return;
    try {
      const r = await getSettingsFn();
      if (r.ok && r.settings) setSettings(r.settings);
      else if (!r.ok) setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const cleaned = settings.sources
        .map((s) => ({ ...s, name: s.name.trim(), query: s.query.trim() }))
        .filter((s) => s.name && s.query);
      const r = await updateSettingsFn({
        data: {
          enabled: settings.enabled,
          sources: cleaned,
          scan_interval_hours: settings.scan_interval_hours,
        },
      });
      if (r.ok) {
        setSettings(r.settings);
        setSettingsOpen(false);
      } else {
        setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onScan = async () => {
    setScanning(true);
    setError(null);
    try {
      await scanFn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  const onAccept = async (id: string) => {
    setBusyId(id);
    try {
      const r = await acceptFn({ data: { id } });
      if (r.ok) {
        addItems(r.items);
        setItems((prev) => prev.filter((i) => i.id !== id));
      } else {
        setError(r.error);
      }
    } finally {
      setBusyId(null);
    }
  };

  const onDismiss = async (id: string) => {
    setBusyId(id);
    try {
      const r = await dismissFn({ data: { id } });
      if (r.ok) setItems((prev) => prev.filter((i) => i.id !== id));
      else setError(r.error);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="widget p-5">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 text-left">
          <Trophy className="w-4 h-4 text-amber-glow" />
          <span className="text-xs tracking-wider text-amber-glow">黑客松雷达</span>
          {items.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-glow/20 text-amber-glow">
              {items.length} 个待决定
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={openSettings}
            className="flex items-center gap-1 text-[11px] text-foreground/60 hover:text-amber-glow transition"
            title="雷达设置"
          >
            <SettingsIcon className="w-3 h-3" /> 设置
          </button>
          <button
            onClick={onScan}
            disabled={scanning}
            className="flex items-center gap-1 text-[11px] text-foreground/60 hover:text-foreground transition disabled:opacity-40"
            title="立即扫描"
          >
            {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {scanning ? "扫描中" : "扫描"}
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div className="mb-4 p-4 rounded-xl bg-foreground/5 border border-amber-glow/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs tracking-wider text-amber-glow flex items-center gap-1.5">
              <SettingsIcon className="w-3.5 h-3.5" /> 黑客松雷达设置
            </span>
            <button onClick={() => setSettingsOpen(false)} className="text-foreground/50 hover:text-foreground transition">
              <X className="w-4 h-4" />
            </button>
          </div>

          {!settings ? (
            <div className="text-xs text-muted-foreground py-3 text-center">
              <Loader2 className="w-4 h-4 animate-spin inline-block mr-1" /> 加载中…
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-foreground/60">扫描状态</span>
                <button
                  onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                    settings.enabled
                      ? "bg-amber-glow/15 border-amber-glow/40 text-amber-glow"
                      : "bg-foreground/5 border-foreground/15 text-foreground/40"
                  }`}
                >
                  {settings.enabled ? "● 自动扫描中" : "○ 已暂停"}
                </button>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-foreground/60">扫描频率</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={settings.scan_interval_hours}
                  onChange={(e) =>
                    setSettings({ ...settings, scan_interval_hours: Math.max(1, Math.min(168, Number(e.target.value) || 24)) })
                  }
                  className="w-16 bg-background/40 border border-foreground/15 rounded px-2 py-0.5 text-[12px] text-foreground focus:border-amber-glow/50 focus:outline-none"
                />
                <span className="text-foreground/50">小时一次</span>
              </div>

              {/* —— 🤖 AI 主题来源规划 Agent —— */}
              <div className="rounded-xl border border-amber-glow/20 bg-amber-glow/5 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] text-amber-glow">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="tracking-wider">AI 监控规划师</span>
                  <span className="text-foreground/40 ml-1">告诉我主题，我自动调研来源、关键词和扫描频率</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="新主题，例如：徒步 / 马拉松 / 飞盘 / AI Agent 论文"
                    className="bg-background/40 border border-foreground/15 rounded px-2 py-1.5 text-[12px] text-foreground placeholder:text-foreground/30 focus:border-amber-glow/50 focus:outline-none"
                  />
                  <input
                    value={topicNotes}
                    onChange={(e) => setTopicNotes(e.target.value)}
                    placeholder="可选: 你的偏好补充, 例如「优先国内, 关注成都周边」"
                    className="bg-background/40 border border-foreground/10 rounded px-2 py-1 text-[11px] text-foreground placeholder:text-foreground/25 focus:border-amber-glow/40 focus:outline-none"
                  />
                  <button
                    onClick={async () => {
                      if (!topic.trim()) return;
                      setPlanning(true);
                      setPlanError(null);
                      setPlan(null);
                      try {
                        const r = await planSourcesFn({ data: { topic: topic.trim(), notes: topicNotes.trim() || undefined } });
                        if (r.ok && r.plan) {
                          setPlan(r.plan as SourcePlan);
                          // 默认全选
                          const sel: Record<number, boolean> = {};
                          r.plan.sources.forEach((_, i) => { sel[i] = true; });
                          setPlanSelected(sel);
                        } else {
                          setPlanError(r.ok ? "AI 未返回有效计划" : r.error);
                        }
                      } catch (e) {
                        setPlanError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setPlanning(false);
                      }
                    }}
                    disabled={planning || !topic.trim()}
                    className="self-start flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] bg-amber-glow/20 border border-amber-glow/40 text-amber-glow hover:bg-amber-glow/30 transition disabled:opacity-40"
                  >
                    {planning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {planning ? "AI 调研中, 约 10-20 秒…" : "让 AI 规划这个主题"}
                  </button>
                </div>
                {planError && (
                  <div className="text-[11px] text-destructive">{planError}</div>
                )}
                {plan && settings && (
                  <div className="space-y-2 pt-1 border-t border-amber-glow/15">
                    <div className="text-[11px] text-foreground/75 leading-relaxed">
                      <span className="text-amber-glow">{plan.topic} · </span>{plan.summary}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-foreground/70">
                      <Clock className="w-3 h-3 text-amber-glow" />
                      <span>建议每 <b className="text-amber-glow">{plan.suggested_interval_hours}h</b> 扫一次 · {plan.update_rhythm}</span>
                      <button
                        onClick={() => setSettings({ ...settings, scan_interval_hours: plan.suggested_interval_hours })}
                        className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-glow/15 border border-amber-glow/30 text-amber-glow hover:bg-amber-glow/25"
                      >
                        应用频率
                      </button>
                    </div>
                    <div className="space-y-1 max-h-[200px] overflow-auto pr-1">
                      {plan.sources.map((s, i) => (
                        <label
                          key={i}
                          className="flex items-start gap-2 p-1.5 rounded-lg bg-background/30 border border-foreground/10 cursor-pointer hover:border-amber-glow/30 transition"
                        >
                          <input
                            type="checkbox"
                            checked={planSelected[i] ?? true}
                            onChange={(e) => setPlanSelected({ ...planSelected, [i]: e.target.checked })}
                            className="mt-0.5 accent-amber-glow"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] text-foreground font-medium">{s.name}</div>
                            <div className="text-[10px] text-foreground/50 font-mono break-all">{s.query}</div>
                            <div className="text-[10px] text-foreground/55 italic">{s.rationale}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    {plan.tips.length > 0 && (
                      <div className="text-[10px] text-foreground/55 space-y-0.5">
                        {plan.tips.map((t, i) => <div key={i}>· {t}</div>)}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        const picked = plan.sources
                          .filter((_, i) => planSelected[i] ?? true)
                          .map((s) => ({ name: s.name, query: s.query, enabled: s.enabled !== false }));
                        if (picked.length === 0) return;
                        // 去重 (按 query)
                        const existing = new Set(settings.sources.map((x) => x.query));
                        const additions = picked.filter((s) => !existing.has(s.query));
                        setSettings({ ...settings, sources: [...settings.sources, ...additions] });
                        setPlan(null);
                        setTopic("");
                        setTopicNotes("");
                      }}
                      className="w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-[11px] bg-amber-glow text-background hover:scale-[1.01] transition"
                    >
                      <Plus className="w-3 h-3" /> 一键加入选中来源
                    </button>
                  </div>
                )}
              </div>

              <SourcesEditor
                sources={settings.sources}
                onChange={(next) => setSettings({ ...settings, sources: next })}
                queryPlaceholder="搜索关键词，例：site:devpost.com hackathon"
              />


              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="px-3 py-1.5 rounded-full text-xs bg-foreground/5 border border-foreground/10 text-foreground/60 hover:bg-foreground/10"
                >
                  取消
                </button>
                <button
                  onClick={onSaveSettings}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-amber-glow text-background hover:scale-[1.02] transition disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  保存
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!collapsed && (
        <>
          <p className="text-[11px] text-muted-foreground mb-3">
            每天早 9 点自动从 Devpost / MLH / DoraHacks / 掘金 / 小红书扫一遍, 你点参加, 我自动加进日程。
          </p>

          {error && (
            <div className="mb-3 p-2 rounded-lg bg-destructive/15 border border-destructive/30 text-[11px] text-destructive-foreground">
              {error}
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin inline-block mr-1" /> 加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              暂时没有新的黑客松。点「扫描」可立即去找。
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-auto pr-1">
              {items.map((h) => (
                <div
                  key={h.id}
                  className="p-3 rounded-xl bg-foreground/5 border border-foreground/10 hover:border-amber-glow/30 transition"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/60">
                          {h.source}
                        </span>
                        {h.tags?.slice(0, 2).map((t) => (
                          <span key={t} className="text-[10px] text-foreground/40">#{t}</span>
                        ))}
                      </div>
                      <a
                        href={h.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-foreground hover:text-amber-glow transition flex items-center gap-1 group"
                      >
                        <span className="line-clamp-1">{h.title}</span>
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 shrink-0" />
                      </a>
                    </div>
                  </div>
                  {h.summary && (
                    <p className="text-[11px] text-foreground/60 line-clamp-2 mb-2">{h.summary}</p>
                  )}
                  <div className="flex flex-wrap gap-2 text-[10px] text-foreground/50 mb-2">
                    {h.deadline && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-glow/10 text-amber-glow">
                        <CalIcon className="w-3 h-3" /> 报名截止 {h.deadline}
                      </span>
                    )}
                    {h.starts_at && (
                      <span className="flex items-center gap-1">
                        <CalIcon className="w-3 h-3" /> 开赛 {h.starts_at}
                      </span>
                    )}
                    {h.ends_at && h.ends_at !== h.starts_at && (
                      <span className="flex items-center gap-1">
                        <CalIcon className="w-3 h-3" /> 结束 {h.ends_at}
                      </span>
                    )}
                    {h.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {h.location}
                      </span>
                    )}
                    {h.prize && (
                      <span className="flex items-center gap-1">
                        <Gift className="w-3 h-3" /> {h.prize}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onAccept(h.id)}
                      disabled={busyId === h.id}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-xs bg-moss text-primary-foreground hover:scale-[1.02] transition disabled:opacity-40"
                    >
                      <Check className="w-3 h-3" /> 参加
                    </button>
                    <button
                      onClick={() => onDismiss(h.id)}
                      disabled={busyId === h.id}
                      className="px-3 py-1.5 rounded-full text-xs bg-foreground/5 border border-foreground/10 text-foreground/60 hover:bg-foreground/10 disabled:opacity-40"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
