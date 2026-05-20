
CREATE TABLE IF NOT EXISTS public.daily_recaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date text NOT NULL UNIQUE,
  summary text,
  diary text,
  mood text,
  source text NOT NULL DEFAULT 'feishu_card',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_recaps ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_daily_recaps_updated_at
BEFORE UPDATE ON public.daily_recaps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
