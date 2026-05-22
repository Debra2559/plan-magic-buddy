
-- 1. Tighten feishu_webhook_logs: remove broad authenticated read; admin policy already covers admins
DROP POLICY IF EXISTS "authenticated can read feishu webhook logs" ON public.feishu_webhook_logs;

-- 2. Remove (user_id IS NULL) clauses across legacy tables (verified 0 NULL rows exist)
DROP POLICY IF EXISTS notes_own_read ON public.notes;
DROP POLICY IF EXISTS notes_own_update ON public.notes;
DROP POLICY IF EXISTS notes_own_delete ON public.notes;
CREATE POLICY notes_own_read   ON public.notes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notes_own_update ON public.notes FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notes_own_delete ON public.notes FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS habits_own_read ON public.habits;
DROP POLICY IF EXISTS habits_own_update ON public.habits;
DROP POLICY IF EXISTS habits_own_delete ON public.habits;
CREATE POLICY habits_own_read   ON public.habits FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY habits_own_update ON public.habits FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY habits_own_delete ON public.habits FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS diary_entries_own_read ON public.diary_entries;
DROP POLICY IF EXISTS diary_entries_own_update ON public.diary_entries;
DROP POLICY IF EXISTS diary_entries_own_delete ON public.diary_entries;
CREATE POLICY diary_entries_own_read   ON public.diary_entries FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY diary_entries_own_update ON public.diary_entries FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY diary_entries_own_delete ON public.diary_entries FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS schedule_items_own_read ON public.schedule_items;
DROP POLICY IF EXISTS schedule_items_own_update ON public.schedule_items;
DROP POLICY IF EXISTS schedule_items_own_delete ON public.schedule_items;
CREATE POLICY schedule_items_own_read   ON public.schedule_items FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY schedule_items_own_update ON public.schedule_items FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY schedule_items_own_delete ON public.schedule_items FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS comics_own_read ON public.comics;
DROP POLICY IF EXISTS comics_own_update ON public.comics;
DROP POLICY IF EXISTS comics_own_delete ON public.comics;
CREATE POLICY comics_own_read   ON public.comics FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY comics_own_update ON public.comics FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY comics_own_delete ON public.comics FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 3. Revoke EXECUTE on SECURITY DEFINER helpers from anon/authenticated; only callable from
--    trusted contexts (RLS policies, triggers, server-side service role).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.user_profiles_record_history() FROM anon, authenticated, public;
