import { useEffect, useMemo, useRef, useState } from "react";
import { useSylva } from "@/lib/sylva-store";
import { itemsToText, textToItems } from "@/lib/calendar-view";
import { Check, Loader2, Highlighter, Star, CheckSquare } from "lucide-react";

interface Props {
  /** YYYY-MM-DD */
  date: string;
}

/** 把一行文本渲染成带高亮/标记/勾选样式的片段 */
function renderLine(line: string, key: number) {
  if (/^\s*【.*】\s*$/.test(line)) {
    return (
      <div key={key} className="text-primary font-semibold">
        {line || "\u00A0"}
      </div>
    );
  }
  const done = /^\s*(\d+\s*[、.．)）]\s*)?(\[x\]|\[X\]|✓|✔)/.test(line);
  const starred = line.includes("★");

  // 高亮片段 ==xxx==
  const parts: React.ReactNode[] = [];
  const re = /==([^=]+)==/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    parts.push(
      <mark key={`${key}-${m.index}`} className="bg-primary/25 text-foreground rounded px-0.5">
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  parts.push(line.slice(last));

  return (
    <div
      key={key}
      className={`${done ? "line-through text-muted-foreground" : ""} ${
        starred ? "text-amber-500 dark:text-amber-400" : ""
      }`}
    >
      {line ? parts : "\u00A0"}
    </div>
  );
}

/** 自由文本编辑视图：一整天的安排写成一段文本，失焦自动保存 */
export function CalendarTextEditor({ date }: Props) {
  const { items, addItems, updateItem, removeItem } = useSylva();
  const dayItems = useMemo(() => items.filter((i) => i.date === date), [items, date]);

  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const dirtyRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
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

  const applyToSelection = (mode: "highlight" | "star" | "check") => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    if (mode === "highlight" && end > start) {
      const sel = text.slice(start, end);
      const next =
        /^==.*==$/.test(sel) ? text.slice(0, start) + sel.slice(2, -2) + text.slice(end)
          : text.slice(0, start) + `==${sel}==` + text.slice(end);
      setText(next);
      setDirty(true);
      setSavedAt(null);
      requestAnimationFrame(() => ta.focus());
      return;
    }

    // 行级操作：标记 / 打勾
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = text.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = text.length;
    const block = text.slice(lineStart, lineEnd);
    const lines = block.split("\n").map((line) => {
      if (!line.trim() || /^\s*【.*】\s*$/.test(line)) return line;
      if (mode === "star") {
        return line.includes("★") ? line.replace(/★\s*/, "") : line.replace(/^(\s*(?:\d+\s*[、.．)）]\s*)?)/, "$1★ ");
      }
      // check
      const m = line.match(/^(\s*(?:\d+\s*[、.．)）]\s*)?)(\[x\]|\[X\]|✓|✔)\s*/);
      if (m) return line.slice(0, m[1].length) + line.slice(m[0].length);
      return line.replace(/^(\s*(?:\d+\s*[、.．)）]\s*)?)/, "$1[x] ");
    });
    const next = text.slice(0, lineStart) + lines.join("\n") + text.slice(lineEnd);
    setText(next);
    setDirty(true);
    setSavedAt(null);
    requestAnimationFrame(() => ta.focus());
  };

  const btn =
    "text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent transition-colors inline-flex items-center gap-1";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-1.5">
          <button className={btn} onClick={() => applyToSelection("check")} title="打勾 / 取消（当前行）">
            <CheckSquare className="w-3 h-3" /> 打勾
          </button>
          <button className={btn} onClick={() => applyToSelection("highlight")} title="高亮选中文字">
            <Highlighter className="w-3 h-3" /> 高亮
          </button>
          <button className={btn} onClick={() => applyToSelection("star")} title="标记当前行">
            <Star className="w-3 h-3" /> 标记
          </button>
        </div>
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

      <div className="relative flex-1 min-h-[240px] rounded-lg border border-border/60 bg-card overflow-hidden focus-within:border-primary/50">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden p-4 text-[15px] leading-8 whitespace-pre-wrap break-words font-normal"
          style={{ transform: `translateY(${-scrollTop}px)` }}
        >
          {text.split("\n").map((line, i) => renderLine(line, i))}
        </div>
        <textarea
          ref={taRef}
          value={text}
          onScroll={(e) => setScrollTop((e.target as HTMLTextAreaElement).scrollTop)}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
            setSavedAt(null);
          }}
          onBlur={save}
          placeholder={"【上午】\n1、\n【下午】\n1、\n【晚上】\n"}
          spellCheck={false}
          className="absolute inset-0 w-full h-full resize-none bg-transparent p-4 text-[15px] leading-8 outline-none font-normal text-transparent caret-foreground selection:bg-primary/30 whitespace-pre-wrap break-words"
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <span className="text-[11px] text-muted-foreground">
          【上午】分段 · 「1、」序号 · 「09:30」时间 · 「[x]」完成 · 「==高亮==」· 「★标记」
        </span>
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
