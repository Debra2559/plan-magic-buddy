import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listPendingHackathons,
  acceptHackathon,
  dismissHackathon,
  scanHackathonsNow,
  getHackathonSettings,
  updateHackathonSettings,
  type HackathonRow,
  type HackathonSettings,
} from "@/lib/hackathons.functions";
import { useSylva } from "@/lib/sylva-store";
import {
  Trophy, X, Check, RefreshCw, Loader2, ExternalLink, MapPin, Calendar as CalIcon, Gift,
  Settings as SettingsIcon, Save,
} from "lucide-react";
import { SourcesEditor } from "@/components/SourcesEditor";

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
