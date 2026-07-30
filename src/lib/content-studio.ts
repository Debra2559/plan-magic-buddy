import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const CONTENT_PLATFORMS = [
  "通用", "小红书", "抖音", "B站", "公众号", "知乎", "视频号", "X/Twitter", "YouTube",
] as const;

export type ContentStage = "idea" | "script" | "produce" | "edit" | "scheduled" | "published";

export const CONTENT_STAGES: { key: ContentStage; label: string; hint: string; emoji: string }[] = [
  { key: "idea", label: "选题确定", hint: "定方向、定钩子", emoji: "💡" },
  { key: "script", label: "脚本/大纲", hint: "写稿、列结构", emoji: "📝" },
  { key: "produce", label: "拍摄/制作", hint: "拍摄、录音、配图", emoji: "🎬" },
  { key: "edit", label: "剪辑/成稿", hint: "剪辑、排版、封面", emoji: "✂️" },
  { key: "scheduled", label: "待发布", hint: "定档、预约发布", emoji: "📅" },
  { key: "published", label: "已发布", hint: "复盘数据", emoji: "🚀" },
];

export interface ContentIdea {
  id: string;
  title: string;
  platform: string;
  angle?: string;
  notes?: string;
  tags: string[];
  score: number;
  status: "inbox" | "picked" | "archived";
  createdAt: string;
}

export interface ContentPiece {
  id: string;
  ideaId?: string;
  title: string;
  platform: string;
  stage: ContentStage;
  publishDate?: string;
  notes?: string;
  tags: string[];
  link?: string;
  /** stage -> 关联的日程条目 id */
  stageSchedule: Partial<Record<ContentStage, string>>;
  metrics: Record<string, number>;
  createdAt: string;
}

const ideaFrom = (r: any): ContentIdea => ({
  id: r.id,
  title: r.title,
  platform: r.platform,
  angle: r.angle ?? undefined,
  notes: r.notes ?? undefined,
  tags: r.tags ?? [],
  score: r.score ?? 3,
  status: r.status ?? "inbox",
  createdAt: r.created_at,
});

const pieceFrom = (r: any): ContentPiece => ({
  id: r.id,
  ideaId: r.idea_id ?? undefined,
  title: r.title,
  platform: r.platform,
  stage: (r.stage ?? "idea") as ContentStage,
  publishDate: r.publish_date ?? undefined,
  notes: r.notes ?? undefined,
  tags: r.tags ?? [],
  link: r.link ?? undefined,
  stageSchedule: (r.stage_schedule ?? {}) as ContentPiece["stageSchedule"],
  metrics: (r.metrics ?? {}) as Record<string, number>,
  createdAt: r.created_at,
});

export function useContentIdeas() {
  const [items, setItems] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("content_ideas").select("*")
      .order("score", { ascending: false })
      .order("created_at", { ascending: false });
    setItems((data ?? []).map(ideaFrom));
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void reload(); });
    return () => sub.subscription.unsubscribe();
  }, [reload]);

  const add = useCallback(async (v: Partial<ContentIdea> & { title: string }) => {
    const { data } = await supabase.from("content_ideas").insert({
      title: v.title,
      platform: v.platform ?? "通用",
      angle: v.angle ?? null,
      notes: v.notes ?? null,
      tags: v.tags ?? [],
      score: v.score ?? 3,
      status: v.status ?? "inbox",
    }).select().single();
    if (data) { const i = ideaFrom(data); setItems((xs) => [i, ...xs]); return i; }
    return null;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<ContentIdea>) => {
    const p: any = {};
    if (patch.title !== undefined) p.title = patch.title;
    if (patch.platform !== undefined) p.platform = patch.platform;
    if (patch.angle !== undefined) p.angle = patch.angle;
    if (patch.notes !== undefined) p.notes = patch.notes;
    if (patch.tags !== undefined) p.tags = patch.tags;
    if (patch.score !== undefined) p.score = patch.score;
    if (patch.status !== undefined) p.status = patch.status;
    const { data } = await supabase.from("content_ideas").update(p).eq("id", id).select().single();
    if (data) setItems((xs) => xs.map((x) => (x.id === id ? ideaFrom(data) : x)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await supabase.from("content_ideas").delete().eq("id", id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  return { items, loading, add, update, remove, reload };
}

export function useContentPieces() {
  const [items, setItems] = useState<ContentPiece[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("content_pieces").select("*").order("created_at", { ascending: false });
    setItems((data ?? []).map(pieceFrom));
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void reload(); });
    return () => sub.subscription.unsubscribe();
  }, [reload]);

  const add = useCallback(async (v: Partial<ContentPiece> & { title: string }) => {
    const { data } = await supabase.from("content_pieces").insert({
      title: v.title,
      platform: v.platform ?? "通用",
      stage: v.stage ?? "idea",
      idea_id: v.ideaId ?? null,
      publish_date: v.publishDate ?? null,
      notes: v.notes ?? null,
      tags: v.tags ?? [],
      link: v.link ?? null,
    }).select().single();
    if (data) { const p = pieceFrom(data); setItems((xs) => [p, ...xs]); return p; }
    return null;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<ContentPiece>) => {
    const p: any = {};
    if (patch.title !== undefined) p.title = patch.title;
    if (patch.platform !== undefined) p.platform = patch.platform;
    if (patch.stage !== undefined) p.stage = patch.stage;
    if (patch.publishDate !== undefined) p.publish_date = patch.publishDate;
    if (patch.notes !== undefined) p.notes = patch.notes;
    if (patch.tags !== undefined) p.tags = patch.tags;
    if (patch.link !== undefined) p.link = patch.link;
    if (patch.stageSchedule !== undefined) p.stage_schedule = patch.stageSchedule;
    if (patch.metrics !== undefined) p.metrics = patch.metrics;
    const { data } = await supabase.from("content_pieces").update(p).eq("id", id).select().single();
    if (data) setItems((xs) => xs.map((x) => (x.id === id ? pieceFrom(data) : x)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await supabase.from("content_pieces").delete().eq("id", id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  return { items, loading, add, update, remove, reload };
}

export const todayStr = () => new Date().toLocaleDateString("sv-SE");
export const shiftDate = (base: string, days: number) => {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE");
};
