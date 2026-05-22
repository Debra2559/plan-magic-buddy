import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { HackathonInbox } from "@/components/HackathonInbox";
import { AiNewsRadar } from "@/components/AiNewsRadar";
import { Radar, Sparkles, Loader2, Check, Trophy, Newspaper } from "lucide-react";
import {
  planMonitoringSources,
  getHackathonSettings,
  updateHackathonSettings,
  classifyMonitorTopic,
} from "@/lib/hackathons.functions";
import {
  parseRadarPrompt,
  getAiNewsSettings,
  updateAiNewsSettings,
} from "@/lib/ai-news.functions";

type Target = "hackathon" | "ai-news";

export function MonitorView() {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const classifyFn = useServerFn(classifyMonitorTopic);
  const planFn = useServerFn(planMonitoringSources);
  const getHackFn = useServerFn(getHackathonSettings);
  const updHackFn = useServerFn(updateHackathonSettings);
  const parsePromptFn = useServerFn(parseRadarPrompt);
  const getAiFn = useServerFn(getAiNewsSettings);
  const updAiFn = useServerFn(updateAiNewsSettings);

  const onCreate = async () => {
    const t = topic.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const cls = await classifyFn({ data: { prompt: t } });
      const target: Target = cls.ok ? cls.kind : "ai-news";
      if (target === "hackathon") {
        const planR = await planFn({ data: { topic: t } });
        if (!planR.ok || !planR.plan) {
          setError(planR.ok ? "AI 未返回有效计划" : planR.error);
          return;
        }
        const cur = await getHackFn();
        if (!cur.ok || !cur.settings) {
          setError(cur.ok ? "加载设置失败" : cur.error);
          return;
        }
        const existing = new Set(cur.settings.sources.map((s) => s.query));
        const additions = planR.plan.sources
          .filter((s) => !existing.has(s.query))
          .map((s) => ({ name: s.name, query: s.query, enabled: s.enabled !== false }));
        if (additions.length === 0) {
          setSuccess("🏆 识别为黑客松/赛事类 · 来源都已存在");
          return;
        }
        const r = await updHackFn({
          data: {
            sources: [...cur.settings.sources, ...additions],
            scan_interval_hours: planR.plan.suggested_interval_hours || cur.settings.scan_interval_hours,
          },
        });
        if (!r.ok) { setError(r.error); return; }
        setSuccess(`🏆 已识别为黑客松雷达 · 新增 ${additions.length} 个来源 · 每 ${planR.plan.suggested_interval_hours}h 扫一次`);
        setTopic("");
      } else {
        const r = await parsePromptFn({ data: { prompt: t } });
        if (!r.ok) { setError(r.error); return; }
        const cur = await getAiFn();
        if (!cur.ok) { setError("加载 AI 雷达设置失败"); return; }
        const merged = { ...cur.settings, ...r.settings };
        const save = await updAiFn({
          data: {
            enabled: merged.enabled,
            sources: merged.sources.filter((s) => s.name.trim() && s.query.trim()),
            include_keywords: merged.include_keywords,
            exclude_keywords: merged.exclude_keywords,
            tag_filters: merged.tag_filters,
            scan_interval_hours: merged.scan_interval_hours,
            time_window: merged.time_window,
            per_source_limit: merged.per_source_limit,
          },
        });
        if (!save.ok) { setError(save.error); return; }
        setSuccess(`📰 已识别为 AI 动态雷达 · ${merged.sources.length} 个来源 · 每 ${merged.scan_interval_hours}h 扫一次`);
        setTopic("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-5 flex items-center gap-2">
        <Radar className="w-5 h-5 text-amber-glow" />
        <h2 className="font-display text-2xl text-foreground">监控</h2>
        <span className="text-xs text-muted-foreground/70 ml-2">黑客松与 AI 动态雷达，每日自动扫一遍</span>
      </div>

      <div className="widget p-4 mb-6">
        <div className="flex items-center gap-1.5 mb-2.5 text-xs tracking-wider text-amber-glow">
          <Sparkles className="w-3.5 h-3.5" />
          一键新建监控
          <span className="text-foreground/40 ml-1 tracking-normal">告诉我想关注什么，AI 自动规划来源和节奏</span>
        </div>
        <div className="flex items-center gap-2 mb-2 text-[10.5px] text-foreground/45">
          <span className="flex items-center gap-1"><Trophy className="w-3 h-3" /> 比赛/赛事</span>
          <span className="opacity-40">·</span>
          <span className="flex items-center gap-1"><Newspaper className="w-3 h-3" /> AI/资讯动态</span>
          <span className="opacity-40">·</span>
          <span>AI 自动判断该建哪种雷达</span>
        </div>
        <div className="flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void onCreate(); } }}
            placeholder="想关注什么？例如：徒步 / AI Agent 比赛 / 开源大模型发布"
            className="flex-1 bg-background/40 border border-foreground/15 rounded-md px-3 py-2 text-[12px] text-foreground placeholder:text-foreground/30 focus:border-amber-glow/60 focus:outline-none"
          />

          <button
            onClick={onCreate}
            disabled={busy || !topic.trim()}
            className="flex items-center gap-1 px-4 py-2 rounded-md text-xs bg-amber-glow text-background hover:scale-[1.02] transition disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {busy ? "AI 规划中…" : "一键创建"}
          </button>
        </div>
        {error && (
          <div className="mt-2 p-2 rounded-lg bg-destructive/15 border border-destructive/30 text-[11px] text-destructive-foreground">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-2 p-2 rounded-lg bg-amber-glow/10 border border-amber-glow/30 text-[11px] text-amber-glow flex items-center gap-1.5">
            <Check className="w-3 h-3" /> {success}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <HackathonInbox />
        <AiNewsRadar />
      </div>
    </div>
  );
}
