import { useState } from "react";
import { HackathonInbox } from "@/components/HackathonInbox";
import { AiNewsRadar } from "@/components/AiNewsRadar";
import { MonitorCreateDialog } from "@/components/MonitorCreateDialog";
import { Radar, Sparkles, Check, Brain } from "lucide-react";

export function MonitorView() {
  const [topic, setTopic] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPrompt, setDialogPrompt] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  const open = () => {
    const t = topic.trim();
    if (!t) return;
    setDialogPrompt(t);
    setDialogOpen(true);
    setSuccess(null);
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-5 flex items-center gap-2">
        <Radar className="w-5 h-5 text-amber-glow" />
        <h2 className="font-display text-2xl text-foreground">监控</h2>
        <span className="text-xs text-muted-foreground/70 ml-2">活动 / 赛事 / AI 动态，每日自动扫一遍</span>
      </div>

      <div className="widget p-4 mb-6">
        <div className="flex items-center gap-1.5 mb-2 text-xs tracking-wider text-amber-glow">
          <Sparkles className="w-3.5 h-3.5" />
          一键新建监控
          <span className="text-foreground/40 ml-1 tracking-normal">告诉我想关注什么，AI 会先想一下并跟你对一遍</span>
        </div>
        <div className="flex items-center gap-2 mb-2.5 text-[10.5px] text-foreground/45">
          <Brain className="w-3 h-3" />
          <span>AI 会判断类别 · 反问澄清 · 展示思路 · 让你确认</span>
        </div>
        <div className="flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); open(); } }}
            placeholder="想关注什么？例如：北京周边徒步 / AI Agent 比赛 / 开源大模型发布"
            className="flex-1 bg-background/40 border border-foreground/15 rounded-md px-3 py-2 text-[12px] text-foreground placeholder:text-foreground/30 focus:border-amber-glow/60 focus:outline-none"
          />
          <button
            onClick={open}
            disabled={!topic.trim()}
            className="flex items-center gap-1 px-4 py-2 rounded-md text-xs bg-amber-glow text-background hover:scale-[1.02] transition disabled:opacity-40"
          >
            <Sparkles className="w-3.5 h-3.5" />
            一键创建
          </button>
        </div>
        {success && (
          <div className="mt-2 p-2 rounded-lg bg-amber-glow/10 border border-amber-glow/30 text-[11px] text-amber-glow flex items-center gap-1.5">
            <Check className="w-3 h-3" /> {success}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <HackathonInbox />
        <AiNewsRadar />
      </div>

      <MonitorCreateDialog
        open={dialogOpen}
        initialPrompt={dialogPrompt}
        onClose={() => setDialogOpen(false)}
        onSaved={(msg) => {
          setSuccess(msg);
          setTopic("");
        }}
      />
    </div>
  );
}
