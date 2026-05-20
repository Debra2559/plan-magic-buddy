import { useEffect, useMemo, useRef, useState } from "react";
import { useSylva, type Note, type Mood } from "@/lib/sylva-store";
import { Pin, PinOff, Trash2, Plus } from "lucide-react";

const MOOD_EMOJI: Record<Mood, string> = {
  great: "😄",
  good: "🙂",
  ok: "😐",
  down: "🙁",
  tired: "😴",
};

type Pos = { x: number; y: number };
const STORAGE_KEY = "sylva:notes-canvas:positions";
const CARD_W = 240;

function loadPositions(): Record<string, Pos> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function savePositions(p: Record<string, Pos>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** 给没有位置的卡片自动排版（按创建时间倒序、瀑布流式两列布局） */
function autoLayout(notes: Note[], existing: Record<string, Pos>): Record<string, Pos> {
  const next = { ...existing };
  const cols = 4;
  const gapX = 24;
  const gapY = 20;
  const startX = 24;
  const startY = 24;
  const colHeights = Array(cols).fill(startY);
  // 已有位置的卡片占据它原来的列
  notes.forEach((n) => {
    const p = next[n.id];
    if (!p) return;
    const c = Math.max(0, Math.min(cols - 1, Math.round((p.x - startX) / (CARD_W + gapX))));
    colHeights[c] = Math.max(colHeights[c], p.y + 160);
  });
  notes.forEach((n) => {
    if (next[n.id]) return;
    // 选最矮的列
    let c = 0;
    for (let i = 1; i < cols; i++) if (colHeights[i] < colHeights[c]) c = i;
    next[n.id] = { x: startX + c * (CARD_W + gapX), y: colHeights[c] };
    colHeights[c] += 180 + gapY;
  });
  return next;
}

export function NotesCanvas() {
  const { notes, removeNote, updateNote, addNote } = useSylva();
  const [positions, setPositions] = useState<Record<string, Pos>>(() => loadPositions());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 同步：新增的笔记自动获得位置
  useEffect(() => {
    setPositions((prev) => {
      const next = autoLayout(notes, prev);
      // 清理已删除的笔记位置
      const idSet = new Set(notes.map((n) => n.id));
      Object.keys(next).forEach((id) => {
        if (!idSet.has(id)) delete next[id];
      });
      if (JSON.stringify(next) !== JSON.stringify(prev)) {
        savePositions(next);
        return next;
      }
      return prev;
    });
  }, [notes]);

  const onPointerDown = (id: string, e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const pos = positions[id] ?? { x: 24, y: 24 };
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffset.current = {
      dx: e.clientX - rect.left - pos.x + containerRef.current!.scrollLeft,
      dy: e.clientY - rect.top - pos.y + containerRef.current!.scrollTop,
    };
    setDraggingId(id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !dragOffset.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - dragOffset.current.dx + containerRef.current.scrollLeft);
    const y = Math.max(0, e.clientY - rect.top - dragOffset.current.dy + containerRef.current.scrollTop);
    setPositions((prev) => ({ ...prev, [draggingId]: { x, y } }));
  };

  const onPointerUp = () => {
    if (draggingId) {
      setPositions((prev) => {
        savePositions(prev);
        return prev;
      });
    }
    setDraggingId(null);
    dragOffset.current = null;
  };

  // 画布大小：根据最远卡片决定
  const { canvasW, canvasH } = useMemo(() => {
    let w = 800;
    let h = 600;
    Object.values(positions).forEach((p) => {
      w = Math.max(w, p.x + CARD_W + 80);
      h = Math.max(h, p.y + 220);
    });
    return { canvasW: w, canvasH: h };
  }, [positions]);

  const handleAddBlank = () => {
    addNote("新便签", {});
  };

  return (
    <div className="relative h-full overflow-hidden bg-[radial-gradient(circle_at_20%_30%,rgba(245,184,67,0.05),transparent_60%),radial-gradient(circle_at_80%_70%,rgba(143,170,107,0.05),transparent_60%)]">
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-auto"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* 背景点阵 */}
        <div
          className="relative"
          style={{
            width: canvasW,
            height: canvasH,
            backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          {notes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/70 text-sm pointer-events-none">
              暂无随手记 · 在「列表」视图里写一条会自动出现在这里
            </div>
          )}
          {notes.map((n) => {
            const p = positions[n.id] ?? { x: 24, y: 24 };
            const isDragging = draggingId === n.id;
            const mood = n.mood ? MOOD_EMOJI[n.mood] : null;
            return (
              <div
                key={n.id}
                onPointerDown={(e) => onPointerDown(n.id, e)}
                className={`absolute select-none rounded-2xl border shadow-lg transition-shadow ${
                  isDragging
                    ? "border-amber-glow/60 shadow-amber-glow/20 cursor-grabbing z-20"
                    : "border-border hover:border-border cursor-grab z-10"
                } ${n.pinned ? "bg-amber-glow/[0.08]" : "bg-background/60 backdrop-blur-sm"}`}
                style={{
                  left: p.x,
                  top: p.y,
                  width: CARD_W,
                }}
              >
                <div className="p-3 flex items-start gap-2">
                  {mood && <span className="text-base shrink-0">{mood}</span>}
                  <p className="text-xs text-white/85 whitespace-pre-wrap break-words flex-1 leading-relaxed">
                    {n.text || "（空便签）"}
                  </p>
                </div>
                {n.images && n.images.length > 0 && (
                  <div className="px-3 pb-2 grid grid-cols-2 gap-1">
                    {n.images.slice(0, 4).map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt=""
                        draggable={false}
                        className="w-full h-16 object-cover rounded-md border border-border"
                      />
                    ))}
                  </div>
                )}
                {n.tags && n.tags.length > 0 && (
                  <div className="px-3 pb-2 flex flex-wrap gap-1">
                    {n.tags.map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/8 text-muted-foreground">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="px-3 py-2 border-t border-border/70 flex items-center justify-between text-[10px] text-muted-foreground/70">
                  <span>{new Date(n.createdAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</span>
                  <div className="flex items-center gap-1" data-no-drag>
                    <button
                      onClick={() => updateNote(n.id, { pinned: !n.pinned })}
                      className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-amber-glow"
                      title={n.pinned ? "取消置顶" : "置顶"}
                    >
                      {n.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => removeNote(n.id)}
                      className="p-1 rounded hover:bg-foreground/10 text-muted-foreground hover:text-accent"
                      title="删除"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 浮动新增按钮 */}
      <button
        onClick={handleAddBlank}
        className="absolute bottom-5 right-5 z-30 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-amber-glow text-primary-foreground text-xs font-medium shadow-lg hover:brightness-110"
      >
        <Plus className="w-3.5 h-3.5" />
        新便签
      </button>
    </div>
  );
}
