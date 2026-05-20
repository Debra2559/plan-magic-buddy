import { createServerFn } from '@tanstack/react-start'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { z } from 'zod'

const FEISHU_BASE = 'https://open.feishu.cn/open-apis'

// ---------- token 缓存 ----------
let cachedToken: { token: string; expiresAt: number } | null = null

async function getTenantAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }
  const appId = process.env.FEISHU_APP_ID
  const appSecret = process.env.FEISHU_APP_SECRET
  if (!appId || !appSecret) throw new Error('FEISHU_APP_ID / FEISHU_APP_SECRET 未配置')

  const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const json = (await res.json()) as {
    code: number
    msg: string
    tenant_access_token?: string
    expire?: number
  }
  if (json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`飞书 token 接口错误: code=${json.code} msg=${json.msg}`)
  }
  cachedToken = {
    token: json.tenant_access_token,
    expiresAt: Date.now() + (json.expire ?? 7200) * 1000,
  }
  return cachedToken.token
}

async function feishu<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getTenantAccessToken()
  const res = await fetch(`${FEISHU_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
  return (await res.json()) as T
}

// ---------- 测试连接 ----------
export const testFeishuConnection = createServerFn({ method: 'POST' }).handler(
  async () => {
    try {
      const token = await getTenantAccessToken()
      const expire = Math.max(
        0,
        Math.round(((cachedToken?.expiresAt ?? Date.now()) - Date.now()) / 1000)
      )
      return { ok: true as const, expire, tokenPreview: `${token.slice(0, 8)}…` }
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? '未知错误' }
    }
  }
)

// ---------- 列出日历 ----------
type FeishuCalendar = {
  calendar_id: string
  summary: string
  description?: string
  color?: number
  role?: string
  type?: string
}

export const listFeishuCalendars = createServerFn({ method: 'POST' }).handler(
  async () => {
    try {
      const json = await feishu<{
        code: number
        msg: string
        data?: { calendar_list?: FeishuCalendar[] }
      }>('/calendar/v4/calendars?page_size=50')

      if (json.code !== 0) {
        return { ok: false as const, error: `code=${json.code} msg=${json.msg}` }
      }
      const list = json.data?.calendar_list ?? []
      return {
        ok: true as const,
        calendars: list.map((c) => ({
          id: c.calendar_id,
          name: c.summary || '(未命名)',
          role: c.role ?? '',
          type: c.type ?? '',
        })),
      }
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? '请求失败' }
    }
  }
)

// ---------- 设置：读取 ----------
export const getFeishuSettings = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from('feishu_settings')
      .select('*')
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return {
      selectedCalendarId: data?.selected_calendar_id ?? null,
      selectedCalendarName: data?.selected_calendar_name ?? null,
      direction: (data?.direction as 'two-way' | 'push-only') ?? 'two-way',
      lastSyncAt: data?.last_sync_at ?? null,
    }
  }
)

// ---------- 设置：选中日历 ----------
const selectSchema = z.object({
  calendarId: z.string().min(1).max(200),
  calendarName: z.string().min(1).max(200),
})

export const selectFeishuCalendar = createServerFn({ method: 'POST' })
  .inputValidator((input) => selectSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from('feishu_settings')
      .select('id')
      .limit(1)
      .maybeSingle()
    if (!row) {
      const { error } = await supabaseAdmin.from('feishu_settings').insert({
        selected_calendar_id: data.calendarId,
        selected_calendar_name: data.calendarName,
      })
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabaseAdmin
        .from('feishu_settings')
        .update({
          selected_calendar_id: data.calendarId,
          selected_calendar_name: data.calendarName,
        })
        .eq('id', row.id)
      if (error) throw new Error(error.message)
    }
    return { ok: true as const }
  })

// ---------- 设置：同步方向 ----------
const dirSchema = z.object({
  direction: z.enum(['two-way', 'push-only']),
})

export const setFeishuDirection = createServerFn({ method: 'POST' })
  .inputValidator((input) => dirSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from('feishu_settings')
      .select('id')
      .limit(1)
      .maybeSingle()
    if (!row) {
      await supabaseAdmin
        .from('feishu_settings')
        .insert({ direction: data.direction })
    } else {
      await supabaseAdmin
        .from('feishu_settings')
        .update({ direction: data.direction })
        .eq('id', row.id)
    }
    return { ok: true as const }
  })
