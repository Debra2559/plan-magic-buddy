import { useSylva } from "@/lib/sylva-store";

export function HabitsWidget() {
  const { habits, toggleHabit } = useSylva();
  const done = habits.filter((h) => h.doneToday).length;

  return (
    <div className="widget p-5 w-[300px]">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium tracking-wider text-foreground/70">每日打卡</span>
        <span className="text-xs text-moss">{done} / {habits.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {habits.map((h) => (
          <button
            key={h.id}
            onClick={() => toggleHabit(h.id)}
            className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition
              ${h.doneToday
                ? "bg-moss/15 border-moss/30 text-moss"
                : "bg-foreground/[0.03] border-foreground/10 text-foreground/40 hover:border-foreground/20"}`}
          >
            <span className="text-lg leading-none">{h.emoji}</span>
            <span className="text-[10px]">{h.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
