
-- ========== 1. user_profiles ==========
CREATE TABLE public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '主人',
  persona_prompt text NOT NULL DEFAULT '你是我的私人 AI 助理。说话风格：幽默搞笑、贱贱的但很专业，敢吐槽我但不能人身攻击，偶尔用网络梗但别太频繁。称呼我为「主人」。',
  humor_level int NOT NULL DEFAULT 4 CHECK (humor_level BETWEEN 1 AND 5),
  sass_level int NOT NULL DEFAULT 3 CHECK (sass_level BETWEEN 1 AND 5),
  professional_level int NOT NULL DEFAULT 5 CHECK (professional_level BETWEEN 1 AND 5),
  verbosity_level int NOT NULL DEFAULT 3 CHECK (verbosity_level BETWEEN 1 AND 5),
  tone_examples text NOT NULL DEFAULT '',
  taboos text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile read" ON public.user_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own profile insert" ON public.user_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.user_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile delete" ON public.user_profiles
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== 2. legacy claim state ==========
CREATE TABLE public.legacy_claim_state (
  id text PRIMARY KEY DEFAULT 'singleton',
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz
);
INSERT INTO public.legacy_claim_state (id) VALUES ('singleton');

ALTER TABLE public.legacy_claim_state ENABLE ROW LEVEL SECURITY;
-- 不对客户端开放

-- ========== 3. 给业务表加 user_id ==========
ALTER TABLE public.schedule_items ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notes          ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.habits         ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.diary_entries  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.comics         ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX idx_schedule_items_user ON public.schedule_items(user_id);
CREATE INDEX idx_notes_user          ON public.notes(user_id);
CREATE INDEX idx_habits_user         ON public.habits(user_id);
CREATE INDEX idx_diary_entries_user  ON public.diary_entries(user_id);
CREATE INDEX idx_comics_user         ON public.comics(user_id);

-- ========== 4. 重写 RLS ==========
-- 旧的 public open policies 删掉
DROP POLICY IF EXISTS "schedule_items public read"   ON public.schedule_items;
DROP POLICY IF EXISTS "schedule_items public insert" ON public.schedule_items;
DROP POLICY IF EXISTS "schedule_items public update" ON public.schedule_items;
DROP POLICY IF EXISTS "schedule_items public delete" ON public.schedule_items;

DROP POLICY IF EXISTS "notes public read"   ON public.notes;
DROP POLICY IF EXISTS "notes public insert" ON public.notes;
DROP POLICY IF EXISTS "notes public update" ON public.notes;
DROP POLICY IF EXISTS "notes public delete" ON public.notes;

DROP POLICY IF EXISTS "habits public read"   ON public.habits;
DROP POLICY IF EXISTS "habits public insert" ON public.habits;
DROP POLICY IF EXISTS "habits public update" ON public.habits;
DROP POLICY IF EXISTS "habits public delete" ON public.habits;

DROP POLICY IF EXISTS "diary public read"   ON public.diary_entries;
DROP POLICY IF EXISTS "diary public insert" ON public.diary_entries;
DROP POLICY IF EXISTS "diary public update" ON public.diary_entries;
DROP POLICY IF EXISTS "diary public delete" ON public.diary_entries;

DROP POLICY IF EXISTS "comics public read"   ON public.comics;
DROP POLICY IF EXISTS "comics public insert" ON public.comics;
DROP POLICY IF EXISTS "comics public update" ON public.comics;
DROP POLICY IF EXISTS "comics public delete" ON public.comics;

-- 通用模式：自己的行 OR 老的 NULL 行（兼容期）
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schedule_items','notes','habits','diary_entries','comics'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid() OR user_id IS NULL)', t || '_own_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())', t || '_own_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid() OR user_id IS NULL) WITH CHECK (user_id = auth.uid())', t || '_own_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid() OR user_id IS NULL)', t || '_own_delete', t);
  END LOOP;
END $$;

-- ========== 5. 注册时认领老数据 + 创建 profile ==========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed uuid;
BEGIN
  -- 1) 创建默认人设
  INSERT INTO public.user_profiles (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- 2) 认领老数据（第一个注册的用户拿到）
  SELECT claimed_by INTO v_claimed FROM public.legacy_claim_state WHERE id = 'singleton' FOR UPDATE;
  IF v_claimed IS NULL THEN
    UPDATE public.schedule_items SET user_id = NEW.id WHERE user_id IS NULL;
    UPDATE public.notes          SET user_id = NEW.id WHERE user_id IS NULL;
    UPDATE public.habits         SET user_id = NEW.id WHERE user_id IS NULL;
    UPDATE public.diary_entries  SET user_id = NEW.id WHERE user_id IS NULL;
    UPDATE public.comics         SET user_id = NEW.id WHERE user_id IS NULL;
    UPDATE public.legacy_claim_state
      SET claimed_by = NEW.id, claimed_at = now()
      WHERE id = 'singleton';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
