import { useState } from "react";
import { useSylva } from "@/lib/sylva-store";
import { Plus, Trash2, StickyNote } from "lucide-react";

export function NotesView() {
  const { notes, addNote, removeNote } = useSylva();
  const [text, setText] = useState("");

  const submit = () => {
    if (!text.trim()) return;
    addNote(text.trim());
    setText("");
  };

  return (
    <div className="p-7 overflow-auto h-full max-w-3xl mx-auto">
      <p className="text-[10px] tracking-widest text-amber-glow mb-1">随手记</p>
      <h2 className="font-display text-3xl text-white mb-6">把脑子里飘过的，先存下来。</h2>

      <div className="widget p-4 mb-6 widget-glow">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={3}
          placeholder="此刻在想什么？ ⌘ + Enter 保存"
          className="w-full bg-transparent outline-none text-sm leading-relaxed text-white/90 placeholder:text-white/30 resize-none"
        />
        <div className="flex items-center justify-between mt-2">
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

      <div className="space-y-3">
        {notes.length === 0 ? (
          <div className="text-center py-16 text-white/40 text-sm">还没有任何记录</div>
        ) : (
          notes.map((n) => (
            <div
              key={n.id}
              className="group p-4 rounded-2xl bg-white/[0.04] border border-white/8 hover:border-white/15 transition"
            >
              <div className="flex items-start gap-3">
                <StickyNote className="w-4 h-4 text-amber-glow mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{n.text}</p>
                  <p className="text-[10px] text-white/40 mt-2 tracking-wider">{fmt(n.createdAt)}</p>
                </div>
                <button
                  onClick={() => removeNote(n.id)}
                  className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-destructive p-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
