import { createServerFn } from '@tanstack/react-start'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { z } from 'zod'

const FEISHU_BASE = 'https://open.feishu.cn/open-apis'
const AUTHORIZE_URL = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize'
const TOKEN_URL = `${FEISHU_BASE}/authen/v2/oauth/token`

// 申请的权限：通讯录基础信息 + 通讯录搜索
const DEFAULT_SCOPES = ['contact:user.base:readonly', 'search:user.id:readonly']

function settingsRow() {
  return supabaseAdmin
    .from('feishu_settings')
    .select('id, user_access_token, user_refresh_token, user_token_expires_at, user_refresh_expires_at, user_open_id, user_name, user_scope')
    .limit(1)
    .maybeSingle()
}

async function upsertAuth(patch: Record<string, any>) {
  const { data: row } = await settingsRow()
  if (!row) {
    const { error } = await supabaseAdmin.from('feishu_settings').insert(patch as any)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabaseAdmin.from('feishu_settings').update(patch as any).eq('id', row.id)
    if (error) throw new Error(error.message)
  }
}

/** 拿到（可能刷新过的）user_access_token。无授权时返回 null。 */
export async function getUserAccessToken(): Promise<string | null> {
  const { data: row } = await settingsRow()
  if (!row?.user_access_token) return null

  const expAt = row.user_token_expires_at ? new Date(row.user_token_expires_at).getTime() : 0
  // 60 秒提前刷新
  if (expAt > Date.now() + 60_000) return row.user_access_token

  if (!row.user_refresh_token) return null
  const refExp = row.user_refresh_expires_at ? new Date(row.user_refresh_expires_at).getTime() : 0
  if (refExp && refExp < Date.now()) return null

  const appId = process.env.FEISHU_APP_ID!
  const appSecret = process.env.FEISHU_APP_SECRET!
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: appId,
      client_secret: appSecret,
      refresh_token: row.user_refresh_token,
    }),
  })
  const json: any = await res.json()
  const tok = json?.data ?? json
  if (!tok?.access_token) {
    console.error('[feishu user auth] refresh failed', json)
    return null
  }
  await upsertAuth({
    user_access_token: tok.access_token,
    user_refresh_token: tok.refresh_token ?? row.user_refresh_token,
    user_token_expires_at: new Date(Date.now() + (Number(tok.expires_in) || 7200) * 1000).toISOString(),
    user_refresh_expires_at: tok.refresh_token_expires_in
      ? new Date(Date.now() + Number(tok.refresh_token_expires_in) * 1000).toISOString()
      : row.user_refresh_expires_at,
    user_scope: tok.scope ?? row.user_scope,
  })
  return tok.access_token as string
}

/** 用 code 换 token 并写库（供 server route 调用） */
export async function exchangeCodeAndSave(code: string, redirectUri: string) {
  const appId = process.env.FEISHU_APP_ID!
  const appSecret = process.env.FEISHU_APP_SECRET!
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: appId,
      client_secret: appSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })
  const json: any = await res.json()
  const tok = json?.data ?? json
  if (!tok?.access_token) {
    throw new Error(`换取 token 失败 code=${json?.code ?? res.status} msg=${json?.msg ?? json?.error_description ?? 'unknown'}`)
  }

  // 拿用户信息（open_id / name）
  let openId: string | null = null
  let name: string | null = null
  try {
    const ures = await fetch(`${FEISHU_BASE}/authen/v1/user_info`, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })
    const ujson: any = await ures.json()
    openId = ujson?.data?.open_id ?? null
    name = ujson?.data?.name ?? null
  } catch {}

  await upsertAuth({
    user_access_token: tok.access_token,
    user_refresh_token: tok.refresh_token ?? null,
    user_token_expires_at: new Date(Date.now() + (Number(tok.expires_in) || 7200) * 1000).toISOString(),
    user_refresh_expires_at: tok.refresh_token_expires_in
      ? new Date(Date.now() + Number(tok.refresh_token_expires_in) * 1000).toISOString()
      : null,
    user_open_id: openId,
    user_name: name,
    user_scope: tok.scope ?? null,
  })

  return { ok: true, openId, name }
}

// ============ 暴露给前端的 server fns ============

export const getFeishuAuthUrl = createServerFn({ method: 'POST' })
  .inputValidator((d) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const appId = process.env.FEISHU_APP_ID
    if (!appId) return { ok: false as const, error: 'FEISHU_APP_ID 未配置' }
    const redirectUri = `${data.origin.replace(/\/$/, '')}/api/public/feishu/oauth/callback`
    const state = Math.random().toString(36).slice(2, 10)
    const url =
      `${AUTHORIZE_URL}?app_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(DEFAULT_SCOPES.join(' '))}` +
      `&state=${state}`
    return { ok: true as const, url, redirectUri }
  })

export const getFeishuUserAuthStatus = createServerFn({ method: 'POST' }).handler(async () => {
  const { data: row } = await settingsRow()
  if (!row?.user_access_token) return { authorized: false as const }
  const expAt = row.user_token_expires_at ? new Date(row.user_token_expires_at).getTime() : 0
  return {
    authorized: true as const,
    openId: row.user_open_id,
    name: row.user_name,
    scope: row.user_scope,
    expiresAt: row.user_token_expires_at,
    expired: expAt > 0 && expAt < Date.now(),
  }
})

export const clearFeishuUserAuth = createServerFn({ method: 'POST' }).handler(async () => {
  const { data: row } = await settingsRow()
  if (row) {
    await supabaseAdmin
      .from('feishu_settings')
      .update({
        user_access_token: null,
        user_refresh_token: null,
        user_token_expires_at: null,
        user_refresh_expires_at: null,
        user_open_id: null,
        user_name: null,
        user_scope: null,
      } as any)
      .eq('id', row.id)
  }
  return { ok: true as const }
})
