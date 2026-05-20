CREATE TABLE IF NOT EXISTS public.canvas_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('notes','journal')),
  data jsonb NOT NULL DEFAULT '{"items":[],"viewport":{"x":0,"y":0,"scale":1}}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_canvas_documents_user ON public.canvas_documents(user_id);

ALTER TABLE public.canvas_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canvas_own_read" ON public.canvas_documents
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "canvas_own_insert" ON public.canvas_documents
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "canvas_own_update" ON public.canvas_documents
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "canvas_own_delete" ON public.canvas_documents
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER trg_canvas_documents_updated_at
  BEFORE UPDATE ON public.canvas_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.canvas_documents REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.canvas_documents;