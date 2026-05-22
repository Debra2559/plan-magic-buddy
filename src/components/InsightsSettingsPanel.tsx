import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getMyInsightsSettings, updateMyInsightsSettings, generateMyInsightsNow } from "@/lib/insights.functions";
import { Sparkles, RefreshCw, Globe, Bell, Lightbulb, TrendingUp, Heart, AlertTriangle } from "lucide-react";

const EXAMPLES = [
  { icon: Bell, tone: "text-amber-glow", label: "待办提醒", example: "「14:00 的设计评审还没准备纲要，建议先列 3 个要点。」" },
  { icon: Lightbulb, tone: "text-sky-300", label: "优化建议", example: "「这周连续 4 天 23 点后睡，明早把 9 点的会挪一挪？」" },
  { icon: TrendingUp, tone: "text-violet-300", label: "行为洞察", example: "「最近 3 天「阅读」习惯都在通勤时打卡，看来这个时段最稳。」" },
  { icon: Heart, tone: "text-rose-300", label: "鼓励", example: "「连续 5 天完成运动打卡，状态肉眼可见地稳了。」" },
  { icon: AlertTriangle, tone: "text-orange-400", label: "风险提示", example: "「今晚 3 个日程叠在一起，建议挪掉其中一个。」" },
] as const;

const SLOTS = [
  { key: "morning", label: "早晨", hint: "≤ 11:00" },
  { key: "noon", label: "午间", hint: "11:00 – 17:00" },
  { key: "evening", label: "傍晚", hint: "≥ 17:00" },
] as const;

const SCOPES = [
  { key: "schedule", label: "日程行为" },
  { key: "notes", label: "记录 / 手帐" },
  { key: "habits", label: "习惯打卡" },
  { key: "insights", label: "综合洞察" },
] as const;

// Common IANA timezones; users in CN default to Asia/Shanghai
const TIMEZONES = [
  { key: "Asia/Shanghai", label: "北京 / 上海", offset: "UTC+8" },
  { key: "Asia/Hong_Kong", label: "香港", offset: "UTC+8" },
  { key: "Asia/Taipei", label: "台北", offset: "UTC+8" },
  { key: "Asia/Tokyo", label: "东京", offset: "UTC+9" },
  { key: "Asia/Singapore", label: "新加坡", offset: "UTC+8" },
  { key: "Asia/Seoul", label: "首尔", offset: "UTC+9" },
  { key: "Asia/Bangkok", label: "曼谷", offset: "UTC+7" },
  { key: "Asia/Dubai", label: "迪拜", offset: "UTC+4" },
  { key: "Europe/London", label: "伦敦", offset: "UTC+0/+1" },
  { key: "Europe/Paris", label: "巴黎 / 柏林", offset: "UTC+1/+2" },
  { key: "America/New_York", label: "纽约", offset: "UTC-5/-4" },
  { key: "America/Los_Angeles", label: "洛杉矶", offset: "UTC-8/-7" },
  { key: "Australia/Sydney", label: "悉尼", offset: "UTC+10/+11" },
] as const;


export function InsightsSettingsPanel() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getMyInsightsSettings);
  const update = useServerFn(updateMyInsightsSettings);
  const generate = useServerFn(generateMyInsightsNow);

  const { data } = useQuery({ queryKey: ["insights-settings"], queryFn: () => fetchSettings() });
  const s = data?.settings;

  const [local, setLocal] = useState<any>(null);
  useEffect(() => { if (s && !local) setLocal(s); }, [s, local]);

  const save = useMutation({
    mutationFn: (patch: any) => update({ data: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insights-settings"] }),
  });
  const generateMut = useMutation({
    mutationFn: () => generate({ data: { slot: "auto" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-insights"] }),
  });

  if (!local) return <div className="text-muted-foreground text-sm">加载中…</div>;

  const toggleSlot = (slot: string) => {
    const next = local.slots.includes(slot) ? local.slots.filter((x: string) => x !== slot) : [...local.slots, slot];
    setLocal({ ...local, slots: next });
    save.mutate({ slots: next });
  };
  const toggleScope = (scope: string) => {
    const next = local.scope.includes(scope) ? local.scope.filter((x: string) => x !== scope) : [...local.scope, scope];
    setLocal({ ...local, scope: next });
    save.mutate({ scope: next });
  };

  return (
    <div className="space-y-4">
      {/* 介绍：AI 提醒到底会推什么 */}
      <div className="widget p-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-glow" />
          <span className="text-sm font-medium text-foreground">AI 提醒会推什么</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          AI 会在你设定的时段，结合你的日程、记录、习惯和回看天数，生成 1–5 条个性化提示。<b className="text-foreground/80">不是定时闹钟</b>，而是「看了你最近的状态后想对你说的话」。点右上角铃铛查看。
        </p>
        <div className="space-y-1.5">
          {EXAMPLES.map((e) => {
            const Icon = e.icon;
            return (
              <div key={e.label} className="flex items-start gap-2 text-[11px] p-2 rounded-lg bg-foreground/[0.04] border border-border/60">
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${e.tone}`} />
                <div className="min-w-0">
                  <span className={`font-medium ${e.tone}`}>{e.label}</span>
                  <span className="text-muted-foreground"> · {e.example}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-2.5">
          想立刻看到效果？拉到底点「立即生成」一组试试。
        </p>
      </div>

      {/* 开关 */}
      <div className="widget p-4 flex items-center justify-between">
        <div>
          <div className="text-foreground font-medium text-sm">启用 AI 行为洞察</div>
          <div className="text-muted-foreground text-xs mt-0.5">关闭后不再自动生成新的提示</div>
        </div>
        <button
          role="switch"
          aria-checked={local.enabled}
          onClick={() => {
            const next = !local.enabled;
            setLocal({ ...local, enabled: next });
            save.mutate({ enabled: next });
          }}
          className={`w-11 h-6 rounded-full transition relative ${local.enabled ? "bg-amber-glow" : "bg-foreground/20"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${local.enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {/* 时段 */}
      <div className="widget p-4">
        <div className="text-foreground font-medium text-sm mb-2">生成时段</div>
        <div className="text-muted-foreground text-xs mb-3">AI 在这些时间段会自动生成提示</div>
        <div className="grid grid-cols-3 gap-2">
          {SLOTS.map((s) => {
            const active = local.slots.includes(s.key);
            return (
              <button
                key={s.key}
                onClick={() => toggleSlot(s.key)}
                className={`px-3 py-2 rounded-lg text-sm transition border ${
                  active ? "bg-amber-glow/15 border-amber-glow/40 text-foreground" : "bg-foreground/[0.04] border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="font-medium">{s.label}</div>
                <div className="text-[10px] text-muted-foreground/70">{s.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 时区 */}
      <div className="widget p-4">
        <div className="text-foreground font-medium text-sm mb-2 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-amber-glow" />
          时区
        </div>
        <div className="text-muted-foreground text-xs mb-3">
          AI 按你所在时区判断「早/午/晚」时段
        </div>
        <select
          value={local.timezone || "Asia/Shanghai"}
          onChange={(e) => {
            const next = e.target.value;
            setLocal({ ...local, timezone: next });
            save.mutate({ timezone: next });
          }}
          className="w-full px-3 py-2 rounded-lg bg-foreground/[0.05] border border-border text-foreground text-sm focus:outline-none focus:border-amber-glow/40 transition"
        >
          {TIMEZONES.map((t) => (
            <option key={t.key} value={t.key} className="bg-background">
              {t.label} · {t.offset}
            </option>
          ))}
        </select>
      </div>



      {/* 数据范围 */}
      <div className="widget p-4">
        <div className="text-foreground font-medium text-sm mb-2">参考数据</div>
        <div className="text-muted-foreground text-xs mb-3">勾选 AI 在生成提示时可以参考的内容</div>
        <div className="grid grid-cols-2 gap-2">
          {SCOPES.map((s) => {
            const active = local.scope.includes(s.key);
            return (
              <button
                key={s.key}
                onClick={() => toggleScope(s.key)}
                className={`px-3 py-2 rounded-lg text-sm transition border ${
                  active ? "bg-foreground/10 border-border text-foreground" : "bg-foreground/[0.04] border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 回看天数 */}
      <div className="widget p-4">
        <div className="text-foreground font-medium text-sm mb-2">回看 {local.lookback_days} 天</div>
        <input
          type="range"
          min={1}
          max={7}
          value={local.lookback_days}
          onChange={(e) => {
            const v = Number(e.target.value);
            setLocal({ ...local, lookback_days: v });
          }}
          onMouseUp={() => save.mutate({ lookback_days: local.lookback_days })}
          onTouchEnd={() => save.mutate({ lookback_days: local.lookback_days })}
          className="w-full accent-amber-glow"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/70 mt-1">
          <span>1 天</span><span>7 天</span>
        </div>
      </div>

      {/* 飞书推送 */}
      <div className="widget p-4 flex items-center justify-between">
        <div>
          <div className="text-foreground font-medium text-sm">推送到飞书</div>
          <div className="text-muted-foreground text-xs mt-0.5">使用飞书同步中配置的接收人</div>
        </div>
        <button
          role="switch"
          aria-checked={local.push_feishu}
          onClick={() => {
            const next = !local.push_feishu;
            setLocal({ ...local, push_feishu: next });
            save.mutate({ push_feishu: next });
          }}
          className={`w-11 h-6 rounded-full transition relative ${local.push_feishu ? "bg-amber-glow" : "bg-foreground/20"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${local.push_feishu ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {/* 立即生成 */}
      <div className="widget p-4 flex items-center justify-between">
        <div>
          <div className="text-foreground font-medium text-sm flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-glow" />
            立即生成一组提示
          </div>
          <div className="text-muted-foreground text-xs mt-0.5">
            {local.last_generated_at ? `上次：${new Date(local.last_generated_at).toLocaleString("zh-CN")}` : "尚未生成过"}
          </div>
        </div>
        <button
          onClick={() => generateMut.mutate()}
          disabled={generateMut.isPending}
          className="px-3 py-1.5 rounded-md bg-foreground/10 hover:bg-foreground/15 text-foreground text-xs flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${generateMut.isPending ? "animate-spin" : ""}`} />
          {generateMut.isPending ? "生成中…" : "立即生成"}
        </button>
      </div>
    </div>
  );
}
