-- AI 记忆表：保存 AI 对用户的长期记忆，会被注入到对话 / 洞察 / 飞书回复的 system prompt
CREATE TABLE IF NOT EXISTS public.ai_memories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  content      text NOT NULL,
  kind         text NOT NULL DEFAULT 'fact',         -- fact | preference | relation | goal | routine | other
  source       text NOT NULL DEFAULT 'manual',       -- manual | ai | feishu | insight | recap | note
  status       text NOT NULL DEFAULT 'active',       -- pending | active | archived
  pinned       boolean NOT NULL DEFAULT false,
  importance   integer NOT NULL DEFAULT 3,           -- 1..5
  tags         text[] NOT NULL DEFAULT '{}',
  context      text NOT NULL DEFAULT '',             -- 提取来源的简短上下文（可空）
  source_ref   text,                                  -- 比如 note_id / chat_id，便于追溯
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_memories_user_status_idx
  ON public.ai_memories (user_id, status, pinned DESC, importance DESC, updated_at DESC);

ALTER TABLE public.ai_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memories self"
  ON public.ai_memories
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "memories admin"
  ON public.ai_memories
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER ai_memories_set_updated_at
  BEFORE UPDATE ON public.ai_memories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
