import { useEffect, useMemo, useRef, useState } from "react";
import { useSylva } from "@/lib/sylva-store";
import { itemsToText, textToItems } from "@/lib/calendar-view";
import { Check, Loader2 } from "lucide-react";

interface Props {
  /** YYYY-MM-DD */
  date: string;
}

/** 自由文本编辑视图：一整天的安排写成一段文本，失焦自动保存 */
export function CalendarTextEditor({ date }: Props) {
  const { items, addItems, updateItem, removeItem } = useSylva();
  const dayItems = useMemo(() => items.filter((i) => i.date === date), [items, date]);

  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  // 切换日期 / 外部数据变化时，如果本地没有未保存修改就刷新文本
  useEffect(() => {
    if (dirtyRef.current) return;
    setText(itemsToText(dayItems));
  }, [date, dayItems]);

  const save = () => {
    if (!dirty) return;
    setSaving(true);
    const parsed = textToItems(text);
    const remaining = [...dayItems];

    for (const p of parsed) {
      const idx = remaining.findIndex((r) => r.title === p.title);
      if (idx >= 0) {
        const cur = remaining[idx];
        remaining.splice(idx, 1);
        if (cur.time !== p.time || Boolean(cur.done) !== Boolean(p.done)) {
          updateItem(cur.id, { time: p.time, done: p.done } as any);
        }
      } else {
        addItems([
          { type: "todo", title: p.title, date, time: p.time, tag: "生活", ...(p.done ? { done: true } : {}) } as any,
        ]);
      }
    }
    remaining.forEach((r) => removeItem(r.id));

    setDirty(false);
    setSaving(false);
    setSavedAt(Date.now());
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[11px] text-muted-foreground">
          支持「【上午】/【下午】/【晚上】」分段、「1、」序号、「09:30 」时间、「[x] 」已完成
        </span>
        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          {saving ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" /> 保存中
            </>
          ) : dirty ? (
            "未保存 · 失焦自动保存"
          ) : savedAt ? (
            <>
              <Check className="w-3 h-3 text-primary" /> 已保存
            </>
          ) : null}
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
          setSavedAt(null);
        }}
        onBlur={save}
        placeholder={"【上午】\n1、\n【下午】\n1、\n【晚上】\n"}
        spellCheck={false}
        className="flex-1 min-h-[420px] w-full resize-none rounded-lg border border-border/60 bg-card p-4 text-[15px] leading-8 outline-none focus:border-primary/50 font-normal"
      />
      <div className="flex justify-end pt-2">
        <button
          onClick={save}
          disabled={!dirty}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-40"
        >
          保存
        </button>
      </div>
    </div>
  );
}
