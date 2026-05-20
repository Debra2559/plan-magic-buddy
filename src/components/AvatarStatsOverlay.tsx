import { useEffect, useState } from "react";
import { Activity, X, RefreshCw } from "lucide-react";
import {
  getAvatarMetrics,
  subscribeAvatarMetrics,
  resetAvatarMetrics,
  type AvatarMetrics,
} from "@/components/CachedAvatar";

/**
 * 仅开发模式渲染的右下角小浮窗，实时显示头像缓存命中率、加载耗时与失败原因。
 * 生产构建里 import.meta.env.DEV === false，整个组件直接返回 null，0 体积影响。
 */
export function AvatarStatsOverlay() {
  if (!import.meta.env.DEV) return null;
  return <AvatarStatsOverlayInner />;
}

function AvatarStatsOverlayInner() {
  const [metrics, setMetrics] = useState<AvatarMetrics>(() => getAvatarMetrics());
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    return subscribeAvatarMetrics(() => setMetrics(getAvatarMetrics()));
  }, []);

  if (hidden) return null;

  const hitPct = (metrics.hitRate * 100).toFixed(0);
  const failPct = metrics.requests
    ? ((metrics.failures / metrics.requests) * 100).toFixed(0)
    : "0";

  return (
    <div
      className="fixed bottom-3 right-3 z-[9999] text-[11px] font-mono select-none"
      style={{ pointerEvents: "auto" }}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/70 backdrop-blur border border-white/15 text-white/85 hover:bg-black/85 shadow-lg"
          title="头像缓存统计 (dev)"
        >
          <Activity className="w-3 h-3 text-emerald-300" />
          <span>头像 {hitPct}%</span>
          {metrics.failures > 0 && <span className="text-rose-300">·{metrics.failures}失败</span>}
        </button>
      ) : (
        <div className="w-[260px] rounded-lg bg-black/85 backdrop-blur border border-white/15 text-white/90 shadow-2xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-emerald-300" />
              <span className="font-semibold">CachedAvatar · dev</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => resetAvatarMetrics()}
                className="p-1 rounded hover:bg-white/10 text-white/70"
                title="重置统计"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-white/10 text-white/70"
                title="收起"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <Row label="请求总数" value={metrics.requests} />
            <Row
              label="缓存命中"
              value={`${metrics.cacheHits} (${hitPct}%)`}
              tone="ok"
            />
            <Row label="网络加载" value={metrics.networkLoads} />
            <Row
              label="加载成功"
              value={metrics.networkSuccess}
              tone={metrics.networkSuccess ? "ok" : undefined}
            />
            <Row
              label="加载失败"
              value={`${metrics.failures} (${failPct}%)`}
              tone={metrics.failures ? "bad" : undefined}
            />
            <div className="border-t border-white/10 my-1" />
            <Row label="平均耗时" value={`${metrics.avgLoadMs} ms`} />
            <Row label="P95 耗时" value={`${metrics.p95LoadMs} ms`} />
            <div className="border-t border-white/10 my-1" />
            <div className="text-white/55">失败原因</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-white/85">
              <span className="text-white/55">load_error</span>
              <span className="tabular-nums text-right">
                {metrics.failuresByReason.load_error}
              </span>
              <span className="text-white/55">previously_failed</span>
              <span className="tabular-nums text-right">
                {metrics.failuresByReason.previously_failed}
              </span>
              <span className="text-white/55">img_tag_error</span>
              <span className="tabular-nums text-right">
                {metrics.failuresByReason.img_tag_error}
              </span>
            </div>
            <div className="border-t border-white/10 my-1" />
            <div className="text-white/55">缓存条目</div>
            <div className="grid grid-cols-3 gap-2 text-center text-white/85">
              <Pill label="成功" value={metrics.cacheSize.loaded} tone="ok" />
              <Pill label="失败" value={metrics.cacheSize.failed} tone="bad" />
              <Pill label="进行中" value={metrics.cacheSize.inflight} />
            </div>
            <button
              type="button"
              onClick={() => setHidden(true)}
              className="w-full mt-1 py-1 rounded bg-white/5 hover:bg-white/10 text-white/55 text-[10px]"
            >
              本次会话不再显示
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-white/90";
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/55">{label}</span>
      <span className={`tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function Pill({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" }) {
  const ring =
    tone === "ok" ? "border-emerald-300/40 text-emerald-300" : tone === "bad" ? "border-rose-300/40 text-rose-300" : "border-white/15 text-white/85";
  return (
    <div className={`rounded-md border ${ring} bg-white/5 py-1`}>
      <div className="tabular-nums text-sm">{value}</div>
      <div className="text-[10px] text-white/45">{label}</div>
    </div>
  );
}
