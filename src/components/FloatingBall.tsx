import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles, ClipboardPaste, CalendarPlus, MessageSquare,
  ListTodo, X, GripVertical,
} from "lucide-react";
import { useSylva, todayLocal } from "@/lib/sylva-store";
import { usePersona, resolveAvatarUrl } from "@/lib/persona";

const STORAGE_KEY = "floating-ball:v1";

type Pos = { x: number; y: number; enabled: boolean };

function loadPos(): Pos {
  if (typeof window === "undefined") return { x: 24, y: 200, enabled: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { enabled: true, ...JSON.parse(raw) };
  } catch {}
  return {
    x: Math.max(16, window.innerWidth - 80),
    y: Math.max(80, window.innerHeight / 2 - 28),
    enabled: true,
  };
}

export function FloatingBall() {
  const { addItems, navigateTo } = useSylva();
  const { persona } = usePersona();
  const avatarSrc = resolveAvatarUrl(persona?.avatar_url);
  const aiName = persona?.ai_nickname || "Sylva";
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<Pos>({ x: 24, y: 200, enabled: true });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const movedRef = useRef(false);
  const offsetRef = useRef({ dx: 0, dy: 0 });

  useEffect(() => {
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    setPos(loadPos());
    setMounted(true);
    const onUpdate = () => setPos(loadPos());
    window.addEventListener("floating-ball:update", onUpdate);
    return () => window.removeEventListener("floating-ball:update", onUpdate);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ x: pos.x, y: pos.y, enabled: pos.enabled }),
      );
    } catch {}
  }, [pos]);

  useEffect(() => {
    const snap = () => {
      setPos((p) => ({
        ...p,
        x: Math.min(Math.max(8, p.x), window.innerWidth - 64),
        y: Math.min(Math.max(8, p.y), window.innerHeight - 64),
      }));
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", snap);
    return () => window.removeEventListener("resize", snap);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    movedRef.current = false;
    offsetRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const nx = e.clientX - offsetRef.current.dx;
    const ny = e.clientY - offsetRef.current.dy;
    if (Math.abs(nx - pos.x) + Math.abs(ny - pos.y) > 3) movedRef.current = true;
    setPos((p) => ({ ...p, x: nx, y: ny }));
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    // 自由停放：仅做边界保护，不再贴边吸附
    setPos((p) => ({
      ...p,
      x: Math.min(Math.max(8, p.x), window.innerWidth - 56),
      y: Math.min(Math.max(8, p.y), window.innerHeight - 56),
    }));
    if (!movedRef.current) setOpen((o) => !o);
  };

  const quickCapture = async () => {
    let clip = "";
    try { clip = (await navigator.clipboard.readText()).trim(); } catch {}
    const url = window.location.href;
    const pageTitle = document.title;
    const previewSrc = clip || pageTitle || url || "快速记录";
    const preview = previewSrc.length > 28 ? previewSrc.slice(0, 26) + "…" : previewSrc;
    const noteParts: string[] = [];
    if (clip) noteParts.push(`剪贴板: ${clip}`);
    if (pageTitle) noteParts.push(`页面: ${pageTitle}`);
    if (url) noteParts.push(`链接: ${url}`);
    addItems([{
      type: "event",
      title: `速记: ${preview}`,
      date: todayLocal(),
      time: new Date().toTimeString().slice(0, 5),
      tag: "速记",
      note: noteParts.join(" · ") || "（无内容）",
    }]);
    toast.success("已加入今日事件", { description: clip ? "剪贴板已记录" : "当前页面已记录" });
    setOpen(false);
  };

  const newEvent = () => {
    addItems([{
      type: "event",
      title: "新事件",
      date: todayLocal(),
      time: new Date().toTimeString().slice(0, 5),
      tag: "速记",
    }]);
    toast.success("已新建一条今日事件");
    navigateTo("schedule");
    setOpen(false);
  };

  const goAI = () => { navigateTo("ai"); setOpen(false); };
  const goToday = () => { navigateTo("schedule"); setOpen(false); };

  if (!mounted || !pos.enabled) return null;

  const snapLeft = pos.x < viewport.width / 2;

  return (
    <>
      {/* 柔光晕底 */}
      <div
        aria-hidden
        style={{ left: pos.x - 10, top: pos.y - 10 }}
        className={`fixed z-[59] w-[68px] h-[68px] rounded-full pointer-events-none
          bg-gradient-to-br from-amber-glow/40 via-rose-300/20 to-moss/30 blur-2xl
          transition-opacity duration-500 ${dragging ? "opacity-90" : "opacity-60"}`}
      />
      <div
        role="button"
        aria-label={`${aiName} 悬浮球`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ left: pos.x, top: pos.y }}
        className={`group fixed z-[60] w-12 h-12 rounded-full select-none touch-none
          flex items-center justify-center cursor-grab active:cursor-grabbing
          bg-gradient-to-br from-amber-glow via-orange-400 to-moss
          text-primary-foreground overflow-hidden
          shadow-[0_10px_30px_-8px_rgba(180,90,30,0.55),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-6px_12px_rgba(0,0,0,0.25)]
          ring-1 ring-white/20
          hover:scale-110 active:scale-95 transition-transform duration-200 ease-out
          ${dragging ? "scale-95" : ""}`}
        title={aiName}
      >
        {/* AI 头像 */}
        <img
          src={avatarSrc}
          alt={aiName}
          draggable={false}
          className="relative w-full h-full object-cover rounded-full pointer-events-none"
        />
        {/* 顶部高光 */}
        <span aria-hidden className="absolute inset-x-2 top-1 h-3 rounded-full bg-white/35 blur-[3px] pointer-events-none" />
        {/* 旋转光环 */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full opacity-50 group-hover:opacity-90 transition-opacity pointer-events-none"
          style={{
            background: "conic-gradient(from 0deg, transparent 0%, rgba(255,255,255,0.45) 25%, transparent 50%, rgba(255,200,120,0.4) 75%, transparent 100%)",
            maskImage: "radial-gradient(circle, transparent 60%, black 63%, black 100%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 60%, black 63%, black 100%)",
            animation: "spin 6s linear infinite",
          }}
        />
        {/* 右下角微光火花标记，提示这是 AI 入口 */}
        <Sparkles aria-hidden className="absolute bottom-0.5 right-0.5 w-3 h-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
      </div>

      {open && (
        <div
          style={{
            left: snapLeft ? pos.x + 56 : undefined,
            right: snapLeft ? undefined : viewport.width - pos.x + 8,
            top: Math.min(Math.max(12, pos.y - 8), viewport.height - 280),
          }}
          className="fixed z-[60] w-52 rounded-2xl p-2 bg-background/95 backdrop-blur-xl
            border border-foreground/10 shadow-2xl animate-in fade-in zoom-in-95"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[10px] tracking-wider text-foreground/50 flex items-center gap-1">
              <GripVertical className="w-3 h-3" /> 快捷面板
            </span>
            <button
              onClick={() => setOpen(false)}
              className="text-foreground/40 hover:text-foreground transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <BallAction icon={<ClipboardPaste className="w-4 h-4" />} label="速记剪贴板" hint="Shift+Q+W" onClick={quickCapture} />
          <BallAction icon={<CalendarPlus className="w-4 h-4" />} label="新建事件" onClick={newEvent} />
          <BallAction icon={<MessageSquare className="w-4 h-4" />} label="跟 AI 聊聊" onClick={goAI} />
          <BallAction icon={<ListTodo className="w-4 h-4" />} label="查看今日" onClick={goToday} />
          <button
            onClick={() => { setPos((p) => ({ ...p, enabled: false })); setOpen(false); toast("已隐藏悬浮球", { description: "在设置中可重新开启" }); }}
            className="w-full mt-1 text-[10px] text-foreground/40 hover:text-foreground/70 transition py-1.5"
          >
            隐藏悬浮球
          </button>
        </div>
      )}
    </>
  );
}

function BallAction({
  icon, label, hint, onClick,
}: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg
        text-xs text-foreground/80 hover:bg-foreground/5 hover:text-foreground transition"
    >
      <span className="text-amber-glow">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {hint && <span className="text-[9px] text-foreground/40">{hint}</span>}
    </button>
  );
}

/** 工具函数：从外部（例如设置页）启用/隐藏悬浮球 */
export function setFloatingBallEnabled(enabled: boolean) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const cur = raw ? JSON.parse(raw) : {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, enabled }));
    window.dispatchEvent(new Event("floating-ball:update"));
  } catch {}
}

export function enableFloatingBall() {
  setFloatingBallEnabled(true);
}

/** 重置悬浮球到右侧中部 */
export function resetFloatingBallPosition() {
  try {
    const x = Math.max(16, window.innerWidth - 64);
    const y = Math.max(80, window.innerHeight / 2 - 28);
    const raw = localStorage.getItem(STORAGE_KEY);
    const cur = raw ? JSON.parse(raw) : {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, x, y, enabled: true }));
    window.dispatchEvent(new Event("floating-ball:update"));
  } catch {}
}

export function getFloatingBallEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const v = JSON.parse(raw);
    return v.enabled !== false;
  } catch { return true; }
}
