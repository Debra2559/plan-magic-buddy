import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyAbilityProfile,
  submitAbilityAssessment,
  generateMyAbilityPlan,
  recomputeAbilityFromActivity,
  researchAbilityPlan,
} from "@/lib/ability.functions";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Brain, Target, ClipboardList, CalendarPlus, Telescope, ExternalLink, Clock, Lightbulb, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useSylva, todayLocal } from "@/lib/sylva-store";
import type { PlanItem } from "@/lib/plan.functions";

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
    return <AbilityLoading />;
  }

  const hasProfile = !!data?.profile?.initial_done;

  return (
    <div className="h-full overflow-auto bg-background text-foreground">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header>
          <h1 className="font-display text-3xl flex items-center gap-2">
            <Brain className="w-7 h-7 text-amber-glow" /> 个人能力
          </h1>
          <p className="text-muted-foreground text-sm mt-1">通过测评建立能力 / 性格画像，AI 据此为你制定专属计划，并随你的行为持续更新。</p>
        </header>

        <div className="flex gap-1 border-b border-border">
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
        active ? "border-amber-glow text-amber-glow" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {children}
    </button>
  );
}

function AbilityLoading() {
  const tips = [
    "正在唤醒你的能力雷达…",
    "AI 正在翻阅你的最近行为…",
    "正在为你的画像配色…",
    "把答辩、英语、健身揉进维度里…",
  ];
  const [tip, setTip] = useState(tips[0]);
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => { i = (i + 1) % tips.length; setTip(tips[i]); }, 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="h-full overflow-hidden bg-background text-foreground">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* 头部骨架 */}
        <header>
          <h1 className="font-display text-3xl flex items-center gap-2">
            <Brain className="w-7 h-7 text-amber-glow animate-pulse" /> 个人能力
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{tip}</p>
        </header>

        {/* 中央可视化 */}
        <div className="relative widget widget-glow p-8 flex flex-col items-center justify-center min-h-[340px] overflow-hidden">
          {/* 旋转的轨道 */}
          <div className="relative w-44 h-44">
            <div className="absolute inset-0 rounded-full border border-amber-glow/20" />
            <div className="absolute inset-3 rounded-full border border-amber-glow/15" />
            <div className="absolute inset-6 rounded-full border border-amber-glow/10" />
            {/* 旋转光环 */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "conic-gradient(from 0deg, transparent 0%, oklch(0.66 0.14 55 / 0.55) 25%, transparent 55%)",
                maskImage: "radial-gradient(circle, transparent 60%, black 62%, black 100%)",
                WebkitMaskImage: "radial-gradient(circle, transparent 60%, black 62%, black 100%)",
                animation: "spin 2.6s linear infinite",
              }}
            />
            {/* 轨道上的粒子 */}
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="absolute top-1/2 left-1/2 w-1.5 h-1.5 -ml-0.5 -mt-0.5 rounded-full bg-amber-glow"
                style={{
                  transformOrigin: "0 0",
                  animation: `ability-orbit 3.4s linear infinite`,
                  animationDelay: `${-i * 0.68}s`,
                  boxShadow: "0 0 8px oklch(0.66 0.14 55 / 0.8)",
                }}
              />
            ))}
            {/* 中心 brain */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-glow/25 to-moss/20 flex items-center justify-center backdrop-blur-sm border border-amber-glow/30">
                <Brain className="w-7 h-7 text-amber-glow animate-pulse" />
              </div>
            </div>
          </div>

          {/* 进度条 */}
          <div className="mt-8 w-56 h-1 rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full w-1/3 rounded-full bg-gradient-to-r from-amber-glow via-orange-400 to-moss"
              style={{ animation: "ability-progress 1.6s ease-in-out infinite" }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground tracking-wider">{tip}</p>
        </div>

        {/* 下方维度骨架 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="widget p-3 space-y-2"
              style={{ animation: "ability-pulse 1.6s ease-in-out infinite", animationDelay: `${i * 0.12}s` }}
            >
              <div className="h-3 w-1/2 rounded-full bg-foreground/10" />
              <div className="h-2 w-full rounded-full bg-foreground/5 overflow-hidden">
                <div className="h-full w-1/3 bg-amber-glow/40 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes ability-orbit {
          from { transform: rotate(0deg) translateX(86px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(86px) rotate(-360deg); }
        }
        @keyframes ability-progress {
          0%   { transform: translateX(-110%); width: 30%; }
          50%  { width: 55%; }
          100% { transform: translateX(220%); width: 30%; }
        }
        @keyframes ability-pulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-foreground/5 p-10 text-center">
      <Brain className="w-12 h-12 mx-auto text-amber-glow/70 mb-3" />
      <h3 className="text-lg font-display mb-2">还没有你的能力画像</h3>
      <p className="text-muted-foreground text-sm mb-5">12 道题，约 2 分钟，AI 会为你生成专属雷达图。</p>
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
          <p className="text-foreground/75 text-sm mt-2 leading-relaxed">{profile.personality.summary}</p>
        )}
        <div className="flex flex-wrap gap-4 mt-4 text-sm">
          <div>
            <span className="text-muted-foreground/70">优势：</span>
            {(profile.strengths ?? []).map((s: string) => (
              <span key={s} className="inline-block ml-1 px-2 py-0.5 rounded bg-moss/20 text-moss-foreground border border-moss/30">{s}</span>
            ))}
          </div>
          <div>
            <span className="text-muted-foreground/70">成长：</span>
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

      <div className="flex items-center justify-between rounded-xl border border-border bg-foreground/5 p-4">
        <div>
          <div className="text-sm font-medium">根据近期行为更新画像</div>
          <div className="text-muted-foreground text-xs">AI 会基于最近 14 天日程完成度、习惯、记录等小幅调整</div>
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} variant="outline" className="border-border bg-foreground/5 hover:bg-foreground/10">
          <RefreshCw className={`w-4 h-4 mr-2 ${mut.isPending ? "animate-spin" : ""}`} /> {mut.isPending ? "分析中…" : "立即更新"}
        </Button>
      </div>
    </div>
  );
}

function ChartCard({ title, data, stroke, fill }: { title: string; data: { dim: string; score: number }[]; stroke: string; fill: string }) {
  return (
    <div className="rounded-xl border border-border bg-foreground/5 p-4">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="75%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="dim" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "var(--muted-foreground)", fillOpacity: 0.5, fontSize: 10 }} />
            <Radar dataKey="score" stroke={stroke} fill={fill} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const ASSESSMENT_DRAFT_KEY = "sylva.abilityAssessmentDraft";

function AssessmentPanel({ questions, onDone }: { questions: readonly any[]; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(ASSESSMENT_DRAFT_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(ASSESSMENT_DRAFT_KEY, JSON.stringify(answers)); } catch {}
  }, [answers]);
  const submit = useServerFn(submitAbilityAssessment);
  const mut = useMutation({
    mutationFn: (responses: Record<string, number>) => submit({ data: { responses, kind: "initial" } }),
    onSuccess: () => {
      toast.success("测评完成，已生成你的画像");
      try { localStorage.removeItem(ASSESSMENT_DRAFT_KEY); } catch {}
      setAnswers({});
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "提交失败"),
  });

  const allAnswered = questions.every((q) => answers[q.id]);
  const progress = Math.round((Object.keys(answers).length / Math.max(questions.length, 1)) * 100);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-foreground/5 p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-foreground/75">完成进度</span>
          <span className="text-amber-glow">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
          <div className="h-full bg-amber-glow transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {questions.map((q, idx) => (
        <div key={q.id} className="rounded-xl border border-border bg-foreground/5 p-4">
          <div className="text-sm mb-3">
            <span className="text-muted-foreground/70 mr-2">{idx + 1}.</span>{q.text}
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: v }))}
                className={`flex-1 py-2 rounded-lg text-sm border transition ${
                  answers[q.id] === v
                    ? "bg-amber-glow text-primary-foreground border-amber-glow"
                    : "bg-foreground/5 text-foreground/75 border-border hover:bg-foreground/10"
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

function areaToTag(area: string): PlanItem["tag"] {
  const a = area || "";
  if (/健|身|运动|睡|饮|休/.test(a)) return "健康";
  if (/学|读|英语|english/i.test(a)) return "学习";
  if (/反思|复盘|记录|手帐|日记/.test(a)) return "生活";
  if (/社|朋友|交往/.test(a)) return "生活";
  if (/计划|专注|工作|项目|效率/.test(a)) return "工作";
  return "习惯";
}

function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// 兼容新旧两种 content 结构
function planContent(plan: any): {
  diagnosis?: string;
  weekly_hours?: number;
  horizon_days?: number;
  review_questions?: string[];
  items: any[];
  report?: any;
  research_meta?: any;
} {
  const c = plan?.content;
  if (Array.isArray(c)) return { items: c, horizon_days: 7 };
  if (c && Array.isArray(c.items)) {
    return {
      diagnosis: c.diagnosis,
      weekly_hours: c.weekly_hours,
      horizon_days: c.horizon_days ?? 28,
      review_questions: c.review_questions,
      items: c.items,
      report: c.report,
      research_meta: c.research_meta,
    };
  }
  return { items: [] };
}

// 解析 "周一/三/五 07:00" / "工作日 12:30" / "每天 22:30" 等
const WEEKDAY_MAP: Record<string, number> = {
  日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
};
function parseWhen(when: string): { weekdays: number[]; time?: string } {
  const w = when || "";
  const timeMatch = w.match(/(\d{1,2})[:：](\d{2})/);
  const time = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : undefined;
  let weekdays: number[] = [];
  if (/每天|daily/i.test(w)) weekdays = [0, 1, 2, 3, 4, 5, 6];
  else if (/工作日|weekday/i.test(w)) weekdays = [1, 2, 3, 4, 5];
  else if (/周末|weekend/i.test(w)) weekdays = [0, 6];
  else {
    const re = /周\s*([一二三四五六日])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(w))) weekdays.push(WEEKDAY_MAP[m[1]]);
    // 处理 "周一/三/五" 这种简写
    const compact = w.match(/周\s*([一二三四五六日](?:[\/、]\s*[一二三四五六日])+)/);
    if (compact) {
      compact[1].split(/[\/、]\s*/).forEach((c) => {
        const d = WEEKDAY_MAP[c];
        if (typeof d === "number" && !weekdays.includes(d)) weekdays.push(d);
      });
    }
  }
  if (weekdays.length === 0) weekdays = [1, 3, 5]; // 兜底
  return { weekdays: Array.from(new Set(weekdays)), time };
}

function planToScheduleItems(plan: any): PlanItem[] {
  const { items, horizon_days, review_questions } = planContent(plan);
  const horizon = horizon_days ?? 28;
  const today = todayLocal();
  const [yy, mm, dd] = today.split("-").map(Number);
  const startDow = new Date(yy, mm - 1, dd).getDay();
  const out: PlanItem[] = [];

  for (const it of items) {
    const area = String(it?.area ?? "成长");
    const tag = areaToTag(area);
    const actions: any[] = Array.isArray(it?.actions) ? it.actions : [];

    for (const a of actions) {
      // 新格式：action 是对象；旧格式：字符串
      if (typeof a === "string") {
        for (let off = 0; off < 7; off++) {
          out.push({ type: "todo", title: `${area}: ${a}`.slice(0, 40), date: addDaysISO(today, off), tag, note: it?.goal });
        }
        continue;
      }
      const title = `${area}: ${a.title ?? "动作"}`.slice(0, 40);
      const { weekdays, time } = parseWhen(String(a.when ?? ""));
      const duration = Number(a.durationMin) || 25;
      for (let off = 0; off < horizon; off++) {
        const dow = (startDow + off) % 7;
        if (!weekdays.includes(dow)) continue;
        const date = addDaysISO(today, off);
        if (time) {
          out.push({ type: "event", title, date, time, durationMin: duration, tag, note: a.note });
        } else {
          out.push({ type: "todo", title, date, tag, note: a.note });
        }
      }
    }

    // 里程碑作为提醒
    const milestones: any[] = Array.isArray(it?.milestones) ? it.milestones : [];
    for (const ms of milestones) {
      const week = Number(ms?.week) || 1;
      const offset = Math.min(horizon - 1, week * 7 - 1);
      out.push({
        type: "reminder",
        title: `里程碑·${area} W${week}`,
        date: addDaysISO(today, offset),
        time: "20:30",
        tag,
        note: String(ms?.target ?? "").slice(0, 200),
      });
    }
  }

  // 每周复盘
  const reviewNote = (review_questions ?? []).slice(0, 3).join(" / ");
  const weeks = Math.max(1, Math.ceil(horizon / 7));
  for (let w = 1; w <= weeks; w++) {
    const sundayOffset = (7 - startDow) % 7 || 7;
    const date = addDaysISO(today, sundayOffset + (w - 1) * 7);
    out.push({
      type: "reminder",
      title: `W${w} 周复盘`,
      date,
      time: "21:00",
      tag: "生活",
      note: reviewNote || "回顾本周节奏 + 调整下周难度",
    });
  }

  return out;
}

function PlanPanel({ plans, onRefresh }: { plans: any[]; onRefresh: () => void }) {
  const generate = useServerFn(generateMyAbilityPlan);
  const research = useServerFn(researchAbilityPlan);
  const { addItemsPending } = useSylva();
  const qc = useQueryClient();
  const [intent, setIntent] = useState("");
  const [weeklyHours, setWeeklyHours] = useState(6);
  const [horizonDays, setHorizonDays] = useState(28);

  // 阶段提示动画
  const RESEARCH_PHASES = [
    "正在拆解你的目标 → 设计搜索词…",
    "搜小红书：达人们的真实作息…",
    "搜抖音：一日 vlog 与时间表…",
    "搜知乎 / B 站：方法论与避坑指南…",
    "综合分析：提取共识与典型时间轴…",
    "对齐你的画像 + 行为数据，生成专属计划…",
  ];
  const [phaseIdx, setPhaseIdx] = useState(0);

  const mut = useMutation({
    mutationFn: () => generate({ data: { intent: intent.trim() || undefined, weeklyHours, horizonDays } }),
    onSuccess: () => {
      toast.success("已生成新计划");
      qc.invalidateQueries({ queryKey: ["ability-profile"] });
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "生成失败"),
  });

  const deepMut = useMutation({
    mutationFn: () => research({ data: { intent: intent.trim(), weeklyHours, horizonDays } }),
    onSuccess: (r: any) => {
      toast.success(`深度研究完成 · 综合了 ${r?.source_count ?? 0} 个来源`);
      qc.invalidateQueries({ queryKey: ["ability-profile"] });
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "深度研究失败"),
  });

  useEffect(() => {
    if (!deepMut.isPending) { setPhaseIdx(0); return; }
    const t = setInterval(() => setPhaseIdx((i) => Math.min(i + 1, RESEARCH_PHASES.length - 1)), 2400);
    return () => clearInterval(t);
  }, [deepMut.isPending]);

  const addToSchedule = (p: any) => {
    const items = planToScheduleItems(p);
    if (items.length === 0) {
      toast.error("这份计划没有可加入的动作");
      return;
    }
    const ids = addItemsPending(items);
    toast.success(`已加入 ${ids.length} 条到未来 ${planContent(p).horizon_days ?? 28} 天日程`, {
      description: "前往「日程」查看并确认",
    });
  };

  const busy = mut.isPending || deepMut.isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-foreground/5 p-4 space-y-3">
        <div>
          <div className="text-sm font-medium">告诉我你这轮想聚焦什么</div>
          <div className="text-muted-foreground text-xs mt-0.5">越具体越精准：考试 / 项目截止 / 想改善的状态 / 限制条件</div>
        </div>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value.slice(0, 500))}
          placeholder="例：6 月底前完成产品 v1 发布，平时晚上和周末有时间，最近睡眠很差想同步改善"
          className="w-full min-h-[72px] resize-y rounded-lg bg-background/60 border border-border p-3 text-sm outline-none focus:border-amber-glow/60"
        />
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-1.5">
            周投入
            <select
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(Number(e.target.value))}
              className="bg-background/60 border border-border rounded px-2 py-1 text-foreground"
            >
              {[3, 5, 6, 8, 10, 12, 15].map((h) => <option key={h} value={h}>{h} 小时</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            周期
            <select
              value={horizonDays}
              onChange={(e) => setHorizonDays(Number(e.target.value))}
              className="bg-background/60 border border-border rounded px-2 py-1 text-foreground"
            >
              {[14, 21, 28, 42].map((d) => <option key={d} value={d}>{d} 天</option>)}
            </select>
          </label>
          <div className="ml-auto flex items-center gap-2">
            <Button
              onClick={() => mut.mutate()}
              disabled={busy}
              variant="outline"
              className="border-border bg-foreground/5 hover:bg-foreground/10"
            >
              <Sparkles className={`w-4 h-4 mr-2 ${mut.isPending ? "animate-pulse" : ""}`} /> {mut.isPending ? "规划中…" : "快速生成"}
            </Button>
            <Button
              onClick={() => {
                if (!intent.trim()) { toast.error("深度研究需要你先描述目标"); return; }
                deepMut.mutate();
              }}
              disabled={busy}
              className="bg-amber-glow text-primary-foreground hover:bg-amber-glow/90"
              title="联网调研小红书 / 抖音 / 知乎 / B站，综合出研究报告 + 计划"
            >
              <Telescope className={`w-4 h-4 mr-2 ${deepMut.isPending ? "animate-pulse" : ""}`} />
              {deepMut.isPending ? "深度研究中…" : "深度研究 + 计划"}
            </Button>
          </div>
        </div>
        {deepMut.isPending && (
          <div className="rounded-lg border border-amber-glow/30 bg-amber-glow/5 p-3 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-glow animate-pulse shrink-0" />
            <div className="text-xs text-foreground/80 leading-relaxed">
              <div className="font-medium text-amber-glow mb-0.5">Agent 工作中</div>
              <div>{RESEARCH_PHASES[phaseIdx]}</div>
            </div>
          </div>
        )}
      </div>


      {plans.length === 0 && (
        <div className="rounded-xl border border-border bg-foreground/5 p-8 text-center text-muted-foreground text-sm">还没有计划，告诉我你想聚焦什么，然后生成第一份。</div>
      )}

      {plans.map((p) => {
        const c = planContent(p);
        return (
          <div key={p.id} className={`rounded-xl border p-5 ${p.status === "active" ? "border-amber-glow/30 bg-amber-glow/5" : "border-border bg-foreground/5"}`}>
            <div className="flex items-start justify-between mb-1 gap-3">
              <div className="min-w-0">
                <div className="font-display text-lg">{p.title}</div>
                <div className="text-muted-foreground text-sm">{p.tagline}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addToSchedule(p)}
                  className="border-amber-glow/40 text-amber-glow hover:bg-amber-glow/10 hover:text-amber-glow"
                >
                  <CalendarPlus className="w-3.5 h-3.5 mr-1.5" />
                  一键加入日程
                </Button>
                <span className={`text-xs px-2 py-0.5 rounded ${p.status === "active" ? "bg-amber-glow text-primary-foreground" : "bg-foreground/10 text-muted-foreground"}`}>
                  {p.status === "active" ? "进行中" : "已归档"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 mt-2 mb-3">
              {(p.focus_areas ?? []).map((a: string) => (
                <span key={a} className="text-xs px-2 py-0.5 rounded bg-foreground/10 text-foreground/75">{a}</span>
              ))}
              {c.weekly_hours && <span className="text-xs px-2 py-0.5 rounded bg-foreground/10 text-foreground/75">{c.weekly_hours}h/周</span>}
              {c.horizon_days && <span className="text-xs px-2 py-0.5 rounded bg-foreground/10 text-foreground/75">{c.horizon_days} 天</span>}
            </div>

            {c.diagnosis && (
              <div className="rounded-lg bg-background/50 border border-border p-3 mb-3">
                <div className="text-[11px] uppercase tracking-wide text-amber-glow/80 mb-1">诊断</div>
                <div className="text-sm text-foreground/85 leading-relaxed">{c.diagnosis}</div>
              </div>
            )}

            {c.report && <ResearchReportCard report={c.report} meta={c.research_meta} />}


            <div className="space-y-3">
              {c.items.map((item: any, idx: number) => (
                <div key={idx} className="rounded-lg bg-background/50 border border-border p-3 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-medium text-amber-glow">{item.area}</div>
                    {item.kpi && <div className="text-[11px] text-muted-foreground shrink-0">KPI · {item.kpi}</div>}
                  </div>
                  {item.why && <div className="text-xs text-foreground/65 italic">{item.why}</div>}
                  <div className="text-sm text-foreground/85">{item.goal}</div>
                  <ul className="space-y-1">
                    {(item.actions ?? []).map((a: any, i: number) => (
                      <li key={i} className="text-xs text-foreground/80 flex gap-2">
                        <span className="text-amber-glow">·</span>
                        {typeof a === "string" ? a : (
                          <span>
                            <span className="text-foreground/90">{a.title}</span>
                            {a.when && <span className="text-muted-foreground"> — {a.when}</span>}
                            {a.durationMin && <span className="text-muted-foreground"> · {a.durationMin}min</span>}
                            {a.note && <span className="text-foreground/55"> · {a.note}</span>}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {Array.isArray(item.milestones) && item.milestones.length > 0 && (
                    <div className="pt-1 border-t border-border/60">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1">里程碑</div>
                      <ul className="space-y-0.5">
                        {item.milestones.map((ms: any, i: number) => (
                          <li key={i} className="text-xs text-foreground/75">W{ms.week} · {ms.target}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(item.pitfalls) && item.pitfalls.length > 0 && (
                    <div className="pt-1 border-t border-border/60">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1">避坑</div>
                      <ul className="space-y-0.5">
                        {item.pitfalls.map((pf: string, i: number) => (
                          <li key={i} className="text-xs text-foreground/70">⚠ {pf}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {item.cadence && <div className="text-[11px] text-muted-foreground/70">节奏：{item.cadence}</div>}
                </div>
              ))}
            </div>

            {Array.isArray(c.review_questions) && c.review_questions.length > 0 && (
              <div className="mt-3 rounded-lg bg-background/40 border border-border/60 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1">每周复盘问自己</div>
                <ul className="space-y-0.5">
                  {c.review_questions.map((q, i) => <li key={i} className="text-xs text-foreground/75">· {q}</li>)}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResearchReportCard({ report, meta }: { report: any; meta?: any }) {
  const [open, setOpen] = useState(true);
  const sources: any[] = Array.isArray(report?.sources) ? report.sources : [];
  const timeline: any[] = Array.isArray(report?.daily_timeline) ? report.daily_timeline : [];
  const consensus: string[] = Array.isArray(report?.consensus) ? report.consensus : [];
  const best: any[] = Array.isArray(report?.best_practices) ? report.best_practices : [];
  const mistakes: string[] = Array.isArray(report?.common_mistakes) ? report.common_mistakes : [];
  const beginner: string[] = Array.isArray(report?.beginner_path) ? report.beginner_path : [];

  return (
    <div className="rounded-lg border border-amber-glow/30 bg-gradient-to-br from-amber-glow/10 to-background/40 p-3 mb-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2 text-left">
        <div className="flex items-center gap-2">
          <Telescope className="w-4 h-4 text-amber-glow" />
          <span className="text-sm font-medium text-amber-glow">深度研究报告</span>
          {meta?.source_count != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-glow/15 text-amber-glow/80">综合 {meta.source_count} 源</span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">{open ? "收起" : "展开"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {report.scope && <div className="text-xs text-foreground/75 italic">{report.scope}</div>}
          {consensus.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-amber-glow/80 mb-1 flex items-center gap-1"><Lightbulb className="w-3 h-3" /> 跨源共识</div>
              <ul className="grid sm:grid-cols-2 gap-x-3 gap-y-1">
                {consensus.map((c, i) => <li key={i} className="text-xs text-foreground/80">· {c}</li>)}
              </ul>
            </div>
          )}
          {timeline.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-amber-glow/80 mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" /> 一日典型时间轴</div>
              <div className="space-y-1">
                {timeline.map((t, i) => (
                  <div key={i} className="grid grid-cols-[64px_1fr] gap-2 text-xs">
                    <div className="text-amber-glow/90 font-mono">{t.time}</div>
                    <div>
                      <span className="text-foreground/90">{t.activity}</span>
                      {t.rationale && <span className="text-foreground/55"> — {t.rationale}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {best.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-amber-glow/80 mb-1">最佳实践</div>
              <ul className="space-y-1">
                {best.map((b, i) => (
                  <li key={i} className="text-xs text-foreground/80">
                    <span className="text-foreground/95 font-medium">{b.title}</span>
                    {b.detail && <span className="text-foreground/65"> · {b.detail}</span>}
                    {b.source_hint && <span className="text-amber-glow/70"> · {b.source_hint}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {beginner.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-amber-glow/80 mb-1">0 起步路径</div>
              <ol className="space-y-0.5 list-decimal list-inside">
                {beginner.map((s, i) => <li key={i} className="text-xs text-foreground/80">{s}</li>)}
              </ol>
            </div>
          )}
          {mistakes.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-amber-glow/80 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> 常见踩坑</div>
              <ul className="space-y-0.5">
                {mistakes.map((m, i) => <li key={i} className="text-xs text-foreground/75">⚠ {m}</li>)}
              </ul>
            </div>
          )}
          {sources.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-amber-glow/80 mb-1">参考来源</div>
              <ul className="space-y-1">
                {sources.map((s, i) => (
                  <li key={i} className="text-xs">
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-foreground/85 hover:text-amber-glow inline-flex items-start gap-1 group">
                      <span className="text-amber-glow/70 shrink-0">[{s.platform}]</span>
                      <span className="underline decoration-dotted decoration-foreground/30 group-hover:decoration-amber-glow">{s.title}</span>
                      <ExternalLink className="w-3 h-3 mt-0.5 text-muted-foreground/60 group-hover:text-amber-glow shrink-0" />
                    </a>
                    {s.takeaway && <div className="text-foreground/55 pl-4">{s.takeaway}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
