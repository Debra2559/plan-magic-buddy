
CREATE TABLE public.habit_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  images TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX habit_checkins_user_habit_idx ON public.habit_checkins(user_id, habit_id, date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_checkins TO authenticated;
GRANT ALL ON public.habit_checkins TO service_role;
ALTER TABLE public.habit_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "habit_checkins self" ON public.habit_checkins FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "habit_checkins admin" ON public.habit_checkins FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER habit_checkins_updated_at BEFORE UPDATE ON public.habit_checkins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
