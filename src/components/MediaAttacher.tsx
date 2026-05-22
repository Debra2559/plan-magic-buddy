import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mic, Square, ImagePlus, Trash2, Loader2, Play, Pause, X } from "lucide-react";
import { fileToCompressedDataURL } from "@/components/ImageAttacher";
import { useSignedMediaUrl } from "@/lib/signed-media";

function SignedVideo({ src, ...rest }: React.VideoHTMLAttributes<HTMLVideoElement> & { src: string }) {
  const url = useSignedMediaUrl(src);
  return <video {...rest} src={url} />;
}

function mmssShort(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function AudioPill({ src: rawSrc }: { src: string }) {
  const src = useSignedMediaUrl(rawSrc);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onTime = () => setCur(a.currentTime);
    const onMeta = () => setDur(a.duration || 0);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <div className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full bg-foreground/[0.05] border border-border">
      <audio ref={ref} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className="w-6 h-6 rounded-full bg-amber-glow/15 hover:bg-amber-glow/25 text-amber-glow flex items-center justify-center transition"
      >
        {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 translate-x-[1px]" />}
      </button>
      <div className="w-20 h-1 rounded-full bg-foreground/10 overflow-hidden">
        <div className="h-full bg-amber-glow/70 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {mmssShort(playing || cur > 0 ? cur : dur)}
      </span>
    </div>
  );
}
import { toast } from "sonner";

type Props = {
  videos: string[];
  audios: string[];
  images?: string[];
  onChange: (next: { videos: string[]; audios: string[]; images?: string[] }) => void;
  maxVideos?: number;
  maxAudios?: number;
  maxImages?: number;
};

const VIDEO_LIMIT_MB = 30;
const AUDIO_LIMIT_MB = 10;

async function uploadToBucket(file: Blob, ext: string): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("未登录");
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("note-media").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("note-media").getPublicUrl(path);
  return data.publicUrl;
}

export function MediaAttacher({ videos, audios, images = [], onChange, maxVideos = 2, maxAudios = 4, maxImages = 6 }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // —— 录音 ——
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const startRecording = async () => {
    if (audios.length >= maxAudios) {
      toast.warning(`最多 ${maxAudios} 段语音`);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        if (blob.size > AUDIO_LIMIT_MB * 1024 * 1024) {
          toast.error(`录音过大（>${AUDIO_LIMIT_MB}MB）`);
          return;
        }
        setUploading(true);
        try {
          const url = await uploadToBucket(blob, "webm");
          onChange({ videos, audios: [...audios, url], images });
        } catch (e: any) {
          toast.error("上传失败", { description: e?.message });
        } finally {
          setUploading(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e: any) {
      toast.error("无法访问麦克风", { description: e?.message });
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const pickFile = () => fileInputRef.current?.click();
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const imgs = files.filter((f) => f.type.startsWith("image/"));
    const vids = files.filter((f) => f.type.startsWith("video/"));

    setUploading(true);
    try {
      let nextImages = images;
      let nextVideos = videos;

      // 图片：压缩为 dataURL（与 ImageAttacher 一致）
      const imgSlots = Math.max(0, maxImages - nextImages.length);
      const imgToAdd = imgs.slice(0, imgSlots);
      if (imgs.length > imgSlots) toast.warning(`最多 ${maxImages} 张图片`);
      if (imgToAdd.length > 0) {
        const urls = await Promise.all(imgToAdd.map((f) => fileToCompressedDataURL(f)));
        nextImages = [...nextImages, ...urls];
      }

      // 视频：上传到 bucket
      for (const file of vids) {
        if (nextVideos.length >= maxVideos) {
          toast.warning(`最多 ${maxVideos} 段视频`);
          break;
        }
        if (file.size > VIDEO_LIMIT_MB * 1024 * 1024) {
          toast.error(`视频过大（>${VIDEO_LIMIT_MB}MB）`);
          continue;
        }
        const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
        const url = await uploadToBucket(file, ext);
        nextVideos = [...nextVideos, url];
      }

      onChange({ videos: nextVideos, audios, images: nextImages });
    } catch (err: any) {
      toast.error("上传失败", { description: err?.message });
    } finally {
      setUploading(false);
    }
  };

  const removeVideo = (i: number) => onChange({ videos: videos.filter((_, idx) => idx !== i), audios, images });
  const removeAudio = (i: number) => onChange({ videos, audios: audios.filter((_, idx) => idx !== i), images });
  const removeImage = (i: number) => onChange({ videos, audios, images: images.filter((_, idx) => idx !== i) });

  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={uploading}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition ${
            recording
              ? "bg-destructive/20 border-destructive/50 text-destructive animate-pulse"
              : "bg-foreground/[0.05] border-border text-muted-foreground hover:text-amber-glow hover:border-amber-glow/40"
          } disabled:opacity-40`}
          title={recording ? "结束录音" : "录一段语音"}
        >
          {recording ? <Square className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
          {recording ? `录音中 ${mmss(elapsed)}` : "语音"}
        </button>

        <button
          type="button"
          onClick={pickFile}
          disabled={uploading || recording}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border bg-foreground/[0.05] border-border text-muted-foreground hover:text-amber-glow hover:border-amber-glow/40 transition disabled:opacity-40"
          title={`图片或视频（视频 ≤${VIDEO_LIMIT_MB}MB）`}
        >
          <ImagePlus className="w-3 h-3" /> 图片 / 视频
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={onFileChosen}
        />


        {uploading && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> 上传中…
          </span>
        )}
      </div>

      {(videos.length > 0 || audios.length > 0 || images.length > 0) && (
        <div className="flex flex-wrap gap-2 items-center">
          {images.map((src, i) => (
            <div key={`i-${i}`} className="relative group">
              <img src={src} alt="" className="w-12 h-12 object-cover rounded-md border border-border" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-background/90 border border-border text-foreground/75 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                title="移除"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          {videos.map((src, i) => (
            <div key={`v-${i}`} className="relative group">
              <video
                src={src}
                controls
                preload="metadata"
                className="max-h-40 rounded-lg border border-border bg-black"
              />
              <button
                type="button"
                onClick={() => removeVideo(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background/85 border border-border text-foreground/75 hover:text-destructive opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                title="删除"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {audios.map((src, i) => (
            <div key={`a-${i}`} className="relative group">
              <AudioPill src={src} />
              <button
                type="button"
                onClick={() => removeAudio(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background/85 border border-border text-foreground/75 hover:text-destructive opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                title="删除"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
