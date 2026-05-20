
-- AI insights table
CREATE TABLE public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date text NOT NULL,
  slot text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  related jsonb DEFAULT '[]'::jsonb,
  priority integer NOT NULL DEFAULT 3,
  dismissed boolean NOT NULL DEFAULT false,
  pushed_feishu boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_insights_user_date ON public.ai_insights(user_id, date DESC);
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insights own read" ON public.ai_insights FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insights own insert" ON public.ai_insights FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "insights own update" ON public.ai_insights FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "insights own delete" ON public.ai_insights FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insights admin all" ON public.ai_insights FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Per-user settings
CREATE TABLE public.ai_insights_settings (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  slots text[] NOT NULL DEFAULT ARRAY['morning','noon','evening']::text[],
  push_feishu boolean NOT NULL DEFAULT false,
  scope text[] NOT NULL DEFAULT ARRAY['schedule','notes','habits','insights']::text[],
  lookback_days integer NOT NULL DEFAULT 2,
  last_generated_at timestamptz,
  last_slot text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_insights_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insights settings own" ON public.ai_insights_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "insights settings admin" ON public.ai_insights_settings FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER trg_ai_insights_settings_updated_at
  BEFORE UPDATE ON public.ai_insights_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
