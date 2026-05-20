import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2, X, Square, Circle as CircleIcon } from "lucide-react";

type Shape = "round" | "square";

interface Props {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: (blob: Blob, shape: Shape) => Promise<void> | void;
}

export function AvatarCropDialog({ open, file, onClose, onConfirm }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [shape, setShape] = useState<Shape>("round");
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  // 读 file → dataURL
  useState(() => {
    /* noop init */
  });
  if (file && !imageUrl && open) {
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setAreaPixels(pixels);
  }, []);

  const reset = () => {
    setImageUrl(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setAreaPixels(null);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleConfirm = async () => {
    if (!imageUrl || !areaPixels) return;
    setBusy(true);
    try {
      const blob = await getCroppedBlob(imageUrl, areaPixels, shape);
      await onConfirm(blob, shape);
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md widget p-5 space-y-4 bg-background">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base text-white">裁剪头像</h3>
          <button onClick={handleClose} className="text-white/60 hover:text-white" disabled={busy}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-white/60">形状</span>
          <button
            type="button"
            onClick={() => setShape("round")}
            className={`px-2 py-1 rounded flex items-center gap-1 border ${shape === "round" ? "bg-amber-glow/20 border-amber-glow/40 text-amber-glow" : "bg-white/5 border-white/10 text-white/70"}`}
          >
            <CircleIcon className="w-3 h-3" /> 圆形
          </button>
          <button
            type="button"
            onClick={() => setShape("square")}
            className={`px-2 py-1 rounded flex items-center gap-1 border ${shape === "square" ? "bg-amber-glow/20 border-amber-glow/40 text-amber-glow" : "bg-white/5 border-white/10 text-white/70"}`}
          >
            <Square className="w-3 h-3" /> 方形
          </button>
        </div>

        <div className="relative w-full h-64 rounded-lg overflow-hidden bg-black/40 border border-white/10">
          {imageUrl ? (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape={shape}
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-white/40 text-xs">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载图片中
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-white/60 w-10">缩放</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-amber-glow"
          />
        </div>

        {/* 最终预览 */}
        <div className="flex items-center gap-4 pt-1 border-t border-white/10">
          <div className="text-xs text-white/60">最终效果</div>
          <PreviewBox imageUrl={imageUrl} area={areaPixels} shape={shape} size={56} />
          <PreviewBox imageUrl={imageUrl} area={areaPixels} shape={shape} size={32} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleClose}
            disabled={busy}
            className="px-3 py-1.5 rounded bg-white/5 border border-white/10 text-white/70 text-xs hover:bg-white/10"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || !areaPixels}
            className="px-3 py-1.5 rounded bg-amber-glow/20 border border-amber-glow/40 text-amber-glow text-xs hover:bg-amber-glow/30 disabled:opacity-50 flex items-center gap-1"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            确认上传
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewBox({
  imageUrl,
  area,
  shape,
  size,
}: {
  imageUrl: string | null;
  area: Area | null;
  shape: Shape;
  size: number;
}) {
  if (!imageUrl || !area) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-white/5 border border-white/10 ${shape === "round" ? "rounded-full" : "rounded-md"}`}
      />
    );
  }
  const scale = size / area.width;
  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${imageUrl})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${(area.width === 0 ? 1 : 1) * (size / area.width) * 100}% auto`,
      }}
      className={`border border-white/10 overflow-hidden ${shape === "round" ? "rounded-full" : "rounded-md"}`}
    >
      {/* 用 img + transform 更稳 */}
      <div
        style={{
          width: 0,
          height: 0,
        }}
      />
      <div
        style={{
          width: size,
          height: size,
          marginTop: -size,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <img
          src={imageUrl}
          alt="预览"
          style={{
            position: "absolute",
            left: -area.x * scale,
            top: -area.y * scale,
            width: `calc(${scale} * var(--natural-w, 100%))`,
            transform: "none",
            maxWidth: "none",
            // 用 transform 缩放整图
            transformOrigin: "top left",
          }}
          onLoad={(e) => {
            const img = e.currentTarget;
            img.style.width = `${img.naturalWidth * scale}px`;
            img.style.height = `${img.naturalHeight * scale}px`;
          }}
        />
      </div>
    </div>
  );
}

async function getCroppedBlob(imageSrc: string, area: Area, shape: Shape): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  const size = Math.round(area.width);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  if (shape === "round") {
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size);
  if (shape === "round") ctx.restore();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png", 0.92);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
