import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function randomToken(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const getOrCreateCalendarToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("calendar_tokens")
      .select("token")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.token) return { token: existing.token };

    const token = randomToken(24);
    const { error } = await supabase.from("calendar_tokens").insert({ user_id: userId, token });
    if (error) throw new Error(error.message);
    return { token };
  });

export const rotateCalendarToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("calendar_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("revoked_at", null);
    const token = randomToken(24);
    const { error } = await supabase.from("calendar_tokens").insert({ user_id: userId, token });
    if (error) throw new Error(error.message);
    return { token };
  });
