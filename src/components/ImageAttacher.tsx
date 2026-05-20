import { useRef, type ClipboardEvent, type DragEvent } from "react";
import { ImagePlus, X } from "lucide-react";

interface Props {
  images: string[];
  onChange: (next: string[]) => void;
  max?: number;
  /** 最长边像素，用于压缩；默认 1280 */
  maxSize?: number;
  /** 压缩质量 0~1，默认 0.82 */
  quality?: number;
  className?: string;
}

/** 把 File/Blob 压缩为 jpeg dataURL，超大图自动等比缩放，避免 localStorage 撑爆 */
export async function fileToCompressedDataURL(file: File | Blob, maxSize = 1280, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  // gif/svg 等不压缩
  if (file.type && !/^image\/(png|jpe?g|webp|bmp|heic)/i.test(file.type)) return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

/** 通用粘贴/拖拽处理：从事件里抽出 image File 列表 */
export function extractImagesFromEvent(e: ClipboardEvent | DragEvent): File[] {
  const out: File[] = [];
  const dt = "clipboardData" in e ? (e as ClipboardEvent).clipboardData : (e as DragEvent).dataTransfer;
  if (!dt) return out;
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === "file") {
      const f = item.getAsFile();
      if (f && f.type.startsWith("image/")) out.push(f);
    }
  }
  if (out.length === 0) {
    for (const f of Array.from(dt.files ?? [])) {
      if (f.type.startsWith("image/")) out.push(f);
    }
  }
  return out;
}

export function ImageAttacher({ images, onChange, max = 6, maxSize, quality, className = "" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: File[]) => {
    const allowed = files.slice(0, Math.max(0, max - images.length));
    if (allowed.length === 0) return;
    const urls = await Promise.all(allowed.map((f) => fileToCompressedDataURL(f, maxSize, quality)));
    onChange([...images, ...urls]);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    await addFiles(files);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAt = (i: number) => onChange(images.filter((_, idx) => idx !== i));

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={onPick} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-amber-glow hover:border-amber-glow/40 transition"
        title="添加图片（也可直接粘贴或拖入）"
      >
        <ImagePlus className="w-3 h-3" /> 加图片
      </button>
      {images.map((src, i) => (
        <div key={i} className="relative group">
          <img src={src} alt="" className="w-12 h-12 object-cover rounded-md border border-white/10" />
          <button
            type="button"
            onClick={() => removeAt(i)}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background/90 border border-white/20 text-white/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
            title="移除"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
      {images.length > 0 && (
        <span className="text-[10px] text-white/40">{images.length}/{max}</span>
      )}
    </div>
  );
}
