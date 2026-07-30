import { useMemo, useState } from "react";
import {
  Megaphone, Lightbulb, KanbanSquare, CalendarRange, Plus, Trash2, Star,
  CalendarPlus, ChevronRight, ExternalLink, Check, ArrowRight,
} from "lucide-react";
import {
  useContentIdeas, useContentPieces, CONTENT_STAGES, CONTENT_PLATFORMS,
  todayStr, shiftDate,
  type ContentStage, type ContentPiece,
} from "@/lib/content-studio";
import { useSylva } from "@/lib/sylva-store";

type Tab = "ideas" | "board" | "calendar";

const TABS: { key: Tab; label: string; icon: typeof Lightbulb; desc: string }[] = [
  { key: "ideas", label: "选题库", icon: Lightbulb, desc: "灵感入库、打分、挑出要做的" },
  { key: "board", label: "内容阶段", icon: KanbanSquare, desc: "从选题到发布的流水线，每阶段可排进日历" },
  { key: "calendar", label: "发布排期", icon: CalendarRange, desc: "按发布日期看未来两周的内容" },
];

export function ContentView() {
  const [tab, setTab] = useState<Tab>("ideas");

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-4 flex items-center gap-2">
        <Megaphone className="w-5 h-5 text-amber-glow" />
        <h2 className="font-display text-2xl text-foreground">自媒体</h2>
        <span className="text-xs text-muted-foreground/70 ml-2">选题 → 脚本 → 制作 → 发布，一条线管到底</span>
      </div>

      <div className="flex gap-1.5 mb-5 border-b border-border/70 pb-2 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition border ${
                active
                  ? "bg-amber-glow/15 border-amber-glow/50 text-amber-glow"
                  : "border-transparent text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
        <span className="ml-2 self-center text-[11px] text-muted-foreground/60 hidden sm:block">
          {TABS.find((t) => t.key === tab)?.desc}
        </span>
      </div>

      {tab === "ideas" && <IdeasTab />}
      {tab === "board" && <BoardTab />}
      {tab === "calendar" && <ScheduleTab />}
    </div>
  );
}

/* ---------------- 选题库 ---------------- */

function IdeasTab() {
  const { items, add, update, remove } = useContentIdeas();
  const { add: addPiece } = useContentPieces();
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<string>("通用");
  const [angle, setAngle] = useState("");
  const [filter, setFilter] = useState<"inbox" | "picked" | "archived" | "all">("inbox");

  const list = items.filter((i) => filter === "all" || i.status === filter);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    await add({ title: t, platform, angle: angle.trim() || undefined });
    setTitle(""); setAngle("");
  };

  return (
    <div className="space-y-4">
      <div className="widget p-4 space-y-2.5">
        <div className="text-xs tracking-wider text-amber-glow flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5" /> 记一个选题
        </div>
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
            placeholder="选题标题，例如：一个人做产品的 5 个反直觉习惯"
            className="flex-1 bg-background/40 border border-foreground/15 rounded-md px-3 py-2 text-[12px] text-foreground placeholder:text-foreground/30 focus:border-amber-glow/60 focus:outline-none"
          />
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="bg-background/40 border border-foreground/15 rounded-md px-2 py-2 text-[12px] text-foreground focus:outline-none"
          >
            {CONTENT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            onClick={() => void submit()}
            disabled={!title.trim()}
            className="flex items-center gap-1 px-4 py-2 rounded-md text-xs bg-amber-glow text-background disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> 入库
          </button>
        </div>
        <input
          value={angle}
          onChange={(e) => setAngle(e.target.value)}
          placeholder="切入角度 / 钩子（可选）"
          className="w-full bg-background/40 border border-foreground/15 rounded-md px-3 py-1.5 text-[11.5px] text-foreground placeholder:text-foreground/30 focus:border-amber-glow/60 focus:outline-none"
        />
      </div>

      <div className="flex gap-1.5 text-[11px]">
        {(["inbox", "picked", "archived", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-full border transition ${
              filter === f ? "border-amber-glow/50 text-amber-glow bg-amber-glow/10" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "inbox" ? "待挑选" : f === "picked" ? "已选用" : f === "archived" ? "已归档" : "全部"}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {list.map((idea) => (
          <div key={idea.id} className="widget p-3.5 group">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground leading-snug">{idea.title}</div>
                {idea.angle && <div className="text-[11px] text-muted-foreground mt-1">{idea.angle}</div>}
                <div className="flex items-center gap-2 mt-2 text-[10.5px] text-muted-foreground/70">
                  <span className="px-1.5 py-0.5 rounded bg-foreground/[0.07]">{idea.platform}</span>
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => void update(idea.id, { score: n })}>
                        <Star className={`w-3 h-3 ${n <= idea.score ? "text-amber-glow fill-amber-glow" : "text-foreground/25"}`} />
                      </button>
                    ))}
                  </span>
                </div>
              </div>
              <button onClick={() => void remove(idea.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex gap-1.5 mt-3">
              {idea.status !== "picked" && (
                <button
                  onClick={async () => {
                    await addPiece({ title: idea.title, platform: idea.platform, ideaId: idea.id, notes: idea.angle });
                    await update(idea.id, { status: "picked" });
                  }}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-amber-glow/15 border border-amber-glow/40 text-amber-glow hover:bg-amber-glow/25"
                >
                  <ArrowRight className="w-3 h-3" /> 开做（进流水线）
                </button>
              )}
              {idea.status === "picked" && (
                <span className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-foreground/[0.07] text-muted-foreground">
                  <Check className="w-3 h-3" /> 已进流水线
                </span>
              )}
              {idea.status !== "archived" && (
                <button
                  onClick={() => void update(idea.id, { status: "archived" })}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground"
                >
                  归档
                </button>
              )}
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="text-xs text-muted-foreground/60 py-8">这里还没有选题，先随手记一条。</div>
        )}
      </div>
    </div>
  );
}

/* ---------------- 阶段看板 ---------------- */

function BoardTab() {
  const { items, add, update, remove } = useContentPieces();
  const [title, setTitle] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    await add({ title: t });
    setTitle("");
  };

  const open = items.find((p) => p.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
          placeholder="直接新建一个内容（标题）"
          className="flex-1 bg-background/40 border border-foreground/15 rounded-md px-3 py-2 text-[12px] text-foreground placeholder:text-foreground/30 focus:border-amber-glow/60 focus:outline-none"
        />
        <button onClick={() => void submit()} disabled={!title.trim()} className="flex items-center gap-1 px-4 py-2 rounded-md text-xs bg-amber-glow text-background disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" /> 新建
        </button>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        {CONTENT_STAGES.map((stage) => {
          const list = items.filter((p) => p.stage === stage.key);
          return (
            <div key={stage.key} className="widget p-3 min-h-[180px]">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-sm">{stage.emoji}</span>
                <span className="text-xs text-foreground">{stage.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/60">{list.length}</span>
              </div>
              <div className="text-[10px] text-muted-foreground/50 mb-2">{stage.hint}</div>
              <div className="space-y-2">
                {list.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setOpenId(p.id)}
                    className="w-full text-left p-2 rounded-lg bg-foreground/[0.05] border border-border/60 hover:border-amber-glow/40 transition"
                  >
                    <div className="text-[12px] text-foreground leading-snug line-clamp-2">{p.title}</div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/70">
                      <span>{p.platform}</span>
                      {p.publishDate && <span>· {p.publishDate}</span>}
                      {p.stageSchedule[stage.key] && <CalendarPlus className="w-2.5 h-2.5 text-amber-glow" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <PieceDetail
          piece={open}
          onClose={() => setOpenId(null)}
          onUpdate={(patch) => void update(open.id, patch)}
          onDelete={() => { void remove(open.id); setOpenId(null); }}
        />
      )}
    </div>
  );
}

function PieceDetail({
  piece, onClose, onUpdate, onDelete,
}: {
  piece: ContentPiece;
  onClose: () => void;
  onUpdate: (patch: Partial<ContentPiece>) => void;
  onDelete: () => void;
}) {
  const { addItems, items: planItems } = useSylva();
  const [date, setDate] = useState(todayStr());

  const linkStage = (stage: ContentStage, when: string) => {
    const meta = CONTENT_STAGES.find((s) => s.key === stage)!;
    const [id] = addItems([
      {
        type: "todo",
        title: `【${piece.platform}】${meta.label}：${piece.title}`,
        date: when,
        tag: "自媒体",
        note: piece.notes ?? undefined,
      } as any,
    ]);
    onUpdate({ stageSchedule: { ...piece.stageSchedule, [stage]: id } });
  };

  const autoPlan = () => {
    const next = { ...piece.stageSchedule };
    CONTENT_STAGES.slice(0, 5).forEach((s, idx) => {
      if (next[s.key]) return;
      const when = shiftDate(date, idx);
      const [id] = addItems([
        {
          type: "todo",
          title: `【${piece.platform}】${s.label}：${piece.title}`,
          date: when,
          tag: "自媒体",
        } as any,
      ]);
      next[s.key] = id;
    });
    onUpdate({ stageSchedule: next, publishDate: piece.publishDate ?? shiftDate(date, 4) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div className="widget w-full max-w-2xl max-h-[80vh] overflow-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <input
            value={piece.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="flex-1 bg-transparent text-lg text-foreground font-display focus:outline-none border-b border-transparent focus:border-amber-glow/40"
          />
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
        </div>

        <div className="grid sm:grid-cols-3 gap-2 text-[11.5px]">
          <label className="space-y-1">
            <div className="text-muted-foreground/70">平台</div>
            <select
              value={piece.platform}
              onChange={(e) => onUpdate({ platform: e.target.value })}
              className="w-full bg-background/40 border border-foreground/15 rounded-md px-2 py-1.5 text-foreground focus:outline-none"
            >
              {CONTENT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <div className="text-muted-foreground/70">当前阶段</div>
            <select
              value={piece.stage}
              onChange={(e) => onUpdate({ stage: e.target.value as ContentStage })}
              className="w-full bg-background/40 border border-foreground/15 rounded-md px-2 py-1.5 text-foreground focus:outline-none"
            >
              {CONTENT_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <div className="text-muted-foreground/70">计划发布日</div>
            <input
              type="date"
              value={piece.publishDate ?? ""}
              onChange={(e) => onUpdate({ publishDate: e.target.value })}
              className="w-full bg-background/40 border border-foreground/15 rounded-md px-2 py-1.5 text-foreground focus:outline-none"
            />
          </label>
        </div>

        <textarea
          value={piece.notes ?? ""}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          placeholder="脚本要点 / 备注"
          rows={3}
          className="w-full bg-background/40 border border-foreground/15 rounded-md px-3 py-2 text-[12px] text-foreground placeholder:text-foreground/30 focus:outline-none"
        />

        <input
          value={piece.link ?? ""}
          onChange={(e) => onUpdate({ link: e.target.value })}
          placeholder="成品链接（发布后填）"
          className="w-full bg-background/40 border border-foreground/15 rounded-md px-3 py-1.5 text-[11.5px] text-foreground placeholder:text-foreground/30 focus:outline-none"
        />

        <div className="border-t border-border/70 pt-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-amber-glow">
            <CalendarPlus className="w-3.5 h-3.5" /> 阶段关联日历
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="ml-auto bg-background/40 border border-foreground/15 rounded px-2 py-1 text-[11px] text-foreground focus:outline-none"
            />
            <button onClick={autoPlan} className="px-2.5 py-1 rounded-full bg-amber-glow text-background text-[11px]">
              一键排 5 天
            </button>
          </div>
          <div className="space-y-1.5">
            {CONTENT_STAGES.map((s) => {
              const linkedId = piece.stageSchedule[s.key];
              const linked = linkedId ? planItems.find((i) => i.id === linkedId) : undefined;
              return (
                <div key={s.key} className="flex items-center gap-2 text-[11.5px] px-2 py-1.5 rounded-lg bg-foreground/[0.04]">
                  <span>{s.emoji}</span>
                  <span className="text-foreground">{s.label}</span>
                  {linked ? (
                    <span className={`ml-auto flex items-center gap-1 ${linked.done ? "text-emerald-400" : "text-muted-foreground"}`}>
                      {linked.done && <Check className="w-3 h-3" />}
                      {linked.date}
                    </span>
                  ) : (
                    <button
                      onClick={() => linkStage(s.key, date)}
                      className="ml-auto flex items-center gap-1 text-amber-glow hover:underline"
                    >
                      排进日历 <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 发布排期 ---------------- */

function ScheduleTab() {
  const { items } = useContentPieces();
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => shiftDate(todayStr(), i)), []);

  return (
    <div className="space-y-2">
      {days.map((d) => {
        const list = items.filter((p) => p.publishDate === d);
        return (
          <div key={d} className="widget p-3 flex gap-3 items-start">
            <div className="w-24 shrink-0 text-[11px] text-muted-foreground">
              {d}
              <div className="text-[10px] text-muted-foreground/50">
                {new Date(`${d}T00:00:00`).toLocaleDateString("zh-CN", { weekday: "short" })}
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              {list.length === 0 && <div className="text-[11px] text-muted-foreground/40">—</div>}
              {list.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-[12px] text-foreground">
                  <span className="px-1.5 py-0.5 rounded bg-amber-glow/15 text-amber-glow text-[10px]">{p.platform}</span>
                  <span className="flex-1 truncate">{p.title}</span>
                  <span className="text-[10px] text-muted-foreground/70">
                    {CONTENT_STAGES.find((s) => s.key === p.stage)?.label}
                  </span>
                  {p.link && (
                    <a href={p.link} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-amber-glow">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
