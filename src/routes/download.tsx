import { createFileRoute, Link } from "@tanstack/react-router";
import { Apple, Download, ShieldAlert, Monitor, ArrowLeft } from "lucide-react";
import { MAC_DOWNLOAD } from "@/lib/downloads";

export const Route = createFileRoute("/download")({
  component: DownloadPage,
  head: () => ({
    meta: [
      { title: "下载 Sylva 日历 macOS 客户端" },
      {
        name: "description",
        content: "下载 Sylva 日历 macOS 客户端：专注的日历视图、文本/时间双模式、日程待办实时同步。附首次打开的 Gatekeeper 解决方法。",
      },
      { property: "og:title", content: "下载 Sylva 日历 macOS 客户端" },
      {
        property: "og:description",
        content: "Sylva 日历 macOS 客户端下载：专注日历、菜单栏常驻、与网页端同账号同步。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function DownloadPage() {
  return (
    <main className="min-h-screen px-6 py-16 md:py-24">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-foreground/60 hover:text-foreground transition mb-10">
          <ArrowLeft className="w-4 h-4" /> 返回首页
        </Link>

        <p className="text-xs tracking-widest text-amber-glow mb-3">macOS 客户端 · v{MAC_DOWNLOAD.version}</p>
        <h1 className="font-display text-4xl md:text-5xl mb-5">把 Sylva 日历放进你的菜单栏。</h1>
        <p className="text-foreground/70 leading-relaxed mb-10 max-w-xl">
          一个干净的 macOS 日历客户端：支持时间视图与文本视图，日程、待办、提醒一站式管理，
          和网页端使用同一个账号，数据实时同步。
        </p>

        <div className="widget p-8 mb-10">
          <div className="flex flex-wrap items-center gap-4 justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Apple className="w-4 h-4 text-amber-glow" />
                <span className="font-medium">Sylva 日历 for macOS</span>
              </div>
              <p className="text-sm text-foreground/60">
                {MAC_DOWNLOAD.arch} · {MAC_DOWNLOAD.sizeLabel} · .zip
              </p>
            </div>
            <a
              href={MAC_DOWNLOAD.url}
              download={MAC_DOWNLOAD.filename}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-amber-glow text-primary-foreground text-sm font-medium hover:scale-[1.02] transition shadow-lg shadow-amber-glow/30"
            >
              <Download className="w-4 h-4" /> 立即下载
            </a>
          </div>
        </div>

        <section className="widget p-8 mb-10">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-4 h-4 text-amber-glow" />
            <h2 className="font-display text-xl">首次打开提示「已损坏」怎么办</h2>
          </div>
          <p className="text-sm text-foreground/70 leading-relaxed mb-4">
            这不是安装包损坏，而是 macOS Gatekeeper 拦截了未经 Apple 公证的应用。把 App 拖进「应用程序」后，
            在终端执行下面这行命令，然后右键 → 打开即可。
          </p>
          <pre className="text-xs md:text-sm bg-foreground/5 border border-foreground/10 rounded-xl p-4 overflow-x-auto">
            <code>xattr -cr &quot;/Applications/Sylva 日历.app&quot;</code>
          </pre>
        </section>

        <section className="widget p-8">
          <div className="flex items-center gap-2 mb-4">
            <Monitor className="w-4 h-4 text-amber-glow" />
            <h2 className="font-display text-xl">先在浏览器里试试</h2>
          </div>
          <p className="text-sm text-foreground/70 leading-relaxed mb-5">
            不想下载也可以，网页端有同样的日历体验，登录后数据互通。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/calendar"
              className="px-5 py-2.5 rounded-full bg-foreground/10 border border-foreground/15 text-sm hover:bg-foreground/15 transition"
            >
              打开网页日历
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
