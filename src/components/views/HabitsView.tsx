import { useSylva } from "@/lib/sylva-store";
import { Flame, Check } from "lucide-react";

export function HabitsView() {
  const { habits, toggleHabit } = useSylva();

  const doneCount = habits.filter((h) => h.doneToday).length;

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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {habits.map((h) => (
          <button
            key={h.id}
            onClick={() => toggleHabit(h.id)}
            className={`group relative p-5 rounded-2xl border text-left transition overflow-hidden
              ${h.doneToday
                ? "bg-gradient-to-br from-moss/25 to-amber-glow/15 border-amber-glow/40"
                : "bg-white/[0.04] border-white/8 hover:border-white/20"}`}
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-3xl">{h.emoji}</span>
              {h.doneToday && (
                <div className="w-6 h-6 rounded-full bg-moss flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />
                </div>
              )}
            </div>
            <h3 className="font-display text-xl text-white mb-1">{h.name}</h3>
            <div className="flex items-center gap-1 text-xs text-amber-glow">
              <Flame className="w-3 h-3" />
              <span>连续 {h.streak} 天</span>
            </div>
            {/* Mini week grid */}
            <div className="flex gap-1 mt-3">
              {Array.from({ length: 7 }).map((_, i) => {
                const filled = i < Math.min(h.streak, 7);
                return (
                  <div
                    key={i}
                    className={`flex-1 h-1.5 rounded-full ${
                      filled ? "bg-amber-glow/70" : "bg-white/10"
                    }`}
                  />
                );
              })}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
