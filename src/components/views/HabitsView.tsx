import { useSylva, habitStreak, habitDaysSinceLast, isHabitDoneOn, todayLocal } from "@/lib/sylva-store";
import { Flame, Check, AlertTriangle } from "lucide-react";

export function HabitsView() {
  const { habits, toggleHabit } = useSylva();
  const today = todayLocal();

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
        <p className="text-sm text-white/50 max-w-xs text-right">
          像森林一年一圈，慢慢长出节奏。
        </p>
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
            <button
              key={h.id}
              onClick={() => toggleHabit(h.id)}
              className={`group relative p-5 rounded-2xl border text-left transition overflow-hidden
                ${doneToday
                  ? "bg-gradient-to-br from-moss/25 to-amber-glow/15 border-amber-glow/40"
                  : isBroken
                    ? "bg-white/[0.03] border-rose-400/30"
                    : "bg-white/[0.04] border-white/8 hover:border-white/20"}`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{h.emoji}</span>
                {doneToday && (
                  <div className="w-6 h-6 rounded-full bg-moss flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />
                  </div>
                )}
              </div>
              <h3 className="font-display text-xl text-white mb-1">{h.name}</h3>
              <div className="flex items-center gap-1 text-xs text-amber-glow">
                <Flame className="w-3 h-3" />
                <span>连续 {streak} 天</span>
                {!doneToday && streak > 0 && (
                  <span className="ml-2 text-[10px] text-amber-glow/70">今天补打不掉</span>
                )}
                {isBroken && (
                  <span className="ml-2 text-[10px] text-rose-300">已断 {gap} 天</span>
                )}
              </div>
              {/* Mini week grid: 最近 7 天 */}
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
            </button>
          );
        })}
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
