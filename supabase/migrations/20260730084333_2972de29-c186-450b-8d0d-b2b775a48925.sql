CREATE TABLE public.content_ideas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  title TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT '通用',
  angle TEXT,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'inbox',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_ideas TO authenticated;
GRANT ALL ON public.content_ideas TO service_role;
ALTER TABLE public.content_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own content_ideas" ON public.content_ideas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER content_ideas_updated_at BEFORE UPDATE ON public.content_ideas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.content_pieces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  idea_id UUID REFERENCES public.content_ideas(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT '通用',
  stage TEXT NOT NULL DEFAULT 'idea',
  publish_date TEXT,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  link TEXT,
  stage_schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_pieces TO authenticated;
GRANT ALL ON public.content_pieces TO service_role;
ALTER TABLE public.content_pieces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own content_pieces" ON public.content_pieces FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER content_pieces_updated_at BEFORE UPDATE ON public.content_pieces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();