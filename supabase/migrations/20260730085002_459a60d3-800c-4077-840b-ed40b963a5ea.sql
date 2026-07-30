ALTER TABLE public.content_pieces ADD COLUMN IF NOT EXISTS medium text NOT NULL DEFAULT 'article';
ALTER TABLE public.content_ideas ADD COLUMN IF NOT EXISTS medium text NOT NULL DEFAULT 'article';