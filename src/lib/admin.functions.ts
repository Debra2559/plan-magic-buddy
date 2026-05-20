import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// --- helpers -------------------------------------------------------------

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error(`权限检查失败：${error.message}`);
  if (!data) throw new Error("仅管理员可访问");
}

// --- session ------------------------------------------------------------

export const getMyAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
    if (error) return { isAdmin: false, userId };
    return { isAdmin: !!data, userId };
  });

// --- users --------------------------------------------------------------

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const { data: usersRes, error: usersErr } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (usersErr) throw new Error(usersErr.message);

    const ids = usersRes.users.map((u) => u.id);
    const [{ data: rolesData }, { data: profilesData }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin
        .from("user_profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids),
    ]);

    const rolesMap = new Map<string, string[]>();
    (rolesData ?? []).forEach((r: any) => {
      const arr = rolesMap.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesMap.set(r.user_id, arr);
    });
    const profileMap = new Map<string, any>();
    (profilesData ?? []).forEach((p: any) => profileMap.set(p.user_id, p));

    const rows = usersRes.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      banned_until: (u as any).banned_until ?? null,
      roles: rolesMap.get(u.id) ?? [],
      display_name: profileMap.get(u.id)?.display_name ?? null,
      avatar_url: profileMap.get(u.id)?.avatar_url ?? null,
    }));

    return { users: rows };
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        targetUserId: z.string().uuid(),
        role: z.enum(["admin", "user"]),
        grant: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    if (data.targetUserId === userId && data.role === "admin" && !data.grant) {
      throw new Error("不能撤销自己的管理员权限");
    }

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.targetUserId, role: data.role });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.targetUserId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ targetUserId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    if (data.targetUserId === userId) throw new Error("不能删除自己");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.targetUserId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- content ------------------------------------------------------------

const ContentTable = z.enum([
  "schedule_items",
  "notes",
  "diary_entries",
  "comics",
  "habits",
  "canvas_documents",
]);

export const adminListContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        table: ContentTable,
        limit: z.number().int().min(1).max(200).optional(),
        userId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const cols: Record<string, string> = {
      schedule_items: "id, user_id, title, type, date, time, done, created_at",
      notes: "id, user_id, text, mood, pinned, created_at",
      diary_entries: "date, user_id, content, mood, created_at, updated_at",
      comics: "date, user_id, provider, image_url, caption, created_at",
      habits: "id, user_id, name, emoji, created_at",
      canvas_documents: "id, user_id, kind, updated_at, created_at",
    };
    let q = supabaseAdmin
      .from(data.table)
      .select(cols[data.table])
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.userId) q = q.eq("user_id", data.userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const adminDeleteContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        table: ContentTable,
        id: z.string().optional(),
        compositeKey: z.object({ date: z.string(), user_id: z.string().uuid() }).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    let q: any = (supabaseAdmin as any).from(data.table).delete();
    if (data.compositeKey) {
      q = q.eq("date", data.compositeKey.date).eq("user_id", data.compositeKey.user_id);
    } else if (data.id) {
      q = q.eq("id", data.id);
    } else {
      throw new Error("缺少删除主键");
    }
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- settings (singletons) ---------------------------------------------

const SettingsTable = z.enum(["ai_news_settings", "hackathon_settings"]);

export const adminGetSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ table: SettingsTable }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { data: row, error } = await supabaseAdmin
      .from(data.table)
      .select("*")
      .eq("id", "singleton")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { row };
  });

export const adminUpdateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        table: SettingsTable,
        patch: z.record(z.string(), z.any()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    const { error } = await supabaseAdmin
      .from(data.table)
      .upsert({ id: "singleton", ...data.patch, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- stats & logs ------------------------------------------------------

export const adminGetStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);

    const tables = [
      "schedule_items",
      "notes",
      "diary_entries",
      "comics",
      "habits",
      "user_profiles",
      "ai_news",
      "hackathons",
      "feishu_webhook_logs",
    ];
    const counts: Record<string, number> = {};
    await Promise.all(
      tables.map(async (t) => {
        const { count } = await (supabaseAdmin as any)
          .from(t)
          .select("*", { count: "exact", head: true });
        counts[t] = count ?? 0;
      }),
    );
    const { data: userList } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    return { counts, totalUsers: (userList as any)?.total ?? null };
  });

export const adminListLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        level: z.enum(["all", "info", "warn", "error"]).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await assertAdmin(supabase, userId);
    let q = supabaseAdmin
      .from("feishu_webhook_logs")
      .select("id, request_id, step, level, event_type, status, duration_ms, message, error, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.level && data.level !== "all") q = q.eq("level", data.level);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
