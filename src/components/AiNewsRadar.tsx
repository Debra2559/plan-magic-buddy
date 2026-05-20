import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listPendingAiNews,
  saveAiNews,
  dismissAiNews,
  scanAiNewsNow,
  getAiNewsSettings,
  updateAiNewsSettings,
  type AiNewsRow,
  type AiNewsSettings,
} from "@/lib/ai-news.functions";
import {
  Sparkles, X, Bookmark, RefreshCw, Loader2, ExternalLink, Calendar as CalIcon,
  ListPlus, Check, Settings as SettingsIcon, Plus, Trash2, Save,
} from "lucide-react";
import { useSylva, todayLocal } from "@/lib/sylva-store";
type PanelProps = {
  settings: AiNewsSettings | null;
  includeText: string;
  excludeText: string;
  tagsText: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (s: AiNewsSettings) => void;
  onIncludeChange: (s: string) => void;
  onExcludeChange: (s: string) => void;
  onTagsChange: (s: string) => void;
  onAddSource: () => void;
  onUpdateSource: (idx: number, patch: Partial<AiNewsSettings["sources"][number]>) => void;
  onRemoveSource: (idx: number) => void;
};

const TIME_WINDOWS: Array<{ value: AiNewsSettings["time_window"]; label: string }> = [
  { value: "qdr:h", label: "过去 1 小时" },
  { value: "qdr:d", label: "过去 1 天" },
  { value: "qdr:w", label: "过去 1 周" },
  { value: "qdr:m", label: "过去 1 月" },
  { value: "qdr:y", label: "过去 1 年" },
];

function SettingsPanel(props: PanelProps) {
  const { settings, saving } = props;

  if (!settings) {
    return (
      <div className="mb-3 p-4 rounded-xl bg-foreground/5 border border-foreground/10 text-xs text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin inline-block mr-1" /> 加载设置中…
      </div>
    );
  }

  const inputCls =
    "w-full bg-background/40 border border-foreground/15 rounded-md px-2 py-1.5 text-[12px] text-foreground placeholder:text-foreground/30 focus:border-amber-glow/60 focus:outline-none";

  return (
    <div className="mb-4 p-4 rounded-xl bg-foreground/5 border border-amber-glow/30 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs tracking-wider text-amber-glow flex items-center gap-1.5">
          <SettingsIcon className="w-3.5 h-3.5" /> 雷达设置
        </span>
        <button
          onClick={props.onClose}
          className="text-foreground/50 hover:text-foreground transition"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <label className="flex items-center justify-between text-[12px] text-foreground/80">
        <span>启用自动扫描</span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => props.onChange({ ...settings, enabled: e.target.checked })}
          className="accent-amber-glow"
        />
      </label>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-foreground/60">数据源</span>
          <button
            onClick={props.onAddSource}
            className="flex items-center gap-1 text-[11px] text-amber-glow hover:text-amber-glow/80 transition"
          >
            <Plus className="w-3 h-3" /> 新增
          </button>
        </div>
        <div className="space-y-1.5 max-h-44 overflow-auto pr-1">
          {settings.sources.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => props.onUpdateSource(i, { enabled: e.target.checked })}
                className="accent-amber-glow shrink-0"
              />
              <input
                value={s.name}
                onChange={(e) => props.onUpdateSource(i, { name: e.target.value })}
                placeholder="名称"
                className={inputCls + " w-24 shrink-0"}
              />
              <input
                value={s.query}
                onChange={(e) => props.onUpdateSource(i, { query: e.target.value })}
                placeholder="site:example.com AI"
                className={inputCls + " flex-1"}
              />
              <button
                onClick={() => props.onRemoveSource(i)}
                className="text-foreground/40 hover:text-destructive transition shrink-0"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-foreground/40 mt-1">支持 Google 搜索语法，如 <code>site:openai.com</code>、<code>AI OR LLM</code>。</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-[11px] text-foreground/60 mb-1">必含关键词（命中其一即保留）</label>
          <input
            value={props.includeText}
            onChange={(e) => props.onIncludeChange(e.target.value)}
            placeholder="GPT, Agent, 多模态"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[11px] text-foreground/60 mb-1">排除关键词（命中任意即过滤）</label>
          <input
            value={props.excludeText}
            onChange={(e) => props.onExcludeChange(e.target.value)}
            placeholder="招聘, 教程, 软文"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[11px] text-foreground/60 mb-1">只保留这些标签（留空则全部）</label>
          <input
            value={props.tagsText}
            onChange={(e) => props.onTagsChange(e.target.value)}
            placeholder="模型发布, Agent, 融资"
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] text-foreground/60 mb-1">扫描频率</label>
          <select
            value={settings.scan_interval_hours}
            onChange={(e) =>
              props.onChange({ ...settings, scan_interval_hours: Number(e.target.value) })
            }
            className={inputCls}
          >
            <option value={1}>每小时</option>
            <option value={3}>每 3 小时</option>
            <option value={6}>每 6 小时</option>
            <option value={12}>每 12 小时</option>
            <option value={24}>每天</option>
            <option value={48}>每 2 天</option>
            <option value={168}>每周</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-foreground/60 mb-1">时间窗口</label>
          <select
            value={settings.time_window}
            onChange={(e) =>
              props.onChange({
                ...settings,
                time_window: e.target.value as AiNewsSettings["time_window"],
              })
            }
            className={inputCls}
          >
            {TIME_WINDOWS.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-foreground/60 mb-1">每源条数</label>
          <input
            type="number"
            min={1}
            max={20}
            value={settings.per_source_limit}
            onChange={(e) =>
              props.onChange({
                ...settings,
                per_source_limit: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
              })
            }
            className={inputCls}
          />
        </div>
      </div>

      {settings.last_scanned_at && (
        <p className="text-[10px] text-foreground/40">
          上次扫描：{new Date(settings.last_scanned_at).toLocaleString()}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={props.onClose}
          className="px-3 py-1.5 rounded-full text-xs bg-foreground/5 border border-foreground/10 text-foreground/60 hover:bg-foreground/10"
        >
          取消
        </button>
        <button
          onClick={props.onSave}
          disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-amber-glow text-background hover:scale-[1.02] transition disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {saving ? "保存中" : "保存"}
        </button>
      </div>
    </div>
  );
}


export function AiNewsRadar() {
  const [items, setItems] = useState<AiNewsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const { addItems } = useSylva();

  const listFn = useServerFn(listPendingAiNews);
  const saveFn = useServerFn(saveAiNews);
  const dismissFn = useServerFn(dismissAiNews);
  const scanFn = useServerFn(scanAiNewsNow);
  const getSettingsFn = useServerFn(getAiNewsSettings);
  const updateSettingsFn = useServerFn(updateAiNewsSettings);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AiNewsSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [includeText, setIncludeText] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [tagsText, setTagsText] = useState("");

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

  useEffect(() => {
    void load();
  }, [load]);

  const onScan = async () => {
    setScanning(true);
    setError(null);
    try {
      await scanFn({ data: { force: true } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  const openSettings = async () => {
    setSettingsOpen(true);
    if (settings) return;
    try {
      const r = await getSettingsFn();
      if (r.ok) {
        setSettings(r.settings);
        setIncludeText(r.settings.include_keywords.join(", "));
        setExcludeText(r.settings.exclude_keywords.join(", "));
        setTagsText(r.settings.tag_filters.join(", "));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const parseList = (s: string) =>
    s.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 30);

  const onSaveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    setError(null);
    try {
      const payload = {
        enabled: settings.enabled,
        sources: settings.sources.filter((s) => s.name.trim() && s.query.trim()),
        include_keywords: parseList(includeText),
        exclude_keywords: parseList(excludeText),
        tag_filters: parseList(tagsText),
        scan_interval_hours: settings.scan_interval_hours,
        time_window: settings.time_window,
        per_source_limit: settings.per_source_limit,
      };
      const r = await updateSettingsFn({ data: payload });
      if (r.ok) {
        setSettings({ ...settings, ...payload });
        setSettingsOpen(false);
      } else {
        setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingSettings(false);
    }
  };

  const updateSource = (idx: number, patch: Partial<AiNewsSettings["sources"][number]>) => {
    if (!settings) return;
    setSettings({
      ...settings,
      sources: settings.sources.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    });
  };

  const removeSource = (idx: number) => {
    if (!settings) return;
    setSettings({ ...settings, sources: settings.sources.filter((_, i) => i !== idx) });
  };

  const addSource = () => {
    if (!settings) return;
    setSettings({
      ...settings,
      sources: [...settings.sources, { name: "新数据源", query: "site:example.com AI", enabled: true }],
    });
  };

  const onSave = async (id: string) => {
    setBusyId(id);
    try {
      const r = await saveFn({ data: { id } });
      if (r.ok) setItems((p) => p.filter((i) => i.id !== id));
      else setError(r.error);
    } finally {
      setBusyId(null);
    }
  };

  const onDismiss = async (id: string) => {
    setBusyId(id);
    try {
      const r = await dismissFn({ data: { id } });
      if (r.ok) setItems((p) => p.filter((i) => i.id !== id));
      else setError(r.error);
    } finally {
      setBusyId(null);
    }
  };

  const onAddTodo = (n: AiNewsRow) => {
    const title = n.title.length > 24 ? n.title.slice(0, 22) + "…" : n.title;
    const noteParts: string[] = [];
    if (n.summary) noteParts.push(n.summary);
    noteParts.push(`来源: ${n.source} · ${n.url}`);
    addItems([
      {
        type: "todo",
        title: `看 AI 动态: ${title}`,
        date: todayLocal(),
        tag: "学习",
        note: noteParts.join(" · "),
      },
    ]);
    setAddedIds((s) => new Set(s).add(n.id));
  };

  return (
    <div className="widget p-5">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 text-left">
          <Sparkles className="w-4 h-4 text-amber-glow" />
          <span className="text-xs tracking-wider text-amber-glow">AI 动态雷达</span>
          {items.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-glow/20 text-amber-glow">
              {items.length} 条待看
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
        <SettingsPanel
          settings={settings}
          includeText={includeText}
          excludeText={excludeText}
          tagsText={tagsText}
          saving={savingSettings}
          onClose={() => setSettingsOpen(false)}
          onSave={onSaveSettings}
          onChange={setSettings}
          onIncludeChange={setIncludeText}
          onExcludeChange={setExcludeText}
          onTagsChange={setTagsText}
          onAddSource={addSource}
          onUpdateSource={updateSource}
          onRemoveSource={removeSource}
        />
      )}


      {!collapsed && (
        <>
          <p className="text-[11px] text-muted-foreground mb-3">
            每天扫一遍 Hacker News / TechCrunch / The Verge / arXiv / 机器之心 / 量子位，挑出真正重要的 AI 动态。
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
              暂时没有新的 AI 动态。点「扫描」可立即去找。
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-auto pr-1">
              {items.map((n) => (
                <div
                  key={n.id}
                  className="p-3 rounded-xl bg-foreground/5 border border-foreground/10 hover:border-amber-glow/30 transition"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/60">
                      {n.source}
                    </span>
                    {n.tags?.slice(0, 3).map((t) => (
                      <span key={t} className="text-[10px] text-foreground/40">#{t}</span>
                    ))}
                  </div>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-foreground hover:text-amber-glow transition flex items-center gap-1 group"
                  >
                    <span className="line-clamp-2">{n.title}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 shrink-0" />
                  </a>
                  {n.summary && (
                    <p className="text-[11px] text-foreground/60 line-clamp-3 mt-1 mb-2">{n.summary}</p>
                  )}
                  {n.published_at && (
                    <div className="flex items-center gap-1 text-[10px] text-foreground/50 mb-2">
                      <CalIcon className="w-3 h-3" /> {n.published_at}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSave(n.id)}
                      disabled={busyId === n.id}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-xs bg-moss text-primary-foreground hover:scale-[1.02] transition disabled:opacity-40"
                    >
                      <Bookmark className="w-3 h-3" /> 收藏
                    </button>
                    <button
                      onClick={() => onAddTodo(n)}
                      disabled={busyId === n.id || addedIds.has(n.id)}
                      title="一键转为待办，加入今日规划"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-amber-glow/15 border border-amber-glow/40 text-amber-glow hover:bg-amber-glow/25 transition disabled:opacity-60"
                    >
                      {addedIds.has(n.id) ? (
                        <><Check className="w-3 h-3" /> 已加入</>
                      ) : (
                        <><ListPlus className="w-3 h-3" /> 转待办</>
                      )}
                    </button>
                    <button
                      onClick={() => onDismiss(n.id)}
                      disabled={busyId === n.id}
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

