import { HackathonInbox } from "@/components/HackathonInbox";
import { AiNewsRadar } from "@/components/AiNewsRadar";
import { Radar } from "lucide-react";

export function MonitorView() {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-5 flex items-center gap-2">
        <Radar className="w-5 h-5 text-amber-glow" />
        <h2 className="font-display text-2xl text-foreground">监控</h2>
        <span className="text-xs text-muted-foreground/70 ml-2">黑客松与 AI 动态雷达，每日自动扫一遍</span>
      </div>
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <HackathonInbox />
        <AiNewsRadar />
      </div>
    </div>
  );
}
