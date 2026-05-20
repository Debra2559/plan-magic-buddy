import { useEffect, useMemo, useRef, useState } from "react";
import { FreeformCanvas } from "@/components/canvas/FreeformCanvas";
import { LayoutGrid, Brush } from "lucide-react";
import {
  useSylva,
  habitStreak,
  habitDaysSinceLast,
  isHabitDoneOn,
  todayLocal,
  type Mood,
} from "@/lib/sylva-store";
import { generateDailyComic } from "@/lib/comic.functions";
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
  NotebookPen,
  Check,
  Wand2,
  Loader2,
  RefreshCw,
  Download,
  Share2,
  X as XIcon,
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

async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`下载失败 [${res.status}]`);
  return res.blob();
}

async function downloadComicImage(url: string, filename: string) {
  try {
    const blob = await fetchImageBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    // 兜底：跨域无法 fetch 时直接打开图片，让用户长按保存
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

async function shareComicImage(url: string, filename: string, title: string) {
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string; url?: string }) => Promise<void>;
  };
  try {
    const blob = await fetchImageBlob(url);
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title, text: title });
      return;
    }
    if (nav.share) {
      await nav.share({ title, text: title, url });
      return;
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return;
  }
  // 不支持系统分享 —— 退化为下载
  await downloadComicImage(url, filename);
}

export function JournalView() {
  const { items, habits, notes, diary, comics, isRecapDone, toggleHabitOn, addNote, upsertDiary, setComic, removeComic, comicHistory, addComicHistory, removeComicHistory, dateFlashEnabled, dateFlashDurationMs } = useSylva();
  const [date, setDate] = useState<string>(() => {
    if (typeof window === "undefined") return todayLocal();
    try {
      const saved = window.localStorage.getItem("journal:lastDate");
      return saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : todayLocal();
    } catch {
      return todayLocal();
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem("journal:lastDate", date); } catch {}
  }, [date]);
  const dateBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [flashTick, setFlashTick] = useState(0);

  useEffect(() => {
    const el = dateBtnRefs.current[date];
    if (!el) return;
    // 用 scrollIntoView({ block: "start" }) 配合按钮上的 scroll-mt，
    // 让活跃日期始终停在 sticky「手帐翻页」标题正下方，不会被遮住。
    el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    // 触发一次高亮闪烁，便于确认定位
    setFlashTick((t) => t + 1);
  }, [date]);

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

  // 上下键切换日期（在「手帐翻页」列表中移动）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (allDates.length === 0) return;
      const idx = allDates.indexOf(date);
      if (e.key === "ArrowUp") {
        const next = idx <= 0 ? allDates[0] : allDates[idx - 1];
        setDate(next);
      } else {
        const next = idx === -1 ? allDates[0] : idx >= allDates.length - 1 ? allDates[allDates.length - 1] : allDates[idx + 1];
        setDate(next);
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allDates, date, setDate]);

  const [jMode, setJMode] = useState<"list" | "canvas">(() => {
    if (typeof window === "undefined") return "list";
    return (window.localStorage.getItem("journal:mode") as "list" | "canvas") ?? "list";
  });
  useEffect(() => { try { window.localStorage.setItem("journal:mode", jMode); } catch {} }, [jMode]);

  if (jMode === "canvas") {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-7 pt-5">
          <div>
            <p className="text-[10px] tracking-widest text-amber-glow mb-1">手帐</p>
            <h2 className="font-display text-2xl text-white">自由画布 · 拼贴你的日子</h2>
          </div>
          <JournalModeToggle mode={jMode} onChange={setJMode} />
        </div>
        <div className="flex-1 mt-3 mx-7 mb-5 rounded-2xl overflow-hidden border border-white/10">
          <FreeformCanvas kind="journal" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="absolute top-4 right-6 z-20">
        <JournalModeToggle mode={jMode} onChange={setJMode} />
      </div>
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
                  <div
                    className="diary-editor text-sm text-white/85 leading-8 whitespace-pre-wrap break-words"
                    dangerouslySetInnerHTML={{ __html: dayDiary.content }}
                  />
                </div>

              ) : (
                <EmptyLine text="还没有写下今天 —— 去『随手记 · 日记』补一笔吧" />
              )}

              {/* —— 每日漫画 —— */}
              <SectionHeader icon={<Wand2 className="w-3.5 h-3.5" />} title="每日漫画" />
              <ComicPanel
                date={date}
                comic={comics.find((c) => c.date === date)}
                buildSummary={() =>
                  buildComicSummary({ date, fmt, dayItems, habitsDone: habits.filter((h) => isHabitDoneOn(h, date)), habitsMissed: habits.filter((h) => !isHabitDoneOn(h, date)), dayNotes, dayDiary })
                }
                onGenerated={(c) => {
                  setComic(c);
                  addComicHistory({ date: c.date, imageUrl: c.imageUrl, provider: c.provider, caption: c.caption, createdAt: c.createdAt });
                }}
                onRemove={() => removeComic(date)}
                onCopyToDiary={(line) => {
                  const prev = diary.find((d) => d.date === date)?.content ?? "";
                  upsertDiary(date, { content: prev ? `${prev}\n\n${line}` : line });
                }}
                onCopyToNote={(line) => addNote(line, { tags: ["每日漫画"] })}
              />

              <ComicHistoryPanel
                history={comicHistory}
                currentDate={date}
                onRecall={(item) => setComic({ date, imageUrl: item.imageUrl, provider: item.provider, caption: item.caption, createdAt: new Date().toISOString() })}
                onDelete={(id) => removeComicHistory(id)}
                onInsertDiary={(item) => {
                  const prev = diary.find((d) => d.date === date)?.content ?? "";
                  const line = `🖼️ 旧作回看（${item.provider} · ${item.date}）：${item.imageUrl}`;
                  upsertDiary(date, { content: prev ? `${prev}\n\n${line}` : line });
                }}
              />

              {/* —— 给未来的建议 —— */}
              <SectionHeader icon={<Sparkles className="w-3.5 h-3.5" />} title="给未来的自己" />
              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <SuggestionCard
                    key={i}
                    s={s}
                    onCopyToDiary={() => {
                      const prev = diary.find((d) => d.date === date)?.content ?? "";
                      const line = `💡 ${s.tag}：${s.text}`;
                      const merged = prev ? `${prev}\n\n${line}` : line;
                      upsertDiary(date, { content: merged });
                    }}
                    onCopyToNote={() => {
                      addNote(s.text, { tags: ["未来的我", s.tag] });
                    }}
                  />
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
      <aside className="w-60 shrink-0 bg-black/30 border-l border-white/10 overflow-auto [scroll-padding-top:2.75rem]">
        <p className="sticky top-0 z-10 -mx-0 px-4 pt-4 pb-2 text-[10px] tracking-widest text-amber-glow bg-black/60 backdrop-blur-md border-b border-white/5">
          手帐翻页
        </p>
        <div className="p-4 pt-2">
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
                    ref={(el) => { dateBtnRefs.current[d] = el; }}
                    onClick={() => setDate(d)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition border scroll-mt-12 ${
                      active
                        ? "bg-amber-glow/15 border-amber-glow/40 text-white"
                        : "bg-transparent border-white/8 text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span
                      key={active && dateFlashEnabled ? `flash-${flashTick}` : "idle"}
                      style={active && dateFlashEnabled ? { animationDuration: `${dateFlashDurationMs}ms` } : undefined}
                      className={`block rounded-md ${active && dateFlashEnabled ? "animate-date-flash" : ""}`}
                    >
                      <p className="font-display text-base leading-none">{f.big}</p>
                      <p className="text-[10px] text-white/40 mt-1">{f.sub}</p>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
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

function SuggestionCard({
  s,
  onCopyToDiary,
  onCopyToNote,
}: {
  s: Suggestion;
  onCopyToDiary: () => void;
  onCopyToNote: () => void;
}) {
  const [copied, setCopied] = useState<"diary" | "note" | null>(null);
  const flash = (kind: "diary" | "note", fn: () => void) => {
    fn();
    setCopied(kind);
    setTimeout(() => setCopied(null), 1400);
  };
  return (
    <div className="group flex items-start gap-3 p-3.5 rounded-xl bg-gradient-to-r from-amber-glow/10 to-transparent border border-amber-glow/20">
      <div className="w-7 h-7 rounded-full bg-amber-glow/20 flex items-center justify-center shrink-0">
        <s.Icon className="w-3.5 h-3.5 text-amber-glow" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs tracking-widest text-amber-glow/90 mb-0.5">{s.tag}</p>
        <p className="text-sm text-white/85 leading-snug">{s.text}</p>
        <div className="flex items-center gap-1.5 mt-2 opacity-60 group-hover:opacity-100 transition">
          <button
            onClick={() => flash("diary", onCopyToDiary)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-amber-glow/20 border border-white/10 hover:border-amber-glow/40 text-[10px] text-white/70 hover:text-amber-glow transition"
            title="追加到今日日记"
          >
            {copied === "diary" ? <Check className="w-3 h-3" /> : <BookHeart className="w-3 h-3" />}
            {copied === "diary" ? "已追加" : "→ 日记"}
          </button>
          <button
            onClick={() => flash("note", onCopyToNote)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-amber-glow/20 border border-white/10 hover:border-amber-glow/40 text-[10px] text-white/70 hover:text-amber-glow transition"
            title="保存为随手记"
          >
            {copied === "note" ? <Check className="w-3 h-3" /> : <NotebookPen className="w-3 h-3" />}
            {copied === "note" ? "已保存" : "→ 随手记"}
          </button>
        </div>
      </div>
    </div>
  );
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

/* ---------------- Daily Comic ---------------- */

function buildComicSummary(args: {
  date: string;
  fmt: { big: string; sub: string };
  dayItems: ReturnType<typeof useSylva>["items"];
  habitsDone: ReturnType<typeof useSylva>["habits"];
  habitsMissed: ReturnType<typeof useSylva>["habits"];
  dayNotes: ReturnType<typeof useSylva>["notes"];
  dayDiary?: { content: string; mood?: Mood };
}): string {
  const { date, dayItems, habitsDone, habitsMissed, dayNotes, dayDiary } = args;
  const lines: string[] = [];
  lines.push(`Date: ${date}`);
  if (dayDiary?.mood) lines.push(`Mood: ${MOODS[dayDiary.mood].label} (${MOODS[dayDiary.mood].emoji})`);
  if (dayDiary?.content) lines.push(`Diary: ${dayDiary.content.slice(0, 600)}`);
  if (dayItems.length) {
    lines.push(`Schedule (${dayItems.filter((i) => i.done).length}/${dayItems.length} done):`);
    dayItems.slice(0, 10).forEach((i) => {
      lines.push(`- ${i.time ?? "—"} ${i.done ? "[done]" : "[ ]"} ${i.title} (${i.tag})`);
    });
  }
  if (habitsDone.length) lines.push(`Habits done: ${habitsDone.map((h) => `${h.emoji}${h.name}`).join(", ")}`);
  if (habitsMissed.length) lines.push(`Habits missed: ${habitsMissed.map((h) => `${h.emoji}${h.name}`).join(", ")}`);
  if (dayNotes.length) {
    lines.push(`Notes:`);
    dayNotes.slice(0, 5).forEach((n) => lines.push(`- ${n.text.slice(0, 160)}`));
  }
  return lines.join("\n");
}

type Provider = "gemini" | "seedream";

function ComicPanel({
  date,
  comic,
  buildSummary,
  onGenerated,
  onRemove,
  onCopyToDiary,
  onCopyToNote,
}: {
  date: string;
  comic?: { imageUrl: string; provider: Provider; caption?: string; createdAt: string };
  buildSummary: () => string;
  onGenerated: (c: { date: string; imageUrl: string; provider: Provider; caption?: string; createdAt: string }) => void;
  onRemove: () => void;
  onCopyToDiary: (line: string) => void;
  onCopyToNote: (line: string) => void;
}) {
  const { comicProvider, comicSeedreamModel, comicStyle, comicProtagonistUrl } = useSylva();
  const provider = comicProvider;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<"diary" | "note" | null>(null);

  const run = async () => {
    setErr(null);
    setLoading(true);
    try {
      const summary = buildSummary();
      const res = await generateDailyComic({
        data: {
          date,
          summary,
          provider,
          ...(provider === "seedream" && comicSeedreamModel ? { model: comicSeedreamModel } : {}),
          ...(comicStyle.trim() ? { style: comicStyle.trim() } : {}),
          ...(provider === "gemini" && comicProtagonistUrl ? { protagonistImageUrl: comicProtagonistUrl } : {}),
        },
      });
      onGenerated({
        date,
        imageUrl: res.imageUrl,
        provider: res.provider as Provider,
        caption: res.caption,
        createdAt: new Date().toISOString(),
      });
    } catch (e: any) {
      setErr(e?.message ?? "生成失败");
    } finally {
      setLoading(false);
    }
  };

  const flash = (kind: "diary" | "note", fn: () => void) => {
    fn();
    setCopied(kind);
    setTimeout(() => setCopied(null), 1400);
  };

  return (
    <div className="mb-7 rounded-2xl bg-white/[0.03] border border-white/8 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={run}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-glow/20 hover:bg-amber-glow/30 border border-amber-glow/40 text-xs text-amber-glow disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : comic ? <RefreshCw className="w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
          {loading ? "正在画…" : comic ? "重新生成" : "生成今日漫画"}
        </button>
      </div>

      {err && (
        <p className="text-xs text-red-300/90 mb-2 px-2 py-1.5 rounded bg-red-500/10 border border-red-400/20">
          {err}
        </p>
      )}

      {comic ? (
        <div className="space-y-2">
          <div className="relative rounded-xl overflow-hidden bg-black/40 border border-white/8">
            <img src={comic.imageUrl} alt={`${date} 漫画`} className="w-full h-auto block" />
            <button
              onClick={onRemove}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white/80 flex items-center justify-center"
              title="删除"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/45">
            <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
              {comic.provider === "gemini" ? "Gemini" : "Seedream"}
            </span>
            <span>{new Date(comic.createdAt).toLocaleString()}</span>
            <button
              onClick={() => downloadComicImage(comic.imageUrl, `sylva-${date}.png`)}
              className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70"
              title="导出为图片"
            >
              <Download className="w-3 h-3" /> 导出
            </button>
            <button
              onClick={() => shareComicImage(comic.imageUrl, `sylva-${date}.png`, `Sylva · ${date} 漫画`)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-glow/15 hover:bg-amber-glow/30 border border-amber-glow/40 text-amber-glow"
              title="移动端可保存到相册"
            >
              <Share2 className="w-3 h-3" /> 保存到相册
            </button>
            <button
              onClick={() =>
                flash("diary", () =>
                  onCopyToDiary(`🖼️ 今日漫画（${comic.provider}）：${comic.imageUrl}`),
                )
              }
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-amber-glow/20 border border-white/10 hover:border-amber-glow/40 text-white/70 hover:text-amber-glow"
            >
              {copied === "diary" ? <Check className="w-3 h-3" /> : <BookHeart className="w-3 h-3" />}
              {copied === "diary" ? "已追加" : "→ 日记"}
            </button>
            <button
              onClick={() =>
                flash("note", () =>
                  onCopyToNote(`今日漫画 · ${comic.provider}\n${comic.imageUrl}`),
                )
              }
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-amber-glow/20 border border-white/10 hover:border-amber-glow/40 text-white/70 hover:text-amber-glow"
            >
              {copied === "note" ? <Check className="w-3 h-3" /> : <NotebookPen className="w-3 h-3" />}
              {copied === "note" ? "已保存" : "→ 随手记"}
            </button>
          </div>
          {comic.caption && (
            <p className="text-xs text-white/55 italic px-1">{comic.caption}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-white/40 italic px-1 py-3">
          把这一天画成漫画 —— 格数由模型自行判断。可在「设置 → 漫画生成」切换模型与风格。
        </p>
      )}
    </div>
  );
}

function ComicHistoryPanel({
  history,
  currentDate,
  onRecall,
  onDelete,
  onInsertDiary,
}: {
  history: import("@/lib/sylva-store").ComicHistoryItem[];
  currentDate: string;
  onRecall: (item: import("@/lib/sylva-store").ComicHistoryItem) => void;
  onDelete: (id: string) => void;
  onInsertDiary: (item: import("@/lib/sylva-store").ComicHistoryItem) => void;
}) {
  const [preview, setPreview] = useState<import("@/lib/sylva-store").ComicHistoryItem | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (history.length === 0) {
    return (
      <div className="mb-7 rounded-2xl bg-white/[0.02] border border-white/8 p-4">
        <p className="text-[11px] tracking-widest text-amber-glow/80 mb-2">Seedream 历史</p>
        <p className="text-xs text-white/40 italic">还没有生成记录 —— 第一幅画即将诞生。</p>
      </div>
    );
  }

  return (
    <div className="mb-7 rounded-2xl bg-white/[0.03] border border-white/8 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] tracking-widest text-amber-glow/80">生成历史 · {history.length}</p>
        <p className="text-[10px] text-white/35">点击缩略图查看大图</p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {history.map((item) => (
          <div
            key={item.id}
            className="group relative rounded-lg overflow-hidden border border-white/10 bg-black/40 aspect-square"
          >
            <button
              onClick={() => setPreview(item)}
              className="block w-full h-full"
              title="点击查看大图"
            >
              <img src={item.imageUrl} alt={item.date} className="w-full h-full object-cover transition group-hover:scale-105" />
            </button>
            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-black/70 text-[9px] text-white/85 border border-white/10">
              {item.provider === "seedream" ? "Seedream" : "Gemini"}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmId(item.id); }}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-red-500/70 text-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              title="删除"
            >
              <XIcon className="w-3 h-3" />
            </button>
            <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/85 to-transparent flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
              <div className="flex items-center justify-between text-[9px] text-white/70">
                <span>{item.date}</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => onRecall(item)}
                  className="flex-1 px-1 py-0.5 rounded bg-amber-glow/30 hover:bg-amber-glow/50 text-[9px] text-white border border-amber-glow/40"
                  title={`设为 ${currentDate} 的漫画`}
                >
                  设为今日
                </button>
                <button
                  onClick={() => onInsertDiary(item)}
                  className="flex-1 px-1 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[9px] text-white/85 border border-white/15"
                  title="插入到今日日记"
                >
                  → 日记
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {confirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setConfirmId(null)}
        >
          <div
            className="bg-zinc-900 border border-white/15 rounded-2xl p-5 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-white/90 mb-4">确定删除这张漫画历史吗？此操作不可撤销。</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmId(null)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white/80"
              >
                取消
              </button>
              <button
                onClick={() => { onDelete(confirmId); setConfirmId(null); }}
                className="px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-xs text-white"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="relative rounded-2xl overflow-hidden border border-white/15 bg-black">
              <img src={preview.imageUrl} alt={preview.date} className="w-full h-auto block" />
              <button
                onClick={() => setPreview(null)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-white/70">
              <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/15">
                {preview.provider === "seedream" ? "Seedream" : "Gemini"}
              </span>
              <span>原日期 · {preview.date}</span>
              <span className="text-white/40">{new Date(preview.createdAt).toLocaleString()}</span>
              <button
                onClick={() => downloadComicImage(preview.imageUrl, `sylva-${preview.date}.png`)}
                className="ml-auto flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 border border-white/15"
                title="导出为图片"
              >
                <Download className="w-3 h-3" /> 导出
              </button>
              <button
                onClick={() => shareComicImage(preview.imageUrl, `sylva-${preview.date}.png`, `Sylva · ${preview.date} 漫画`)}
                className="flex items-center gap-1 px-3 py-1 rounded-full bg-amber-glow/15 hover:bg-amber-glow/30 border border-amber-glow/40 text-amber-glow"
                title="移动端可保存到相册"
              >
                <Share2 className="w-3 h-3" /> 保存到相册
              </button>
              <button
                onClick={() => { onRecall(preview); setPreview(null); }}
                className="ml-auto px-3 py-1 rounded-full bg-amber-glow/25 hover:bg-amber-glow/40 border border-amber-glow/40 text-amber-glow"
              >
                设为 {currentDate} 的漫画
              </button>
              <button
                onClick={() => { onInsertDiary(preview); setPreview(null); }}
                className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 border border-white/15"
              >
                插入到日记
              </button>
            </div>
            {preview.caption && (
              <p className="text-xs text-white/55 italic mt-2 px-1">{preview.caption}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function JournalModeToggle({ mode, onChange }: { mode: "list" | "canvas"; onChange: (m: "list" | "canvas") => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/10 shrink-0">
      <button
        onClick={() => onChange("list")}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${mode === "list" ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
      >
        <LayoutGrid className="w-3 h-3" /> 手帐
      </button>
      <button
        onClick={() => onChange("canvas")}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${mode === "canvas" ? "bg-amber-glow/20 text-amber-glow" : "text-white/60 hover:text-white"}`}
      >
        <Brush className="w-3 h-3" /> 画布
      </button>
    </div>
  );
}
