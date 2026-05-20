import { useEffect, useMemo, useState } from "react";
import { useSylva, type Mood, type Note, habitStreak, habitDaysSinceLast, isHabitDoneOn } from "@/lib/sylva-store";
import { Plus, Trash2, StickyNote, Search, Pin, PinOff, BookHeart, ListChecks, NotebookPen, Sparkles, CheckCircle2, Circle, Flame, AlertTriangle, RotateCcw, Filter, X as XIcon } from "lucide-react";
import { markRecapDone, getDailyRecap } from "@/lib/feishu.functions";
import { EnterHint } from "@/components/EnterHint";
import { shouldSubmitOnKey } from "@/lib/keybinds";

type Tab = "notes" | "diary" | "summary";

const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: "great", emoji: "😄", label: "很棒" },
  { value: "good", emoji: "🙂", label: "不错" },
  { value: "ok", emoji: "😐", label: "一般" },
  { value: "down", emoji: "🙁", label: "低落" },
  { value: "tired", emoji: "😴", label: "疲惫" },
];

const moodOf = (m?: Mood) => MOODS.find((x) => x.value === m);

function readUrlParams() {
  if (typeof window === "undefined") return { tab: null as Tab | null, date: null as string | null };
  const p = new URLSearchParams(window.location.search);
  const t = p.get("tab");
  const d = p.get("date");
  const tab = (t === "notes" || t === "diary" || t === "summary") ? (t as Tab) : null;
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  return { tab, date };
}

export function NotesView() {
  const urlInit = readUrlParams();
  const [tab, setTab] = useState<Tab>(urlInit.tab ?? "notes");
  const initialDate = urlInit.date;

  return (
    <div className="p-7 overflow-auto h-full max-w-3xl mx-auto">
      <p className="text-[10px] tracking-widest text-amber-glow mb-1">每日笔记</p>
      <h2 className="font-display text-3xl text-white mb-5">把脑子里飘过的，先存下来。</h2>

      <div className="flex items-center gap-1 mb-6 p-1 rounded-full bg-white/[0.04] border border-white/8 w-fit">
        <TabBtn active={tab === "notes"} onClick={() => setTab("notes")} icon={<NotebookPen className="w-3.5 h-3.5" />}>随手记</TabBtn>
        <TabBtn active={tab === "diary"} onClick={() => setTab("diary")} icon={<BookHeart className="w-3.5 h-3.5" />}>日记</TabBtn>
        <TabBtn active={tab === "summary"} onClick={() => setTab("summary")} icon={<ListChecks className="w-3.5 h-3.5" />}>今日小结</TabBtn>
      </div>

      {tab === "notes" && <NotesTab />}
      {tab === "diary" && <DiaryTab initialDate={initialDate} />}
      {tab === "summary" && <SummaryTab initialDate={initialDate} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition ${
        active ? "bg-amber-glow text-primary-foreground font-medium" : "text-white/60 hover:text-white"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---------------- Notes ---------------- */
function NotesTab() {
  const { notes, addNote, removeNote, updateNote, enterToSubmit, habits } = useSylva();
  const [text, setText] = useState("");
  const [mood, setMood] = useState<Mood | undefined>();
  const [tagsRaw, setTagsRaw] = useState("");
  const [query, setQuery] = useState("");
  const [diaryOpen, setDiaryOpen] = useState(false);

  // —— 筛选状态 ——
  const [dateFilter, setDateFilter] = useState<string>(""); // YYYY-MM-DD or ''
  const [moodFilter, setMoodFilter] = useState<Mood | "all">("all");
  const [habitFilter, setHabitFilter] = useState<string>("all"); // habit name
  type TypeFilter = "all" | "pinned" | "withMood" | "withTags" | "plain";
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  const submit = () => {
    if (!text.trim()) return;
    const tags = tagsRaw
      .split(/[,，#\s]+/)
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean);
    addNote(text.trim(), { mood, tags: tags.length ? tags : undefined });
    setText("");
    setMood(undefined);
    setTagsRaw("");
  };

  const noteDate = (n: Note) => {
    const d = new Date(n.createdAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const activeFilterCount =
    (dateFilter ? 1 : 0) +
    (moodFilter !== "all" ? 1 : 0) +
    (habitFilter !== "all" ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0);

  const clearFilters = () => {
    setDateFilter("");
    setMoodFilter("all");
    setHabitFilter("all");
    setTypeFilter("all");
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = notes.filter((n) => {
      if (q) {
        const inText = n.text.toLowerCase().includes(q);
        const inTags = (n.tags ?? []).some((t) => t.toLowerCase().includes(q));
        if (!inText && !inTags) return false;
      }
      if (dateFilter && noteDate(n) !== dateFilter) return false;
      if (moodFilter !== "all" && n.mood !== moodFilter) return false;
      if (habitFilter !== "all") {
        const tags = (n.tags ?? []).map((t) => t.toLowerCase());
        if (!tags.includes(habitFilter.toLowerCase())) return false;
      }
      if (typeFilter === "pinned" && !n.pinned) return false;
      if (typeFilter === "withMood" && !n.mood) return false;
      if (typeFilter === "withTags" && !(n.tags && n.tags.length > 0)) return false;
      if (typeFilter === "plain" && (n.mood || (n.tags && n.tags.length > 0))) return false;
      return true;
    });
    return [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  }, [notes, query, dateFilter, moodFilter, habitFilter, typeFilter]);

  return (
    <>
      <div className="widget p-4 mb-4 widget-glow">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (shouldSubmitOnKey(e, enterToSubmit)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder="此刻在想什么？"
          className="w-full bg-transparent outline-none text-sm leading-relaxed text-white/90 placeholder:text-white/30 resize-none"
        />
        <div className="flex justify-end -mt-1 mb-1">
          <EnterHint example={"灵感：把答辩比喻成森林徒步 ↵（Shift+Enter）\n开场用 30 秒抛痛点"} />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <div className="flex items-center gap-1">
            {MOODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMood(mood === m.value ? undefined : m.value)}
                title={m.label}
                className={`w-7 h-7 rounded-full text-base transition ${
                  mood === m.value ? "bg-amber-glow/30 ring-1 ring-amber-glow" : "hover:bg-white/10"
                }`}
              >
                {m.emoji}
              </button>
            ))}
          </div>
          <input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="#标签 用逗号或空格"
            className="flex-1 min-w-[140px] bg-transparent text-xs text-white/80 placeholder:text-white/30 outline-none border-b border-white/10 focus:border-white/30 py-1"
          />
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-[10px] text-white/40 tracking-wider">{text.length} 字</span>
          <button
            onClick={submit}
            disabled={!text.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-glow text-primary-foreground text-xs font-medium disabled:opacity-30"
          >
            <Plus className="w-3 h-3" /> 保存
          </button>
        </div>
      </div>

      <QuickDiaryEditor open={diaryOpen} onToggle={() => setDiaryOpen((v) => !v)} />

      {/* 搜索框 */}
      <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-full bg-white/[0.04] border border-white/8">
        <Search className="w-3.5 h-3.5 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索内容或标签"
          className="flex-1 bg-transparent text-xs text-white/80 placeholder:text-white/30 outline-none"
        />
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition ${
            activeFilterCount > 0 || showFilters
              ? "bg-amber-glow/15 border-amber-glow/40 text-amber-glow"
              : "border-white/10 text-white/50 hover:text-white"
          }`}
          title="筛选"
        >
          <Filter className="w-3 h-3" />
          筛选{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
        </button>
        <span className="text-[10px] text-white/40">{filtered.length} 条</span>
      </div>

      {/* 筛选面板 */}
      {showFilters && (
        <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2.5">
          {/* 日期 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] tracking-widest text-white/40 w-10">日期</span>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-md px-2 py-1 text-[11px] text-white/85 outline-none focus:border-amber-glow/50"
            />
            <button
              onClick={() => setDateFilter(todayStr())}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70"
            >
              今天
            </button>
            {dateFilter && (
              <button
                onClick={() => setDateFilter("")}
                className="text-[10px] px-1.5 py-0.5 rounded-full text-white/40 hover:text-white"
                title="清除日期"
              >
                <XIcon className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* 心情 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] tracking-widest text-white/40 w-10">心情</span>
            <FilterChip active={moodFilter === "all"} onClick={() => setMoodFilter("all")}>全部</FilterChip>
            {MOODS.map((m) => (
              <FilterChip
                key={m.value}
                active={moodFilter === m.value}
                onClick={() => setMoodFilter(moodFilter === m.value ? "all" : m.value)}
                title={m.label}
              >
                {m.emoji} {m.label}
              </FilterChip>
            ))}
          </div>

          {/* 习惯（按标签匹配） */}
          {habits.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] tracking-widest text-white/40 w-10">习惯</span>
              <FilterChip active={habitFilter === "all"} onClick={() => setHabitFilter("all")}>全部</FilterChip>
              {habits.map((h) => (
                <FilterChip
                  key={h.id}
                  active={habitFilter === h.name}
                  onClick={() => setHabitFilter(habitFilter === h.name ? "all" : h.name)}
                  title={`标签包含 #${h.name}`}
                >
                  {h.emoji} {h.name}
                </FilterChip>
              ))}
            </div>
          )}

          {/* 类型 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] tracking-widest text-white/40 w-10">类型</span>
            {([
              ["all", "全部"],
              ["pinned", "置顶"],
              ["withMood", "带心情"],
              ["withTags", "带标签"],
              ["plain", "纯文字"],
            ] as [TypeFilter, string][]).map(([v, label]) => (
              <FilterChip key={v} active={typeFilter === v} onClick={() => setTypeFilter(v)}>
                {label}
              </FilterChip>
            ))}
          </div>

          {activeFilterCount > 0 && (
            <div className="flex justify-end pt-1">
              <button
                onClick={clearFilters}
                className="text-[10px] text-white/50 hover:text-amber-glow flex items-center gap-1"
              >
                <XIcon className="w-3 h-3" /> 清除全部筛选
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-white/40 text-sm">
            {query || activeFilterCount > 0 ? "没有匹配的记录" : "还没有任何记录"}
          </div>
        ) : (
          filtered.map((n) => (
            <NoteCard key={n.id} n={n} onRemove={() => removeNote(n.id)} onPin={() => updateNote(n.id, { pinned: !n.pinned })} />
          ))
        )}
      </div>
    </>
  );
}

function FilterChip({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
        active
          ? "bg-amber-glow/20 border-amber-glow/50 text-amber-glow"
          : "bg-white/[0.03] border-white/10 text-white/65 hover:text-white hover:border-white/25"
      }`}
    >
      {children}
    </button>
  );
}


function NoteCard({ n, onRemove, onPin }: { n: Note; onRemove: () => void; onPin: () => void }) {
  const m = moodOf(n.mood);
  return (
    <div className="group p-4 rounded-2xl bg-white/[0.04] border border-white/8 hover:border-white/15 transition">
      <div className="flex items-start gap-3">
        <StickyNote className="w-4 h-4 text-amber-glow mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap break-words">{n.text}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-[10px] text-white/40 tracking-wider">{fmt(n.createdAt)}</span>
            {m && <span className="text-[10px]" title={m.label}>{m.emoji}</span>}
            {(n.tags ?? []).map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/60">#{t}</span>
            ))}
            {n.pinned && <span className="text-[10px] text-amber-glow">已置顶</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={onPin} className="text-white/40 hover:text-amber-glow p-1" title={n.pinned ? "取消置顶" : "置顶"}>
            {n.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onRemove} className="text-white/30 hover:text-destructive p-1">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Quick Diary Editor (in 随手记) ---------------- */
function QuickDiaryEditor({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { diary, upsertDiary, enterToSubmit } = useSylva();
  const today = todayStr();
  const entry = diary.find((d) => d.date === today);
  const [content, setContent] = useState(entry?.content ?? "");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (open) setContent(diary.find((d) => d.date === today)?.content ?? "");
  }, [open, today, diary]);

  const save = () => {
    upsertDiary(today, { content });
    if (content.trim().length > 0) {
      markRecapDone({ data: { date: today } }).catch(() => {});
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/8 text-xs text-white/70 hover:text-white hover:border-white/15 transition"
        title="编辑今日日记"
      >
        <BookHeart className="w-3.5 h-3.5 text-amber-glow" />
        {open ? "收起今日日记" : "编辑今日日记"}
        {entry?.content?.trim() && !open && (
          <span className="text-[10px] text-white/40">· 已有 {entry.content.length} 字</span>
        )}
      </button>
      {open && (
        <div className="widget p-4 mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] tracking-widest text-amber-glow">{today} · 今日日记</span>
            <span className="text-[10px] text-white/40">{content.length} 字</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (shouldSubmitOnKey(e, enterToSubmit)) {
                e.preventDefault();
                save();
              }
            }}
            rows={6}
            placeholder="今天发生了什么？"
            className="w-full bg-transparent outline-none text-sm leading-7 text-white/90 placeholder:text-white/30 resize-none"
          />
          <div className="flex items-center justify-end gap-3 mt-2">
            <EnterHint example={"今天搞定了答辩 PPT ↵（Shift+Enter）\n明天和导师对齐"} />
            {saved && <span className="text-[10px] text-moss">已保存</span>}
            <button
              onClick={save}
              className="px-4 py-1.5 rounded-full bg-amber-glow text-primary-foreground text-xs font-medium"
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function DiaryTab({ initialDate }: { initialDate?: string | null }) {
  const { diary, upsertDiary, enterToSubmit } = useSylva();
  const today = todayStr();
  const [date, setDate] = useState(initialDate ?? today);
  const entry = diary.find((d) => d.date === date);
  const [content, setContent] = useState(entry?.content ?? "");
  const [mood, setMood] = useState<Mood | undefined>(entry?.mood);

  // sync on date change
  useMemoSync(date, () => {
    const e = diary.find((d) => d.date === date);
    setContent(e?.content ?? "");
    setMood(e?.mood);
    // 拉一下飞书卡片提交过的内容；如果本地为空就回填
    getDailyRecap({ data: { date } })
      .then((row) => {
        if (!row) return;
        const remote = [row.summary, row.diary].filter(Boolean).join("\n\n");
        const local = (diary.find((d) => d.date === date)?.content ?? "").trim();
        const localMood = diary.find((d) => d.date === date)?.mood;
        const remoteMood = (row.mood as Mood | undefined) || undefined;
        const patch: { content?: string; mood?: Mood } = {};
        if (remote && !local) {
          setContent(remote);
          patch.content = remote;
        }
        if (remoteMood && !localMood) {
          setMood(remoteMood);
          patch.mood = remoteMood;
        }
        if (Object.keys(patch).length > 0) upsertDiary(date, patch);
      })
      .catch(() => {});
  });

  const save = () => {
    upsertDiary(date, { content, mood });
    if (content.trim().length > 0) {
      markRecapDone({ data: { date } }).catch(() => {});
    }
  };
  const sorted = [...diary].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <div className="widget p-5 mb-4 widget-glow">
        <div className="flex items-center justify-between mb-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent text-sm text-white/90 outline-none border border-white/10 rounded-md px-2 py-1"
          />
          <div className="flex items-center gap-1">
            {MOODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMood(mood === m.value ? undefined : m.value)}
                title={m.label}
                className={`w-7 h-7 rounded-full text-base transition ${
                  mood === m.value ? "bg-amber-glow/30 ring-1 ring-amber-glow" : "hover:bg-white/10"
                }`}
              >
                {m.emoji}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (shouldSubmitOnKey(e, enterToSubmit)) {
              e.preventDefault();
              save();
            }
          }}
          rows={10}
          placeholder="今天发生了什么？"
          className="w-full bg-transparent outline-none text-sm leading-7 text-white/90 placeholder:text-white/30 resize-none"
        />
        <div className="flex items-center justify-between mt-2 gap-2">
          <span className="text-[10px] text-white/40">失焦自动保存 · {content.length} 字</span>
          <div className="flex items-center gap-3">
            <EnterHint example={"今天搞定了答辩 PPT ↵（Shift+Enter）\n明天要去和导师对齐节奏"} />
            <button onClick={save} className="px-4 py-1.5 rounded-full bg-amber-glow text-primary-foreground text-xs font-medium">保存</button>
          </div>
        </div>
      </div>

      <p className="text-[10px] tracking-widest text-white/40 mb-2">过往</p>
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <div className="text-center py-12 text-white/40 text-sm">还没有日记，从今天开始 ✨</div>
        ) : (
          sorted.map((d) => {
            const m = moodOf(d.mood);
            return (
              <button
                key={d.date}
                onClick={() => setDate(d.date)}
                className={`w-full text-left p-3 rounded-xl bg-white/[0.03] border transition ${
                  d.date === date ? "border-amber-glow/40" : "border-white/8 hover:border-white/15"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-white/70 tracking-wider">{d.date}</span>
                  {m && <span className="text-xs">{m.emoji}</span>}
                </div>
                <p className="text-xs text-white/60 line-clamp-2 whitespace-pre-wrap">{d.content || "（空白）"}</p>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

// Tiny helper: re-run effect when key changes (without importing useEffect everywhere we already did)
// Re-sync local state when key changes
function useMemoSync(key: string, fn: () => void) {
  useEffect(() => { fn(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
}

/* ---------------- Daily Summary ---------------- */
function SummaryTab({ initialDate }: { initialDate?: string | null }) {
  const { items, habits, diary, upsertDiary, isRecapDone, refreshRecapDoneDates, unmarkRecapDone } = useSylva();
  const [date, setDate] = useState(initialDate ?? todayStr());
  useEffect(() => { refreshRecapDoneDates(); }, [refreshRecapDoneDates]);
  const recapDone = isRecapDone(date);

  const dayItems = items.filter((i) => i.date === date);
  const done = dayItems.filter((i) => i.done);
  const pending = dayItems.filter((i) => !i.done);
  const ratio = dayItems.length ? Math.round((done.length / dayItems.length) * 100) : 0;

  // 习惯统计：仅当查看今天才有「漏打」概念，其他日期只展示当天打卡情况
  const isToday = date === todayStr();
  const habitDoneList = habits.filter((h) => isHabitDoneOn(h, date));
  const habitPendingList = habits.filter((h) => !isHabitDoneOn(h, date));
  const missedToday = isToday
    ? habits.filter((h) => !isHabitDoneOn(h, date) && habitStreak(h, date) > 0)
    : [];
  const brokenHabits = isToday
    ? habits.filter((h) => {
        const gap = habitDaysSinceLast(h, date);
        return gap !== Infinity && gap >= 2;
      })
    : [];
  const topStreaks = [...habits]
    .map((h) => ({ h, s: habitStreak(h, date) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);

  const generateRecap = () => {
    const lines: string[] = [];
    lines.push(`📅 ${date} 小结`);
    lines.push(`完成 ${done.length}/${dayItems.length} 项任务（${ratio}%）`);
    if (done.length) lines.push("✅ 已完成：\n  · " + done.map((i) => i.title).join("\n  · "));
    if (pending.length) lines.push("◻️ 未完成：\n  · " + pending.map((i) => i.title).join("\n  · "));
    lines.push(`🔥 习惯打卡 ${habitDoneList.length}/${habits.length}`);
    if (habitDoneList.length) {
      lines.push("  · 已打卡：" + habitDoneList.map((h) => `${h.emoji}${h.name}(${habitStreak(h, date)}d)`).join(" "));
    }
    if (missedToday.length) {
      lines.push("⚠️ 今日漏打：" + missedToday.map((h) => `${h.emoji}${h.name}(连续 ${habitStreak(h, date)}d 待保持)`).join(" "));
    }
    if (brokenHabits.length) {
      lines.push("💤 已中断：" + brokenHabits.map((h) => `${h.emoji}${h.name}(${habitDaysSinceLast(h, date)}d 未打)`).join(" "));
    }
    const existing = diary.find((d) => d.date === date)?.content ?? "";
    const merged = existing ? existing + "\n\n" + lines.join("\n") : lines.join("\n");
    upsertDiary(date, { content: merged });
    markRecapDone({ data: { date } }).catch(() => {});
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent text-sm text-white/90 outline-none border border-white/10 rounded-md px-2 py-1"
          />
          {recapDone && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-moss/15 border border-moss/30 text-[10px] text-moss" title="已通过飞书卡片提交并同步到日历">
              <CheckCircle2 className="w-3 h-3" /> 飞书已提交
              <button
                onClick={async () => {
                  if (!confirm(`撤销 ${date} 的「飞书已提交」标记？\n这会清掉当天回执，同时取消日历与待办里的完成状态。`)) return;
                  try { await unmarkRecapDone(date); } catch (e: any) { alert(e?.message ?? "撤销失败"); }
                }}
                title="撤销已提交标记"
                className="ml-1 -mr-0.5 p-0.5 rounded-full hover:bg-moss/25 text-moss/80 hover:text-moss"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
        <button
          onClick={generateRecap}
          disabled={!dayItems.length && !habits.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-glow text-primary-foreground text-xs font-medium disabled:opacity-30"
        >
          <Sparkles className="w-3 h-3" /> 写入当日日记
        </button>
      </div>

      <div className="widget p-5 mb-4 widget-glow">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-[10px] tracking-widest text-white/40">完成率</p>
            <p className="font-display text-4xl text-white">{ratio}%</p>
          </div>
          <p className="text-xs text-white/60">{done.length} / {dayItems.length} 项</p>
        </div>
        <div className="h-2 rounded-full bg-white/8 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-glow to-amber-glow/70 transition-all"
            style={{ width: `${ratio}%` }}
          />
        </div>
      </div>

      {/* 心情趋势 · 近 7 天 */}
      <MoodTrend date={date} diary={diary} />

      <Section title="已完成" icon={<CheckCircle2 className="w-3.5 h-3.5 text-amber-glow" />} list={done} empty="今天还没有完成的任务" />
      <Section title="未完成" icon={<Circle className="w-3.5 h-3.5 text-white/40" />} list={pending} empty="全部完成，太棒了 🎉" />

      {/* 习惯小结 */}
      <div className="mt-6 mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] tracking-widest text-white/50">
          <Flame className="w-3.5 h-3.5 text-amber-glow" /> 习惯 · {habitDoneList.length}/{habits.length}
        </p>
        {topStreaks.length > 0 && (
          <p className="text-[10px] text-white/40">
            最长连击 {topStreaks.map(({ h, s }) => `${h.emoji}${s}d`).join(" · ")}
          </p>
        )}
      </div>

      {isToday && (missedToday.length > 0 || brokenHabits.length > 0) && (
        <div className="widget p-3 mb-3 border border-amber-glow/30 bg-amber-glow/5">
          <div className="flex items-center gap-1.5 mb-1.5 text-amber-glow text-[11px]">
            <AlertTriangle className="w-3 h-3" />
            <span className="tracking-widest">漏打提醒</span>
          </div>
          {missedToday.length > 0 && (
            <p className="text-xs text-white/85 leading-relaxed">
              今天还没打：{missedToday.map((h) => (
                <span key={h.id} className="ml-1.5 px-1.5 py-0.5 rounded bg-white/10 text-white/90 text-[11px]">
                  {h.emoji} {h.name} · {habitStreak(h, date)}d
                </span>
              ))}
            </p>
          )}
          {brokenHabits.length > 0 && (
            <p className="text-xs text-white/60 mt-1.5">
              已中断：{brokenHabits.map((h) => (
                <span key={h.id} className="ml-1.5 text-[11px]">
                  {h.emoji} {h.name}（{habitDaysSinceLast(h, date)}d 未打）
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {habits.map((h) => {
          const dToday = isHabitDoneOn(h, date);
          const s = habitStreak(h, date);
          return (
            <span
              key={h.id}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                dToday ? "bg-amber-glow/15 border-amber-glow/40 text-white" : "bg-white/[0.03] border-white/8 text-white/50"
              }`}
            >
              {h.emoji} {h.name} · {s}d
            </span>
          );
        })}
      </div>
    </>
  );
}

function Section({ title, icon, list, empty }: { title: string; icon: React.ReactNode; list: { id: string; title: string; time?: string; tag?: string }[]; empty: string }) {
  return (
    <div className="mb-4">
      <p className="flex items-center gap-1.5 text-[10px] tracking-widest text-white/50 mb-2">{icon} {title} · {list.length}</p>
      {list.length === 0 ? (
        <p className="text-xs text-white/40 pl-5">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((i) => (
            <div key={i.id} className="flex items-center gap-2 text-xs text-white/80 p-2.5 rounded-lg bg-white/[0.03] border border-white/8">
              <span className="flex-1 truncate">{i.title}</span>
              {i.time && <span className="text-white/40 tracking-wider">{i.time}</span>}
              {i.tag && <span className="text-[10px] text-amber-glow">#{i.tag}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Mood Trend ---------------- */
const MOOD_SCORE: Record<Mood, number> = { great: 5, good: 4, ok: 3, down: 2, tired: 1 };

function MoodTrend({ date, diary }: { date: string; diary: { date: string; mood?: Mood; content: string }[] }) {
  // 最近 7 天（以 date 为终点，按本地日期倒推）
  const days: string[] = [];
  const [y, m, d] = date.split("-").map(Number);
  const end = new Date(y, m - 1, d);
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(end);
    dt.setDate(end.getDate() - i);
    days.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
  }
  const series = days.map((iso) => {
    const e = diary.find((x) => x.date === iso);
    return { iso, mood: e?.mood as Mood | undefined };
  });
  const filled = series.filter((s) => s.mood);
  const avg = filled.length
    ? filled.reduce((a, s) => a + MOOD_SCORE[s.mood!], 0) / filled.length
    : 0;
  const counts: Record<Mood, number> = { great: 0, good: 0, ok: 0, down: 0, tired: 0 };
  for (const s of filled) counts[s.mood!] += 1;

  return (
    <div className="widget p-5 mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] tracking-widest text-white/40">心情 · 近 7 天</p>
        <p className="text-[11px] text-white/60">
          {filled.length > 0 ? `${filled.length}/7 天有记录 · 平均 ${avg.toFixed(1)}` : "暂无心情记录"}
        </p>
      </div>

      {/* 7 天迷你条 */}
      <div className="flex items-end gap-1.5 h-16">
        {series.map((s) => {
          const score = s.mood ? MOOD_SCORE[s.mood] : 0;
          const h = score ? `${(score / 5) * 100}%` : "6%";
          const opacity = s.mood ? 1 : 0.25;
          const m = moodOf(s.mood);
          const dd = Number(s.iso.slice(-2));
          return (
            <div key={s.iso} className="flex-1 flex flex-col items-center gap-1" title={`${s.iso} ${m?.label ?? "无记录"}`}>
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-amber-glow/80 to-amber-glow/40"
                  style={{ height: h, opacity }}
                />
              </div>
              <span className="text-[9px] text-white/50">{m?.emoji ?? "·"}</span>
              <span className="text-[9px] text-white/30 font-mono">{dd}</span>
            </div>
          );
        })}
      </div>

      {/* 分布 chips */}
      {filled.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {MOODS.map((m) => {
            const c = counts[m.value];
            if (!c) return null;
            return (
              <span
                key={m.value}
                className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-white/75"
              >
                {m.emoji} {m.label} × {c}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}


/* ---------------- utils ---------------- */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
