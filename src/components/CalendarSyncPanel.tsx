import { useEffect, useState } from "react";
import { Copy, RefreshCw, Calendar, Smartphone, Apple, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getOrCreateCalendarToken, rotateCalendarToken } from "@/lib/calendar-sync.functions";

export function CalendarSyncPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"http" | "webcal" | null>(null);

  const fetchToken = useServerFn(getOrCreateCalendarToken);
  const rotate = useServerFn(rotateCalendarToken);

  useEffect(() => {
    let alive = true;
    fetchToken({})
      .then((r) => alive && setToken(r.token))
      .catch((e) => toast.error("获取订阅链接失败：" + (e?.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchToken]);

  // 预览域名（lovableproject.com / id-preview--*）需要 Lovable 登录，系统日历无法访问，
  // 因此订阅链接一律使用已发布的公开域名。
  const PUBLIC_BASE = "https://project--01545937-4efd-4487-a500-8dd999f2e87d.lovable.app";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const base =
    /lovableproject\.com|id-preview--/.test(origin) || !origin ? PUBLIC_BASE : origin;
  const httpUrl = token ? `${base}/api/public/calendar/${token}.ics` : "";
  const webcalUrl = token ? httpUrl.replace(/^https?:/, "webcal:") : "";

  const copy = async (kind: "http" | "webcal") => {
    const v = kind === "http" ? httpUrl : webcalUrl;
    try {
      await navigator.clipboard.writeText(v);
      setCopied(kind);
      toast.success("链接已复制");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("复制失败,请手动选中");
    }
  };

  const doRotate = async () => {
    if (!confirm("重新生成后旧链接会立刻失效,已订阅的日历需要重新添加。确定继续?")) return;
    setLoading(true);
    try {
      const r = await rotate({});
      setToken(r.token);
      toast.success("已生成新链接");
    } catch (e: any) {
      toast.error("重新生成失败:" + (e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 说明卡 */}
      <div className="widget p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-glow" />
          <div className="text-sm font-medium text-foreground">日历订阅 (ICS)</div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          把你在 Sylva 里的所有日程,一键同步到 iPhone、Mac、iPad 的系统日历,以及 Google Calendar、Outlook。
          日历会自动每小时刷新一次。<span className="text-foreground/80">这是单向同步 (只读)</span>——
          系统日历里删/改事件不会回写 Sylva。
        </p>
      </div>

      {/* 订阅链接 */}
      <div className="widget p-4 space-y-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground/70">你的订阅链接</div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> 准备中…
          </div>
        ) : token ? (
          <>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] px-2 py-1.5 rounded-md bg-foreground/[0.05] border border-border text-foreground/85 truncate">
                {webcalUrl}
              </code>
              <button
                onClick={() => copy("webcal")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-amber-glow/15 hover:bg-amber-glow/25 text-amber-glow text-xs transition"
                title="webcal 链接 — iOS/Mac 系统日历打开会自动订阅"
              >
                {copied === "webcal" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                复制 webcal
              </button>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] px-2 py-1.5 rounded-md bg-foreground/[0.05] border border-border text-foreground/85 truncate">
                {httpUrl}
              </code>
              <button
                onClick={() => copy("http")}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-foreground/[0.06] hover:bg-foreground/[0.12] text-foreground/85 text-xs transition"
                title="Google Calendar / Outlook 用这个 https 链接"
              >
                {copied === "http" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                复制 https
              </button>
            </div>
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-muted-foreground/70">
                拿到链接的任何人都能读到你的日程,不要公开分享。
              </p>
              <button
                onClick={doRotate}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
              >
                <RefreshCw className="w-3 h-3" /> 重新生成
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">未能生成链接。</p>
        )}
      </div>

      {/* 使用指南 */}
      <details className="widget p-4 group" open>
        <summary className="cursor-pointer text-sm font-medium text-foreground flex items-center gap-2">
          <Apple className="w-4 h-4 text-amber-glow" /> 在 iPhone / Mac 上订阅
        </summary>
        <div className="mt-3 space-y-3 text-xs text-muted-foreground leading-relaxed">
          <div>
            <div className="text-foreground/85 font-medium mb-1">最简单 (推荐):</div>
            用 iPhone/Mac 的 Safari 打开本页,点上面的<span className="text-amber-glow">「复制 webcal」</span>,
            然后在系统日历 App 里粘贴到「文件 → 新建日历订阅」或 iPhone「设置 → 日历 → 账户 → 添加账户 → 其他 → 添加已订阅的日历」。
          </div>
          <div>
            <div className="text-foreground/85 font-medium mb-1">iPhone 详细步骤:</div>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>设置 → 日历 → 账户 → 添加账户 → 其他</li>
              <li>选「添加已订阅的日历」</li>
              <li>服务器一栏粘贴上面的 webcal 链接 → 下一步 → 存储</li>
              <li>打开「日历」App,新事件会陆续出现</li>
            </ol>
          </div>
          <div>
            <div className="text-foreground/85 font-medium mb-1">Mac 详细步骤:</div>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>打开「日历」App → 顶部菜单「文件 → 新建日历订阅」</li>
              <li>粘贴 webcal 链接 → 订阅</li>
              <li>自动刷新选「每小时」</li>
            </ol>
          </div>
        </div>
      </details>

      <details className="widget p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-amber-glow" /> Google Calendar / Outlook
        </summary>
        <div className="mt-3 space-y-3 text-xs text-muted-foreground leading-relaxed">
          <div>
            <div className="text-foreground/85 font-medium mb-1">Google Calendar:</div>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>打开 <a className="text-amber-glow underline" href="https://calendar.google.com" target="_blank">calendar.google.com</a></li>
              <li>左侧「其他日历」旁的 + 号 → 「通过网址添加」</li>
              <li>粘贴上面的 <span className="text-foreground/85">https</span> 链接 → 添加日历</li>
              <li>刷新周期约几小时,Google 侧无法调整</li>
            </ol>
          </div>
          <div>
            <div className="text-foreground/85 font-medium mb-1">Outlook:</div>
            日历 → 添加日历 → 从 Internet 订阅 → 粘贴 https 链接。
          </div>
        </div>
      </details>

      <details className="widget p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-amber-glow" /> 把 Sylva 装到手机主屏 (PWA)
        </summary>
        <div className="mt-3 space-y-3 text-xs text-muted-foreground leading-relaxed">
          <div>
            <div className="text-foreground/85 font-medium mb-1">iPhone / iPad:</div>
            Safari 打开 Sylva → 底部分享按钮 → 「添加到主屏幕」→ 完成。
            之后从主屏图标进入就跟原生 app 一样,没有浏览器地址栏。
          </div>
          <div>
            <div className="text-foreground/85 font-medium mb-1">Mac (Safari 17+):</div>
            打开 Sylva → 顶部「文件 → 添加到程序坞」→ 之后就能在启动台里像 app 一样打开。
          </div>
          <div className="text-[11px] text-muted-foreground/70">
            注:PWA 不会上架 App Store,但功能一样能用,且省下开发者账号费用。
          </div>
        </div>
      </details>
    </div>
  );
}
