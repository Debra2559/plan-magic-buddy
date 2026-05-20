ALTER TABLE public.feishu_settings
  ADD COLUMN IF NOT EXISTS notify_receive_id text,
  ADD COLUMN IF NOT EXISTS notify_receive_id_type text NOT NULL DEFAULT 'open_id',
  ADD COLUMN IF NOT EXISTS notify_on_discover boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_accept boolean NOT NULL DEFAULT true;