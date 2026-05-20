import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  MousePointer2, StickyNote, Pen, ArrowRight, Image as ImageIcon,
  Trash2, ZoomIn, ZoomOut, Maximize2, Loader2, Hand,
} from "lucide-react";
import { toast } from "sonner";

type Tool = "select" | "pan" | "note" | "pen" | "arrow" | "image";

interface BaseItem { id: string; type: string; }
interface NoteItem extends BaseItem { type: "note"; x: number; y: number; w: number; h: number; text: string; color: string; }
interface StrokeItem extends BaseItem { type: "stroke"; points: number[]; color: string; width: number; }
interface ImageItem extends BaseItem { type: "image"; x: number; y: number; w: number; h: number; url: string; }
interface EdgeItem extends BaseItem { type: "edge"; x1: number; y1: number; x2: number; y2: number; color: string; }
type Item = NoteItem | StrokeItem | ImageItem | EdgeItem;

interface Viewport { x: number; y: number; scale: number; }
interface CanvasData { items: Item[]; viewport: Viewport; }

const EMPTY: CanvasData = { items: [], viewport: { x: 0, y: 0, scale: 1 } };
const NOTE_COLORS = ["#FEF3C7", "#FCE7F3", "#DBEAFE", "#D1FAE5", "#EDE9FE", "#FFFFFF"];

interface Props { kind: "notes" | "journal"; title?: string; }

export function FreeformCanvas({ kind, title }: Props) {
  const { user } = useAuth();
  const [data, setData] = useState<CanvasData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const [penColor, setPenColor] = useState("#1f2937");
  const [penWidth, setPenWidth] = useState(2);
  const [saving, setSaving] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  // ---- Load + realtime ----
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: row } = await supabase
        .from("canvas_documents").select("data").eq("user_id", user.id).eq("kind", kind).maybeSingle();
      if (cancelled) return;
      if (row?.data) setData(row.data as unknown as CanvasData);
      else {
        await supabase.from("canvas_documents").insert({ user_id: user.id, kind, data: EMPTY as any });
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel(`canvas:${user.id}:${kind}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "canvas_documents", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { kind: string; data: CanvasData };
          if (row.kind === kind) setData(row.data);
        })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user, kind]);

  const persist = useCallback((next: CanvasData) => {
    setData(next);
    if (!user) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await supabase.from("canvas_documents")
        .upsert({ user_id: user.id, kind, data: next as any }, { onConflict: "user_id,kind" });
      setSaving(false);
    }, 400);
  }, [user, kind]);

  // ---- Coords ----
  const toCanvas = useCallback((cx: number, cy: number): [number, number] => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    const { x, y, scale } = dataRef.current.viewport;
    return [(cx - rect.left - x) / scale, (cy - rect.top - y) / scale];
  }, []);

  // ---- Pan ----
  const panState = useRef<{ active: boolean; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const onWheel = (e: React.WheelEvent) => {
    if (!wrapRef.current) return;
    e.preventDefault();
    const { x, y, scale } = dataRef.current.viewport;
    if (e.ctrlKey || e.metaKey) {
      // pinch-zoom on trackpad sends ctrlKey
      const rect = wrapRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.01);
      const newScale = Math.min(3, Math.max(0.25, scale * factor));
      const nx = mx - (mx - x) * (newScale / scale);
      const ny = my - (my - y) * (newScale / scale);
      persist({ ...dataRef.current, viewport: { x: nx, y: ny, scale: newScale } });
    } else {
      persist({ ...dataRef.current, viewport: { x: x - e.deltaX, y: y - e.deltaY, scale } });
    }
  };

  // ---- Drawing / creation ----
  const drawing = useRef<{ id: string; pts: number[] } | null>(null);
  const dragging = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const resizing = useRef<{ id: string; sw: number; sh: number; sx: number; sy: number } | null>(null);
  const drawingEdge = useRef<{ id: string } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || tool === "pan" || (tool === "select" && e.button === 0 && (e.target as HTMLElement).dataset.canvasBg)) {
      // pan
      const { x, y } = dataRef.current.viewport;
      panState.current = { active: true, sx: e.clientX, sy: e.clientY, ox: x, oy: y };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (!(e.target as HTMLElement).dataset.canvasBg) return;
    const [cx, cy] = toCanvas(e.clientX, e.clientY);
    const id = crypto.randomUUID();
    if (tool === "note") {
      const item: NoteItem = { id, type: "note", x: cx - 90, y: cy - 50, w: 180, h: 120, text: "", color: noteColor };
      persist({ ...dataRef.current, items: [...dataRef.current.items, item] });
      setSelected(id); setTool("select");
    } else if (tool === "pen") {
      drawing.current = { id, pts: [cx, cy] };
      const item: StrokeItem = { id, type: "stroke", points: [cx, cy], color: penColor, width: penWidth };
      setData((d) => ({ ...d, items: [...d.items, item] }));
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else if (tool === "arrow") {
      drawingEdge.current = { id };
      const item: EdgeItem = { id, type: "edge", x1: cx, y1: cy, x2: cx, y2: cy, color: penColor };
      setData((d) => ({ ...d, items: [...d.items, item] }));
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (panState.current?.active) {
      const p = panState.current;
      persist({ ...dataRef.current, viewport: { ...dataRef.current.viewport, x: p.ox + (e.clientX - p.sx), y: p.oy + (e.clientY - p.sy) } });
      return;
    }
    if (drawing.current) {
      const [cx, cy] = toCanvas(e.clientX, e.clientY);
      drawing.current.pts.push(cx, cy);
      const id = drawing.current.id;
      const pts = drawing.current.pts.slice();
      setData((d) => ({ ...d, items: d.items.map((it) => it.id === id && it.type === "stroke" ? { ...it, points: pts } : it) }));
      return;
    }
    if (drawingEdge.current) {
      const [cx, cy] = toCanvas(e.clientX, e.clientY);
      const id = drawingEdge.current.id;
      setData((d) => ({ ...d, items: d.items.map((it) => it.id === id && it.type === "edge" ? { ...it, x2: cx, y2: cy } : it) }));
      return;
    }
    if (dragging.current) {
      const [cx, cy] = toCanvas(e.clientX, e.clientY);
      const id = dragging.current.id;
      const { offX, offY } = dragging.current;
      setData((d) => ({ ...d, items: d.items.map((it) => it.id === id && "x" in it ? { ...it, x: cx - offX, y: cy - offY } : it) }));
      return;
    }
    if (resizing.current) {
      const [cx, cy] = toCanvas(e.clientX, e.clientY);
      const r = resizing.current;
      const nw = Math.max(80, r.sw + (cx - r.sx));
      const nh = Math.max(60, r.sh + (cy - r.sy));
      setData((d) => ({ ...d, items: d.items.map((it) => it.id === r.id && "w" in it ? { ...it, w: nw, h: nh } : it) }));
      return;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (panState.current) { panState.current = null; (e.target as Element).releasePointerCapture?.(e.pointerId); return; }
    if (drawing.current || drawingEdge.current || dragging.current || resizing.current) {
      drawing.current = null; drawingEdge.current = null; dragging.current = null; resizing.current = null;
      persist(dataRef.current);
    }
  };

  // ---- Image upload ----
  const fileRef = useRef<HTMLInputElement>(null);
  const handleImage = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) { toast.error("请选择图片"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("图片需小于 8MB"); return; }
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/canvas-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type, cacheControl: "31536000" });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const img = new Image();
      img.onload = () => {
        const maxW = 320; const ratio = img.width > maxW ? maxW / img.width : 1;
        const w = img.width * ratio, h = img.height * ratio;
        const rect = wrapRef.current!.getBoundingClientRect();
        const [cx, cy] = toCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const item: ImageItem = { id: crypto.randomUUID(), type: "image", x: cx - w / 2, y: cy - h / 2, w, h, url: pub.publicUrl };
        persist({ ...dataRef.current, items: [...dataRef.current.items, item] });
      };
      img.src = pub.publicUrl;
    } catch (e: any) { toast.error(e?.message ?? "上传失败"); }
  };

  // ---- Item helpers ----
  const updateItem = (id: string, patch: Partial<Item>) => {
    persist({ ...dataRef.current, items: dataRef.current.items.map((it) => it.id === id ? { ...it, ...patch } as Item : it) });
  };
  const deleteSelected = () => {
    if (!selected) return;
    persist({ ...dataRef.current, items: dataRef.current.items.filter((it) => it.id !== selected) });
    setSelected(null);
  };
  const resetView = () => persist({ ...dataRef.current, viewport: { x: 0, y: 0, scale: 1 } });
  const zoomBy = (f: number) => {
    const { x, y, scale } = dataRef.current.viewport;
    const rect = wrapRef.current!.getBoundingClientRect();
    const mx = rect.width / 2, my = rect.height / 2;
    const ns = Math.min(3, Math.max(0.25, scale * f));
    persist({ ...dataRef.current, viewport: { x: mx - (mx - x) * (ns / scale), y: my - (my - y) * (ns / scale), scale: ns } });
  };

  // delete key
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !(e.target as HTMLElement).closest("textarea,input")) {
        e.preventDefault(); deleteSelected();
      }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });

  const cursor = useMemo(() => {
    if (tool === "pan") return "grab";
    if (tool === "pen" || tool === "arrow") return "crosshair";
    if (tool === "note") return "copy";
    return "default";
  }, [tool]);

  if (!user) return <div className="p-8 text-white/60 text-sm">请先登录使用画布</div>;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10 bg-white/[0.02] backdrop-blur-sm flex-wrap">
        <span className="text-xs text-white/50 mr-2 font-display">{title ?? (kind === "notes" ? "笔记画布" : "日记画布")}</span>
        <ToolBtn active={tool === "select"} onClick={() => setTool("select")} icon={<MousePointer2 className="w-3.5 h-3.5" />} label="选择" />
        <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} icon={<Hand className="w-3.5 h-3.5" />} label="平移" />
        <div className="w-px h-5 bg-white/10 mx-1" />
        <ToolBtn active={tool === "note"} onClick={() => setTool("note")} icon={<StickyNote className="w-3.5 h-3.5" />} label="便签" />
        <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} icon={<Pen className="w-3.5 h-3.5" />} label="画笔" />
        <ToolBtn active={tool === "arrow"} onClick={() => setTool("arrow")} icon={<ArrowRight className="w-3.5 h-3.5" />} label="箭头" />
        <ToolBtn active={tool === "image"} onClick={() => fileRef.current?.click()} icon={<ImageIcon className="w-3.5 h-3.5" />} label="图片" />
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = ""; }} />

        <div className="w-px h-5 bg-white/10 mx-1" />
        {tool === "note" && (
          <div className="flex items-center gap-1">
            {NOTE_COLORS.map((c) => (
              <button key={c} onClick={() => setNoteColor(c)}
                className={`w-4 h-4 rounded-sm border ${noteColor === c ? "ring-2 ring-amber-glow border-white/40" : "border-white/20"}`}
                style={{ background: c }} title={c} />
            ))}
          </div>
        )}
        {(tool === "pen" || tool === "arrow") && (
          <div className="flex items-center gap-2">
            <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} className="w-6 h-6 bg-transparent border-none cursor-pointer" />
            {tool === "pen" && (
              <input type="range" min={1} max={10} value={penWidth} onChange={(e) => setPenWidth(Number(e.target.value))} className="w-20 accent-amber-glow" />
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 text-xs text-white/50">
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          <button onClick={() => zoomBy(1 / 1.2)} className="p-1 hover:bg-white/10 rounded" title="缩小"><ZoomOut className="w-3.5 h-3.5" /></button>
          <span className="tabular-nums w-10 text-center">{Math.round(data.viewport.scale * 100)}%</span>
          <button onClick={() => zoomBy(1.2)} className="p-1 hover:bg-white/10 rounded" title="放大"><ZoomIn className="w-3.5 h-3.5" /></button>
          <button onClick={resetView} className="p-1 hover:bg-white/10 rounded" title="回到原点"><Maximize2 className="w-3.5 h-3.5" /></button>
          {selected && (
            <button onClick={deleteSelected} className="p-1 hover:bg-rose-500/20 hover:text-rose-300 rounded" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={wrapRef}
        className="relative flex-1 overflow-hidden bg-white"
        style={{ cursor, touchAction: "none" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={(e) => { if ((e.target as HTMLElement).dataset.canvasBg) setSelected(null); }}
      >
        {/* dotted bg */}
        <div data-canvas-bg="1" className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, #d4d4d8 1px, transparent 1px)",
            backgroundSize: `${24 * data.viewport.scale}px ${24 * data.viewport.scale}px`,
            backgroundPosition: `${data.viewport.x}px ${data.viewport.y}px`,
          }}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> 加载画布…
          </div>
        )}
        <div
          className="absolute top-0 left-0"
          style={{ transform: `translate(${data.viewport.x}px, ${data.viewport.y}px) scale(${data.viewport.scale})`, transformOrigin: "0 0" }}
        >
          {/* SVG strokes + edges */}
          <svg style={{ position: "absolute", left: -50000, top: -50000, width: 100000, height: 100000, pointerEvents: "none", overflow: "visible" }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
              </marker>
            </defs>
            {data.items.map((it) => {
              if (it.type === "stroke") {
                const d = strokeToPath(it.points);
                return <path key={it.id} d={d} stroke={it.color} strokeWidth={it.width} fill="none" strokeLinecap="round" strokeLinejoin="round"
                  style={{ pointerEvents: "stroke" }} onPointerDown={(e) => { e.stopPropagation(); setSelected(it.id); }} />;
              }
              if (it.type === "edge") {
                const active = selected === it.id;
                return <line key={it.id} x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2}
                  stroke={it.color} strokeWidth={active ? 2.5 : 2}
                  style={{ pointerEvents: "stroke", color: it.color }} markerEnd="url(#arrow)"
                  onPointerDown={(e) => { e.stopPropagation(); setSelected(it.id); }} />;
              }
              return null;
            })}
          </svg>

          {/* Notes & images */}
          {data.items.map((it) => {
            if (it.type === "note") {
              const active = selected === it.id;
              return (
                <div key={it.id}
                  className={`absolute rounded-md shadow-md ${active ? "ring-2 ring-amber-glow" : "ring-1 ring-black/5"}`}
                  style={{ left: it.x, top: it.y, width: it.w, height: it.h, background: it.color, transform: "rotate(-0.4deg)" }}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
                    e.stopPropagation(); setSelected(it.id);
                    const [cx, cy] = toCanvas(e.clientX, e.clientY);
                    dragging.current = { id: it.id, offX: cx - it.x, offY: cy - it.y };
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                  }}
                  onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                >
                  <textarea
                    value={it.text} onChange={(e) => updateItem(it.id, { text: e.target.value } as Partial<NoteItem>)}
                    placeholder="写点什么…"
                    className="w-full h-full p-3 bg-transparent outline-none resize-none text-zinc-800 text-sm leading-relaxed font-display placeholder:text-zinc-500/60"
                    onFocus={() => setSelected(it.id)}
                  />
                  {active && <ResizeHandle item={it} onStart={(e) => {
                    e.stopPropagation();
                    const [cx, cy] = toCanvas(e.clientX, e.clientY);
                    resizing.current = { id: it.id, sw: it.w, sh: it.h, sx: cx, sy: cy };
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                  }} />}
                </div>
              );
            }
            if (it.type === "image") {
              const active = selected === it.id;
              return (
                <div key={it.id}
                  className={`absolute rounded ${active ? "ring-2 ring-amber-glow" : ""}`}
                  style={{ left: it.x, top: it.y, width: it.w, height: it.h }}
                  onPointerDown={(e) => {
                    e.stopPropagation(); setSelected(it.id);
                    const [cx, cy] = toCanvas(e.clientX, e.clientY);
                    dragging.current = { id: it.id, offX: cx - it.x, offY: cy - it.y };
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                  }}
                  onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                >
                  <img src={it.url} alt="" draggable={false} className="w-full h-full object-cover rounded select-none pointer-events-none" />
                  {active && <ResizeHandle item={it} onStart={(e) => {
                    e.stopPropagation();
                    const [cx, cy] = toCanvas(e.clientX, e.clientY);
                    resizing.current = { id: it.id, sw: it.w, sh: it.h, sx: cx, sy: cy };
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                  }} />}
                </div>
              );
            }
            return null;
          })}
        </div>

        {data.items.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-zinc-400 text-xs">选个工具开始 · 滚轮平移 · ⌘/Ctrl + 滚轮缩放</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} title={label}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${active ? "bg-amber-glow/20 text-amber-glow border border-amber-glow/40" : "text-white/70 hover:bg-white/10 border border-transparent"}`}>
      {icon}<span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ResizeHandle({ item, onStart }: { item: { w: number; h: number }; onStart: (e: React.PointerEvent) => void }) {
  return (
    <div onPointerDown={onStart}
      className="absolute -bottom-1 -right-1 w-3 h-3 rounded-sm bg-white border border-zinc-400 cursor-nwse-resize"
      style={{ pointerEvents: "auto" }} />
  );
}

function strokeToPath(pts: number[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
  return d;
}
