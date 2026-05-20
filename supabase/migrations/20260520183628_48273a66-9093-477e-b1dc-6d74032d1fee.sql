-- 1) notes 表新增视频 / 语音字段
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS videos text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS audios text[] NOT NULL DEFAULT '{}'::text[];

-- 2) note-media 存储桶
INSERT INTO storage.buckets (id, name, public)
VALUES ('note-media', 'note-media', true)
ON CONFLICT (id) DO NOTHING;

-- 3) 存储桶访问策略
DROP POLICY IF EXISTS "note-media public read" ON storage.objects;
CREATE POLICY "note-media public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'note-media');

DROP POLICY IF EXISTS "note-media owner insert" ON storage.objects;
CREATE POLICY "note-media owner insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'note-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "note-media owner update" ON storage.objects;
CREATE POLICY "note-media owner update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'note-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "note-media owner delete" ON storage.objects;
CREATE POLICY "note-media owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'note-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);