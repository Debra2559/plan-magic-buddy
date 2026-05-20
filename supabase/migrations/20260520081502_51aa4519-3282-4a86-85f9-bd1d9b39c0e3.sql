ALTER TABLE public.feishu_settings
  ADD COLUMN IF NOT EXISTS daily_recap_done_dates text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS daily_recap_last_followup_date text;