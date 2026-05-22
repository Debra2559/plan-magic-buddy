import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "note-media";
const EXPIRES = 60 * 60; // 1 hour

// In-memory cache (path -> { url, expiresAt })
const cache = new Map<string, { url: string; expiresAt: number }>();

/** Extract the storage path from a stored value (legacy public URL or bare path). */
export function extractNoteMediaPath(value: string): string | null {
  if (!value) return null;
  // Legacy public URL: .../storage/v1/object/public/note-media/<path>
  const m = value.match(/\/storage\/v1\/object\/(?:public|sign)\/note-media\/([^?]+)/);
  if (m) return decodeURIComponent(m[1]);
  // Bare path "uid/filename.ext"
  if (!/^https?:/i.test(value)) return value.replace(/^\/+/, "");
  return null;
}

async function sign(path: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.expiresAt > now + 30_000) return hit.url;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, EXPIRES);
  if (error || !data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, expiresAt: now + EXPIRES * 1000 });
  return data.signedUrl;
}

/** React hook: resolves stored value (legacy public URL or path) to a signed URL. */
export function useSignedMediaUrl(value: string | undefined | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (!value) return undefined;
    const path = extractNoteMediaPath(value);
    if (!path) return value; // external URL, pass through
    const hit = cache.get(path);
    return hit?.url;
  });

  useEffect(() => {
    if (!value) { setUrl(undefined); return; }
    const path = extractNoteMediaPath(value);
    if (!path) { setUrl(value); return; }
    let cancelled = false;
    sign(path).then((signed) => {
      if (!cancelled && signed) setUrl(signed);
    });
    return () => { cancelled = true; };
  }, [value]);

  return url;
}
