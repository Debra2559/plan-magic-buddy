
-- 1. Role enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. has_role / is_admin
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role);
$$;

-- 4. RLS for user_roles
DROP POLICY IF EXISTS "user_roles self read" ON public.user_roles;
CREATE POLICY "user_roles self read" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "user_roles admin write" ON public.user_roles;
CREATE POLICY "user_roles admin write" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5. Seed admin for the existing user
INSERT INTO public.user_roles (user_id, role)
SELECT '0b1a36b0-4fa3-406a-a405-bc2a07e3ea73'::uuid, 'admin'::public.app_role
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '0b1a36b0-4fa3-406a-a405-bc2a07e3ea73')
ON CONFLICT DO NOTHING;

-- 6. Add admin policies to user-data tables (admins can read/modify all)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['schedule_items','notes','diary_entries','comics','habits','canvas_documents','user_profiles','user_profile_history'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin all read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "admin all read" ON public.%I FOR SELECT TO authenticated USING (public.is_admin(auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin all update" ON public.%I', t);
    EXECUTE format('CREATE POLICY "admin all update" ON public.%I FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin all delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "admin all delete" ON public.%I FOR DELETE TO authenticated USING (public.is_admin(auth.uid()))', t);
  END LOOP;
END $$;

-- 7. Enable RLS + admin-only policies on singleton/global settings tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['ai_news_settings','ai_news','hackathon_settings','hackathons','feishu_settings','feishu_webhook_logs','daily_recaps','legacy_claim_state','feishu_event_map','feishu_webhook_dedup'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin manage" ON public.%I', t);
    EXECUTE format('CREATE POLICY "admin manage" ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))', t);
  END LOOP;
END $$;

-- 8. Patch handle_new_user to also grant default 'user' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_claimed uuid;
BEGIN
  INSERT INTO public.user_profiles (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user'::public.app_role)
  ON CONFLICT DO NOTHING;

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
$function$;
