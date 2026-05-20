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

// ============= 真实推送 =============

const TZ = 'Asia/Shanghai'

// 把 YYYY-MM-DD + HH:MM 解成 Unix 秒（按 +08:00 处理）
function toUnixSeconds(date: string, time: string): number {
  // 直接拼成带时区偏移的 ISO，避免依赖运行时时区
  const iso = `${date}T${time}:00+08:00`
  return Math.floor(new Date(iso).getTime() / 1000)
}

interface PushItem {
  id: string
  type: 'event' | 'todo' | 'reminder'
  title: string
  date: string
  time?: string
  durationMin?: number
  tag?: string
  note?: string
  done?: boolean
}

const pushSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      type: z.enum(['event', 'todo', 'reminder']),
      title: z.string().min(1).max(500),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      durationMin: z.number().int().min(5).max(24 * 60).optional(),
      tag: z.string().max(20).optional(),
      note: z.string().max(2000).optional(),
      done: z.boolean().optional(),
    })
  ).max(500),
})

function buildEventBody(it: PushItem) {
  // event 必有 time；reminder/todo 有 time 也按事件推（默认 30 分钟）
  const time = it.time ?? '09:00'
  const start = toUnixSeconds(it.date, time)
  const dur = (it.durationMin ?? (it.type === 'event' ? 60 : 30)) * 60
  return {
    summary: it.title,
    description: [it.tag ? `#${it.tag}` : '', it.note ?? ''].filter(Boolean).join('\n') || undefined,
    start_time: { timestamp: String(start), timezone: TZ },
    end_time: { timestamp: String(start + dur), timezone: TZ },
  }
}

type SyncEntry = {
  op: 'create' | 'update' | 'delete'
  localId: string
  title: string
  status: 'ok' | 'error'
  error?: string
}

export const syncToFeishu = createServerFn({ method: 'POST' })
  .inputValidator((input) => pushSchema.parse(input))
  .handler(async ({ data }) => {
    // 1) 读选中的日历
    const { data: settings } = await supabaseAdmin
      .from('feishu_settings')
      .select('selected_calendar_id')
      .limit(1)
      .maybeSingle()

    const calendarId = settings?.selected_calendar_id
    if (!calendarId) {
      return { ok: false as const, error: '请先在面板里选一个飞书日历' }
    }

    // 2) 只推「能映射成事件」的条目：必须有 time
    const pushable = data.items.filter((i) => i.time && !i.done)

    // 3) 已有 mapping
    const { data: existingMaps } = await supabaseAdmin
      .from('feishu_event_map')
      .select('local_id, feishu_event_id, calendar_id')

    const mapByLocal = new Map(
      (existingMaps ?? []).map((m) => [m.local_id, m])
    )

    const entries: SyncEntry[] = []

    // 4) create / update
    for (const it of pushable) {
      const body = buildEventBody(it)
      const existing = mapByLocal.get(it.id)
      try {
        if (existing && existing.calendar_id === calendarId) {
          const r = await feishu<{ code: number; msg: string }>(
            `/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existing.feishu_event_id)}`,
            { method: 'PATCH', body: JSON.stringify(body) }
          )
          if (r.code === 0) {
            entries.push({ op: 'update', localId: it.id, title: it.title, status: 'ok' })
          } else {
            entries.push({ op: 'update', localId: it.id, title: it.title, status: 'error', error: `${r.code} ${r.msg}` })
          }
        } else {
          const r = await feishu<{
            code: number
            msg: string
            data?: { event?: { event_id?: string } }
          }>(
            `/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events`,
            { method: 'POST', body: JSON.stringify(body) }
          )
          const evId = r.data?.event?.event_id
          if (r.code === 0 && evId) {
            await supabaseAdmin.from('feishu_event_map').upsert(
              {
                local_id: it.id,
                feishu_event_id: evId,
                calendar_id: calendarId,
                last_pushed_at: new Date().toISOString(),
              },
              { onConflict: 'local_id' }
            )
            entries.push({ op: 'create', localId: it.id, title: it.title, status: 'ok' })
          } else {
            entries.push({ op: 'create', localId: it.id, title: it.title, status: 'error', error: `${r.code} ${r.msg}` })
          }
        }
      } catch (e: any) {
        entries.push({
          op: existing ? 'update' : 'create',
          localId: it.id,
          title: it.title,
          status: 'error',
          error: e?.message ?? '请求失败',
        })
      }
    }

    // 5) delete：本地已不存在 / 已标记 done / 已没 time，但映射还在
    const keep = new Set(pushable.map((i) => i.id))
    for (const m of existingMaps ?? []) {
      if (m.calendar_id !== calendarId) continue
      if (keep.has(m.local_id)) continue
      try {
        const r = await feishu<{ code: number; msg: string }>(
          `/calendar/v4/calendars/${encodeURIComponent(m.calendar_id)}/events/${encodeURIComponent(m.feishu_event_id)}`,
          { method: 'DELETE' }
        )
        if (r.code === 0 || r.code === 195100) {
          // 195100 = 事件不存在，视为已删
          await supabaseAdmin.from('feishu_event_map').delete().eq('local_id', m.local_id)
          entries.push({ op: 'delete', localId: m.local_id, title: `(${m.local_id.slice(-4)})`, status: 'ok' })
        } else {
          entries.push({ op: 'delete', localId: m.local_id, title: `(${m.local_id.slice(-4)})`, status: 'error', error: `${r.code} ${r.msg}` })
        }
      } catch (e: any) {
        entries.push({ op: 'delete', localId: m.local_id, title: `(${m.local_id.slice(-4)})`, status: 'error', error: e?.message ?? '请求失败' })
      }
    }

    // 6) 写入 last_sync_at
    await supabaseAdmin
      .from('feishu_settings')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('selected_calendar_id', calendarId)

    const okCount = entries.filter((e) => e.status === 'ok').length
    const errCount = entries.length - okCount
    return { ok: true as const, entries, okCount, errCount }
  })
