
-- Shared updated_at trigger (already exists in this DB)
-- public.update_updated_at_column()

-- schedule_items
CREATE TABLE public.schedule_items (
  id text PRIMARY KEY,
  type text NOT NULL,
  title text NOT NULL,
  date text,
  time text,
  duration_min integer,
  tag text,
  note text,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedule_items public read"   ON public.schedule_items FOR SELECT USING (true);
CREATE POLICY "schedule_items public insert" ON public.schedule_items FOR INSERT WITH CHECK (true);
CREATE POLICY "schedule_items public update" ON public.schedule_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "schedule_items public delete" ON public.schedule_items FOR DELETE USING (true);
CREATE TRIGGER trg_schedule_items_updated_at BEFORE UPDATE ON public.schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.schedule_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_items;

-- notes
CREATE TABLE public.notes (
  id text PRIMARY KEY,
  text text NOT NULL DEFAULT '',
  mood text,
  tags text[] NOT NULL DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false,
  images text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes public read"   ON public.notes FOR SELECT USING (true);
CREATE POLICY "notes public insert" ON public.notes FOR INSERT WITH CHECK (true);
CREATE POLICY "notes public update" ON public.notes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "notes public delete" ON public.notes FOR DELETE USING (true);
CREATE TRIGGER trg_notes_updated_at BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.notes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;

-- habits
CREATE TABLE public.habits (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  emoji text NOT NULL DEFAULT '✨',
  history text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "habits public read"   ON public.habits FOR SELECT USING (true);
CREATE POLICY "habits public insert" ON public.habits FOR INSERT WITH CHECK (true);
CREATE POLICY "habits public update" ON public.habits FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "habits public delete" ON public.habits FOR DELETE USING (true);
CREATE TRIGGER trg_habits_updated_at BEFORE UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.habits REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.habits;

-- diary_entries
CREATE TABLE public.diary_entries (
  date text PRIMARY KEY,
  content text NOT NULL DEFAULT '',
  mood text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diary public read"   ON public.diary_entries FOR SELECT USING (true);
CREATE POLICY "diary public insert" ON public.diary_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "diary public update" ON public.diary_entries FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "diary public delete" ON public.diary_entries FOR DELETE USING (true);
CREATE TRIGGER trg_diary_updated_at BEFORE UPDATE ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.diary_entries REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.diary_entries;

-- comics (today's comic per date)
CREATE TABLE public.comics (
  date text PRIMARY KEY,
  image_url text NOT NULL,
  provider text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comics public read"   ON public.comics FOR SELECT USING (true);
CREATE POLICY "comics public insert" ON public.comics FOR INSERT WITH CHECK (true);
CREATE POLICY "comics public update" ON public.comics FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "comics public delete" ON public.comics FOR DELETE USING (true);
CREATE TRIGGER trg_comics_updated_at BEFORE UPDATE ON public.comics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.comics REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comics;
