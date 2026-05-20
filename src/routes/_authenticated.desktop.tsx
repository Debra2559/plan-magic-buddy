import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAdminStatus } from "@/lib/admin.functions";
import forestBg from "@/assets/forest-bg.jpg";
import { CalendarWidget } from "@/components/widgets/CalendarWidget";
import { TodayWidget } from "@/components/widgets/TodayWidget";
import { QuickNoteWidget } from "@/components/widgets/QuickNoteWidget";
import { HabitsWidget } from "@/components/widgets/HabitsWidget";
import { AiPlanner } from "@/components/AiPlanner";
import { InsightsBell } from "@/components/InsightsBell";
import { ScheduleView } from "@/components/views/ScheduleView";
import { TodosView } from "@/components/views/TodosView";
import { NotesView } from "@/components/views/NotesView";
import { HabitsView } from "@/components/views/HabitsView";
import { JournalView } from "@/components/views/JournalView";
import { AbilityView } from "@/components/views/AbilityView";
import { SettingsView } from "@/components/views/SettingsView";
import { SyncSummaryModal } from "@/components/SyncSummaryModal";
import { OnboardingHint } from "@/components/OnboardingHint";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSylva } from "@/lib/sylva-store";
import { usePersona } from "@/lib/persona";
import {
  Apple,
  Wifi,
  Battery,
  Search,
  Bluetooth,
  ChevronLeft,
  Maximize2,
  Calendar as CalIcon,
  CheckSquare,
  
  Sparkles,
  Settings,
  Music,
  Mail,
  Image as ImageIcon,
  BookHeart,
  Shield,
  Brain,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/desktop")({
  component: DesktopApp,
  head: () => ({
    meta: [
      { title: "Sylva for macOS · 桌面体验" },
      { name: "description", content: "Sylva macOS 客户端的实时桌面体验：菜单栏、Dock、桌面组件与主窗口可交互。" },
    ],
  }),
});

type WidgetId = "calendar" | "today" | "note" | "habits";

interface WinPos {
  x: number;
  y: number;
}

type SylvaView = "ai" | "schedule" | "todos" | "notes" | "habits" | "journal" | "ability" | "settings";

function DesktopApp() {
  const [now, setNow] = useState<Date | null>(null);
  const [positions, setPositions] = useState<Record<WidgetId, WinPos>>({
    calendar: { x: 32, y: 56 },
    today: { x: 470, y: 56 },
    note: { x: 32, y: 410 },
    habits: { x: 470, y: 410 },
  });
  const [appOpen, setAppOpen] = useState(true);
  const [appPos, setAppPos] = useState<WinPos>({ x: 240, y: 90 });
  const [appMaximized, setAppMaximized] = useState(true);
  const [activeDock, setActiveDock] = useState<string>("sylva");
  const [view, setView] = useState<SylvaView>(() => {
    if (typeof window === "undefined") return "ai";
    const v = new URLSearchParams(window.location.search).get("view");
    const allowed: SylvaView[] = ["schedule", "ai", "todos", "notes", "habits", "settings"];
    return (allowed as string[]).includes(v ?? "") ? (v as SylvaView) : "schedule";
  });
  const [todosFilter, setTodosFilter] = useState<"todo" | "reminder" | "event" | "all">("all");
  const { registerNavigate } = useSylva();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = (tab?: string) => {
    if (tab && typeof window !== "undefined") {
      const target = `#settings/${tab}`;
      if (window.location.hash !== target) {
        window.history.replaceState(null, "", target);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
    }
    setSettingsOpen(true);
    setAppOpen(true);
    setActiveDock("sylva");
  };

  useEffect(() => {
    try {
      if (localStorage.getItem("sylva:onboarding") === "1") {
        setShowOnboarding(true);
        localStorage.removeItem("sylva:onboarding");
      }
    } catch {}
  }, []);

  useEffect(() => {
    registerNavigate((nextView, opts) => {
      if (nextView === "settings") {
        openSettings();
        return;
      }
      setView(nextView as SylvaView);
      setAppOpen(true);
      setActiveDock("sylva");
      if (opts?.todosFilter) setTodosFilter(opts.todosFilter);
    });
  }, [registerNavigate]);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const time = now ? now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const day = now ? now.toLocaleDateString("zh-CN", { weekday: "short", month: "short", day: "numeric" }) : "";


  return (
    <div className="fixed inset-0 overflow-hidden bg-black select-none">
      {/* Wallpaper */}
      <img src={forestBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />

      {/* Top menu bar */}
      <div className="absolute top-0 inset-x-0 h-7 z-50 bg-black/30 backdrop-blur-2xl border-b border-white/10 flex items-center px-4 text-[13px] text-white/95">
        <Apple className="w-4 h-4 mr-4" fill="currentColor" strokeWidth={0} />
        <span className="font-semibold mr-5">Sylva</span>
        <span className="mr-4 hover:bg-white/10 px-2 py-0.5 rounded cursor-default">文件</span>
        <span className="mr-4 hover:bg-white/10 px-2 py-0.5 rounded cursor-default">编辑</span>
        <span className="mr-4 hover:bg-white/10 px-2 py-0.5 rounded cursor-default">视图</span>
        <span className="mr-4 hover:bg-white/10 px-2 py-0.5 rounded cursor-default">规划</span>
        <span className="mr-4 hover:bg-white/10 px-2 py-0.5 rounded cursor-default">窗口</span>
        <span className="hover:bg-white/10 px-2 py-0.5 rounded cursor-default">帮助</span>

        <div className="ml-auto flex items-center gap-3.5 text-[12px]">
          <Bluetooth className="w-3.5 h-3.5" />
          <Wifi className="w-3.5 h-3.5" />
          <Battery className="w-4 h-4" />
          <Search className="w-3.5 h-3.5" />
          <Sparkles className="w-3.5 h-3.5 text-amber-glow" />
          <span className="font-medium">{day} {time}</span>
        </div>
      </div>

      {/* Desktop widgets layer */}
      <div className="absolute inset-0 pt-7 pb-24">
        <DraggableWidget id="calendar" pos={positions.calendar} setPos={(p) => setPositions({ ...positions, calendar: p })} onDoubleClick={() => { setAppOpen(true); setActiveDock("sylva"); setView("schedule"); }}>
          <CalendarWidget />
        </DraggableWidget>
        <DraggableWidget id="today" pos={positions.today} setPos={(p) => setPositions({ ...positions, today: p })} onDoubleClick={() => { setAppOpen(true); setActiveDock("sylva"); setView("todos"); }}>
          <TodayWidget />
        </DraggableWidget>
        <DraggableWidget id="note" pos={positions.note} setPos={(p) => setPositions({ ...positions, note: p })} onDoubleClick={() => { setAppOpen(true); setActiveDock("sylva"); setView("notes"); }}>
          <QuickNoteWidget />
        </DraggableWidget>
        <DraggableWidget id="habits" pos={positions.habits} setPos={(p) => setPositions({ ...positions, habits: p })} onDoubleClick={() => { setAppOpen(true); setActiveDock("sylva"); setView("habits"); }}>
          <HabitsWidget />
        </DraggableWidget>

        {/* App window: Sylva */}
        {appOpen && (
          <AppWindow
            pos={appPos}
            setPos={setAppPos}
            maximized={appMaximized}
            onClose={() => setAppOpen(false)}
            onMinimize={() => setAppOpen(false)}
            onMaximize={() => setAppMaximized((m) => !m)}
          >
            <div className="flex h-full">
              {/* Sidebar */}
              <aside className="w-52 shrink-0 bg-black/30 backdrop-blur-xl border-r border-white/8 p-4 flex flex-col gap-1 text-[13px]">
                <AssistantHeader onClick={() => openSettings("persona")} />
                <SidebarItem icon={CalIcon} label="日程" active={view === "schedule"} onClick={() => setView("schedule")} />
                <SidebarItem icon={Sparkles} label="规划" active={view === "ai"} onClick={() => setView("ai")} />
                <SidebarItem icon={CheckSquare} label="待办" active={view === "todos"} onClick={() => setView("todos")} />
                <SidebarItem icon={BookHeart} label="记录" active={view === "notes" || view === "journal"} onClick={() => setView("notes")} />
                <SidebarItem icon={Sparkles} label="习惯" active={view === "habits"} onClick={() => setView("habits")} />
                <SidebarItem icon={Brain} label="能力" active={view === "ability"} onClick={() => setView("ability")} />
                <div className="mt-auto pt-4 border-t border-white/8">
                  <SidebarItem icon={Settings} label="设置" active={false} onClick={openSettings} muted />
                </div>
              </aside>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                {view === "ai" && <div className="overflow-auto h-full p-6"><AiPlanner onGoSettings={openSettings} /></div>}
                {view === "schedule" && <ScheduleView onGoPlan={() => setView("ai")} onGoSettings={openSettings} />}
                {view === "todos" && <TodosView initialFilter={todosFilter} filterKey={todosFilter} />}
                {view === "notes" && <NotesView />}
                {view === "habits" && <HabitsView />}
                {view === "journal" && <JournalView />}
                {view === "ability" && <AbilityView />}
              </div>
            </div>
          </AppWindow>
        )}
      </div>

      <InsightsBell />



      {/* Dock */}
      <div className="absolute bottom-3 inset-x-0 z-50 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-end gap-2 px-3 py-2 rounded-2xl bg-white/10 backdrop-blur-2xl border border-white/15 shadow-2xl">
          <DockIcon id="sylva" label="Sylva" active={activeDock === "sylva"} onClick={() => { setActiveDock("sylva"); setAppOpen(true); }}>
            <div className="w-full h-full rounded-xl bg-gradient-to-br from-amber-glow to-moss flex items-center justify-center">
              <span className="font-display text-primary-foreground text-xl">S</span>
            </div>
          </DockIcon>
          <DockIcon id="cal" label="日历" onClick={() => setActiveDock("cal")} active={activeDock === "cal"}>
            <div className="w-full h-full rounded-xl bg-white flex flex-col overflow-hidden">
              <div className="h-1/4 bg-red-500 text-white text-[8px] flex items-center justify-center font-bold">5月</div>
              <div className="flex-1 flex items-center justify-center text-black text-xl font-bold">19</div>
            </div>
          </DockIcon>
          <DockIcon id="mail" label="邮件" onClick={() => setActiveDock("mail")} active={activeDock === "mail"}>
            <div className="w-full h-full rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center">
              <Mail className="w-6 h-6 text-white" />
            </div>
          </DockIcon>
          <DockIcon id="music" label="音乐" onClick={() => setActiveDock("music")} active={activeDock === "music"}>
            <div className="w-full h-full rounded-xl bg-gradient-to-br from-pink-400 to-rose-600 flex items-center justify-center">
              <Music className="w-6 h-6 text-white" />
            </div>
          </DockIcon>
          <DockIcon id="photos" label="照片" onClick={() => setActiveDock("photos")} active={activeDock === "photos"}>
            <div className="w-full h-full rounded-xl bg-gradient-to-br from-purple-400 to-orange-400 flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-white" />
            </div>
          </DockIcon>
          <div className="w-px self-stretch bg-white/20 mx-1" />
          <DockIcon id="feishu" label="飞书" onClick={() => setActiveDock("feishu")} active={activeDock === "feishu"}>
            <div className="w-full h-full rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">飞</div>
          </DockIcon>
        </div>
      </div>

      {/* Back to landing */}
      <Link
        to="/"
        className="absolute top-10 left-3 z-50 flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/30 backdrop-blur text-white/80 hover:bg-black/50 text-xs border border-white/10"
      >
        <ChevronLeft className="w-3 h-3" /> 返回介绍页
      </Link>

      {showOnboarding && <OnboardingHint onClose={() => setShowOnboarding(false)} />}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen} modal>
        <DialogContent
          className="max-w-4xl w-[92vw] p-0 bg-[#1a1d24] border-white/10 text-white overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={() => setSettingsOpen(false)}
          onPointerDownOutside={() => setSettingsOpen(false)}
          onInteractOutside={() => setSettingsOpen(false)}
        >
          <DialogTitle className="sr-only">设置</DialogTitle>
          <div
            className="max-h-[82vh] overflow-auto overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <SettingsView />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DraggableWidget({
  id,
  pos,
  setPos,
  onDoubleClick,
  children,
}: {
  id: string;
  pos: WinPos;
  setPos: (p: WinPos) => void;
  onDoubleClick?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ ox: number; oy: number; moved: boolean } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y, moved: false };
    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      drag.current.moved = true;
      setPos({ x: ev.clientX - drag.current.ox, y: ev.clientY - drag.current.oy });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      ref={ref}
      data-widget={id}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      style={{ left: pos.x, top: pos.y }}
      className="absolute cursor-grab active:cursor-grabbing group"
      title="双击编辑"
    >
      {children}
      <div className="pointer-events-none absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition px-2 py-0.5 rounded-full bg-black/70 text-white text-[10px] border border-white/10">
        双击编辑
      </div>
    </div>
  );
}

function AppWindow({
  pos,
  setPos,
  maximized,
  children,
  onClose,
  onMinimize,
  onMaximize,
}: {
  pos: WinPos;
  setPos: (p: WinPos) => void;
  maximized: boolean;
  children: React.ReactNode;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
}) {
  const drag = useRef<{ ox: number; oy: number } | null>(null);

  const onBarMouseDown = (e: React.MouseEvent) => {
    if (maximized) return;
    drag.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y };
    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      setPos({ x: ev.clientX - drag.current.ox, y: ev.clientY - drag.current.oy });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const style = maximized
    ? { left: 12, top: 36, right: 12, bottom: 96 }
    : { left: pos.x, top: pos.y, width: "min(960px, calc(100vw - 80px))", height: "min(640px, calc(100vh - 160px))" };

  return (
    <div
      style={style as React.CSSProperties}
      className="absolute z-40 rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-background/85 backdrop-blur-2xl flex flex-col"
    >
      {/* Title bar */}
      <div
        onMouseDown={onBarMouseDown}
        className="h-9 shrink-0 flex items-center px-3 border-b border-white/8 bg-black/20 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-1.5">
          <button onClick={onClose} className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110" />
          <button onClick={onMinimize} className="w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-110" />
          <button onClick={onMaximize} className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-110" />
        </div>
        <div className="flex-1 text-center text-xs text-white/70 font-medium pointer-events-none">
          Sylva — AI 规划
        </div>
        <Maximize2 className="w-3 h-3 text-white/40" />
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  muted,
  onClick,
}: {
  icon: typeof Sparkles;
  label: string;
  active?: boolean;
  muted?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition
        ${active ? "bg-amber-glow/20 text-amber-glow" : muted ? "text-white/40 hover:bg-white/5" : "text-white/80 hover:bg-white/8"}`}
    >
      <Icon className="w-4 h-4" strokeWidth={1.8} />
      <span>{label}</span>
    </button>
  );
}

function AssistantHeader({ onClick }: { onClick?: () => void }) {
  const { persona } = usePersona();
  const aiName = (persona?.ai_nickname || "").trim() || "Sylva";
  const userName = (persona?.display_name || "").trim() || "主人";
  const avatar = persona?.avatar_url || null;
  const initial = aiName.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-5 px-2 group block w-full text-left transition active:scale-[0.98]"
      title="编辑人设（头像 / 名称）"
    >
      <div className="flex items-center gap-2.5">
        <div className="relative w-9 h-9 rounded-full overflow-hidden ring-1 ring-white/15 shadow-lg shrink-0 group-hover:ring-amber-glow/60 transition">
          {avatar ? (
            <img src={avatar} alt={aiName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-amber-glow to-moss flex items-center justify-center">
              <span className="font-display text-primary-foreground text-sm">{initial}</span>
            </div>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-black/70" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-base text-white truncate group-hover:text-amber-glow transition">
            {aiName}
          </div>
          <div className="text-[10px] text-white/40 group-hover:text-white/70 transition truncate">
            为 {userName} 服务 · 点击编辑人设
          </div>
        </div>
      </div>
    </button>
  );
}



function DockIcon({
  label,
  active,
  onClick,
  children,
}: {
  id: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative w-12 h-12 hover:scale-125 hover:-translate-y-1 transition-transform duration-200 origin-bottom"
      title={label}
    >
      {children}
      {active && <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white" />}
      <span className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition px-2 py-0.5 rounded bg-black/70 text-white text-[10px] whitespace-nowrap pointer-events-none">
        {label}
      </span>
    </button>
  );
}
