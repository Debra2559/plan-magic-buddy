ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_own_insert" ON storage.objects;
CREATE POLICY "avatars_own_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "avatars_own_update" ON storage.objects;
CREATE POLICY "avatars_own_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "avatars_own_delete" ON storage.objects;
CREATE POLICY "avatars_own_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);