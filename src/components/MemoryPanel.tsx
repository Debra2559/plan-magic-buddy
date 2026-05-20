import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Pin, PinOff, Archive, RotateCcw, Trash2, Check, X, Plus, Sparkles, Loader2, Brain } from "lucide-react";
import { toast } from "sonner";
import {
  listMemories, upsertMemory, setMemoryStatus, setMemoryPinned,
  deleteMemory, extractMemoryCandidates,
  MEMORY_KINDS, type Memory, type MemoryKind, type MemoryStatus, labelOfKind,
} from "@/lib/memories.functions";

type Tab = MemoryStatus;
const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "待审核" },
  { key: "active", label: "已生效" },
  { key: "archived", label: "已归档" },
];

export function MemoryPanel() {
  const list = useServerFn(listMemories);
  const upsert = useServerFn(upsertMemory);
  const setStatus = useServerFn(setMemoryStatus);
  const setPinned = useServerFn(setMemoryPinned);
  const remove = useServerFn(deleteMemory);
  const extract = useServerFn(extractMemoryCandidates);

  const [tab, setTab] = useState<Tab>("active");
  const [rows, setRows] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<{ content: string; kind: MemoryKind }>({ content: "", kind: "fact" });

  const counts = { pending: 0, active: 0, archived: 0 };

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await list({ data: { status: tab } });
      setRows(r.memories);
    } catch (e: any) {
      toast.error(`加载失败: ${e?.message ?? "未知错误"}`);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [tab]);

  const handleAdd = async () => {
    if (!draft.content.trim()) return;
    try {
      await upsert({ data: { content: draft.content.trim(), kind: draft.kind, status: "active" } });
      setDraft({ content: "", kind: "fact" });
      setAddOpen(false);
      toast.success("已添加");
      if (tab === "active") refresh();
    } catch (e: any) { toast.error(e?.message ?? "保存失败"); }
  };

  const handleStatus = async (id: string, status: MemoryStatus, msg: string) => {
    try { await setStatus({ data: { id, status } }); toast.success(msg); refresh(); }
    catch (e: any) { toast.error(e?.message ?? "操作失败"); }
  };
  const handlePin = async (m: Memory) => {
    try { await setPinned({ data: { id: m.id, pinned: !m.pinned } }); refresh(); }
    catch (e: any) { toast.error(e?.message ?? "失败"); }
  };
  const handleDelete = async (id: string) => {
    if (!confirm("永久删除这条记忆？")) return;
    try { await remove({ data: { id } }); toast.success("已删除"); refresh(); }
    catch (e: any) { toast.error(e?.message ?? "删除失败"); }
  };
  const handleExtract = async () => {
    setExtracting(true);
    try {
      const r = await extract({ data: { lookbackDays: 7 } });
      if (!r.ok) toast.error(r.error);
      else toast.success(r.inserted > 0 ? `提取到 ${r.inserted} 条候选记忆` : (r.message ?? "暂无新候选"));
      if (r.ok && r.inserted > 0) setTab("pending"); else refresh();
    } catch (e: any) { toast.error(e?.message ?? "提取失败"); }
    finally { setExtracting(false); }
  };

  return (
    <div className="space-y-4">
      {/* 顶部说明 + 操作 */}
      <div className="widget p-4 flex flex-wrap items-start gap-3">
        <Brain className="w-4 h-4 text-amber-glow mt-0.5 shrink-0" />
        <div className="flex-1 min-w-[220px]">
          <div className="text-sm text-foreground font-medium">AI 长期记忆</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            「已生效」的记忆会自动注入到 AI 规划、行为洞察和飞书机器人的提示词中。
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExtract}
            disabled={extracting}
            className="text-xs px-3 py-1.5 rounded-full bg-foreground/10 border border-border text-foreground hover:bg-foreground/15 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-amber-glow" />}
            从最近内容提取
          </button>
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-full bg-amber-glow/25 border border-amber-glow/60 text-foreground font-medium hover:bg-amber-glow/35 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> 手动新增
          </button>
        </div>
      </div>

      {/* 手动新增表单 */}
      {addOpen && (
        <div className="widget p-3 space-y-2">
          <textarea
            value={draft.content}
            onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
            placeholder="例如：我喜欢喝燕麦拿铁、不加糖。"
            rows={2}
            className="w-full bg-foreground/5 border border-border rounded-md px-2.5 py-2 text-sm text-foreground outline-none focus:border-amber-glow/60 resize-none"
          />
          <div className="flex items-center gap-2">
            <select
              value={draft.kind}
              onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as MemoryKind }))}
              className="text-xs bg-foreground/5 border border-border rounded-md px-2 py-1 text-foreground"
            >
              {MEMORY_KINDS.map((k) => <option key={k} value={k}>{labelOfKind(k)}</option>)}
            </select>
            <div className="flex-1" />
            <button onClick={() => setAddOpen(false)} className="text-xs px-3 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground">取消</button>
            <button onClick={handleAdd} className="text-xs px-3 py-1 rounded-full bg-amber-glow/25 border border-amber-glow/60 text-foreground font-medium">保存</button>
          </div>
        </div>
      )}

      {/* 标签页 */}
      <div className="flex items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              tab === t.key
                ? "bg-amber-glow/25 border-amber-glow/60 text-foreground font-medium"
                : "bg-foreground/5 border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="widget overflow-hidden divide-y divide-border/70">
        {loading ? (
          <div className="px-4 py-6 text-xs text-muted-foreground text-center">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            {tab === "pending" && "暂无待审核候选 · 点击「从最近内容提取」让 AI 帮你整理"}
            {tab === "active" && "还没有生效的记忆 · 手动新增或从最近内容提取"}
            {tab === "archived" && "归档区是空的"}
          </div>
        ) : rows.map((m) => (
          <div key={m.id} className="px-4 py-3 flex items-start gap-3">
            <span className={`text-[10px] mt-1 px-1.5 py-0.5 rounded shrink-0 ${
              m.kind === "goal" ? "bg-amber-glow/20 text-foreground" :
              m.kind === "preference" ? "bg-sky-400/15 text-sky-700 dark:text-sky-200" :
              m.kind === "relation" ? "bg-rose-400/15 text-rose-700 dark:text-rose-200" :
              m.kind === "routine" ? "bg-emerald-400/15 text-emerald-700 dark:text-emerald-200" :
              "bg-foreground/10 text-foreground/75"
            }`}>{labelOfKind(m.kind)}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-foreground flex items-center gap-1.5">
                {m.pinned && <Pin className="w-3 h-3 text-amber-glow" />}
                <span className="break-words">{m.content}</span>
              </div>
              <div className="text-[10px] text-muted-foreground/80 mt-1 flex items-center gap-2">
                <span>来源：{m.source === "manual" ? "手动" : m.source === "ai" ? "AI 提取" : m.source}</span>
                <span>·</span>
                <span>重要度 {m.importance}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {tab === "pending" && (
                <>
                  <button onClick={() => handleStatus(m.id, "active", "已通过")} title="通过" className="p-1.5 rounded-md hover:bg-foreground/10 text-emerald-600 dark:text-emerald-300"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleStatus(m.id, "archived", "已归档")} title="拒绝" className="p-1.5 rounded-md hover:bg-foreground/10 text-rose-600 dark:text-rose-300"><X className="w-3.5 h-3.5" /></button>
                </>
              )}
              {tab === "active" && (
                <>
                  <button onClick={() => handlePin(m)} title={m.pinned ? "取消置顶" : "置顶"} className="p-1.5 rounded-md hover:bg-foreground/10 text-foreground/70">
                    {m.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => handleStatus(m.id, "archived", "已归档")} title="归档" className="p-1.5 rounded-md hover:bg-foreground/10 text-foreground/70"><Archive className="w-3.5 h-3.5" /></button>
                </>
              )}
              {tab === "archived" && (
                <button onClick={() => handleStatus(m.id, "active", "已恢复")} title="恢复" className="p-1.5 rounded-md hover:bg-foreground/10 text-foreground/70"><RotateCcw className="w-3.5 h-3.5" /></button>
              )}
              <button onClick={() => handleDelete(m.id)} title="删除" className="p-1.5 rounded-md hover:bg-foreground/10 text-rose-500/80"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
