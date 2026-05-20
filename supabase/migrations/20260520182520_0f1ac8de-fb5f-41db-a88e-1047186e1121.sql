
-- user_ability_profiles
CREATE TABLE public.user_ability_profiles (
  user_id uuid PRIMARY KEY,
  abilities jsonb NOT NULL DEFAULT '{"planning":50,"focus":50,"health":50,"creativity":50,"social":50,"reflection":50}'::jsonb,
  personality jsonb NOT NULL DEFAULT '{"openness":50,"conscientiousness":50,"extraversion":50,"agreeableness":50,"neuroticism":50,"summary":""}'::jsonb,
  strengths text[] NOT NULL DEFAULT '{}',
  growth_areas text[] NOT NULL DEFAULT '{}',
  tagline text NOT NULL DEFAULT '',
  initial_done boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_ability_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ability profile self" ON public.user_ability_profiles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "ability profile admin" ON public.user_ability_profiles FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE TRIGGER trg_ability_profile_updated BEFORE UPDATE ON public.user_ability_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ability_assessments
CREATE TABLE public.ability_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'initial',
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ability_assessments_user ON public.ability_assessments(user_id, created_at DESC);
ALTER TABLE public.ability_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assessments self" ON public.ability_assessments FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "assessments admin" ON public.ability_assessments FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- ability_plans
CREATE TABLE public.ability_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  tagline text NOT NULL DEFAULT '',
  focus_areas text[] NOT NULL DEFAULT '{}',
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ability_plans_user ON public.ability_plans(user_id, created_at DESC);
ALTER TABLE public.ability_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans self" ON public.ability_plans FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "plans admin" ON public.ability_plans FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE TRIGGER trg_ability_plans_updated BEFORE UPDATE ON public.ability_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
