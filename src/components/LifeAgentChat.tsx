import { useEffect, useRef, useState } from "react";
import { X, Send, Sparkles, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePersona, resolveAvatarUrl } from "@/lib/persona";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "life-agent:history:v1";
const GREETING =
  "我是你的生活小助理。你可以直接跟我说：帮我明天9点排个开会、这周花了多少钱、把冥想打个卡、我周三通常在家办公（我会记住）……我可以帮你查、帮你想，也可以直接动手。";

function loadHistory(): Msg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
function saveHistory(msgs: Msg[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-40))); } catch {}
}

export function LifeAgentChat() {
  const { persona } = usePersona();
  const aiName = persona?.ai_nickname || "Sylva";
  const avatar = resolveAvatarUrl(persona?.avatar_url);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(loadHistory);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [assistantBuffer, setAssistantBuffer] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const openIt = () => setOpen(true);
    const toggleIt = () => setOpen((o) => !o);
    window.addEventListener("life-agent:open", openIt);
    window.addEventListener("life-agent:toggle", toggleIt);
    return () => {
      window.removeEventListener("life-agent:open", openIt);
      window.removeEventListener("life-agent:toggle", toggleIt);
    };
  }, []);

  useEffect(() => { saveHistory(messages); }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, assistantBuffer, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setAssistantBuffer("");
    setStreaming(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("请先登录");

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const res = await fetch("/api/life-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: next }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => "");
        throw new Error(err || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setAssistantBuffer(acc);
      }
      setMessages((m) => [...m, { role: "assistant", content: acc || "（无回复）" }]);
      setAssistantBuffer("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "AbortError" && !msg.includes("aborted")) {
        toast.error("助手回复失败", { description: msg });
        setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${msg}` }]);
      }
      setAssistantBuffer("");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => { abortRef.current?.abort(); };
  const reset = () => {
    setMessages([]);
    saveHistory([]);
    toast("对话已清空");
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-black/25 backdrop-blur-[2px] animate-in fade-in"
        onClick={() => setOpen(false)}
      />
      <aside
        className="fixed right-0 top-0 bottom-0 z-[71] w-full sm:w-[420px] bg-background/98 backdrop-blur-2xl
          border-l border-foreground/10 shadow-2xl flex flex-col animate-in slide-in-from-right"
      >
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-foreground/10">
          <img src={avatar} alt={aiName} className="w-8 h-8 rounded-full object-cover ring-1 ring-amber-glow/40" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium flex items-center gap-1.5">
              {aiName}
              <Sparkles className="w-3 h-3 text-amber-glow" />
            </div>
            <div className="text-[10px] text-foreground/50">你的生活 agent · 能查能想能动手</div>
          </div>
          <button onClick={reset} title="清空对话" className="p-1.5 rounded hover:bg-foreground/5 text-foreground/50">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-foreground/5 text-foreground/50">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-xs text-foreground/60 leading-relaxed bg-foreground/[0.03] rounded-xl p-3 border border-foreground/5">
              {GREETING}
            </div>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} content={m.content} />
          ))}
          {streaming && (
            <Bubble
              role="assistant"
              content={assistantBuffer || "…"}
              typing={!assistantBuffer}
            />
          )}
        </div>

        {/* input */}
        <div className="border-t border-foreground/10 p-3">
          <div className="flex items-end gap-2 rounded-2xl bg-foreground/[0.04] border border-foreground/10 p-2 focus-within:border-amber-glow/50 transition">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="跟我聊聊你想做什么…（Enter 发送 / Shift+Enter 换行）"
              className="flex-1 bg-transparent outline-none text-sm resize-none max-h-40 min-h-[24px] leading-6 px-2 py-1"
            />
            {streaming ? (
              <button onClick={stop} className="p-2 rounded-lg bg-foreground/10 text-foreground/70 hover:bg-foreground/15">
                <Loader2 className="w-4 h-4 animate-spin" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="p-2 rounded-lg bg-gradient-to-br from-amber-glow to-orange-400 text-primary-foreground disabled:opacity-40 hover:scale-105 transition"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="text-[9px] text-foreground/40 mt-1.5 px-1">
            提示：我能直接新建日程/待办/记账、打卡习惯、搜笔记、记住你的偏好。
          </div>
        </div>
      </aside>
    </>
  );
}

function Bubble({ role, content, typing }: { role: "user" | "assistant"; content: string; typing?: boolean }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words
          ${isUser
            ? "bg-gradient-to-br from-amber-glow/90 to-orange-400/90 text-primary-foreground rounded-br-md"
            : "bg-foreground/[0.05] text-foreground rounded-bl-md border border-foreground/5"}`}
      >
        {typing ? <span className="inline-flex gap-1"><Dot /><Dot d={150} /><Dot d={300} /></span> : content}
      </div>
    </div>
  );
}
function Dot({ d = 0 }: { d?: number }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse"
      style={{ animationDelay: `${d}ms` }}
    />
  );
}

/** 外部调用：打开助手 */
export function openLifeAgent() {
  window.dispatchEvent(new Event("life-agent:open"));
}
