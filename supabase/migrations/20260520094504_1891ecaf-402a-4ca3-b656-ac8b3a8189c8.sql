CREATE TABLE IF NOT EXISTS public.ai_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  url text NOT NULL UNIQUE,
  title text NOT NULL,
  published_at text,
  summary text,
  tags text[] DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'pending',
  raw jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_news_status_idx
  ON public.ai_news (status, discovered_at DESC);

ALTER TABLE public.ai_news ENABLE ROW LEVEL SECURITY;