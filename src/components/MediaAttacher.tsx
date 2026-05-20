import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mic, Square, Video, Trash2, Loader2, Play, Pause } from "lucide-react";

function mmssShort(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function AudioPill({ src }: { src: string }) {
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
    <div className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full bg-white/[0.04] border border-white/10">
      <audio ref={ref} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className="w-6 h-6 rounded-full bg-amber-glow/15 hover:bg-amber-glow/25 text-amber-glow flex items-center justify-center transition"
      >
        {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 translate-x-[1px]" />}
      </button>
      <div className="w-20 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-amber-glow/70 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-white/60">
        {mmssShort(playing || cur > 0 ? cur : dur)}
      </span>
    </div>
  );
}
import { toast } from "sonner";

type Props = {
  videos: string[];
  audios: string[];
  onChange: (next: { videos: string[]; audios: string[] }) => void;
  maxVideos?: number;
  maxAudios?: number;
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

export function MediaAttacher({ videos, audios, onChange, maxVideos = 2, maxAudios = 4 }: Props) {
  const videoInputRef = useRef<HTMLInputElement>(null);
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
          onChange({ videos, audios: [...audios, url] });
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

  const pickVideo = () => videoInputRef.current?.click();
  const onVideoChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (videos.length >= maxVideos) {
      toast.warning(`最多 ${maxVideos} 段视频`);
      return;
    }
    if (file.size > VIDEO_LIMIT_MB * 1024 * 1024) {
      toast.error(`视频过大（>${VIDEO_LIMIT_MB}MB）`);
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const url = await uploadToBucket(file, ext);
      onChange({ videos: [...videos, url], audios });
    } catch (e: any) {
      toast.error("上传失败", { description: e?.message });
    } finally {
      setUploading(false);
    }
  };

  const removeVideo = (i: number) => onChange({ videos: videos.filter((_, idx) => idx !== i), audios });
  const removeAudio = (i: number) => onChange({ videos, audios: audios.filter((_, idx) => idx !== i) });

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
              : "bg-white/[0.04] border-white/10 text-white/60 hover:text-amber-glow hover:border-amber-glow/40"
          } disabled:opacity-40`}
          title={recording ? "结束录音" : "录一段语音"}
        >
          {recording ? <Square className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
          {recording ? `录音中 ${mmss(elapsed)}` : "语音"}
        </button>

        <button
          type="button"
          onClick={pickVideo}
          disabled={uploading || recording}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border bg-white/[0.04] border-white/10 text-white/60 hover:text-amber-glow hover:border-amber-glow/40 transition disabled:opacity-40"
          title={`选择视频文件（≤${VIDEO_LIMIT_MB}MB）`}
        >
          <Video className="w-3 h-3" /> 视频
        </button>
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={onVideoChosen}
        />

        {uploading && (
          <span className="flex items-center gap-1 text-[10px] text-white/50">
            <Loader2 className="w-3 h-3 animate-spin" /> 上传中…
          </span>
        )}
      </div>

      {(videos.length > 0 || audios.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {videos.map((src, i) => (
            <div key={`v-${i}`} className="relative group">
              <video
                src={src}
                controls
                preload="metadata"
                className="max-h-40 rounded-lg border border-white/10 bg-black"
              />
              <button
                type="button"
                onClick={() => removeVideo(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 border border-white/20 text-white/70 hover:text-destructive opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                title="删除"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {audios.map((src, i) => (
            <div key={`a-${i}`} className="relative group flex items-center gap-2 pr-7 pl-2 py-1 rounded-full bg-white/[0.04] border border-white/10">
              <Play className="w-3 h-3 text-amber-glow" />
              <audio src={src} controls className="h-7 max-w-[200px]" />
              <button
                type="button"
                onClick={() => removeAudio(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/80 border border-white/20 text-white/70 hover:text-destructive opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
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
