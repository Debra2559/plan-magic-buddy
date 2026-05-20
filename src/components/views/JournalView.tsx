import { useMemo, useState } from "react";
import {
  useSylva,
  habitStreak,
  habitDaysSinceLast,
  isHabitDoneOn,
  todayLocal,
  type Mood,
} from "@/lib/sylva-store";
import {
  BookHeart,
  Calendar as CalIcon,
  Clock,
  Bell,
  Flame,
  StickyNote,
  Sparkles,
  Sun,
  Moon,
  Coffee,
  Leaf,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const MOODS: Record<Mood, { emoji: string; label: string }> = {
  great: { emoji: "😄", label: "很棒" },
  good: { emoji: "🙂", label: "不错" },
  ok: { emoji: "😐", label: "一般" },
  down: { emoji: "🙁", label: "低落" },
  tired: { emoji: "😴", label: "疲惫" },
};

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function fmtLong(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAY[new Date(y, m - 1, d).getDay()];
  return { big: `${m}.${String(d).padStart(2, "0")}`, sub: `${y} · ${wd}` };
}

export function JournalView() {
  const { items, habits, notes, diary, isRecapDone, toggleHabitOn } = useSylva();
  const [date, setDate] = useState<string>(todayLocal());

  const dayItems = useMemo(
    () =>
      items
        .filter((i) => i.date === date)
        .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99")),
    [items, date],
  );
  const dayNotes = useMemo(
    () => notes.filter((n) => (n.createdAt ?? "").slice(0, 10) === date),
    [notes, date],
  );
  const dayDiary = diary.find((d) => d.date === date);
  const habitsDone = habits.filter((h) => isHabitDoneOn(h, date));
  const habitsMissed = habits.filter((h) => !isHabitDoneOn(h, date));

  const doneItems = dayItems.filter((i) => i.done);
  const ratio = dayItems.length
    ? Math.round((doneItems.length / dayItems.length) * 100)
    : 0;

  const suggestions = useMemo(
    () => buildSuggestions({ date, dayItems, habits, dayDiary, dayNotes }),
    [date, dayItems, habits, dayDiary, dayNotes],
  );

  const isToday = date === todayLocal();
  const fmt = fmtLong(date);

  // 过往：取最近 14 个有内容的日期
  const allDates = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.date));
    notes.forEach((n) => set.add((n.createdAt ?? "").slice(0, 10)));
    diary.forEach((d) => set.add(d.date));
    habits.forEach((h) => (h.history ?? []).forEach((d) => set.add(d)));
    return [...set].filter(Boolean).sort((a, b) => b.localeCompare(a)).slice(0, 14);
  }, [items, notes, diary, habits]);

  return (
    <div className="flex h-full">
      {/* 手帐主页 */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-7">
          {/* 翻页头 */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setDate(addDays(date, -1))}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60"
              title="前一天"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-xs text-white/80 outline-none border border-white/10 rounded-md px-2 py-1"
              />
              {!isToday && (
                <button
                  onClick={() => setDate(todayLocal())}
                  className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/60 hover:text-white"
                >
                  回到今天
                </button>
              )}
            </div>
            <button
              onClick={() => setDate(addDays(date, 1))}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60"
              title="后一天"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 纸张本体 */}
          <div className="relative rounded-[28px] overflow-hidden journal-paper">
            {/* 装饰：washi 胶带 */}
            <div className="absolute -top-2 left-10 w-24 h-7 rotate-[-4deg] bg-amber-glow/40 border border-amber-glow/30 shadow-md" />
            <div className="absolute -top-2 right-12 w-20 h-6 rotate-[5deg] bg-moss/40 border border-moss/30 shadow-md" />

            <div className="p-9 pt-12">
              {/* 日期大字 */}
              <div className="flex items-end justify-between mb-1">
                <div>
                  <p className="text-[10px] tracking-[0.3em] text-amber-glow/90 mb-1">
                    DAILY · JOURNAL
                  </p>
                  <h1 className="font-display text-6xl text-white leading-none">
                    {fmt.big}
                  </h1>
                  <p className="text-xs text-white/50 mt-2 tracking-widest">
                    {fmt.sub}
                    {isRecapDone(date) && (
                      <span className="ml-3 text-moss">· 已通过飞书打卡 ✓</span>
                    )}
                  </p>
                </div>
                {dayDiary?.mood && (
                  <div className="text-right">
                    <p className="text-[10px] tracking-widest text-white/40">心情</p>
                    <p className="text-3xl">{MOODS[dayDiary.mood]?.emoji}</p>
                    <p className="text-[10px] text-white/50">{MOODS[dayDiary.mood]?.label}</p>
                  </div>
                )}
              </div>

              {/* 完成率小条 */}
              {dayItems.length > 0 && (
                <div className="mt-5 mb-7">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] tracking-widest text-white/40">今日完成率</span>
                    <span className="text-[10px] text-white/60">{doneItems.length}/{dayItems.length} · {ratio}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-glow via-amber-glow/80 to-moss transition-all"
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                </div>
              )}

              {/* —— 时间线 —— */}
              <SectionHeader icon={<CalIcon className="w-3.5 h-3.5" />} title="今日时间线" />
              {dayItems.length === 0 ? (
                <EmptyLine text="这一天没有安排，留白也是一种安排 ✨" />
              ) : (
                <div className="relative pl-6 mb-7">
                  <div className="absolute left-2 top-1 bottom-1 w-px bg-gradient-to-b from-amber-glow/50 via-white/10 to-transparent" />
                  <div className="space-y-2.5">
                    {dayItems.map((it) => {
                      const Icon = it.type === "event" ? CalIcon : it.type === "reminder" ? Bell : Clock;
                      return (
                        <div key={it.id} className="relative">
                          <div className={`absolute -left-[18px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/40 ${it.done ? "bg-moss" : "bg-amber-glow"}`} />
                          <div className="flex items-baseline gap-3">
                            <span className="font-mono text-[11px] text-amber-glow/90 w-12 shrink-0">
                              {it.time ?? "—"}
                            </span>
                            <Icon className="w-3 h-3 text-white/40 shrink-0" />
                            <p className={`text-sm leading-snug ${it.done ? "line-through text-white/40" : "text-white/90"}`}>
                              {it.title}
                            </p>
                            <span className="ml-auto text-[10px] text-white/35 shrink-0">{it.tag}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* —— 习惯印章 —— */}
              <SectionHeader icon={<Flame className="w-3.5 h-3.5" />} title={`习惯印章 · ${habitsDone.length}/${habits.length}`} />
              {habits.length === 0 ? (
                <EmptyLine text="还没有习惯，先从一件小事开始 🌱" />
              ) : (
                <div className="flex flex-wrap gap-2 mb-7">
                  {habits.map((h) => {
                    const done = isHabitDoneOn(h, date);
                    const s = habitStreak(h, date);
                    return (
                      <button
                        key={h.id}
                        onClick={() => toggleHabitOn(h.id, date)}
                        className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition active:scale-95 ${
                          done
                            ? "bg-moss/15 border-moss/40 text-moss hover:bg-moss/25"
                            : "bg-white/5 border-dashed border-white/15 text-white/45 hover:border-amber-glow/40 hover:text-white/80"
                        }`}
                        title={done ? `已打卡 · 连续 ${s} 天（点击撤销）` : "点击一键打卡"}
                      >
                        <span className="text-base">{h.emoji}</span>
                        <span className="text-xs">{h.name}</span>
                        {done && s > 1 && (
                          <span className="text-[10px] font-mono opacity-80">×{s}</span>
                        )}
                        {done && (
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-moss text-[8px] text-primary-foreground flex items-center justify-center font-bold shadow">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* —— 随手记 —— */}
              <SectionHeader icon={<StickyNote className="w-3.5 h-3.5" />} title={`随手记 · ${dayNotes.length}`} />
              {dayNotes.length === 0 ? (
                <EmptyLine text="没有抓到飘过的念头" />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-7">
                  {dayNotes.map((n) => (
                    <div
                      key={n.id}
                      className="p-3 rounded-xl bg-white/[0.04] border border-white/8 hover:border-amber-glow/30 transition"
                      style={{ transform: `rotate(${(parseInt(n.id.slice(-2), 36) % 5 - 2) * 0.25}deg)` }}
                    >
                      <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap line-clamp-4">
                        {n.text}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-white/40">
                        <span>{(n.createdAt ?? "").slice(11, 16)}</span>
                        {n.mood && <span>{MOODS[n.mood]?.emoji}</span>}
                        {(n.tags ?? []).slice(0, 3).map((t) => (
                          <span key={t} className="px-1.5 py-0.5 rounded-full bg-white/5">#{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* —— 日记 —— */}
              <SectionHeader icon={<BookHeart className="w-3.5 h-3.5" />} title="今日日记" />
              {dayDiary?.content ? (
                <div className="journal-lines p-5 rounded-2xl bg-white/[0.03] border border-white/8 mb-7">
                  <p className="text-sm text-white/85 leading-8 whitespace-pre-wrap">
                    {dayDiary.content}
                  </p>
                </div>
              ) : (
                <EmptyLine text="还没有写下今天 —— 去『随手记 · 日记』补一笔吧" />
              )}

              {/* —— 给未来的建议 —— */}
              <SectionHeader icon={<Sparkles className="w-3.5 h-3.5" />} title="给未来的自己" />
              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3.5 rounded-xl bg-gradient-to-r from-amber-glow/10 to-transparent border border-amber-glow/20"
                  >
                    <div className="w-7 h-7 rounded-full bg-amber-glow/20 flex items-center justify-center shrink-0">
                      <s.Icon className="w-3.5 h-3.5 text-amber-glow" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs tracking-widest text-amber-glow/90 mb-0.5">{s.tag}</p>
                      <p className="text-sm text-white/85 leading-snug">{s.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 底部签名 */}
            <div className="px-9 pb-7 pt-2 text-right">
              <p className="font-display text-sm text-white/35 italic">— Sylva ·  慢慢长出节奏 ·</p>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：过往 */}
      <aside className="w-60 shrink-0 bg-black/30 border-l border-white/10 p-4 overflow-auto">
        <p className="text-[10px] tracking-widest text-amber-glow mb-3">手帐翻页</p>
        {allDates.length === 0 ? (
          <p className="text-xs text-white/40">还没有任何记录</p>
        ) : (
          <div className="space-y-1">
            {allDates.map((d) => {
              const f = fmtLong(d);
              const active = d === date;
              return (
                <button
                  key={d}
                  onClick={() => setDate(d)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition border ${
                    active
                      ? "bg-amber-glow/15 border-amber-glow/40 text-white"
                      : "bg-transparent border-white/8 text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <p className="font-display text-base leading-none">{f.big}</p>
                  <p className="text-[10px] text-white/40 mt-1">{f.sub}</p>
                </button>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <div className="w-6 h-6 rounded-full bg-amber-glow/15 flex items-center justify-center text-amber-glow">
        {icon}
      </div>
      <h3 className="text-xs tracking-[0.25em] text-white/70 uppercase">{title}</h3>
      <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-xs text-white/35 italic mb-7 pl-1">— {text} —</p>;
}

/* ---------------- Suggestions ---------------- */

interface Suggestion {
  tag: string;
  text: string;
  Icon: typeof Sparkles;
}

function buildSuggestions(args: {
  date: string;
  dayItems: ReturnType<typeof useSylva>["items"];
  habits: ReturnType<typeof useSylva>["habits"];
  dayDiary?: { content: string; mood?: Mood };
  dayNotes: ReturnType<typeof useSylva>["notes"];
}): Suggestion[] {
  const { date, dayItems, habits, dayDiary, dayNotes } = args;
  const out: Suggestion[] = [];

  const pending = dayItems.filter((i) => !i.done);
  const done = dayItems.filter((i) => i.done);
  const ratio = dayItems.length ? done.length / dayItems.length : 0;

  // 1. 任务节奏
  if (pending.length === 0 && dayItems.length > 0) {
    out.push({
      tag: "节奏",
      Icon: Sun,
      text: `今天全部 ${dayItems.length} 项都打钩了，给自己一个安静的奖励 —— 一杯茶、十分钟散步，都好。`,
    });
  } else if (ratio >= 0.6) {
    out.push({
      tag: "节奏",
      Icon: Sun,
      text: `已经完成大半了。剩下 ${pending.length} 项中，挑一件最快收尾的先做，让今天有一个干净的结束。`,
    });
  } else if (dayItems.length > 6) {
    out.push({
      tag: "节奏",
      Icon: Coffee,
      text: `今天排了 ${dayItems.length} 件事，明天可以试着只留 3 件「必须做」，把其余拆到后天 —— 留白才能跑得久。`,
    });
  } else if (dayItems.length === 0) {
    out.push({
      tag: "节奏",
      Icon: Leaf,
      text: `这一天是空白的。明天给自己安排 1-2 件「最小可做」的小事，比如「读 10 页书」「散步 20 分钟」，让节奏慢慢启动。`,
    });
  }

  // 2. 习惯
  const habitDone = habits.filter((h) => isHabitDoneOn(h, date));
  const habitMissed = habits.filter((h) => !isHabitDoneOn(h, date) && habitStreak(h, date) > 0);
  const broken = habits.filter((h) => {
    const gap = habitDaysSinceLast(h, date);
    return gap !== Infinity && gap >= 3;
  });
  const topStreak = [...habits]
    .map((h) => ({ h, s: habitStreak(h, date) }))
    .filter((x) => x.s >= 5)
    .sort((a, b) => b.s - a.s)[0];

  if (broken.length > 0) {
    const h = broken[0];
    out.push({
      tag: "习惯",
      Icon: Leaf,
      text: `「${h.emoji} ${h.name}」已经 ${habitDaysSinceLast(h, date)} 天没碰了。明天用一个「3 分钟最小版本」重启它就行 —— 起步比坚持难得多。`,
    });
  } else if (habitMissed.length > 0) {
    const list = habitMissed.slice(0, 2).map((h) => `${h.emoji}${h.name}`).join("、");
    out.push({
      tag: "习惯",
      Icon: Flame,
      text: `今天 ${list} 还没打卡，连续记录别在最后一步断掉。睡前 10 分钟还来得及。`,
    });
  } else if (topStreak) {
    out.push({
      tag: "习惯",
      Icon: Flame,
      text: `${topStreak.h.emoji} ${topStreak.h.name} 已经连续 ${topStreak.s} 天，明天继续 —— 这条线越长，越能扛住坏天气。`,
    });
  } else if (habitDone.length === habits.length && habits.length > 0) {
    out.push({
      tag: "习惯",
      Icon: Flame,
      text: `所有习惯今天都打卡了 🌟 明天可以试着把其中一件加 10%（多一组、多一页、多一分钟）。`,
    });
  }

  // 3. 心情 / 日记
  if (dayDiary?.mood === "down" || dayDiary?.mood === "tired") {
    out.push({
      tag: "照顾自己",
      Icon: Moon,
      text: `今天心情有点 ${MOODS[dayDiary.mood].label}。明天给自己留一段「什么都不做」的 30 分钟 —— 是允许，不是奖励。`,
    });
  } else if (!dayDiary?.content) {
    out.push({
      tag: "回看",
      Icon: BookHeart,
      text: `今天还没写日记。哪怕只写一句「今天最暖的一刻是 ___」，未来翻回来的自己会感谢你。`,
    });
  }

  // 4. 灵感（来自随手记）
  if (dayNotes.length >= 3) {
    out.push({
      tag: "灵感",
      Icon: Sparkles,
      text: `今天记下了 ${dayNotes.length} 条想法 —— 挑一条最让你心动的，明天给它 25 分钟「先动手做出最丑的版本」。`,
    });
  }

  // 兜底
  if (out.length === 0) {
    out.push({
      tag: "明天",
      Icon: Sun,
      text: `先早起 10 分钟，给自己一杯水的时间想清楚：今天最重要的 1 件事是什么。`,
    });
  }

  return out.slice(0, 4);
}
