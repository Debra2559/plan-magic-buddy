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

function preload(url: string): Promise<void> {
  if (loadedUrls.has(url)) return Promise.resolve();
  if (failedUrls.has(url)) return Promise.reject(new Error("previously failed"));
  const existing = inflight.get(url);
  if (existing) return existing;
  const p = new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      loadedUrls.add(url);
      inflight.delete(url);
      resolve();
    };
    img.onerror = () => {
      failedUrls.add(url);
      inflight.delete(url);
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
  // 首次渲染同步决定要不要直接展示目标 URL：
  // - 默认/data: URI：直接用
  // - 命中缓存：直接用
  // - 已知失败：直接 fallback
  // - 其它：先放 fallback，等 preload 完成再切换，避免切换面板时出现"灰->真图"的闪烁/重复请求
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
      setShown(target);
      return;
    }
    if (failedUrls.has(target)) {
      setShown(fallback);
      return;
    }
    setShown(fallback);
    preload(target)
      .then(() => {
        // 避免快速切换时把旧 URL 覆盖到新组件
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
        failedUrls.add(target);
        if (img.src !== fallback) img.src = fallback;
        rest.onError?.(e);
      }}
    />
  );
}

/** 调试/登出时清空缓存 */
export function clearAvatarCache() {
  loadedUrls.clear();
  failedUrls.clear();
  inflight.clear();
}
