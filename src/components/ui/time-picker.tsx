import { useEffect, useRef, useState } from "react";
import { Clock, X } from "lucide-react";

interface TimePickerProps {
  value: string; // "HH:MM" or ""
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  size?: "sm" | "md";
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

export function TimePicker({
  value,
  onChange,
  className = "",
  placeholder = "--:--",
  size = "sm",
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hourColRef = useRef<HTMLDivElement>(null);
  const minColRef = useRef<HTMLDivElement>(null);

  const [hh, mm] = value ? value.split(":") : ["", ""];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 仅在「打开」那一刻做一次性定位，之后切换值不再滚动，避免列表跳动。
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const scroll = (el: HTMLDivElement | null, idx: number) => {
        if (!el) return;
        const item = el.children[idx] as HTMLElement | undefined;
        if (!item) return;
        const target = item.offsetTop - el.clientHeight / 2 + item.clientHeight / 2;
        // 用 instant 行为，open 瞬间不要出现一段平滑滚动
        el.scrollTo({ top: target, behavior: "auto" });
      };
      const hIdx = hh ? HOURS.indexOf(hh) : new Date().getHours();
      const mInit = mm ? closest(mm) : "00";
      const mIdx = MINUTES.indexOf(mInit);
      scroll(hourColRef.current, hIdx >= 0 ? hIdx : 0);
      scroll(minColRef.current, mIdx >= 0 ? mIdx : 0);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 值变化时触发一次高亮闪烁（不动滚动位置）
  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => {
    if (!open) return;
    setFlashKey((k) => k + 1);
  }, [hh, mm, open]);

  const select = (newHh: string, newMm: string) => {
    onChange(`${newHh}:${newMm}`);
  };

  const padded = size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs";

  return (
    <div ref={wrapRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`group inline-flex items-center gap-1.5 rounded-md bg-white/5 border border-white/10 hover:border-amber-glow/40 hover:bg-amber-glow/[0.06] transition ${padded} font-mono tabular-nums ${
          value ? "text-amber-glow/95" : "text-white/40"
        } focus:outline-none focus:border-amber-glow/50`}
        title="选择时间"
      >
        <Clock className="w-3 h-3 opacity-70 group-hover:opacity-100" />
        <span>{value || placeholder}</span>
        {value && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="ml-0.5 opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:text-white transition"
            title="清除"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-[180px] rounded-xl border border-white/15 bg-zinc-950/95 backdrop-blur-md shadow-2xl shadow-black/60 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
            <span className="text-[10px] tracking-widest text-amber-glow/80 uppercase">时间</span>
            <span className="font-mono text-sm text-white/90 tabular-nums">
              {hh || "--"}<span className="text-white/30 mx-0.5">:</span>{mm || "--"}
            </span>
          </div>
          <div className="relative flex h-44">
            {/* 选中高亮 */}
            <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 h-8 rounded-md bg-amber-glow/10 border border-amber-glow/25" />
            <Column
              innerRef={hourColRef}
              items={HOURS}
              selected={hh}
              flashKey={flashKey}
              onPick={(v) => select(v, mm || "00")}
            />
            <div className="w-px bg-white/8" />
            <Column
              innerRef={minColRef}
              items={MINUTES}
              selected={mm && MINUTES.includes(mm) ? mm : mm ? closest(mm) : ""}
              flashKey={flashKey}
              onPick={(v) => select(hh || String(new Date().getHours()).padStart(2, "0"), v)}
            />

          </div>
          <div className="flex items-center justify-between px-2 py-1.5 border-t border-white/8 bg-black/30">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const closestMin = MINUTES.reduce((p, c) =>
                  Math.abs(+c - now.getMinutes()) < Math.abs(+p - now.getMinutes()) ? c : p,
                );
                onChange(`${String(now.getHours()).padStart(2, "0")}:${closestMin}`);
              }}
              className="px-2 py-0.5 text-[10px] rounded text-white/60 hover:text-amber-glow hover:bg-white/5"
            >
              现在
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-0.5 text-[10px] rounded text-amber-glow hover:bg-amber-glow/15"
            >
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function closest(mm: string) {
  return MINUTES.reduce((p, c) => (Math.abs(+c - +mm) < Math.abs(+p - +mm) ? c : p));
}

function Column({
  items,
  selected,
  onPick,
  innerRef,
  flashKey,
}: {
  items: string[];
  selected: string;
  onPick: (v: string) => void;
  innerRef: React.RefObject<HTMLDivElement | null>;
  flashKey: number;
}) {
  return (
    <div
      ref={innerRef}
      className="flex-1 overflow-y-auto py-[72px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((it) => {
        const active = it === selected;
        return (
          <button
            key={it}
            type="button"
            onClick={() => onPick(it)}
            className={`block w-full h-8 text-center font-mono tabular-nums text-sm transition-colors ${
              active
                ? "text-amber-glow font-semibold"
                : "text-white/55 hover:text-white"
            }`}
          >
            <span
              key={active ? `flash-${flashKey}` : "idle"}
              className={`inline-block px-2 rounded ${active ? "animate-date-flash" : ""}`}
            >
              {it}
            </span>
          </button>
        );
      })}
    </div>
  );
}
