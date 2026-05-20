import { useState } from "react";
import { useSylva, habitStreak, habitDaysSinceLast, isHabitDoneOn, todayLocal, type Habit } from "@/lib/sylva-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Flame, Check, AlertTriangle, Plus, Pencil, Trash2, X, Save } from "lucide-react";

export function HabitsView() {
  const { habits, toggleHabit, addHabit, updateHabit, removeHabit } = useSylva();
  const today = todayLocal();
  const [editing, setEditing] = useState<Habit | null>(null);
  const [deleting, setDeleting] = useState<Habit | null>(null);
  const [creating, setCreating] = useState(false);

  const doneCount = habits.filter((h) => isHabitDoneOn(h, today)).length;
  const missedToday = habits.filter((h) => !isHabitDoneOn(h, today) && habitStreak(h, today) > 0);
  const broken = habits.filter((h) => {
    const gap = habitDaysSinceLast(h, today);
    return gap !== Infinity && gap >= 2;
  });

  return (
    <div className="p-7 overflow-auto h-full max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-7">
        <div>
          <p className="text-[10px] tracking-widest text-amber-glow mb-1">习惯打卡</p>
          <h2 className="font-display text-3xl text-white">
            今天已打卡 {doneCount} / {habits.length}
          </h2>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-sm text-white/50 max-w-xs text-right">
            像森林一年一圈，慢慢长出节奏。
          </p>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-amber-glow/15 border border-amber-glow/40 text-amber-glow hover:bg-amber-glow/25 transition"
          >
            <Plus className="w-3.5 h-3.5" /> 新增习惯
          </button>
        </div>
      </div>

      {(missedToday.length > 0 || broken.length > 0) && (
        <div className="widget p-4 mb-5 border border-amber-glow/30 bg-amber-glow/5">
          <div className="flex items-center gap-1.5 mb-2 text-amber-glow text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="tracking-widest">漏打提醒</span>
          </div>
          {missedToday.length > 0 && (
            <p className="text-xs text-white/80 mb-1">
              今天还没补：
              {missedToday.map((h) => (
                <button
                  key={h.id}
                  onClick={() => toggleHabit(h.id)}
                  className="ml-1.5 px-2 py-0.5 rounded-full bg-white/10 hover:bg-amber-glow/30 text-white/90"
                >
                  {h.emoji} {h.name} · 连续 {habitStreak(h, today)}d
                </button>
              ))}
            </p>
          )}
          {broken.length > 0 && (
            <p className="text-xs text-white/60 mt-1">
              已中断：
              {broken.map((h) => (
                <span key={h.id} className="ml-1.5">
                  {h.emoji} {h.name}（{habitDaysSinceLast(h, today)} 天）
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {habits.map((h) => {
          const doneToday = isHabitDoneOn(h, today);
          const streak = habitStreak(h, today);
          const gap = habitDaysSinceLast(h, today);
          const isBroken = gap !== Infinity && gap >= 2;
          return (
            <div
              key={h.id}
              className={`group relative p-5 rounded-2xl border text-left transition overflow-hidden
                ${doneToday
                  ? "bg-gradient-to-br from-moss/25 to-amber-glow/15 border-amber-glow/40"
                  : isBroken
                    ? "bg-white/[0.03] border-rose-400/30"
                    : "bg-white/[0.04] border-white/8 hover:border-white/20"}`}
            >
              {/* edit/delete actions — bottom right, away from done badge */}
              <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition z-10">
                <button
                  onClick={(e) => { e.stopPropagation(); setEditing(h); }}
                  className="w-6 h-6 rounded-md bg-black/50 backdrop-blur hover:bg-amber-glow/25 text-white/60 hover:text-amber-glow flex items-center justify-center"
                  title="编辑"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleting(h); }}
                  className="w-6 h-6 rounded-md bg-black/50 backdrop-blur hover:bg-rose-500/25 text-white/60 hover:text-rose-300 flex items-center justify-center"
                  title="删除"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              <button
                onClick={() => toggleHabit(h.id)}
                className="absolute inset-0 w-full h-full"
                aria-label={`打卡 ${h.name}`}
              />
              <div className="relative pointer-events-none">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl">{h.emoji}</span>
                  {doneToday && (
                    <div className="w-6 h-6 rounded-full bg-moss flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <h3 className="font-display text-xl text-white mb-1">{h.name}</h3>
                <div className="flex items-center gap-1 text-xs text-amber-glow flex-wrap">
                  <Flame className="w-3 h-3" />
                  <span>连续 {streak} 天</span>
                  {!doneToday && streak > 0 && (
                    <span className="ml-2 text-[10px] text-amber-glow/70">今天补打不掉</span>
                  )}
                  {isBroken && (
                    <span className="ml-2 text-[10px] text-rose-300">已断 {gap} 天</span>
                  )}
                </div>
                <div className="flex gap-1 mt-3">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const d = offsetDate(today, -(6 - i));
                    const filled = isHabitDoneOn(h, d);
                    const isToday = d === today;
                    return (
                      <div
                        key={i}
                        className={`flex-1 h-1.5 rounded-full ${
                          filled ? "bg-amber-glow/70" : isToday ? "bg-white/25" : "bg-white/10"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* + 新增 卡片 */}
        <button
          onClick={() => setCreating(true)}
          className="p-5 rounded-2xl border-2 border-dashed border-white/15 hover:border-amber-glow/50 text-white/40 hover:text-amber-glow min-h-[150px] flex flex-col items-center justify-center gap-2 transition"
        >
          <Plus className="w-6 h-6" />
          <span className="text-xs tracking-wider">新增习惯</span>
        </button>
      </div>

      {(editing || creating) && (
        <HabitEditor
          initial={editing ?? undefined}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={(name, emoji) => {
            if (editing) updateHabit(editing.id, { name, emoji });
            else addHabit({ name, emoji });
            setEditing(null);
            setCreating(false);
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="bg-zinc-950 border-rose-400/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              删除习惯「{deleting?.emoji} {deleting?.name}」？
            </AlertDialogTitle>
            <AlertDialogDescription>
              该习惯的全部打卡历史也会一并清除，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleting) removeHabit(deleting.id); setDeleting(null); }}
              className="bg-rose-500 hover:bg-rose-600 text-white"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const EMOJI_PRESETS = ["✨","🌅","🌙","📖","🏃","🧘","🇬🇧","💧","🥗","💪","🎨","🎵","✍️","💼","🛌","🧠","☕","🚭","💰","🧹"];

function HabitEditor({
  initial,
  onClose,
  onSave,
}: {
  initial?: Habit;
  onClose: () => void;
  onSave: (name: string, emoji: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "✨");
  const valid = name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-zinc-950 border border-amber-glow/30 p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-white">
            {initial ? "编辑习惯" : "新增习惯"}
          </h3>
          <button onClick={onClose} className="text-white/50 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="block text-[11px] text-white/60 mb-1.5">名称</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && valid) onSave(name.trim(), emoji); }}
            placeholder="例如：早起、阅读…"
            maxLength={20}
            className="w-full bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-amber-glow/60 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[11px] text-white/60 mb-1.5">图标</label>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-11 h-11 rounded-lg bg-white/5 border border-white/15 flex items-center justify-center text-2xl">
              {emoji || "✨"}
            </div>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
              placeholder="自定义"
              className="flex-1 bg-white/5 border border-white/15 rounded-md px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-amber-glow/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_PRESETS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`w-8 h-8 rounded-md text-lg flex items-center justify-center transition ${
                  emoji === e ? "bg-amber-glow/25 border border-amber-glow/50" : "bg-white/5 hover:bg-white/10 border border-transparent"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-full text-xs bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
          >
            取消
          </button>
          <button
            onClick={() => valid && onSave(name.trim(), emoji || "✨")}
            disabled={!valid}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-amber-glow text-background hover:scale-[1.02] transition disabled:opacity-40"
          >
            <Save className="w-3 h-3" /> 保存
          </button>
        </div>
      </div>
    </div>
  );
}

function offsetDate(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
