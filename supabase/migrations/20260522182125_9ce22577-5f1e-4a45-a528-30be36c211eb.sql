
-- 1. Make note-media bucket private
UPDATE storage.buckets SET public = false WHERE id = 'note-media';

-- 2. Replace public read with owner-scoped authenticated read
DROP POLICY IF EXISTS "note-media public read" ON storage.objects;
DROP POLICY IF EXISTS "note-media owner read" ON storage.objects;
CREATE POLICY "note-media owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'note-media' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 3. Move pg_net out of public schema (drop + recreate in extensions schema)
CREATE SCHEMA IF NOT EXISTS extensions;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
