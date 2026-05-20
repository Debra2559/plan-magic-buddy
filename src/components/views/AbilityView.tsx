import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyAbilityProfile,
  submitAbilityAssessment,
  generateMyAbilityPlan,
  recomputeAbilityFromActivity,
} from "@/lib/ability.functions";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Brain, Target, ClipboardList } from "lucide-react";
import { toast } from "sonner";

const ABILITY_LABELS: Record<string, string> = {
  planning: "计划力",
  focus: "专注力",
  health: "健康力",
  creativity: "创造力",
  social: "社交力",
  reflection: "反思力",
};
const PERSONALITY_LABELS: Record<string, string> = {
  openness: "开放性",
  conscientiousness: "尽责性",
  extraversion: "外向性",
  agreeableness: "宜人性",
  neuroticism: "情绪性",
};

type Tab = "overview" | "assessment" | "plan";

export function AbilityView() {
  const [tab, setTab] = useState<Tab>("overview");
  const fetchProfile = useServerFn(getMyAbilityProfile);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ability-profile"],
    queryFn: () => fetchProfile(),
  });

  if (isLoading) {
    return <div className="p-8 text-white/60">加载中…</div>;
  }

  const hasProfile = !!data?.profile?.initial_done;

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-[#1a1d24] via-[#181b22] to-[#15171c] text-white">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header>
          <h1 className="font-display text-3xl flex items-center gap-2">
            <Brain className="w-7 h-7 text-amber-glow" /> 个人能力
          </h1>
          <p className="text-white/50 text-sm mt-1">通过测评建立能力 / 性格画像，AI 据此为你制定专属计划，并随你的行为持续更新。</p>
        </header>

        <div className="flex gap-1 border-b border-white/10">
          <TabBtn active={tab === "overview"} onClick={() => setTab("overview")} icon={<Target className="w-4 h-4" />}>概览</TabBtn>
          <TabBtn active={tab === "assessment"} onClick={() => setTab("assessment")} icon={<ClipboardList className="w-4 h-4" />}>{hasProfile ? "重测" : "开始测评"}</TabBtn>
          <TabBtn active={tab === "plan"} onClick={() => setTab("plan")} icon={<Sparkles className="w-4 h-4" />}>成长计划</TabBtn>
        </div>

        {tab === "overview" && (
          hasProfile ? <OverviewPanel data={data!} onRefresh={refetch} /> : <EmptyState onStart={() => setTab("assessment")} />
        )}
        {tab === "assessment" && <AssessmentPanel questions={data?.questions ?? []} onDone={() => { refetch(); setTab("overview"); }} />}
        {tab === "plan" && (
          hasProfile ? <PlanPanel plans={data?.plans ?? []} onRefresh={refetch} /> : <EmptyState onStart={() => setTab("assessment")} />
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition ${
        active ? "border-amber-glow text-amber-glow" : "border-transparent text-white/60 hover:text-white"
      }`}
    >
      {icon} {children}
    </button>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center">
      <Brain className="w-12 h-12 mx-auto text-amber-glow/70 mb-3" />
      <h3 className="text-lg font-display mb-2">还没有你的能力画像</h3>
      <p className="text-white/60 text-sm mb-5">12 道题，约 2 分钟，AI 会为你生成专属雷达图。</p>
      <Button onClick={onStart} className="bg-amber-glow text-primary-foreground hover:bg-amber-glow/90">开始测评</Button>
    </div>
  );
}

function OverviewPanel({ data, onRefresh }: { data: any; onRefresh: () => void }) {
  const profile = data.profile;
  const recompute = useServerFn(recomputeAbilityFromActivity);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => recompute(),
    onSuccess: (r: any) => {
      toast.success(r?.summary ?? "已根据近期行为更新画像");
      qc.invalidateQueries({ queryKey: ["ability-profile"] });
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "更新失败"),
  });

  const abilityData = useMemo(
    () => Object.entries(profile.abilities ?? {}).map(([k, v]) => ({ dim: ABILITY_LABELS[k] ?? k, score: Number(v) })),
    [profile.abilities],
  );
  const personalityData = useMemo(
    () => Object.entries(profile.personality ?? {})
      .filter(([k]) => k !== "summary")
      .map(([k, v]) => ({ dim: PERSONALITY_LABELS[k] ?? k, score: Number(v) })),
    [profile.personality],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-glow/20 bg-amber-glow/5 p-5">
        <div className="text-amber-glow text-xs uppercase tracking-wider mb-1">画像</div>
        <div className="font-display text-xl">{profile.tagline || "你的个人画像"}</div>
        {profile.personality?.summary && (
          <p className="text-white/70 text-sm mt-2 leading-relaxed">{profile.personality.summary}</p>
        )}
        <div className="flex flex-wrap gap-4 mt-4 text-sm">
          <div>
            <span className="text-white/40">优势：</span>
            {(profile.strengths ?? []).map((s: string) => (
              <span key={s} className="inline-block ml-1 px-2 py-0.5 rounded bg-moss/20 text-moss-foreground border border-moss/30">{s}</span>
            ))}
          </div>
          <div>
            <span className="text-white/40">成长：</span>
            {(profile.growth_areas ?? []).map((s: string) => (
              <span key={s} className="inline-block ml-1 px-2 py-0.5 rounded bg-amber-glow/15 text-amber-glow border border-amber-glow/30">{s}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="能力雷达" data={abilityData} stroke="hsl(45 95% 60%)" fill="hsl(45 95% 60% / 0.35)" />
        <ChartCard title="性格画像（大五）" data={personalityData} stroke="hsl(180 60% 60%)" fill="hsl(180 60% 60% / 0.3)" />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
        <div>
          <div className="text-sm font-medium">根据近期行为更新画像</div>
          <div className="text-white/50 text-xs">AI 会基于最近 14 天日程完成度、习惯、记录等小幅调整</div>
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} variant="outline" className="border-white/20 bg-white/5 hover:bg-white/10">
          <RefreshCw className={`w-4 h-4 mr-2 ${mut.isPending ? "animate-spin" : ""}`} /> {mut.isPending ? "分析中…" : "立即更新"}
        </Button>
      </div>
    </div>
  );
}

function ChartCard({ title, data, stroke, fill }: { title: string; data: { dim: string; score: number }[]; stroke: string; fill: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="75%">
            <PolarGrid stroke="rgba(255,255,255,0.15)" />
            <PolarAngleAxis dataKey="dim" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
            <Radar dataKey="score" stroke={stroke} fill={fill} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AssessmentPanel({ questions, onDone }: { questions: readonly any[]; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const submit = useServerFn(submitAbilityAssessment);
  const mut = useMutation({
    mutationFn: (responses: Record<string, number>) => submit({ data: { responses, kind: "initial" } }),
    onSuccess: () => {
      toast.success("测评完成，已生成你的画像");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "提交失败"),
  });

  const allAnswered = questions.every((q) => answers[q.id]);
  const progress = Math.round((Object.keys(answers).length / Math.max(questions.length, 1)) * 100);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-white/70">完成进度</span>
          <span className="text-amber-glow">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-amber-glow transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {questions.map((q, idx) => (
        <div key={q.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm mb-3">
            <span className="text-white/40 mr-2">{idx + 1}.</span>{q.text}
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                className={`flex-1 py-2 rounded-lg text-sm border transition ${
                  answers[q.id] === v
                    ? "bg-amber-glow text-primary-foreground border-amber-glow"
                    : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                }`}
              >
                {["非常不符合", "不符合", "一般", "符合", "非常符合"][v - 1]}
              </button>
            ))}
          </div>
        </div>
      ))}

      <Button
        disabled={!allAnswered || mut.isPending}
        onClick={() => mut.mutate(answers)}
        className="w-full bg-amber-glow text-primary-foreground hover:bg-amber-glow/90"
      >
        {mut.isPending ? "AI 分析中…" : allAnswered ? "提交并生成画像" : `还有 ${questions.length - Object.keys(answers).length} 题`}
      </Button>
    </div>
  );
}

function PlanPanel({ plans, onRefresh }: { plans: any[]; onRefresh: () => void }) {
  const generate = useServerFn(generateMyAbilityPlan);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => generate(),
    onSuccess: () => {
      toast.success("已生成新计划");
      qc.invalidateQueries({ queryKey: ["ability-profile"] });
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "生成失败"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
        <div>
          <div className="text-sm font-medium">基于画像 + 近期行为生成成长计划</div>
          <div className="text-white/50 text-xs">每次生成会归档上一份，保留历史可查阅</div>
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="bg-amber-glow text-primary-foreground hover:bg-amber-glow/90">
          <Sparkles className={`w-4 h-4 mr-2 ${mut.isPending ? "animate-pulse" : ""}`} /> {mut.isPending ? "生成中…" : "生成新计划"}
        </Button>
      </div>

      {plans.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-white/60 text-sm">还没有计划，点上面按钮生成第一份吧。</div>
      )}

      {plans.map((p) => (
        <div key={p.id} className={`rounded-xl border p-5 ${p.status === "active" ? "border-amber-glow/30 bg-amber-glow/5" : "border-white/10 bg-white/5"}`}>
          <div className="flex items-start justify-between mb-1">
            <div>
              <div className="font-display text-lg">{p.title}</div>
              <div className="text-white/60 text-sm">{p.tagline}</div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded ${p.status === "active" ? "bg-amber-glow text-primary-foreground" : "bg-white/10 text-white/50"}`}>
              {p.status === "active" ? "进行中" : "已归档"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mt-2 mb-3">
            {(p.focus_areas ?? []).map((a: string) => (
              <span key={a} className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/70">{a}</span>
            ))}
          </div>
          <div className="space-y-3">
            {(p.content ?? []).map((item: any, idx: number) => (
              <div key={idx} className="rounded-lg bg-black/30 border border-white/10 p-3">
                <div className="text-sm font-medium text-amber-glow">{item.area}</div>
                <div className="text-sm text-white/80 mt-0.5">{item.goal}</div>
                <ul className="mt-2 space-y-1">
                  {(item.actions ?? []).map((a: string, i: number) => (
                    <li key={i} className="text-xs text-white/70 flex gap-2"><span className="text-amber-glow">·</span>{a}</li>
                  ))}
                </ul>
                <div className="text-[11px] text-white/40 mt-2">节奏：{item.cadence}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
