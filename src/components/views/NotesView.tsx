import { useEffect, useMemo, useRef, useState } from "react";
import { NotesCanvas } from "@/components/NotesCanvas";
import { LayoutGrid, Brush } from "lucide-react";
import { useSylva, type Mood, type Note, type NoteKind } from "@/lib/sylva-store";
import { Plus, Trash2, StickyNote, Search, Pin, PinOff, BookHeart, NotebookPen, Filter, X as XIcon, Sparkles, ListChecks } from "lucide-react";
import { markRecapDone, getDailyRecap } from "@/lib/feishu.functions";
import { EnterHint } from "@/components/EnterHint";
import { shouldSubmitOnKey } from "@/lib/keybinds";
import { ImageAttacher, extractImagesFromEvent, fileToCompressedDataURL } from "@/components/ImageAttacher";
import { MediaAttacher } from "@/components/MediaAttacher";
import { JournalView } from "@/components/views/JournalView";

type Tab = "log" | "reflection" | "handbook";

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
  // 兼容历史链接：notes→log，diary→reflection，summary/journal→handbook
  const tab: Tab | null =
    t === "log" || t === "notes" ? "log"
    : t === "reflection" || t === "diary" || t === "summary" ? "reflection"
    : t === "handbook" || t === "journal" ? "handbook"
    : null;
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  return { tab, date };
}

export function NotesView() {
  const urlInit = readUrlParams();
  const [tab, setTab] = useState<Tab>(urlInit.tab ?? "log");
  const [mode, setMode] = useState<"list" | "canvas">(() => {
    if (typeof window === "undefined") return "list";
    return (window.localStorage.getItem("notes:mode") as "list" | "canvas") ?? "list";
  });
  useEffect(() => { try { window.localStorage.setItem("notes:mode", mode); } catch {} }, [mode]);
  const initialDate = urlInit.date;

  if (mode === "canvas") {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-7 pt-5 pb-3">
          <div>
            <p className="text-[10px] tracking-widest text-amber-glow mb-1">每日笔记</p>
            <h2 className="font-display text-2xl text-white">画布视图 · 拖动卡片</h2>
          </div>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        <div className="flex-1 mx-7 mb-5 rounded-2xl overflow-hidden border border-white/10">
          <NotesCanvas />
        </div>
      </div>
    );
  }

  // 手帐 Tab 复用 JournalView，使用全屏布局，不套用列表容器
  if (tab === "handbook") {
    return (
      <div className="h-full flex flex-col">
        <div className="px-7 pt-5 pb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] tracking-widest text-amber-glow mb-1">每日记录</p>
            <h2 className="font-display text-2xl text-white">手帐 · 按天回顾</h2>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/8">
            <TabBtn active={false} onClick={() => setTab("log")} icon={<ListChecks className="w-3.5 h-3.5" />}>事件</TabBtn>
            <TabBtn active={false} onClick={() => setTab("reflection")} icon={<Sparkles className="w-3.5 h-3.5" />}>感受 &amp; 思考</TabBtn>
            <TabBtn active={true} onClick={() => setTab("handbook")} icon={<BookHeart className="w-3.5 h-3.5" />}>手帐</TabBtn>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <JournalView />
        </div>
      </div>
    );
  }

  return (
    <div className="p-7 overflow-auto h-full max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-1 gap-3">
        <div>
          <p className="text-[10px] tracking-widest text-amber-glow mb-1">每日记录</p>
          <h2 className="font-display text-3xl text-white mb-5">
            {tab === "log" ? "把发生的事，先存下来。" : "把感受和想法，写出来。"}
          </h2>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      <div className="flex items-center gap-1 mb-6 p-1 rounded-full bg-white/[0.04] border border-white/8 w-fit">
        <TabBtn active={tab === "log"} onClick={() => setTab("log")} icon={<ListChecks className="w-3.5 h-3.5" />}>事件</TabBtn>
        <TabBtn active={tab === "reflection"} onClick={() => setTab("reflection")} icon={<Sparkles className="w-3.5 h-3.5" />}>感受 &amp; 思考</TabBtn>
        <TabBtn active={false} onClick={() => setTab("handbook")} icon={<BookHeart className="w-3.5 h-3.5" />}>手帐</TabBtn>
      </div>

      <NotesTab kind={tab} />
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
function NotesTab({ kind }: { kind: NoteKind }) {
  const { notes, addNote, removeNote, updateNote, enterToSubmit, habits } = useSylva();
  const [text, setText] = useState("");
  const [mood, setMood] = useState<Mood | undefined>();
  const [tagsRaw, setTagsRaw] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [audios, setAudios] = useState<string[]>([]);
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
    if (!text.trim() && images.length === 0 && videos.length === 0 && audios.length === 0) return;
    const tags = tagsRaw
      .split(/[,，#\s]+/)
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean);
    addNote(text.trim(), {
      kind,
      mood,
      tags: tags.length ? tags : undefined,
      images: images.length ? images : undefined,
      videos: videos.length ? videos : undefined,
      audios: audios.length ? audios : undefined,
    });
    setText("");
    setMood(undefined);
    setTagsRaw("");
    setImages([]);
    setVideos([]);
    setAudios([]);
  };

  const onPasteOrDrop = async (e: React.ClipboardEvent | React.DragEvent) => {
    const files = extractImagesFromEvent(e);
    if (files.length === 0) return;
    e.preventDefault();
    const urls = await Promise.all(files.map((f) => fileToCompressedDataURL(f)));
    setImages((prev) => [...prev, ...urls].slice(0, 6));
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
      const nKind: NoteKind = n.kind === "reflection" ? "reflection" : "log";
      if (nKind !== kind) return false;
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
  }, [notes, query, dateFilter, moodFilter, habitFilter, typeFilter, kind]);

  return (
    <>
      <div
        className="widget p-4 mb-4 widget-glow"
        onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); }}
        onDrop={onPasteOrDrop}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPasteOrDrop}
          onKeyDown={(e) => {
            if (shouldSubmitOnKey(e, enterToSubmit)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder={kind === "reflection"
            ? "此刻在想什么？写下感受、复盘、灵感…"
            : "刚发生了什么？开会 / 健身 / 见了谁…粘贴或拖入图片即可附加"}
          className="w-full bg-transparent outline-none text-sm leading-relaxed text-white/90 placeholder:text-white/30 resize-none"
        />
        <div className="flex justify-end -mt-1 mb-1">
          <EnterHint example={kind === "reflection"
            ? "今天答辩前莫名紧张 ↵（Shift+Enter）\n其实是怕被问到那个含糊的点"
            : "和导师碰了答辩节奏 ↵（Shift+Enter）\n#答辩"} />
        </div>
        <div className="mt-2">
          <MediaAttacher
            videos={videos}
            audios={audios}
            images={images}
            onChange={(next) => {
              setVideos(next.videos);
              setAudios(next.audios);
              if (next.images) setImages(next.images);
            }}
          />
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
          <span className="text-[10px] text-white/40 tracking-wider">
            {text.length} 字
            {images.length > 0 ? ` · ${images.length} 图` : ""}
            {videos.length > 0 ? ` · ${videos.length} 视频` : ""}
            {audios.length > 0 ? ` · ${audios.length} 语音` : ""}
          </span>
          <button
            onClick={submit}
            disabled={!text.trim() && images.length === 0 && videos.length === 0 && audios.length === 0}
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
          {n.text && (
            <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap break-words">{n.text}</p>
          )}
          {n.images && n.images.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {n.images.map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noreferrer" className="block">
                  <img src={src} alt="" className="max-h-40 rounded-lg border border-white/10 hover:border-amber-glow/40 transition" />
                </a>
              ))}
            </div>
          )}
          {n.videos && n.videos.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {n.videos.map((src, i) => (
                <video
                  key={i}
                  src={src}
                  controls
                  preload="metadata"
                  className="max-h-48 rounded-lg border border-white/10 bg-black"
                />
              ))}
            </div>
          )}
          {n.audios && n.audios.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-2">
              {n.audios.map((src, i) => (
                <audio key={i} src={src} controls className="h-8 max-w-full" />
              ))}
            </div>
          )}
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

/* ---------------- Quick Diary Editor (in 记录) ---------------- */
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
        title="编辑今日手帐"
      >
        <BookHeart className="w-3.5 h-3.5 text-amber-glow" />
        {open ? "收起今日手帐" : "编辑今日手帐"}
        {entry?.content?.trim() && !open && (
          <span className="text-[10px] text-white/40">· 已有 {entry.content.length} 字</span>
        )}
      </button>
      {open && (
        <div className="widget p-4 mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] tracking-widest text-amber-glow">{today} · 今日手帐</span>
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
  const editorRef = useRef<HTMLDivElement>(null);

  const setEditorHtml = (html: string) => {
    if (editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
  };

  // sync on date change
  useMemoSync(date, () => {
    const e = diary.find((d) => d.date === date);
    const c = e?.content ?? "";
    setContent(c);
    setEditorHtml(c);
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
          setEditorHtml(remote);
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

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((it) => it.type.startsWith("image/"));
    if (!imageItem) return; // 让默认粘贴文字
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img = `<img src="${dataUrl}" alt="" style="max-width:100%;border-radius:10px;margin:8px 0;display:block" />`;
    // 在光标位置插入
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const tpl = document.createElement("template");
      tpl.innerHTML = img;
      const node = tpl.content.firstChild!;
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
      sel.removeAllRanges();
      sel.addRange(range);
    } else if (editorRef.current) {
      editorRef.current.insertAdjacentHTML("beforeend", img);
    }
    if (editorRef.current) setContent(editorRef.current.innerHTML);
  };

  const textLength = useMemo(() => content.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").length, [content]);
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
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => setContent((e.target as HTMLDivElement).innerHTML)}
          onBlur={save}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (shouldSubmitOnKey(e as unknown as React.KeyboardEvent<HTMLTextAreaElement>, enterToSubmit)) {
              e.preventDefault();
              save();
            }
          }}

          data-placeholder="今天发生了什么？粘贴图片即可插入"
          className="diary-editor min-h-[240px] w-full bg-transparent outline-none text-sm leading-7 text-white/90 whitespace-pre-wrap break-words"
        />
        <div className="flex items-center justify-between mt-2 gap-2">
          <span className="text-[10px] text-white/40">失焦自动保存 · 支持粘贴图片 · {textLength} 字</span>
          <div className="flex items-center gap-3">
            <EnterHint example={"今天搞定了答辩 PPT ↵（Shift+Enter）\n明天要去和导师对齐节奏"} />
            <button onClick={save} className="px-4 py-1.5 rounded-full bg-amber-glow text-primary-foreground text-xs font-medium">保存</button>
          </div>
        </div>

      </div>

      <p className="text-[10px] tracking-widest text-white/40 mb-2">过往</p>
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <div className="text-center py-12 text-white/40 text-sm">还没有记录，从今天开始 ✨</div>
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
                <div className="text-xs text-white/60 line-clamp-2 whitespace-pre-wrap [&_img]:hidden" dangerouslySetInnerHTML={{ __html: d.content || "（空白）" }} />
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



/* ---------------- utils ---------------- */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function ModeToggle({ mode, onChange }: { mode: "list" | "canvas"; onChange: (m: "list" | "canvas") => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/10 shrink-0">
      <button
        onClick={() => onChange("list")}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${mode === "list" ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
      >
        <LayoutGrid className="w-3 h-3" /> 列表
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
