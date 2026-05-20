-- 1) 飞书同步设置（单用户开发模式，只有一行）
CREATE TABLE public.feishu_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selected_calendar_id TEXT,
  selected_calendar_name TEXT,
  direction TEXT NOT NULL DEFAULT 'two-way' CHECK (direction IN ('two-way','push-only')),
  last_sync_at TIMESTAMPTZ,
  page_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) 本地条目 ↔ 飞书事件 映射
CREATE TABLE public.feishu_event_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id TEXT NOT NULL,
  feishu_event_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  last_pushed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(local_id),
  UNIQUE(calendar_id, feishu_event_id)
);

CREATE INDEX idx_feishu_event_map_event ON public.feishu_event_map(feishu_event_id);

-- 3) Webhook 事件去重
CREATE TABLE public.feishu_webhook_dedup (
  uuid TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 触发器
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_feishu_settings_updated
BEFORE UPDATE ON public.feishu_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 启用 RLS，但不创建任何策略 —— 只允许服务端（service role）访问
ALTER TABLE public.feishu_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feishu_event_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feishu_webhook_dedup ENABLE ROW LEVEL SECURITY;

-- 初始化设置行
INSERT INTO public.feishu_settings (direction) VALUES ('two-way');