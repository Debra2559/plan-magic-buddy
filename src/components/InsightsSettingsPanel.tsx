import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getMyInsightsSettings, updateMyInsightsSettings, generateMyInsightsNow } from "@/lib/insights.functions";
import { Sparkles, RefreshCw } from "lucide-react";

const SLOTS = [
  { key: "morning", label: "早晨", hint: "≤ 11:00" },
  { key: "noon", label: "午间", hint: "11:00 – 17:00" },
  { key: "evening", label: "傍晚", hint: "≥ 17:00" },
] as const;

const SCOPES = [
  { key: "schedule", label: "日程行为" },
  { key: "notes", label: "随手记 / 日记" },
  { key: "habits", label: "习惯打卡" },
  { key: "insights", label: "综合洞察" },
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

  if (!local) return <div className="text-white/50 text-sm">加载中…</div>;

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
      {/* 开关 */}
      <div className="widget p-4 flex items-center justify-between">
        <div>
          <div className="text-white font-medium text-sm">启用 AI 行为洞察</div>
          <div className="text-white/50 text-xs mt-0.5">关闭后不再自动生成新的提示</div>
        </div>
        <button
          role="switch"
          aria-checked={local.enabled}
          onClick={() => {
            const next = !local.enabled;
            setLocal({ ...local, enabled: next });
            save.mutate({ enabled: next });
          }}
          className={`w-11 h-6 rounded-full transition relative ${local.enabled ? "bg-amber-glow" : "bg-white/20"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${local.enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {/* 时段 */}
      <div className="widget p-4">
        <div className="text-white font-medium text-sm mb-2">生成时段</div>
        <div className="text-white/50 text-xs mb-3">AI 在这些时间段会自动生成提示</div>
        <div className="grid grid-cols-3 gap-2">
          {SLOTS.map((s) => {
            const active = local.slots.includes(s.key);
            return (
              <button
                key={s.key}
                onClick={() => toggleSlot(s.key)}
                className={`px-3 py-2 rounded-lg text-sm transition border ${
                  active ? "bg-amber-glow/15 border-amber-glow/40 text-white" : "bg-white/[0.03] border-white/10 text-white/60 hover:text-white"
                }`}
              >
                <div className="font-medium">{s.label}</div>
                <div className="text-[10px] text-white/40">{s.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 数据范围 */}
      <div className="widget p-4">
        <div className="text-white font-medium text-sm mb-2">参考数据</div>
        <div className="text-white/50 text-xs mb-3">勾选 AI 在生成提示时可以参考的内容</div>
        <div className="grid grid-cols-2 gap-2">
          {SCOPES.map((s) => {
            const active = local.scope.includes(s.key);
            return (
              <button
                key={s.key}
                onClick={() => toggleScope(s.key)}
                className={`px-3 py-2 rounded-lg text-sm transition border ${
                  active ? "bg-white/10 border-white/25 text-white" : "bg-white/[0.03] border-white/10 text-white/60 hover:text-white"
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
        <div className="text-white font-medium text-sm mb-2">回看 {local.lookback_days} 天</div>
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
        <div className="flex justify-between text-[10px] text-white/40 mt-1">
          <span>1 天</span><span>7 天</span>
        </div>
      </div>

      {/* 飞书推送 */}
      <div className="widget p-4 flex items-center justify-between">
        <div>
          <div className="text-white font-medium text-sm">推送到飞书</div>
          <div className="text-white/50 text-xs mt-0.5">使用飞书同步中配置的接收人</div>
        </div>
        <button
          role="switch"
          aria-checked={local.push_feishu}
          onClick={() => {
            const next = !local.push_feishu;
            setLocal({ ...local, push_feishu: next });
            save.mutate({ push_feishu: next });
          }}
          className={`w-11 h-6 rounded-full transition relative ${local.push_feishu ? "bg-amber-glow" : "bg-white/20"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${local.push_feishu ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {/* 立即生成 */}
      <div className="widget p-4 flex items-center justify-between">
        <div>
          <div className="text-white font-medium text-sm flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-glow" />
            立即生成一组提示
          </div>
          <div className="text-white/50 text-xs mt-0.5">
            {local.last_generated_at ? `上次：${new Date(local.last_generated_at).toLocaleString("zh-CN")}` : "尚未生成过"}
          </div>
        </div>
        <button
          onClick={() => generateMut.mutate()}
          disabled={generateMut.isPending}
          className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-white text-xs flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${generateMut.isPending ? "animate-spin" : ""}`} />
          {generateMut.isPending ? "生成中…" : "立即生成"}
        </button>
      </div>
    </div>
  );
}
