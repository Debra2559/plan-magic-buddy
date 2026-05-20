import { useCallback, useEffect, useState } from "react";
import { History, RotateCcw, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { usePersona, type PersonaProfile } from "@/lib/persona";
import { toast } from "sonner";

interface HistoryRow {
  id: string;
  user_id: string;
  version: number;
  changed_at: string;
  changed_fields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

const FIELD_LABEL: Record<string, string> = {
  avatar_url: "头像",
  display_name: "昵称",
  persona_prompt: "人设描述",
  humor_level: "幽默度",
  sass_level: "贱度",
  professional_level: "专业度",
  verbosity_level: "啰嗦度",
  tone_examples: "语气示范",
  taboos: "禁忌话题",
};

const RESTORABLE = new Set(Object.keys(FIELD_LABEL));

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString();
}

function previewValue(v: unknown): string {
  if (v == null) return "（空）";
  if (Array.isArray(v)) return v.length ? v.join("、") : "（空）";
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return "（空）";
    if (t.startsWith("data:") || t.startsWith("http")) return "<图片>";
    return t.length > 40 ? t.slice(0, 40) + "…" : t;
  }
  return String(v);
}

export function ProfileHistoryPanel() {
  const { user } = useAuth();
  const { save } = usePersona();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("user_profile_history")
      .select("*")
      .eq("user_id", user.id)
      .order("changed_at", { ascending: false })
      .limit(20);
    if (error) {
      toast.error("加载变更历史失败", { description: error.message });
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as HistoryRow[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
    const ch = supabase
      .channel(`user_profile_history:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_profile_history", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as unknown as HistoryRow;
          setRows((prev) => [row, ...prev].slice(0, 20));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, load]);

  const restore = async (row: HistoryRow) => {
    const before = row.before;
    if (!before) {
      toast.error("此条没有可恢复的旧值");
      return;
    }
    const patch: Partial<PersonaProfile> = {};
    for (const k of row.changed_fields) {
      if (!RESTORABLE.has(k)) continue;
      (patch as Record<string, unknown>)[k] = before[k] ?? null;
    }
    if (Object.keys(patch).length === 0) {
      toast.error("没有可恢复的字段");
      return;
    }
    setRestoringId(row.id);
    try {
      await save(patch);
      toast.success("已恢复到该变更之前的内容");
    } catch (e) {
      toast.error("恢复失败", { description: (e as Error)?.message });
    } finally {
      setRestoringId(null);
    }
  };

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="pt-4 border-t border-border space-y-3">
      <div className="flex items-center gap-2 text-sm text-foreground/85">
        <History className="w-4 h-4 text-amber-glow" />
        <span className="font-medium">最近变更</span>
        <span className="text-[11px] text-muted-foreground/70">仅保留最近 20 条</span>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> 加载中…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground/70">还没有任何变更记录</div>
      ) : (
        <ol className="space-y-2">
          {rows.map((r) => {
            const isOpen = expanded.has(r.id);
            const canRestore = !!r.before && r.changed_fields.some((f) => RESTORABLE.has(f));
            const labels = r.changed_fields
              .map((f) => FIELD_LABEL[f] ?? f)
              .join("、");
            return (
              <li
                key={r.id}
                className="rounded-lg border border-border bg-foreground/[0.03] text-xs"
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    title={isOpen ? "收起" : "展开"}
                  >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-white/85 truncate">
                      修改了 <span className="text-amber-glow">{labels || "（无变化）"}</span>
                    </div>
                    <div className="text-muted-foreground/70 mt-0.5 tabular-nums">
                      {relTime(r.changed_at)} · v{r.version}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canRestore || restoringId === r.id}
                    onClick={() => restore(r)}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full border border-border bg-foreground/5 hover:bg-amber-glow/15 hover:border-amber-glow/40 hover:text-amber-glow disabled:opacity-40 disabled:cursor-not-allowed"
                    title={canRestore ? "把这些字段恢复到此次变更之前" : "无可恢复的旧值"}
                  >
                    {restoringId === r.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3 h-3" />
                    )}
                    恢复
                  </button>
                </div>

                {isOpen && (
                  <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-border/50">
                    {r.changed_fields.map((f) => (
                      <div key={f} className="grid grid-cols-[64px_1fr] gap-2">
                        <div className="text-muted-foreground/80 truncate">{FIELD_LABEL[f] ?? f}</div>
                        <div className="text-foreground/85 break-words">
                          <span className="text-muted-foreground/70 line-through mr-1.5">
                            {previewValue(r.before?.[f])}
                          </span>
                          <span className="text-amber-glow/90">→ {previewValue(r.after?.[f])}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
