ALTER TABLE public.feishu_settings
  ADD COLUMN IF NOT EXISTS daily_recap_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_recap_hour integer NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS daily_recap_last_sent_date text;