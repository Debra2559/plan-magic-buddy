
CREATE TABLE public.follow_ups (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL,
  notes text,
  prerequisite text,
  prerequisite_id text,
  linked_item_id text,
  ddl text,
  remind_before_days integer NOT NULL DEFAULT 3,
  interval_hours numeric NOT NULL DEFAULT 24,
  last_asked_at bigint,
  snooze_until bigint,
  created_at_ms bigint NOT NULL,
  done boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX follow_ups_user_idx ON public.follow_ups (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follow_ups self read" ON public.follow_ups
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "follow_ups self insert" ON public.follow_ups
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "follow_ups self update" ON public.follow_ups
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "follow_ups self delete" ON public.follow_ups
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "follow_ups admin" ON public.follow_ups
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
