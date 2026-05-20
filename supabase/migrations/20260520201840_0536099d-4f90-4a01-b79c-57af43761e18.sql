ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'log';
CREATE INDEX IF NOT EXISTS notes_user_kind_idx ON public.notes (user_id, kind);