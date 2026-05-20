import { useRef, useState } from "react";
import { Upload, X as XIcon, Loader2, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useSylva } from "@/lib/sylva-store";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

import watercolorThumb from "@/assets/comic-styles/watercolor.jpg";
import ghibliThumb from "@/assets/comic-styles/ghibli.jpg";
import lineartThumb from "@/assets/comic-styles/lineart.jpg";
import pixelThumb from "@/assets/comic-styles/pixel.jpg";
import chineseInkThumb from "@/assets/comic-styles/chinese-ink.jpg";
import cyberpunkThumb from "@/assets/comic-styles/cyberpunk.jpg";
import celluloidThumb from "@/assets/comic-styles/celluloid.jpg";
import americanComicsThumb from "@/assets/comic-styles/american-comics.jpg";
import pixelRetroThumb from "@/assets/comic-styles/pixel-retro.jpg";
import ghibli2Thumb from "@/assets/comic-styles/ghibli2.jpg";
import makotoThumb from "@/assets/comic-styles/makoto-shinkai.jpg";
import chibiThumb from "@/assets/comic-styles/chibi.jpg";
import cardManThumb from "@/assets/comic-styles/card-man.jpg";
import jpCartoonThumb from "@/assets/comic-styles/japanese-cartoon.jpg";
import chineseComicsThumb from "@/assets/comic-styles/chinese-comics.jpg";
import chineseInk2Thumb from "@/assets/comic-styles/chinese-ink2.jpg";
import pixarThumb from "@/assets/comic-styles/pixar.jpg";
import jojoThumb from "@/assets/comic-styles/jojo.jpg";
import miyazakiThumb from "@/assets/comic-styles/miyazaki.jpg";
import pictureBookThumb from "@/assets/comic-styles/picture-book.jpg";
import retroAnimeThumb from "@/assets/comic-styles/retro-anime.jpg";
import crayonThumb from "@/assets/comic-styles/crayon.jpg";
import boldLineThumb from "@/assets/comic-styles/bold-line.jpg";
import gouacheThumb from "@/assets/comic-styles/gouache.jpg";
import flatStyleThumb from "@/assets/comic-styles/flat-style.jpg";
import dunhuangThumb from "@/assets/comic-styles/dunhuang.jpg";

type Provider = "gemini" | "seedream";

const PROVIDERS: { key: Provider; title: string; subtitle: string }[] = [
  { key: "gemini", title: "Gemini (Lovable 内置)", subtitle: "无需配置；支持把上传的主角画进画面" },
  { key: "seedream", title: "火山 Seedream", subtitle: "需要 ARK_API_KEY；暂不支持主角参考" },
];

const SEEDREAM_PRESETS = [
  "doubao-seedream-5-0-lite-251015",
  "doubao-seedream-5-0-lite-250915",
  "doubao-seedream-4-0-250828",
  "doubao-seedream-3-0-t2i-250415",
];

type StylePreset = {
  id: string;
  label: string;
  thumb: string;
  prompt: string;
};

const STYLE_PRESETS: StylePreset[] = [
  { id: "watercolor", label: "温暖水彩", thumb: watercolorThumb, prompt: "warm, cozy, hand-drawn watercolor diary comic, soft amber & moss palette, gentle linework, slight grain" },
  { id: "ghibli", label: "吉卜力 (柔)", thumb: ghibliThumb, prompt: "Studio Ghibli anime style, soft pastel colors, lush nature, dreamy lighting, hand-drawn cel animation aesthetic" },
  { id: "ghibli2", label: "吉卜力 (画风2)", thumb: ghibli2Thumb, prompt: "classic Ghibli/Hayao Miyazaki style, soft cel-shaded anime, gentle expressions, warm storybook palette" },
  { id: "miyazaki", label: "宫崎骏旅行", thumb: miyazakiThumb, prompt: "Miyazaki-style watercolor anime scenery, vibrant skies, slice-of-life travel composition, painterly background" },
  { id: "makoto-shinkai", label: "新海诚", thumb: makotoThumb, prompt: "Makoto Shinkai anime style, hyper-detailed skies, cinematic lighting, lens flares, melancholic atmosphere, vivid blues" },
  { id: "retro-anime", label: "古早日漫", thumb: retroAnimeThumb, prompt: "90s shoujo anime style, large sparkling eyes, soft cel shading, retro VHS color grading" },
  { id: "japanese-cartoon", label: "日式卡通", thumb: jpCartoonThumb, prompt: "modern Japanese anime portrait style, soft skin shading, gentle natural lighting, clean line art" },
  { id: "celluloid", label: "赛璐璐", thumb: celluloidThumb, prompt: "anime cel-shaded (celluloid) style, bold flat colors, crisp ink outline, vivid pink/black accents, sticker pop culture vibe" },
  { id: "chibi", label: "Q版萌系", thumb: chibiThumb, prompt: "ultra-cute chibi 3D style, big head small body, soft fluffy textures, pastel palette, kawaii" },
  { id: "card-man", label: "卡片人", thumb: cardManThumb, prompt: "trading card game character art, neon holographic background, dynamic action pose, glowing rim light" },
  { id: "american-comics", label: "美式漫画", thumb: americanComicsThumb, prompt: "American superhero comic book style, bold inks, halftone shading, dramatic perspective, saturated primary colors" },
  { id: "jojo", label: "JOJO奇妙冒险", thumb: jojoThumb, prompt: "JoJo's Bizarre Adventure manga style, exaggerated dramatic poses, sharp angular faces, bold outlines, vivid magenta/purple palette" },
  { id: "chinese-comics", label: "国漫", thumb: chineseComicsThumb, prompt: "modern Chinese xianxia comic style, flowing black hair, ink splash background, elegant ancient costume, ethereal mood" },
  { id: "chinese-ink", label: "国风水墨", thumb: chineseInkThumb, prompt: "traditional Chinese ink wash painting style, muted earth tones, rice paper texture, elegant brush strokes" },
  { id: "chinese-ink2", label: "水墨工笔", thumb: chineseInk2Thumb, prompt: "Chinese gongbi ink painting with delicate color, soft brushwork, traditional costume, rice paper background" },
  { id: "dunhuang", label: "敦煌美学", thumb: dunhuangThumb, prompt: "Dunhuang mural aesthetic, flying apsaras motifs, mineral pigment palette of cinnabar/malachite/azurite, ornate patterns" },
  { id: "picture-book", label: "绘本", thumb: pictureBookThumb, prompt: "children's picture book illustration, soft watercolor and colored pencil, gentle round shapes, warm storybook palette" },
  { id: "crayon", label: "蜡笔画", thumb: crayonThumb, prompt: "wax crayon children's book illustration, textured strokes, warm earthy palette, Little Prince storybook vibe" },
  { id: "gouache", label: "水粉", thumb: gouacheThumb, prompt: "gouache illustration, soft matte texture, dreamy starlit color palette, gentle storybook composition" },
  { id: "flat-style", label: "扁平风格", thumb: flatStyleThumb, prompt: "flat vector illustration, clean geometric shapes, limited modern palette, editorial corporate style" },
  { id: "bold-line", label: "粗线条", thumb: boldLineThumb, prompt: "bold thick black outline illustration, flat color blocks, modern Korean/Japanese editorial style, urban scene" },
  { id: "lineart", label: "极简线稿", thumb: lineartThumb, prompt: "minimal black line art on cream paper, clean continuous lines, lots of whitespace, New Yorker editorial vibe, monochrome" },
  { id: "pixar", label: "皮克斯3D", thumb: pixarThumb, prompt: "Pixar-style 3D animated render, cinematic lighting, expressive character design, polished CGI textures" },
  { id: "pixel", label: "像素风", thumb: pixelThumb, prompt: "16-bit pixel art, vibrant limited palette, chunky pixels, nostalgic SNES-era aesthetic" },
  { id: "pixel-retro", label: "像素复古", thumb: pixelRetroThumb, prompt: "cozy lofi pixel art scene, neon city night, purple/pink palette, animated retro vibe" },
  { id: "cyberpunk", label: "赛博朋克", thumb: cyberpunkThumb, prompt: "cyberpunk comic, neon pink and cyan glow, rain-soaked streets, holographic billboards, moody noir lighting" },
  { id: "custom", label: "自定义", thumb: "", prompt: "" },
];

export function ComicSettingsPanel() {
  const { user } = useAuth();
  const {
    comicProvider,
    setComicProvider,
    comicSeedreamModel,
    setComicSeedreamModel,
    comicStyle,
    setComicStyle,
    comicStylePreset,
    setComicStylePreset,
    comicProtagonistUrl,
    setComicProtagonistUrl,
  } = useSylva();

  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectPreset = (p: StylePreset) => {
    setComicStylePreset(p.id);
    if (p.id !== "custom") setComicStyle(p.prompt);
  };

  const handleUpload = async (file: File) => {
    if (!user) {
      toast.error("请先登录后再上传");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片不能超过 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/comic-protagonist-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "31536000",
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      setComicProtagonistUrl(pub.publicUrl);
      toast.success("主角已设置");
    } catch (e: any) {
      toast.error("上传失败", { description: e?.message ?? "请重试" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Provider */}
      <div className="widget overflow-hidden">
        <div className="px-4 py-3 border-b border-white/8">
          <div className="text-sm text-white/90">生成提供方</div>
          <div className="text-xs text-white/50 mt-0.5">选择默认使用的图像模型</div>
        </div>
        <div className="divide-y divide-white/8">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              onClick={() => setComicProvider(p.key)}
              className="w-full flex items-center px-4 py-3 hover:bg-white/[0.03] text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/90">{p.title}</div>
                <div className="text-xs text-white/50 mt-0.5">{p.subtitle}</div>
              </div>
              <div
                className={`w-4 h-4 rounded-full border ${
                  comicProvider === p.key ? "bg-amber-glow border-amber-glow" : "border-white/25"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {comicProvider === "seedream" && (
        <div className="widget p-4 space-y-3">
          <div>
            <div className="text-sm text-white/90">Seedream 模型 ID</div>
            <div className="text-xs text-white/50 mt-0.5">
              在火山方舟控制台 → 模型广场复制你已开通模型的完整 ID
            </div>
          </div>
          <input
            value={comicSeedreamModel}
            onChange={(e) => setComicSeedreamModel(e.target.value)}
            placeholder="doubao-seedream-5-0-lite-XXXXXX"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-glow/50 font-mono"
          />
          <div className="flex flex-wrap gap-1.5">
            {SEEDREAM_PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => setComicSeedreamModel(m)}
                className={`text-[10px] px-2 py-1 rounded-full border font-mono ${
                  comicSeedreamModel === m
                    ? "bg-amber-glow/20 border-amber-glow/40 text-amber-glow"
                    : "bg-white/5 border-white/10 text-white/55 hover:bg-white/10"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Style preset gallery */}
      <StyleGallery active={comicStylePreset} onSelect={selectPreset} />

      {/* Custom style prompt (always shown, more weight when 自定义 selected) */}
      <div className="widget p-4 space-y-2">
        <div>
          <div className="text-sm text-white/90">
            {comicStylePreset === "custom" ? "自定义风格 Prompt" : "微调当前风格（可选）"}
          </div>
          <div className="text-xs text-white/50 mt-0.5">
            会附加到上面的风格描述中。例如：再加一点电影感、暖色调更浓…
          </div>
        </div>
        <textarea
          value={comicStyle}
          onChange={(e) => setComicStyle(e.target.value)}
          placeholder="warm watercolor, soft golden light, slight grain…"
          rows={3}
          maxLength={500}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-glow/50 resize-none"
        />
        <div className="text-[10px] text-white/35 text-right">{comicStyle.length}/500</div>
      </div>

      {/* Protagonist uploader */}
      <div className="widget p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-white/90">主角形象（可选）</div>
            <div className="text-xs text-white/50 mt-0.5">
              上传一张你（或宠物、玩偶）的照片，AI 会把这个形象作为漫画主角
              {comicProvider === "seedream" && (
                <span className="block text-amber-glow/80 mt-1">
                  ⚠️ Seedream 暂不支持主角参考，主角图仅在 Gemini 下生效
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0 relative">
            {comicProtagonistUrl ? (
              <>
                <img
                  src={comicProtagonistUrl}
                  alt="主角"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => setComicProtagonistUrl(null)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center"
                  title="移除"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30 text-[10px]">
                未上传
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-glow/20 hover:bg-amber-glow/30 border border-amber-glow/40 text-xs text-amber-glow disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {uploading ? "上传中…" : comicProtagonistUrl ? "更换图片" : "上传图片"}
            </button>
            <p className="text-[10px] text-white/35">
              建议清晰正面照、单人 / 单主体，≤5MB
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const INITIAL_VISIBLE = 6;

function StyleGallery({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (p: StylePreset) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeIdx = STYLE_PRESETS.findIndex((p) => p.id === active);
  // Ensure the currently-selected preset is always visible even when collapsed
  const mustExpand = activeIdx >= INITIAL_VISIBLE;
  const showAll = expanded || mustExpand;
  const visible = showAll ? STYLE_PRESETS : STYLE_PRESETS.slice(0, INITIAL_VISIBLE);
  const hidden = STYLE_PRESETS.length - INITIAL_VISIBLE;

  return (
    <div className="widget overflow-hidden">
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-white/90">画面风格</div>
          <div className="text-xs text-white/50 mt-0.5">
            选一张参考图，每天的漫画会按这个风格生成
          </div>
        </div>
        <div className="text-[10px] text-white/40 shrink-0">
          {STYLE_PRESETS.length} 种
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-3">
        {visible.map((p) => {
          const isActive = active === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className={`group relative aspect-square rounded-lg overflow-hidden border transition ${
                isActive
                  ? "border-amber-glow ring-2 ring-amber-glow/40"
                  : "border-white/10 hover:border-white/25"
              }`}
            >
              {p.thumb ? (
                <img
                  src={p.thumb}
                  alt={p.label}
                  loading="lazy"
                  width={256}
                  height={256}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-white/[0.04] text-white/40 text-xs">
                  自由发挥
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5">
                <div className="text-[11px] text-white/95 font-medium truncate">{p.label}</div>
              </div>
              {isActive && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-amber-glow flex items-center justify-center">
                  <Check className="w-3 h-3 text-black" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      {hidden > 0 && !mustExpand && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-white/8 text-xs text-white/60 hover:text-white/90 hover:bg-white/[0.03]"
        >
          {expanded ? "收起" : `展开全部 (+${hidden})`}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}
