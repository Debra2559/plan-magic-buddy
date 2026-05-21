import { useState } from "react";
import { Plus, X, Shield, Check, Pencil, ChevronDown } from "lucide-react";

const TABOO_TEMPLATES: { group: string; items: string[] }[] = [
  {
    group: "敏感话题",
    items: ["政治", "宗教", "国族争议", "性别对立", "种族话题"],
  },
  {
    group: "心理边界",
    items: ["容貌焦虑", "身材焦虑", "原生家庭", "前任", "比较他人"],
  },
  {
    group: "工作雷区",
    items: ["薪资八卦", "同事评价", "辞职建议", "管理吐槽"],
  },
  {
    group: "健康相关",
    items: ["饮食羞辱", "节食建议", "医疗诊断", "用药建议"],
  },
  {
    group: "语气禁令",
    items: ["说教口吻", "鸡汤金句", "PUA 话术", "网络烂梗", "emoji 满天飞"],
  },
];

export function TaboosEditor({
  value,
  onChange,
  onCommit,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  onCommit: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState("");

  const taboos = value ?? [];
  const set = (next: string[]) => {
    const dedup = Array.from(new Set(next.map((s) => s.trim()).filter(Boolean)));
    onChange(dedup);
    onCommit(dedup);
  };

  const addOne = (raw: string) => {
    const parts = raw.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    set([...taboos, ...parts]);
  };

  const remove = (i: number) => set(taboos.filter((_, idx) => idx !== i));

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setEditingDraft(taboos[i]);
  };
  const saveEdit = () => {
    if (editingIdx == null) return;
    const v = editingDraft.trim();
    if (!v) {
      remove(editingIdx);
    } else {
      const next = [...taboos];
      next[editingIdx] = v;
      set(next);
    }
    setEditingIdx(null);
    setEditingDraft("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-amber-glow/80" />
          <span className="text-xs text-foreground/85 font-medium">禁忌话题</span>
          <span className="text-[10px] text-muted-foreground">
            AI 永远不会主动碰，被问到也会礼貌岔开
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">{taboos.length} 条</span>
      </div>

      {/* 已选标签 */}
      <div className="min-h-[40px] flex flex-wrap gap-1.5 p-2 rounded-lg bg-foreground/5 border border-border">
        {taboos.length === 0 && (
          <span className="text-[11px] text-muted-foreground/70 italic px-1">
            还没有禁忌话题。可手动输入，或从下方常用模板挑选。
          </span>
        )}
        {taboos.map((t, i) =>
          editingIdx === i ? (
            <span
              key={i}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-amber-glow/15 border border-amber-glow/50"
            >
              <input
                autoFocus
                value={editingDraft}
                onChange={(e) => setEditingDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
                  if (e.key === "Escape") { setEditingIdx(null); setEditingDraft(""); }
                }}
                onBlur={saveEdit}
                className="bg-transparent outline-none text-[12px] text-amber-glow w-24"
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={saveEdit}
                className="w-4 h-4 rounded-full hover:bg-amber-glow/30 flex items-center justify-center"
                title="保存"
              >
                <Check className="w-3 h-3 text-amber-glow" />
              </button>
            </span>
          ) : (
            <span
              key={i}
              className="group inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-rose-400/10 border border-rose-400/30 text-[12px] text-rose-200/90"
            >
              <span className="opacity-60">⊘</span>
              <span>{t}</span>
              <button
                type="button"
                onClick={() => startEdit(i)}
                className="w-4 h-4 rounded-full opacity-60 group-hover:opacity-100 hover:bg-rose-400/20 flex items-center justify-center"
                title="编辑"
              >
                <Pencil className="w-2.5 h-2.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="w-4 h-4 rounded-full opacity-60 group-hover:opacity-100 hover:bg-rose-400/30 flex items-center justify-center"
                title="移除"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ),
        )}
      </div>

      {/* 添加输入框 */}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addOne(draft);
              setDraft("");
            }
          }}
          placeholder="输入一条禁忌，回车 / 逗号添加"
          className="flex-1 px-3 py-2 rounded-lg bg-foreground/5 border border-border text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-amber-glow/50"
        />
        <button
          type="button"
          onClick={() => { addOne(draft); setDraft(""); }}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-glow/20 border border-amber-glow/40 text-amber-glow text-xs hover:bg-amber-glow/30 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> 添加
        </button>
      </div>

      {/* 常用模板（折叠） */}
      <div className="space-y-2 pt-1">
        <div className="text-[11px] text-muted-foreground">从常用模板挑选 · 点击展开分组</div>
        <div className="space-y-1.5">
          {TABOO_TEMPLATES.map((g) => {
            const allSelected = g.items.every((it) => taboos.includes(it));
            const selectedCount = g.items.filter((it) => taboos.includes(it)).length;
            return (
              <TaboosGroup
                key={g.group}
                group={g.group}
                items={g.items}
                taboos={taboos}
                allSelected={allSelected}
                selectedCount={selectedCount}
                onToggleAll={() =>
                  allSelected
                    ? set(taboos.filter((t) => !g.items.includes(t)))
                    : set([...taboos, ...g.items])
                }
                onToggleItem={(it) =>
                  taboos.includes(it)
                    ? set(taboos.filter((t) => t !== it))
                    : set([...taboos, it])
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TaboosGroup({
  group,
  items,
  taboos,
  allSelected,
  selectedCount,
  onToggleAll,
  onToggleItem,
}: {
  group: string;
  items: string[];
  taboos: string[];
  allSelected: boolean;
  selectedCount: number;
  onToggleAll: () => void;
  onToggleItem: (it: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-foreground/[0.03] overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] text-foreground/80 hover:text-foreground"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? "" : "-rotate-90"}`} />
          <span>{group}</span>
          <span className="text-[10px] text-muted-foreground">
            {selectedCount > 0 ? `${selectedCount}/${items.length}` : items.length}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleAll}
          className="text-[10px] text-amber-glow/80 hover:text-amber-glow"
        >
          {allSelected ? "全部移除" : "全部添加"}
        </button>
      </div>
      {open && (
        <div className="flex flex-wrap gap-1 px-2.5 pb-2 pt-0.5 border-t border-border/60">
          {items.map((it) => {
            const active = taboos.includes(it);
            return (
              <button
                key={it}
                type="button"
                onClick={() => onToggleItem(it)}
                className={`px-2 py-0.5 rounded-full text-[11px] border transition ${
                  active
                    ? "bg-rose-400/15 border-rose-400/40 text-rose-200/90 line-through decoration-rose-300/50"
                    : "bg-foreground/5 border-border text-foreground/70 hover:border-amber-glow/40 hover:text-amber-glow"
                }`}
                title={active ? "再次点击移除" : "点击添加为禁忌"}
              >
                {active ? "✓ " : "+ "}{it}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
