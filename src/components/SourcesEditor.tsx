import { Plus, Trash2, Eye, EyeOff } from "lucide-react";

export interface EditableSource {
  name: string;
  query: string;
  enabled: boolean;
}

interface Props {
  sources: EditableSource[];
  onChange: (next: EditableSource[]) => void;
  queryPlaceholder?: string;
}

export function SourcesEditor({ sources, onChange, queryPlaceholder = "搜索关键词，例：site:devpost.com hackathon" }: Props) {
  const update = (i: number, patch: Partial<EditableSource>) => {
    const next = sources.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(sources.filter((_, idx) => idx !== i));
  const add = () => onChange([...sources, { name: "", query: "", enabled: true }]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-foreground/60">监控来源 · 共 {sources.length} 条</span>
        <button
          onClick={add}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-amber-glow/15 border border-amber-glow/30 text-amber-glow hover:bg-amber-glow/25 transition"
        >
          <Plus className="w-3 h-3" /> 添加来源
        </button>
      </div>
      {sources.length === 0 && (
        <div className="text-[11px] text-foreground/40 py-2 text-center">还没有任何来源，点上方「添加来源」开始。</div>
      )}
      <div className="space-y-1.5 max-h-[260px] overflow-auto pr-1">
        {sources.map((s, i) => (
          <div
            key={i}
            className={`flex items-center gap-1.5 p-1.5 rounded-lg border transition ${
              s.enabled ? "bg-background/30 border-foreground/10" : "bg-background/10 border-foreground/5 opacity-60"
            }`}
          >
            <button
              onClick={() => update(i, { enabled: !s.enabled })}
              className="shrink-0 p-1 rounded hover:bg-foreground/10 text-foreground/50 hover:text-amber-glow transition"
              title={s.enabled ? "暂停此来源" : "启用此来源"}
            >
              {s.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            <input
              value={s.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="名称"
              className="w-24 bg-transparent border-none text-[12px] text-foreground placeholder:text-foreground/30 focus:outline-none"
            />
            <input
              value={s.query}
              onChange={(e) => update(i, { query: e.target.value })}
              placeholder={queryPlaceholder}
              className="flex-1 bg-background/40 border border-foreground/10 rounded px-2 py-1 text-[12px] text-foreground placeholder:text-foreground/30 focus:border-amber-glow/50 focus:outline-none"
            />
            <button
              onClick={() => remove(i)}
              className="shrink-0 p-1 rounded hover:bg-destructive/20 text-foreground/40 hover:text-destructive transition"
              title="删除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
