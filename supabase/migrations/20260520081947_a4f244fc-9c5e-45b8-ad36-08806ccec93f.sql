ALTER TABLE public.feishu_settings
  ADD COLUMN IF NOT EXISTS daily_recap_timezone text NOT NULL DEFAULT 'Asia/Shanghai';