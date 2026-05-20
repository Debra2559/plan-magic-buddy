import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  MousePointer2, StickyNote, Pen, ArrowRight, Image as ImageIcon,
  Trash2, ZoomIn, ZoomOut, Maximize2, Loader2, Hand,
  FileText, FileArchive, FileAudio, FileVideo, File as FileIcon, Download,
} from "lucide-react";
import { toast } from "sonner";

type Tool = "select" | "pan" | "note" | "pen" | "arrow" | "image";

interface BaseItem { id: string; type: string; }
interface NoteItem extends BaseItem { type: "note"; x: number; y: number; w: number; h: number; text: string; color: string; }
interface StrokeItem extends BaseItem { type: "stroke"; points: number[]; color: string; width: number; }
interface ImageItem extends BaseItem { type: "image"; x: number; y: number; w: number; h: number; url: string; }
interface EdgeItem extends BaseItem { type: "edge"; x1: number; y1: number; x2: number; y2: number; color: string; }
interface FileItem extends BaseItem { type: "file"; x: number; y: number; w: number; h: number; url: string; name: string; mime: string; size: number; }
type Item = NoteItem | StrokeItem | ImageItem | EdgeItem | FileItem;

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (editingId && editingRef.current) {
      const ta = editingRef.current;
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
  }, [editingId]);

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
      setSelected(id); setEditingId(id); setTool("select");
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

  // ---- Upload (images + generic files) ----
  const fileRef = useRef<HTMLInputElement>(null);
  const MAX_BYTES = 20 * 1024 * 1024;

  const centerCanvasPoint = (clientX?: number, clientY?: number): [number, number] => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = clientX ?? rect.left + rect.width / 2;
    const py = clientY ?? rect.top + rect.height / 2;
    return toCanvas(px, py);
  };

  const uploadToStorage = async (file: File): Promise<string> => {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_") || "file";
    const ext = safeName.includes(".") ? safeName.split(".").pop()!.toLowerCase() : "bin";
    const path = `${user!.id}/canvas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true, contentType: file.type || "application/octet-stream", cacheControl: "31536000",
    });
    if (error) throw error;
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    return pub.publicUrl;
  };

  const addImageItem = (url: string, atClient?: { x: number; y: number }) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 320; const ratio = img.width > maxW ? maxW / img.width : 1;
      const w = img.width * ratio, h = img.height * ratio;
      const [cx, cy] = centerCanvasPoint(atClient?.x, atClient?.y);
      const item: ImageItem = { id: crypto.randomUUID(), type: "image", x: cx - w / 2, y: cy - h / 2, w, h, url };
      persist({ ...dataRef.current, items: [...dataRef.current.items, item] });
    };
    img.onerror = () => toast.error("图片加载失败");
    img.src = url;
  };

  const addFileItem = (file: File, url: string, atClient?: { x: number; y: number }) => {
    const w = 220, h = 84;
    const [cx, cy] = centerCanvasPoint(atClient?.x, atClient?.y);
    const item: FileItem = {
      id: crypto.randomUUID(), type: "file",
      x: cx - w / 2, y: cy - h / 2, w, h, url,
      name: file.name || "未命名文件", mime: file.type || "application/octet-stream", size: file.size,
    };
    persist({ ...dataRef.current, items: [...dataRef.current.items, item] });
  };

  const handleAnyFile = async (file: File, atClient?: { x: number; y: number }) => {
    if (!user) return;
    if (file.size > MAX_BYTES) { toast.error(`文件需小于 ${Math.round(MAX_BYTES / 1024 / 1024)}MB`); return; }
    const toastId = toast.loading(`上传 ${file.name || "文件"}…`);
    try {
      const url = await uploadToStorage(file);
      if (file.type.startsWith("image/")) addImageItem(url, atClient);
      else addFileItem(file, url, atClient);
      toast.success("已添加到画布", { id: toastId });
    } catch (e: any) { toast.error(e?.message ?? "上传失败", { id: toastId }); }
  };

  // Back-compat: image-only entry point used by the file picker
  const handleImage = (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("请选择图片"); return; }
    void handleAnyFile(file);
  };

  // ---- Paste & drag-drop ----
  useEffect(() => {
    if (!user) return;
    const onPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest("textarea,input,[contenteditable='true']")) return;
      const cd = e.clipboardData; if (!cd) return;
      const files: File[] = [];
      for (const it of Array.from(cd.items)) {
        if (it.kind === "file") { const f = it.getAsFile(); if (f) files.push(f); }
      }
      if (files.length === 0) return;
      e.preventDefault();
      for (const f of files) await handleAnyFile(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const [dragOver, setDragOver] = useState(false);
  const onDragOver = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault(); setDragOver(true);
    }
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = async (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    e.preventDefault(); setDragOver(false);
    for (const f of files) await handleAnyFile(f, { x: e.clientX, y: e.clientY });
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

  if (!user) return <div className="p-8 text-muted-foreground text-sm">请先登录使用画布</div>;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-foreground/[0.03] backdrop-blur-sm flex-wrap">
        <span className="text-xs text-muted-foreground mr-2 font-display">{title ?? (kind === "notes" ? "笔记画布" : "日记画布")}</span>
        <ToolBtn active={tool === "select"} onClick={() => setTool("select")} icon={<MousePointer2 className="w-3.5 h-3.5" />} label="选择" />
        <ToolBtn active={tool === "pan"} onClick={() => setTool("pan")} icon={<Hand className="w-3.5 h-3.5" />} label="平移" />
        <div className="w-px h-5 bg-foreground/10 mx-1" />
        <ToolBtn active={tool === "note"} onClick={() => setTool("note")} icon={<StickyNote className="w-3.5 h-3.5" />} label="便签" />
        <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} icon={<Pen className="w-3.5 h-3.5" />} label="画笔" />
        <ToolBtn active={tool === "arrow"} onClick={() => setTool("arrow")} icon={<ArrowRight className="w-3.5 h-3.5" />} label="箭头" />
        <ToolBtn active={tool === "image"} onClick={() => fileRef.current?.click()} icon={<ImageIcon className="w-3.5 h-3.5" />} label="文件" />
        <input ref={fileRef} type="file" multiple className="hidden"
          onChange={(e) => { const fs = Array.from(e.target.files ?? []); fs.forEach((f) => void handleAnyFile(f)); e.target.value = ""; }} />

        <div className="w-px h-5 bg-foreground/10 mx-1" />
        {tool === "note" && (
          <div className="flex items-center gap-1">
            {NOTE_COLORS.map((c) => (
              <button key={c} onClick={() => setNoteColor(c)}
                className={`w-4 h-4 rounded-sm border ${noteColor === c ? "ring-2 ring-amber-glow border-white/40" : "border-border"}`}
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

        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          <button onClick={() => zoomBy(1 / 1.2)} className="p-1 hover:bg-foreground/10 rounded" title="缩小"><ZoomOut className="w-3.5 h-3.5" /></button>
          <span className="tabular-nums w-10 text-center">{Math.round(data.viewport.scale * 100)}%</span>
          <button onClick={() => zoomBy(1.2)} className="p-1 hover:bg-foreground/10 rounded" title="放大"><ZoomIn className="w-3.5 h-3.5" /></button>
          <button onClick={resetView} className="p-1 hover:bg-foreground/10 rounded" title="回到原点"><Maximize2 className="w-3.5 h-3.5" /></button>
          {selected && (
            <button onClick={deleteSelected} className="p-1 hover:bg-rose-500/20 hover:text-rose-300 rounded" title="删除"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={wrapRef}
        className={`relative flex-1 overflow-hidden bg-white ${dragOver ? "ring-2 ring-amber-glow/70 ring-inset" : ""}`}
        style={{ cursor, touchAction: "none" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
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
              const isEditing = editingId === it.id;
              return (
                <div key={it.id}
                  className={`absolute rounded-md shadow-md ${active ? "ring-2 ring-amber-glow" : "ring-1 ring-black/5"} ${isEditing ? "cursor-text" : "cursor-move"}`}
                  style={{ left: it.x, top: it.y, width: it.w, height: it.h, background: it.color, transform: "rotate(-0.4deg)" }}
                  onPointerDown={(e) => {
                    if (isEditing) return;
                    e.stopPropagation(); setSelected(it.id);
                    const [cx, cy] = toCanvas(e.clientX, e.clientY);
                    dragging.current = { id: it.id, offX: cx - it.x, offY: cy - it.y };
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                  }}
                  onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                  onDoubleClick={(e) => { e.stopPropagation(); setSelected(it.id); setEditingId(it.id); }}
                  title={isEditing ? undefined : "双击编辑"}
                >
                  <textarea
                    ref={isEditing ? editingRef : undefined}
                    value={it.text}
                    readOnly={!isEditing}
                    onChange={(e) => updateItem(it.id, { text: e.target.value } as Partial<NoteItem>)}
                    onBlur={() => setEditingId((id) => (id === it.id ? null : id))}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
                    }}
                    placeholder={isEditing ? "写点什么…" : ""}
                    className={`w-full h-full p-3 bg-transparent outline-none resize-none text-zinc-800 text-sm leading-relaxed font-display placeholder:text-zinc-500/60 ${isEditing ? "" : "pointer-events-none select-none"}`}
                  />
                  {!isEditing && !it.text && (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-500/60 text-[11px] pointer-events-none">
                      双击编辑
                    </div>
                  )}
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
            if (it.type === "file") {
              const active = selected === it.id;
              const Icon = pickFileIcon(it.mime, it.name);
              return (
                <div key={it.id}
                  className={`absolute rounded-lg bg-white shadow-md ring-1 ring-black/10 ${active ? "ring-2 ring-amber-glow" : ""}`}
                  style={{ left: it.x, top: it.y, width: it.w, height: it.h }}
                  onPointerDown={(e) => {
                    e.stopPropagation(); setSelected(it.id);
                    const [cx, cy] = toCanvas(e.clientX, e.clientY);
                    dragging.current = { id: it.id, offX: cx - it.x, offY: cy - it.y };
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                  }}
                  onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                  onDoubleClick={(e) => { e.stopPropagation(); window.open(it.url, "_blank", "noopener"); }}
                  title="双击打开 · 拖拽移动"
                >
                  <div className="flex items-center gap-3 p-3 h-full">
                    <div className="w-10 h-10 rounded-md bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-zinc-800 truncate font-medium">{it.name}</div>
                      <div className="text-[11px] text-zinc-500 truncate">{formatBytes(it.size)} · {it.mime.split("/")[1] || it.mime || "file"}</div>
                    </div>
                    <a href={it.url} target="_blank" rel="noopener noreferrer" download={it.name}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded hover:bg-zinc-100 text-zinc-500 shrink-0" title="下载">
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
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
            <div className="text-zinc-400 text-xs">选个工具开始 · 粘贴 / 拖入图片或文件 · ⌘/Ctrl + 滚轮缩放</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} title={label}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${active ? "bg-amber-glow/20 text-amber-glow border border-amber-glow/40" : "text-foreground/75 hover:bg-foreground/10 border border-transparent"}`}>
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

function formatBytes(n: number): string {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function pickFileIcon(mime: string, name: string) {
  const m = (mime || "").toLowerCase();
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (m.startsWith("audio/")) return FileAudio;
  if (m.startsWith("video/")) return FileVideo;
  if (m === "application/pdf" || ext === "pdf") return FileText;
  if (/zip|rar|7z|tar|gz/.test(m) || /^(zip|rar|7z|tar|gz)$/.test(ext)) return FileArchive;
  if (m.startsWith("text/") || /^(md|txt|json|csv|log|xml|yml|yaml)$/.test(ext)) return FileText;
  if (/(word|excel|powerpoint|spreadsheet|presentation|document)/.test(m)) return FileText;
  return FileIcon;
}
