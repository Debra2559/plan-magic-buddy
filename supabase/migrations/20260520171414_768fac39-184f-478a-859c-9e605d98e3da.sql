-- 1) 增加 version 字段（用于乐观并发控制）
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- 2) 触发器：每次 UPDATE 自动 +1，并刷新 updated_at
CREATE OR REPLACE FUNCTION public.user_profiles_bump_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_bump_version ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_bump_version
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.user_profiles_bump_version();