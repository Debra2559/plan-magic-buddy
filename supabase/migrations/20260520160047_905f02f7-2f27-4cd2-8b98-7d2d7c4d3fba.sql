ALTER TABLE public.feishu_settings
  ADD COLUMN IF NOT EXISTS user_access_token text,
  ADD COLUMN IF NOT EXISTS user_refresh_token text,
  ADD COLUMN IF NOT EXISTS user_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_refresh_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_open_id text,
  ADD COLUMN IF NOT EXISTS user_name text,
  ADD COLUMN IF NOT EXISTS user_scope text;