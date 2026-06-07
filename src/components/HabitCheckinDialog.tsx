import { useState } from "react";
import { useHabitCheckins } from "@/lib/habit-checkins";
import { ImageAttacher } from "@/components/ImageAttacher";
import { X, Save, Trash2, NotebookPen, BookOpen } from "lucide-react";
import type { Habit } from "@/lib/sylva-store";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PROMPTS: Record<string, string> = {
  "📖": "今天读了什么？拍张书页或写两句书评…",
  "📚": "今天读了什么？拍张书页或写两句书评…",
  "🏃": "跑了多远？感觉如何？",
  "💪": "今天练了什么？拍张训练照…",
  "🧘": "冥想/拉伸感受？",
  "🎨": "今天画/做了什么？拍张作品…",
  "✍️": "今天写了什么？",
  "🎵": "练了什么曲子？",
  "🥗": "今天吃了什么？",
};

interface Props {
  habit: Habit;
  onClose: () => void;
  onChanged?: () => void;
}

export function HabitCheckinDialog({ habit, onClose, onChanged }: Props) {
  const { items, add, remove, loading } = useHabitCheckins(habit.id);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const placeholder = PROMPTS[habit.emoji] ?? "写两句记录、贴张照片…";

  const canSave = note.trim().length > 0 || images.length > 0;

  const save = async () => {
    if (!canSave) return;
    await add(date, note.trim(), images);
    setNote(""); setImages([]);
    onChanged?.();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-zinc-950 border border-amber-glow/30 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{habit.emoji}</span>
            <div>
              <h3 className="font-display text-lg text-foreground leading-tight">{habit.name}</h3>
              <p className="text-[10px] text-muted-foreground tracking-wider">打卡记录 · {items.length} 条</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New entry */}
        <div className="p-4 space-y-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-3.5 h-3.5 text-amber-glow" />
            <span className="text-[11px] tracking-widest text-amber-glow">新记录</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="ml-auto bg-foreground/5 border border-border rounded px-2 py-0.5 text-[11px] text-foreground"
            />
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="w-full bg-foreground/5 border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-amber-glow/60 focus:outline-none resize-none"
          />
          <ImageAttacher images={images} onChange={setImages} max={6} />
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={!canSave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-amber-glow text-background hover:scale-[1.02] transition disabled:opacity-40"
            >
              <Save className="w-3 h-3" /> 保存记录
            </button>
          </div>
        </div>

        {/* History */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          <div className="flex items-center gap-2 text-[11px] tracking-widest text-muted-foreground">
            <BookOpen className="w-3 h-3" /> 历史
          </div>
          {loading && <p className="text-xs text-muted-foreground">加载中…</p>}
          {!loading && items.length === 0 && (
            <p className="text-xs text-muted-foreground/70">还没有记录。拍一张、写两句，让习惯长出年轮。</p>
          )}
          {items.map((it) => (
            <div key={it.id} className="rounded-lg border border-border/60 bg-foreground/[0.04] p-3 group">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="text-[10px] tracking-widest text-amber-glow">{it.date}</span>
                <button
                  onClick={() => remove(it.id)}
                  className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-rose-300 p-1"
                  title="删除"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              {it.note && (
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed mb-2">{it.note}</p>
              )}
              {it.images.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {it.images.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noreferrer">
                      <img src={src} alt="" className="w-20 h-20 object-cover rounded-md border border-border" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
