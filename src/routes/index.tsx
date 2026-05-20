import { createFileRoute, Link } from "@tanstack/react-router";
import forestBg from "@/assets/forest-bg.jpg";
import { CalendarWidget } from "@/components/widgets/CalendarWidget";
import { TodayWidget } from "@/components/widgets/TodayWidget";
import { QuickNoteWidget } from "@/components/widgets/QuickNoteWidget";
import { HabitsWidget } from "@/components/widgets/HabitsWidget";
import { AiPlanner } from "@/components/AiPlanner";
import { PhoneMockup } from "@/components/PhoneMockup";
import { Sparkles, RefreshCw, Apple, Smartphone, Monitor } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Sylva · 让 AI 替你规划每一天" },
      { name: "description", content: "集规划、日程、提醒、记录于一体的 Mac 与 iPhone 客户端。输入想法，AI 自动拆解为日程、待办与习惯，支持桌面/锁屏组件，飞书日程双向同步。" },
    ],
  }),
});

function Index() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Forest background */}
      <div className="fixed inset-0 -z-10">
        <img src={forestBg} alt="" className="w-full h-full object-cover" width={1920} height={1280} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 lg:px-16 py-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-glow/90 flex items-center justify-center">
            <span className="font-display text-primary-foreground text-sm">S</span>
          </div>
          <span className="font-display text-xl">Sylva</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-foreground/70">
          <a href="#widgets" className="hover:text-foreground transition">桌面组件</a>
          <a href="#ai" className="hover:text-foreground transition">AI 规划</a>
          <a href="#sync" className="hover:text-foreground transition">飞书同步</a>
        </div>
        <button className="text-sm px-4 py-2 rounded-full bg-foreground/10 border border-foreground/15 backdrop-blur hover:bg-foreground/15 transition">
          下载 macOS
        </button>
      </nav>

      {/* Hero */}
      <section className="relative px-8 lg:px-16 pt-16 pb-32 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-glow/10 border border-amber-glow/20 mb-8">
          <Sparkles className="w-3 h-3 text-amber-glow" />
          <span className="text-xs tracking-wider text-amber-glow">AI · 规划 · 日程 · 提醒 · 记录</span>
        </div>
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl leading-[1.05] mb-6">
          说一句想法，<br />
          <span className="italic text-amber-glow">替你排好</span>每一天。
        </h1>
        <p className="text-base md:text-lg text-foreground/70 max-w-2xl mx-auto leading-relaxed">
          为 Mac 与 iPhone 设计的智能规划助手。<br className="hidden md:inline" />
          像森林一样安静地待在你身边，把零散的想法长成可执行的节奏。
        </p>
        <div className="flex items-center justify-center gap-3 mt-10 flex-wrap">
          <Link to="/desktop" className="flex items-center gap-2 px-6 py-3 rounded-full bg-amber-glow text-primary-foreground text-sm font-medium hover:scale-[1.02] transition shadow-lg shadow-amber-glow/30">
            <Monitor className="w-4 h-4" /> 打开 Mac 桌面体验
          </Link>
          <a href="#download" className="flex items-center gap-2 px-6 py-3 rounded-full bg-foreground/10 border border-foreground/15 backdrop-blur text-sm hover:bg-foreground/15 transition">
            <Apple className="w-4 h-4" /> 下载 .app
          </a>
          <button className="flex items-center gap-2 px-6 py-3 rounded-full bg-foreground/10 border border-foreground/15 backdrop-blur text-sm hover:bg-foreground/15 transition">
            <Smartphone className="w-4 h-4" /> iPhone App
          </button>
        </div>
      </section>

      {/* Desktop scene with widgets */}
      <section id="widgets" className="relative px-8 lg:px-16 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
            <div>
              <p className="text-xs tracking-widest text-amber-glow mb-2">桌面组件 · macOS & iOS</p>
              <h2 className="font-display text-4xl md:text-5xl max-w-xl">把规划钉在你最常看的地方。</h2>
            </div>
            <p className="text-sm text-foreground/60 max-w-sm">
              日历、今日任务、随手记、习惯打卡 —— 钉在桌面或锁屏，一眼可见，单手可改。
            </p>
          </div>

          <div className="relative rounded-3xl overflow-hidden border border-foreground/10 bg-background/40 backdrop-blur p-10 lg:p-16">
            <div className="grid lg:grid-cols-[1fr_auto] gap-12 items-start">
              {/* Widgets cluster */}
              <div className="space-y-5">
                <div className="flex flex-wrap gap-5 justify-start">
                  <CalendarWidget />
                  <div className="space-y-5">
                    <TodayWidget />
                  </div>
                </div>
                <div className="flex flex-wrap gap-5">
                  <QuickNoteWidget />
                  <HabitsWidget />
                </div>
              </div>

              {/* Phone */}
              <div className="flex justify-center lg:justify-end">
                <PhoneMockup />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI section - LIVE */}
      <section id="ai" className="relative px-6 lg:px-16 py-32">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs tracking-widest text-amber-glow mb-3">AI · 智能规划 · 实时</p>
            <h2 className="font-display text-4xl md:text-6xl leading-tight mb-5">
              把想法<span className="italic">说出口</span>，<br />
              剩下的交给 Sylva。
            </h2>
            <p className="text-foreground/70 leading-relaxed max-w-2xl mx-auto">
              下面就是真实的 AI 规划面板 —— 输入一段想法，Sylva 会自动拆成日程、待办和提醒；
              你可以从 0 创建、调整重排、或者往现有规划里追加。
            </p>
          </div>
          <AiPlanner />
        </div>
      </section>

      {/* Feishu sync */}
      <section id="sync" className="relative px-8 lg:px-16 py-24">
        <div className="max-w-4xl mx-auto widget p-10 lg:p-14 text-center">
          <RefreshCw className="w-8 h-8 text-amber-glow mx-auto mb-4" strokeWidth={1.2} />
          <p className="text-xs tracking-widest text-amber-glow mb-3">飞书日程 · 双向同步</p>
          <h2 className="font-display text-3xl md:text-4xl mb-4">和你的工作节奏，对齐到一秒。</h2>
          <p className="text-foreground/70 max-w-xl mx-auto leading-relaxed mb-8">
            Sylva 的日程和飞书自动双向同步 —— 在飞书收到的会议立刻出现在桌面组件上，
            AI 拆出的待办也会回写到飞书，团队和自己都不掉链子。
          </p>
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-full bg-foreground/5 border border-foreground/10">
            <span className="w-2 h-2 rounded-full bg-moss animate-pulse-glow" />
            <span className="text-sm text-foreground/85">已连接飞书 · 上次同步 2 分钟前</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative px-8 lg:px-16 py-12 border-t border-foreground/10">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-foreground/50">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-amber-glow/80 flex items-center justify-center">
              <span className="font-display text-primary-foreground text-[10px]">S</span>
            </div>
            <span>Sylva · 像森林一样陪你长出节奏</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground transition">隐私</a>
            <a href="#" className="hover:text-foreground transition">条款</a>
            <a href="#" className="hover:text-foreground transition">支持</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
