import { Droplet, Coffee, Headphones, Pencil, Moon, BookOpen } from "lucide-react";

const habits = [
  { icon: Droplet, label: "晨起温水", done: true },
  { icon: Coffee, label: "吃早餐", done: true },
  { icon: Headphones, label: "泛听英语", done: true },
  { icon: Pencil, label: "记一条想法", done: false },
  { icon: Moon, label: "23:30 前睡", done: false },
  { icon: BookOpen, label: "睡前读书", done: false },
];

export function HabitsWidget() {
  return (
    <div className="widget p-5 w-[300px]">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium tracking-wider text-foreground/70">每日打卡</span>
        <span className="text-xs text-moss">3 / 6</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {habits.map((h, i) => {
          const Icon = h.icon;
          return (
            <div
              key={i}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition
                ${h.done
                  ? "bg-moss/15 border-moss/30 text-moss"
                  : "bg-foreground/[0.03] border-foreground/10 text-foreground/40"}`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-[10px]">{h.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
