import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { DEFAULT_AVATAR_URL, resolveAvatarUrl } from "@/lib/persona";

/**
 * 进程内头像缓存：
 * - 已成功加载过的 URL 命中 `loadedUrls` → 直接渲染，浏览器走 memory cache
 * - 正在加载的 URL 命中 `inflight` Promise，避免并发重复请求
 * - 加载失败的 URL 命中 `failedUrls` → 直接回退默认头像，不再网络重试
 *
 * 这样面板/组件切来切去时同一头像 URL 不会反复触发请求或 `onError` 抖动。
 */
const loadedUrls = new Set<string>();
const failedUrls = new Set<string>();
const inflight = new Map<string, Promise<void>>();

// ---------- 性能监控 ----------
export type FailureReason = "load_error" | "previously_failed" | "img_tag_error";

export interface AvatarMetrics {
  /** 组件实例总请求次数（含命中缓存） */
  requests: number;
  /** 命中内存缓存或 inflight 去重的次数 */
  cacheHits: number;
  /** 实际发起的网络加载次数（含成功/失败） */
  networkLoads: number;
  /** 网络加载成功次数 */
  networkSuccess: number;
  /** 失败次数 */
  failures: number;
  /** 命中率 = cacheHits / requests */
  hitRate: number;
  /** 网络加载平均耗时 ms */
  avgLoadMs: number;
  /** 网络加载 p95 耗时 ms */
  p95LoadMs: number;
  /** 按原因分桶的失败次数 */
  failuresByReason: Record<FailureReason, number>;
  /** 当前缓存大小（成功/失败/进行中） */
  cacheSize: { loaded: number; failed: number; inflight: number };
}

const loadDurations: number[] = [];
const state = {
  requests: 0,
  cacheHits: 0,
  networkLoads: 0,
  networkSuccess: 0,
  failures: 0,
  failuresByReason: { load_error: 0, previously_failed: 0, img_tag_error: 0 } as Record<FailureReason, number>,
};
const subscribers = new Set<() => void>();

function notify() {
  for (const cb of subscribers) cb();
}

function recordHit() {
  state.requests++;
  state.cacheHits++;
  notify();
}
function recordRequest() {
  state.requests++;
  notify();
}
function recordNetworkSuccess(ms: number) {
  state.networkLoads++;
  state.networkSuccess++;
  loadDurations.push(ms);
  // 控制内存：只保留最近 200 条
  if (loadDurations.length > 200) loadDurations.shift();
  notify();
}
function recordFailure(reason: FailureReason, countAsNetwork: boolean) {
  if (countAsNetwork) state.networkLoads++;
  state.failures++;
  state.failuresByReason[reason]++;
  notify();
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx]);
}

export function getAvatarMetrics(): AvatarMetrics {
  const avg = loadDurations.length
    ? Math.round(loadDurations.reduce((a, b) => a + b, 0) / loadDurations.length)
    : 0;
  return {
    requests: state.requests,
    cacheHits: state.cacheHits,
    networkLoads: state.networkLoads,
    networkSuccess: state.networkSuccess,
    failures: state.failures,
    hitRate: state.requests ? state.cacheHits / state.requests : 0,
    avgLoadMs: avg,
    p95LoadMs: percentile(loadDurations, 95),
    failuresByReason: { ...state.failuresByReason },
    cacheSize: { loaded: loadedUrls.size, failed: failedUrls.size, inflight: inflight.size },
  };
}

export function subscribeAvatarMetrics(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function resetAvatarMetrics() {
  state.requests = 0;
  state.cacheHits = 0;
  state.networkLoads = 0;
  state.networkSuccess = 0;
  state.failures = 0;
  state.failuresByReason = { load_error: 0, previously_failed: 0, img_tag_error: 0 };
  loadDurations.length = 0;
  notify();
}
// -----------------------------

function preload(url: string): Promise<void> {
  if (loadedUrls.has(url)) {
    recordHit();
    return Promise.resolve();
  }
  if (failedUrls.has(url)) {
    recordRequest();
    recordFailure("previously_failed", false);
    return Promise.reject(new Error("previously failed"));
  }
  const existing = inflight.get(url);
  if (existing) {
    // 并发去重也算作命中（省下了一次网络请求）
    recordHit();
    return existing;
  }
  recordRequest();
  const startedAt = performance.now();
  const p = new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      loadedUrls.add(url);
      inflight.delete(url);
      recordNetworkSuccess(performance.now() - startedAt);
      resolve();
    };
    img.onerror = () => {
      failedUrls.add(url);
      inflight.delete(url);
      recordFailure("load_error", true);
      reject(new Error("load error"));
    };
    img.src = url;
  });
  inflight.set(url, p);
  return p;
}

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "loading"> & {
  src: string | null | undefined;
  /** 是否启用懒加载（视口外才请求），默认 true */
  lazy?: boolean;
  /** 自定义兜底，不传则用 DEFAULT_AVATAR_URL */
  fallback?: string;
};

export function CachedAvatar({ src, lazy = true, fallback = DEFAULT_AVATAR_URL, alt = "头像", ...rest }: Props) {
  const target = resolveAvatarUrl(src);
  const isDefault = target === DEFAULT_AVATAR_URL;
  const initial = (() => {
    if (isDefault) return target;
    if (target.startsWith("data:")) return target;
    if (loadedUrls.has(target)) return target;
    if (failedUrls.has(target)) return fallback;
    return fallback;
  })();

  const [shown, setShown] = useState(initial);
  const lastTargetRef = useRef(target);

  useEffect(() => {
    lastTargetRef.current = target;
    if (isDefault || target.startsWith("data:")) {
      setShown(target);
      return;
    }
    if (loadedUrls.has(target)) {
      recordHit();
      setShown(target);
      return;
    }
    if (failedUrls.has(target)) {
      recordRequest();
      recordFailure("previously_failed", false);
      setShown(fallback);
      return;
    }
    setShown(fallback);
    preload(target)
      .then(() => {
        if (lastTargetRef.current === target) setShown(target);
      })
      .catch(() => {
        if (lastTargetRef.current === target) setShown(fallback);
      });
  }, [target, isDefault, fallback]);

  return (
    <img
      {...rest}
      src={shown}
      alt={alt}
      loading={lazy ? "lazy" : "eager"}
      decoding="async"
      onError={(e) => {
        const img = e.currentTarget;
        if (!failedUrls.has(target)) {
          failedUrls.add(target);
          recordFailure("img_tag_error", false);
        }
        if (img.src !== fallback) img.src = fallback;
        rest.onError?.(e);
      }}
    />
  );
}

/** 调试/登出时清空缓存（同时重置统计） */
export function clearAvatarCache() {
  loadedUrls.clear();
  failedUrls.clear();
  inflight.clear();
  resetAvatarMetrics();
}
