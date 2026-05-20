ALTER TABLE public.feishu_settings
  ADD COLUMN IF NOT EXISTS push_require_time boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_default_time text NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS push_allowed_types text[] NOT NULL DEFAULT ARRAY['event','reminder','todo']::text[],
  ADD COLUMN IF NOT EXISTS push_include_done boolean NOT NULL DEFAULT false;