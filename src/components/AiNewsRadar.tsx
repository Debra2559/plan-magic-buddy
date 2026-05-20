import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listPendingAiNews,
  saveAiNews,
  dismissAiNews,
  scanAiNewsNow,
  getAiNewsSettings,
  updateAiNewsSettings,
  parseRadarPrompt,
  type AiNewsRow,
  type AiNewsSettings,
} from "@/lib/ai-news.functions";
import {
  Sparkles, X, Bookmark, RefreshCw, Loader2, ExternalLink, Calendar as CalIcon,
  ListPlus, Check, Settings as SettingsIcon, Wand2, Save,
} from "lucide-react";
import { useSylva, todayLocal } from "@/lib/sylva-store";

const TIME_WINDOW_LABEL: Record<AiNewsSettings["time_window"], string> = {
  "qdr:h": "过去 1 小时",
  "qdr:d": "过去 1 天",
  "qdr:w": "过去 1 周",
  "qdr:m": "过去 1 月",
  "qdr:y": "过去 1 年",
};

const PROMPT_PRESETS: Array<{ label: string; text: string }> = [
  { label: "聚焦开源模型", text: "重点关注开源大模型发布与权重更新，过滤招聘、教程、营销软文，每天扫一次，时间窗口 1 天。" },
  { label: "Agent & 工具", text: "我只想看 AI Agent、工具调用、MCP、Computer Use 相关进展。加上 LangChain、AutoGen、Claude Code 之类来源。" },
  { label: "中文 AI 圈", text: "聚焦中文 AI 媒体：机器之心、量子位、新智元、AI 科技评论。排除融资软文，每 6 小时扫一次。" },
  { label: "重置为默认", text: "恢复默认配置：Hacker News / TechCrunch / The Verge / arXiv / 机器之心 / 量子位，关键词全部清空，每天扫一次，过去 1 周。" },
];

type PromptPanelProps = {
  settings: AiNewsSettings | null;
  prompt: string;
  onPromptChange: (s: string) => void;
  parsing: boolean;
  saving: boolean;
  onParse: () => void;
  onSaveDirect: () => void;
  onClose: () => void;
  onToggleEnabled: () => void;
};

function SettingsPanel({
  settings, prompt, onPromptChange, parsing, saving, onParse, onSaveDirect, onClose, onToggleEnabled,
}: PromptPanelProps) {
  if (!settings) {
    return (
      <div className="mb-3 p-4 rounded-xl bg-foreground/5 border border-foreground/10 text-xs text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin inline-block mr-1" /> 加载设置中…
      </div>
    );
  }

  const activeSources = settings.sources.filter((s) => s.enabled);

  return (
    <div className="mb-4 p-4 rounded-xl bg-foreground/5 border border-amber-glow/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs tracking-wider text-amber-glow flex items-center gap-1.5">
          <SettingsIcon className="w-3.5 h-3.5" /> 雷达设置
        </span>
        <button onClick={onClose} className="text-foreground/50 hover:text-foreground transition" title="关闭">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="text-[11px] text-foreground/70 leading-relaxed p-2.5 rounded-lg bg-background/30 border border-foreground/10">
        <div className="flex items-center justify-between mb-1">
          <span className="text-foreground/50">当前配置</span>
          <button
            onClick={onToggleEnabled}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
              settings.enabled
                ? "bg-amber-glow/15 border-amber-glow/40 text-amber-glow"
                : "bg-foreground/5 border-foreground/15 text-foreground/40"
            }`}
          >
            {settings.enabled ? "● 自动扫描中" : "○ 已暂停"}
          </button>
        </div>
        <div>
          <span className="text-foreground/40">来源</span>：{activeSources.map((s) => s.name).join("、") || "无"}
        </div>
        <div>
          <span className="text-foreground/40">节奏</span>：每 {settings.scan_interval_hours} 小时 · {TIME_WINDOW_LABEL[settings.time_window]} · 每源 {settings.per_source_limit} 条
        </div>
        {settings.include_keywords.length > 0 && (
          <div><span className="text-foreground/40">必含</span>：{settings.include_keywords.join("、")}</div>
        )}
        {settings.exclude_keywords.length > 0 && (
          <div><span className="text-foreground/40">排除</span>：{settings.exclude_keywords.join("、")}</div>
        )}
        {settings.tag_filters.length > 0 && (
          <div><span className="text-foreground/40">标签</span>：{settings.tag_filters.join("、")}</div>
        )}
      </div>

      <div>
        <label className="block text-[11px] text-foreground/60 mb-1.5">
          用一段话告诉雷达你想关注什么
        </label>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="例：我想看最近一周开源大模型发布、Agent 框架进展和重要融资。加上 Hugging Face 博客作为来源，过滤掉招聘和教程，每 6 小时扫一次。"
          rows={4}
          className="w-full bg-background/40 border border-foreground/15 rounded-md px-3 py-2 text-[12px] text-foreground placeholder:text-foreground/30 focus:border-amber-glow/60 focus:outline-none resize-y leading-relaxed"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {PROMPT_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => onPromptChange(p.text)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-foreground/5 border border-foreground/10 text-foreground/60 hover:text-amber-glow hover:border-amber-glow/40 transition"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-full text-xs bg-foreground/5 border border-foreground/10 text-foreground/60 hover:bg-foreground/10"
        >
          取消
        </button>
        <button
          onClick={onSaveDirect}
          disabled={saving || parsing}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-foreground/5 border border-foreground/10 text-foreground/70 hover:bg-foreground/10 disabled:opacity-40"
          title="保存当前显示的配置（如开/关状态）"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          保存当前
        </button>
        <button
          onClick={onParse}
          disabled={parsing || saving || prompt.trim().length < 2}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-amber-glow text-background hover:scale-[1.02] transition disabled:opacity-40"
        >
          {parsing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          {parsing ? "理解中" : "应用 Prompt"}
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
  const parsePromptFn = useServerFn(parseRadarPrompt);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AiNewsSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [promptText, setPromptText] = useState("");

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
      if (r.ok) setSettings(r.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const persist = async (next: AiNewsSettings) => {
    setSavingSettings(true);
    setError(null);
    try {
      const payload = {
        enabled: next.enabled,
        sources: next.sources.filter((s) => s.name.trim() && s.query.trim()),
        include_keywords: next.include_keywords,
        exclude_keywords: next.exclude_keywords,
        tag_filters: next.tag_filters,
        scan_interval_hours: next.scan_interval_hours,
        time_window: next.time_window,
        per_source_limit: next.per_source_limit,
      };
      const r = await updateSettingsFn({ data: payload });
      if (r.ok) setSettings({ ...next, ...payload });
      else setError(r.error);
      return r.ok;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSavingSettings(false);
    }
  };

  const onParsePrompt = async () => {
    if (!settings) return;
    setParsing(true);
    setError(null);
    try {
      const r = await parsePromptFn({ data: { prompt: promptText } });
      if (!r.ok) { setError(r.error); return; }
      const merged: AiNewsSettings = { ...settings, ...r.settings };
      const ok = await persist(merged);
      if (ok) {
        setPromptText("");
        setSettingsOpen(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  };

  const onSaveDirect = async () => {
    if (!settings) return;
    const ok = await persist(settings);
    if (ok) setSettingsOpen(false);
  };

  const onToggleEnabled = () => {
    if (!settings) return;
    setSettings({ ...settings, enabled: !settings.enabled });
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
          prompt={promptText}
          onPromptChange={setPromptText}
          parsing={parsing}
          saving={savingSettings}
          onParse={onParsePrompt}
          onSaveDirect={onSaveDirect}
          onClose={() => setSettingsOpen(false)}
          onToggleEnabled={onToggleEnabled}
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
