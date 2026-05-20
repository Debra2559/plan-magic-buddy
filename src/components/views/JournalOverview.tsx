import { useMemo, useState } from "react";
import {
  Calendar as CalIcon,
  Clock,
  Bell,
  Flame,
  Sparkles,
  ListChecks,
  Printer,
  ChevronDown,
} from "lucide-react";
import { useSylva, isHabitDoneOn, todayLocal, type Mood } from "@/lib/sylva-store";

const MOODS: Record<Mood, { emoji: string; label: string }> = {
  great: { emoji: "😄", label: "很棒" },
  good: { emoji: "🙂", label: "不错" },
  ok: { emoji: "😐", label: "一般" },
  down: { emoji: "🙁", label: "低落" },
  tired: { emoji: "😴", label: "疲惫" },
};
const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function fmtLong(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAY[new Date(y, m - 1, d).getDay()];
  return { big: `${m}.${String(d).padStart(2, "0")}`, sub: `${y} · ${wd}`, full: `${y}年${m}月${d}日 · ${wd}` };
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

type Preset = "7" | "30" | "all" | "custom";

export function JournalOverview() {
  const { items, notes, diary, habits } = useSylva();

  const [preset, setPreset] = useState<Preset>("7");
  const today = todayLocal();
  const [from, setFrom] = useState<string>(addDays(today, -6));
  const [to, setTo] = useState<string>(today);

  // 所有有记录的日期
  const allDates = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.date));
    notes.forEach((n) => set.add((n.createdAt ?? "").slice(0, 10)));
    diary.forEach((d) => set.add(d.date));
    habits.forEach((h) => (h.history ?? []).forEach((d) => set.add(d)));
    return [...set].filter(Boolean).sort((a, b) => b.localeCompare(a));
  }, [items, notes, diary, habits]);

  const datesInRange = useMemo(() => {
    if (preset === "all") return allDates;
    let lo = from, hi = to;
    if (preset === "7") { lo = addDays(today, -6); hi = today; }
    if (preset === "30") { lo = addDays(today, -29); hi = today; }
    return allDates.filter((d) => d >= lo && d <= hi);
  }, [allDates, preset, from, to, today]);

  const handlePreset = (p: Preset) => {
    setPreset(p);
    if (p === "7") { setFrom(addDays(today, -6)); setTo(today); }
    if (p === "30") { setFrom(addDays(today, -29)); setTo(today); }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <div className="h-full overflow-auto bg-background">
      {/* 打印样式：隐藏工具栏、铺满纸张、避免分页切断卡片 */}
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          html, body { background: white !important; }
          .no-print { display: none !important; }
          .overview-page { background: white !important; }
          .overview-day-card {
            break-inside: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
            border: 1px solid #e5e7eb !important;
            background: white !important;
            color: #111 !important;
          }
          .overview-day-card * { color: #111 !important; }
          .overview-muted { color: #555 !important; }
          .overview-accent { color: #b45309 !important; }
        }
      `}</style>

      <div className="overview-page max-w-4xl mx-auto p-7">
        {/* 顶部工具栏 */}
        <div className="no-print flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-amber-glow/90 mb-1">JOURNAL · OVERVIEW</p>
            <h1 className="font-display text-3xl text-foreground">手帐全景 · 我这些天干了什么</h1>
            <p className="text-xs text-muted-foreground mt-1">
              共 {datesInRange.length} 天有记录{preset !== "all" && `(${from} → ${to})`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-full bg-foreground/[0.05] border border-border">
              {([
                ["7", "近 7 天"],
                ["30", "近 30 天"],
                ["all", "全部"],
                ["custom", "自定义"],
              ] as [Preset, string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => handlePreset(k)}
                  className={`px-3 py-1 rounded-full text-xs transition ${
                    preset === k
                      ? "bg-amber-glow/20 text-amber-glow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <div className="flex items-center gap-1.5 text-xs">
                <input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  className="bg-transparent text-foreground/85 outline-none border border-border rounded-md px-2 py-1"
                />
                <span className="text-muted-foreground">→</span>
                <input
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => setTo(e.target.value)}
                  className="bg-transparent text-foreground/85 outline-none border border-border rounded-md px-2 py-1"
                />
              </div>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-white text-xs shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 transition"
              title="打印 / 保存为 PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              导出 PDF
            </button>
          </div>
        </div>

        {/* 打印用标题（仅打印可见） */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">Sylva · 手帐全景</h1>
          <p className="text-xs overview-muted mt-1">
            {from} → {to} · 共 {datesInRange.length} 天
          </p>
        </div>

        {datesInRange.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground/70 text-sm">
            这段时间还没有任何记录 ✨
          </div>
        ) : (
          <div className="space-y-5">
            {datesInRange.map((d) => (
              <DayBlock key={d} date={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DayBlock({ date }: { date: string }) {
  const { items, notes, diary, habits } = useSylva();
  const f = fmtLong(date);

  const dayItems = items
    .filter((i) => i.date === date)
    .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  const dayNotes = notes.filter((n) => (n.createdAt ?? "").slice(0, 10) === date);
  const dayDiary = diary.find((d) => d.date === date);
  const habitsDone = habits.filter((h) => isHabitDoneOn(h, date));
  const logs = dayNotes.filter((n) => (n.kind ?? "log") === "log");
  const refs = dayNotes.filter((n) => n.kind === "reflection");
  const doneCount = dayItems.filter((i) => i.done).length;

  const isEmpty =
    dayItems.length === 0 && logs.length === 0 && refs.length === 0 && habitsDone.length === 0 && !dayDiary?.content;

  return (
    <div className="overview-day-card rounded-2xl border border-border bg-foreground/[0.03] p-6">
      {/* 日期头 */}
      <div className="flex items-end justify-between mb-4 pb-3 border-b border-border/60">
        <div className="flex items-baseline gap-4">
          <h2 className="font-display text-4xl text-foreground leading-none">{f.big}</h2>
          <p className="text-xs overview-muted text-muted-foreground tracking-wider">{f.full}</p>
        </div>
        <div className="flex items-center gap-3 text-xs overview-muted text-muted-foreground">
          {dayDiary?.mood && (
            <span className="text-base" title={MOODS[dayDiary.mood].label}>
              {MOODS[dayDiary.mood].emoji}
            </span>
          )}
          {dayItems.length > 0 && (
            <span>
              {doneCount}/{dayItems.length} 完成
            </span>
          )}
          {habitsDone.length > 0 && (
            <span className="flex items-center gap-1">
              <Flame className="w-3 h-3" /> {habitsDone.length}
            </span>
          )}
        </div>
      </div>

      {isEmpty && (
        <p className="text-xs text-muted-foreground/70 italic">— 这一天留白 —</p>
      )}

      {/* 时间线 */}
      {dayItems.length > 0 && (
        <Section icon={<CalIcon className="w-3 h-3" />} title="时间线">
          <div className="space-y-1.5">
            {dayItems.map((it) => {
              const Icon = it.type === "event" ? CalIcon : it.type === "reminder" ? Bell : Clock;
              return (
                <div key={it.id} className="flex items-baseline gap-2 text-sm">
                  <span className="font-mono text-[11px] overview-accent text-amber-glow/90 w-12 shrink-0">
                    {it.time ?? "—"}
                  </span>
                  <Icon className="w-3 h-3 overview-muted text-muted-foreground/70 shrink-0" />
                  <p
                    className={
                      it.done
                        ? "line-through overview-muted text-muted-foreground/70"
                        : "text-foreground"
                    }
                  >
                    {it.title}
                  </p>
                  {it.tag && (
                    <span className="ml-auto text-[10px] overview-muted text-muted-foreground/70 shrink-0">
                      {it.tag}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* 事件 */}
      {logs.length > 0 && (
        <Section icon={<ListChecks className="w-3 h-3" />} title={`事件 · ${logs.length}`}>
          <div className="space-y-2">
            {logs.map((n) => <NoteLine key={n.id} n={n} />)}
          </div>
        </Section>
      )}

      {/* 感受 & 思考 */}
      {refs.length > 0 && (
        <Section icon={<Sparkles className="w-3 h-3" />} title={`感受 & 思考 · ${refs.length}`}>
          <div className="space-y-2">
            {refs.map((n) => <NoteLine key={n.id} n={n} />)}
          </div>
        </Section>
      )}

      {/* 习惯 */}
      {habitsDone.length > 0 && (
        <Section icon={<Flame className="w-3 h-3" />} title={`习惯打卡 · ${habitsDone.length}`}>
          <div className="flex flex-wrap gap-1.5">
            {habitsDone.map((h) => (
              <span
                key={h.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-moss/15 border border-moss/40 text-moss text-xs"
              >
                <span>{h.emoji}</span>
                <span>{h.name}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* 日记 */}
      {dayDiary?.content && (
        <Section icon={<ChevronDown className="w-3 h-3" />} title="日记">
          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
            {dayDiary.content}
          </p>
        </Section>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-full bg-amber-glow/15 flex items-center justify-center overview-accent text-amber-glow">
          {icon}
        </div>
        <h3 className="text-[10px] tracking-[0.25em] overview-muted text-foreground/75 uppercase">
          {title}
        </h3>
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}

function NoteLine({ n }: { n: ReturnType<typeof useSylva>["notes"][number] }) {
  const t = new Date(n.createdAt);
  const hhmm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  const m = n.mood ? MOODS[n.mood] : undefined;
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="font-mono text-[11px] overview-accent text-amber-glow/90 w-12 shrink-0 mt-0.5">
        {hhmm}
      </span>
      <div className="flex-1 min-w-0">
        {n.text && (
          <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
            {n.text}
          </p>
        )}
        {n.images && n.images.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {n.images.slice(0, 4).map((src, i) => (
              <img key={i} src={src} alt="" className="h-14 rounded-md border border-border" />
            ))}
          </div>
        )}
        {(m || (n.tags && n.tags.length > 0)) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {m && <span className="text-[10px]">{m.emoji}</span>}
            {(n.tags ?? []).map((tg) => (
              <span
                key={tg}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-glow/10 overview-accent text-amber-glow/90"
              >
                #{tg}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
