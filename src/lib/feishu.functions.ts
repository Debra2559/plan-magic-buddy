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
      pushRules: {
        requireTime: (data as any)?.push_require_time ?? true,
        defaultTime: ((data as any)?.push_default_time as string) ?? '09:00',
        allowedTypes: (((data as any)?.push_allowed_types as string[]) ?? ['event','reminder','todo']) as Array<'event'|'reminder'|'todo'>,
        includeDone: (data as any)?.push_include_done ?? false,
      },
    }
  }
)

// ---------- 设置：推送规则 ----------
const pushRulesSchema = z.object({
  requireTime: z.boolean(),
  defaultTime: z.string().regex(/^\d{2}:\d{2}$/),
  allowedTypes: z.array(z.enum(['event','reminder','todo'])).min(1).max(3),
  includeDone: z.boolean(),
})

export const setFeishuPushRules = createServerFn({ method: 'POST' })
  .inputValidator((input) => pushRulesSchema.parse(input))
  .handler(async ({ data }) => {
    const patch = {
      push_require_time: data.requireTime,
      push_default_time: data.defaultTime,
      push_allowed_types: data.allowedTypes,
      push_include_done: data.includeDone,
    }
    const { data: row } = await supabaseAdmin
      .from('feishu_settings')
      .select('id')
      .limit(1)
      .maybeSingle()
    if (!row) {
      const { error } = await supabaseAdmin.from('feishu_settings').insert(patch as any)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabaseAdmin
        .from('feishu_settings')
        .update(patch as any)
        .eq('id', row.id)
      if (error) throw new Error(error.message)
    }
    return { ok: true as const }
  })

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

function buildEventBody(it: PushItem, defaultTime = '09:00') {
  const time = it.time ?? defaultTime
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
    // 1) 读选中的日历 + 推送规则
    const { data: settings } = await supabaseAdmin
      .from('feishu_settings')
      .select('selected_calendar_id, push_require_time, push_default_time, push_allowed_types, push_include_done')
      .limit(1)
      .maybeSingle()

    const calendarId = settings?.selected_calendar_id
    if (!calendarId) {
      return { ok: false as const, error: '请先在面板里选一个飞书日历' }
    }

    const requireTime = (settings as any)?.push_require_time ?? true
    const defaultTime = ((settings as any)?.push_default_time as string) ?? '09:00'
    const allowedTypes = new Set<string>(
      ((settings as any)?.push_allowed_types as string[]) ?? ['event', 'reminder', 'todo']
    )
    const includeDone = (settings as any)?.push_include_done ?? false

    // 2) 按规则过滤
    const pushable = data.items.filter((i) => {
      if (!allowedTypes.has(i.type)) return false
      if (!includeDone && i.done) return false
      if (requireTime && !i.time) return false
      return true
    })

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
      const body = buildEventBody(it, defaultTime)
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

// ============= 真实拉取（飞书 → Sylva） =============

interface FeishuEvent {
  event_id: string
  summary?: string
  description?: string
  start_time?: { timestamp?: string; date?: string; timezone?: string }
  end_time?: { timestamp?: string; date?: string; timezone?: string }
  status?: string
}

// 把 Unix 秒（CST）拆成 { date: 'YYYY-MM-DD', time: 'HH:MM' }
function unixToCST(sec: number): { date: string; time: string } {
  const d = new Date(sec * 1000)
  // 转到 +08:00
  const cst = new Date(d.getTime() + 8 * 3600 * 1000)
  const y = cst.getUTCFullYear()
  const m = String(cst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(cst.getUTCDate()).padStart(2, '0')
  const hh = String(cst.getUTCHours()).padStart(2, '0')
  const mm = String(cst.getUTCMinutes()).padStart(2, '0')
  return { date: `${y}-${m}-${day}`, time: `${hh}:${mm}` }
}

export const pullFromFeishu = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { data: settings } = await supabaseAdmin
      .from('feishu_settings')
      .select('selected_calendar_id')
      .limit(1)
      .maybeSingle()

    const calendarId = settings?.selected_calendar_id
    if (!calendarId) {
      return { ok: false as const, error: '请先选一个飞书日历' }
    }

    // 拉取「今天 - 7 天」到「今天 + 60 天」窗口
    const now = Math.floor(Date.now() / 1000)
    const start = now - 7 * 86400
    const end = now + 60 * 86400

    const all: FeishuEvent[] = []
    let pageToken: string | undefined
    let safety = 0
    do {
      const qs = new URLSearchParams({
        page_size: '100',
        start_time: String(start),
        end_time: String(end),
      })
      if (pageToken) qs.set('page_token', pageToken)
      const r = await feishu<{
        code: number
        msg: string
        data?: { items?: FeishuEvent[]; page_token?: string; has_more?: boolean }
      }>(`/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events?${qs.toString()}`)
      if (r.code !== 0) {
        return { ok: false as const, error: `拉取失败 code=${r.code} msg=${r.msg}` }
      }
      all.push(...(r.data?.items ?? []))
      pageToken = r.data?.has_more ? r.data?.page_token : undefined
      safety++
    } while (pageToken && safety < 10)

    // 反查已存在映射 —— 这些是 Sylva 已知的事件，跳过
    const { data: maps } = await supabaseAdmin
      .from('feishu_event_map')
      .select('feishu_event_id, local_id')
      .eq('calendar_id', calendarId)

    const knownFeishuIds = new Set((maps ?? []).map((m) => m.feishu_event_id))

    type NewItem = {
      type: 'event'
      title: string
      date: string
      time: string
      durationMin: number
      tag?: string
      note?: string
      _feishuEventId: string
    }

    const newItems: NewItem[] = []
    for (const ev of all) {
      if (!ev.event_id || knownFeishuIds.has(ev.event_id)) continue
      if (ev.status === 'cancelled') continue
      const startTs = ev.start_time?.timestamp
      const endTs = ev.end_time?.timestamp
      if (!startTs) continue // 全天事件先跳过
      const startSec = Number(startTs)
      const endSec = Number(endTs ?? startTs)
      const { date, time } = unixToCST(startSec)
      const durationMin = Math.max(5, Math.round((endSec - startSec) / 60)) || 60
      newItems.push({
        type: 'event',
        title: ev.summary || '(无标题)',
        date,
        time,
        durationMin,
        tag: '飞书',
        note: ev.description || undefined,
        _feishuEventId: ev.event_id,
      })
    }

    return { ok: true as const, total: all.length, newItems, calendarId }
  }
)

// 写入新拉到的事件 → 映射表（local_id 由客户端生成）
const recordSchema = z.object({
  calendarId: z.string().min(1),
  records: z.array(
    z.object({
      localId: z.string().min(1),
      feishuEventId: z.string().min(1),
    })
  ).max(500),
})

export const recordPulledMappings = createServerFn({ method: 'POST' })
  .inputValidator((input) => recordSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.records.length === 0) return { ok: true as const, count: 0 }
    const rows = data.records.map((r) => ({
      local_id: r.localId,
      feishu_event_id: r.feishuEventId,
      calendar_id: data.calendarId,
      last_pushed_at: new Date().toISOString(),
    }))
    const { error } = await supabaseAdmin
      .from('feishu_event_map')
      .upsert(rows, { onConflict: 'local_id' })
    if (error) throw new Error(error.message)
    return { ok: true as const, count: rows.length }
  })

// ============= 黑客松 → 飞书消息推送 =============

type NotifySettings = {
  receive_id: string | null
  receive_id_type: 'open_id' | 'chat_id' | 'user_id' | 'email'
  notify_on_discover: boolean
  notify_on_accept: boolean
}

async function loadNotifySettings(): Promise<NotifySettings | null> {
  const { data } = await supabaseAdmin
    .from('feishu_settings')
    .select('notify_receive_id, notify_receive_id_type, notify_on_discover, notify_on_accept')
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    receive_id: (data as any).notify_receive_id ?? null,
    receive_id_type: ((data as any).notify_receive_id_type ?? 'open_id') as NotifySettings['receive_id_type'],
    notify_on_discover: (data as any).notify_on_discover ?? true,
    notify_on_accept: (data as any).notify_on_accept ?? true,
  }
}

function hackathonCard(opts: {
  kind: 'new' | 'accepted' | 'dismissed'
  hackathonId: string
  title: string
  source: string
  summary?: string | null
  deadline?: string | null
  starts_at?: string | null
  location?: string | null
  prize?: string | null
  url: string
}) {
  const isNew = opts.kind === 'new'
  const isAccepted = opts.kind === 'accepted'
  const headerTitle = isNew ? '🛰️ 新黑客松发现' : isAccepted ? '✅ 已加入日程' : '已忽略'
  const headerTpl = isNew ? 'orange' : isAccepted ? 'green' : 'grey'

  const fields: { is_short: boolean; text: { tag: 'lark_md'; content: string } }[] = []
  if (opts.deadline) fields.push({ is_short: true, text: { tag: 'lark_md', content: `**截止**\n${opts.deadline}` } })
  if (opts.starts_at) fields.push({ is_short: true, text: { tag: 'lark_md', content: `**开始**\n${opts.starts_at}` } })
  if (opts.location) fields.push({ is_short: true, text: { tag: 'lark_md', content: `**地点**\n${opts.location}` } })
  if (opts.prize) fields.push({ is_short: true, text: { tag: 'lark_md', content: `**奖金**\n${opts.prize}` } })

  const elements: any[] = []
  if (opts.summary) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: opts.summary } })
  }
  if (fields.length) elements.push({ tag: 'div', fields })
  elements.push({ tag: 'hr' })
  elements.push({
    tag: 'note',
    elements: [{ tag: 'plain_text', content: `来源：${opts.source}` }],
  })

  if (isNew) {
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '参加 ✅' },
          type: 'primary',
          value: { kind: 'hackathon', action: 'accept', id: opts.hackathonId },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '忽略' },
          type: 'default',
          value: { kind: 'hackathon', action: 'dismiss', id: opts.hackathonId },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '查看详情' },
          type: 'default',
          url: opts.url,
        },
      ],
    })
  } else {
    elements.push({
      tag: 'action',
      actions: [
        { tag: 'button', text: { tag: 'plain_text', content: '查看详情' }, type: 'default', url: opts.url },
      ],
    })
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      template: headerTpl,
      title: { tag: 'plain_text', content: `${headerTitle} · ${opts.title}`.slice(0, 100) },
    },
    elements,
  }
}

async function sendCardToFeishu(card: unknown): Promise<{ ok: boolean; error?: string }> {
  const s = await loadNotifySettings()
  if (!s || !s.receive_id) return { ok: false, error: '未配置飞书接收人' }
  try {
    const r = await feishu<{ code: number; msg: string }>(
      `/im/v1/messages?receive_id_type=${encodeURIComponent(s.receive_id_type)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          receive_id: s.receive_id,
          msg_type: 'interactive',
          content: JSON.stringify(card),
        }),
      }
    )
    if (r.code !== 0) return { ok: false, error: `code=${r.code} msg=${r.msg}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '发送失败' }
  }
}

export async function notifyHackathonDiscovered(row: {
  id: string
  title: string
  source: string
  summary: string | null
  deadline: string | null
  starts_at: string | null
  location: string | null
  prize: string | null
  url: string
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const s = await loadNotifySettings()
  if (!s || !s.receive_id || !s.notify_on_discover) return { ok: true, skipped: true }
  return sendCardToFeishu(hackathonCard({ kind: 'new', hackathonId: row.id, ...row }))
}

export async function notifyHackathonAccepted(row: {
  id: string
  title: string
  source: string
  summary: string | null
  deadline: string | null
  starts_at: string | null
  location: string | null
  prize: string | null
  url: string
}): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const s = await loadNotifySettings()
  if (!s || !s.receive_id || !s.notify_on_accept) return { ok: true, skipped: true }
  return sendCardToFeishu(hackathonCard({ kind: 'accepted', hackathonId: row.id, ...row }))
}

// ============= 通知设置：读写 =============
export const getFeishuNotifyConfig = createServerFn({ method: 'GET' }).handler(async () => {
  const s = await loadNotifySettings()
  return {
    receiveId: s?.receive_id ?? '',
    receiveIdType: s?.receive_id_type ?? 'open_id',
    notifyOnDiscover: s?.notify_on_discover ?? true,
    notifyOnAccept: s?.notify_on_accept ?? true,
  }
})

const notifyConfigSchema = z.object({
  receiveId: z.string().max(200),
  receiveIdType: z.enum(['open_id', 'chat_id', 'user_id', 'email']),
  notifyOnDiscover: z.boolean(),
  notifyOnAccept: z.boolean(),
})

export const setFeishuNotifyConfig = createServerFn({ method: 'POST' })
  .inputValidator((d) => notifyConfigSchema.parse(d))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from('feishu_settings')
      .select('id')
      .limit(1)
      .maybeSingle()
    const patch = {
      notify_receive_id: data.receiveId || null,
      notify_receive_id_type: data.receiveIdType,
      notify_on_discover: data.notifyOnDiscover,
      notify_on_accept: data.notifyOnAccept,
    }
    if (!row) {
      const { error } = await supabaseAdmin.from('feishu_settings').insert(patch as any)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabaseAdmin.from('feishu_settings').update(patch as any).eq('id', row.id)
      if (error) throw new Error(error.message)
    }
    return { ok: true as const }
  })

export const testHackathonNotify = createServerFn({ method: 'POST' }).handler(async () => {
  return sendCardToFeishu(
    hackathonCard({
      kind: 'new',
      hackathonId: '00000000-0000-0000-0000-000000000000',
      title: '测试卡片 · Sylva 黑客松雷达',
      source: '测试',
      summary: '这是一条测试卡片。点击「参加」会在真实场景下把比赛加入日程。',
      deadline: '2026-06-30',
      starts_at: '2026-07-05',
      location: '线上',
      prize: '$10k',
      url: 'https://devpost.com/',
    }),
  )
})

// ============= 每日小结提醒 =============

function dailyRecapCard(dateLabel: string, opts?: { missed?: boolean }) {
  const missed = !!opts?.missed
  return {
    config: { wide_screen_mode: true },
    header: {
      template: missed ? 'orange' : 'indigo',
      title: {
        tag: 'plain_text',
        content: missed
          ? `⏰ 昨日小结还没填 · ${dateLabel}`
          : `📝 今日小结提醒 · ${dateLabel}`,
      },
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: missed
            ? `**${dateLabel}** 的小结和日记还是空的，要不要现在补一下？\n- ✅ 昨天完成了哪些任务\n- 💭 写两句话日记 / 心情\n- 🌱 今天想优先做什么`
            : '今天过得怎么样？花 1 分钟回顾一下吧：\n- ✅ 今天完成了哪些任务\n- 💭 写两句话日记 / 心情\n- 🌱 明天想优先做什么',
        },
      },
      { tag: 'hr' },
      {
        tag: 'form',
        name: 'recap_form',
        elements: [
          {
            tag: 'input',
            name: 'summary',
            label: { tag: 'plain_text', content: '今日小结' },
            placeholder: { tag: 'plain_text', content: '今天完成了哪些任务 / 收获…' },
            max_length: 1000,
          },
          {
            tag: 'input',
            name: 'diary',
            label: { tag: 'plain_text', content: '日记 / 心情' },
            placeholder: { tag: 'plain_text', content: '今天的感受、想法、明天的计划…' },
            max_length: 2000,
          },
          {
            tag: 'select_static',
            name: 'mood',
            placeholder: { tag: 'plain_text', content: '今天的心情…（可选）' },
            options: [
              { text: { tag: 'plain_text', content: '😄 很棒' }, value: 'great' },
              { text: { tag: 'plain_text', content: '🙂 不错' }, value: 'good' },
              { text: { tag: 'plain_text', content: '😐 一般' }, value: 'ok' },
              { text: { tag: 'plain_text', content: '🙁 低落' }, value: 'down' },
              { text: { tag: 'plain_text', content: '😴 疲惫' }, value: 'tired' },
            ],
          },
          {
            tag: 'action',
            actions: [
              {
                tag: 'button',
                text: { tag: 'plain_text', content: '✅ 提交并打勾' },
                type: 'primary',
                action_type: 'form_submit',
                value: { kind: 'recap', action: 'submit', date: dateLabel },
              },
              {
                tag: 'button',
                text: { tag: 'plain_text', content: '去 Sylva 填写 ✍️' },
                type: 'default',
                url: `https://id-preview--01545937-4efd-4487-a500-8dd999f2e87d.lovable.app/desktop?view=notes&tab=diary&date=${encodeURIComponent(dateLabel)}`,
              },
            ],
          },
        ],
      },
    ],
  }
}

/** 检查所有用户：到点且今天没发过 → 发送提醒卡片。由 cron 每小时调用一次。 */
export async function runDailyRecapTick(): Promise<{
  checked: number
  sent: number
  results: Array<{ ok: boolean; error?: string }>
}> {
  const now = new Date()

  const { data: rows } = await supabaseAdmin
    .from('feishu_settings')
    .select('id, notify_receive_id, notify_receive_id_type, daily_recap_enabled, daily_recap_hour, daily_recap_timezone, daily_recap_last_sent_date, daily_recap_done_dates, daily_recap_last_followup_date')

  const results: Array<{ ok: boolean; error?: string }> = []
  let sent = 0

  for (const r of (rows ?? []) as any[]) {
    if (!r.daily_recap_enabled) continue
    if (!r.notify_receive_id) continue

    const tz = (r.daily_recap_timezone as string) || 'Asia/Shanghai'
    let hour: number
    let today: string
    let yesterday: string
    try {
      hour = hourInTz(now, tz)
      today = dateInTz(now, tz)
      yesterday = dateInTz(new Date(now.getTime() - 24 * 3600 * 1000), tz)
    } catch (e: any) {
      results.push({ ok: false, error: `时区无效 ${tz}` })
      continue
    }
    if (Number(r.daily_recap_hour) !== hour) continue

    const doneDates: string[] = Array.isArray(r.daily_recap_done_dates) ? r.daily_recap_done_dates : []

    // (A) 今日提醒：到点 + 今天还没发过
    if (r.daily_recap_last_sent_date !== today) {
      try {
        const res = await feishu<{ code: number; msg: string }>(
          `/im/v1/messages?receive_id_type=${encodeURIComponent(r.notify_receive_id_type ?? 'open_id')}`,
          {
            method: 'POST',
            body: JSON.stringify({
              receive_id: r.notify_receive_id,
              msg_type: 'interactive',
              content: JSON.stringify(dailyRecapCard(today)),
            }),
          },
        )
        if (res.code !== 0) {
          results.push({ ok: false, error: `today: code=${res.code} msg=${res.msg}` })
        } else {
          await supabaseAdmin
            .from('feishu_settings')
            .update({ daily_recap_last_sent_date: today } as any)
            .eq('id', r.id)
          sent++
          results.push({ ok: true })
        }
      } catch (e: any) {
        results.push({ ok: false, error: e?.message ?? '发送失败' })
      }
    }

    // (B) 昨日补打：昨天没在 done_dates 里 + 今天还没发过补打提醒
    if (!doneDates.includes(yesterday) && r.daily_recap_last_followup_date !== today) {
      try {
        const res = await feishu<{ code: number; msg: string }>(
          `/im/v1/messages?receive_id_type=${encodeURIComponent(r.notify_receive_id_type ?? 'open_id')}`,
          {
            method: 'POST',
            body: JSON.stringify({
              receive_id: r.notify_receive_id,
              msg_type: 'interactive',
              content: JSON.stringify(dailyRecapCard(yesterday, { missed: true })),
            }),
          },
        )
        if (res.code !== 0) {
          results.push({ ok: false, error: `followup: code=${res.code} msg=${res.msg}` })
        } else {
          await supabaseAdmin
            .from('feishu_settings')
            .update({ daily_recap_last_followup_date: today } as any)
            .eq('id', r.id)
          sent++
          results.push({ ok: true })
        }
      } catch (e: any) {
        results.push({ ok: false, error: e?.message ?? '补打发送失败' })
      }
    }
  }
  return { checked: (rows ?? []).length, sent, results }
}

/** 给定时区下当前的小时（0-23）。 */
function hourInTz(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', hour12: false,
  }).formatToParts(d)
  const h = parts.find((p) => p.type === 'hour')?.value ?? '0'
  // 部分实现对 00 点返回 "24"
  const n = Number(h)
  return n === 24 ? 0 : n
}

/** 给定时区下当前的 YYYY-MM-DD。 */
function dateInTz(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${day}`
}

/** 标记某天的小结已完成（在 done_dates 数组里追加去重）。 */
async function markRecapDoneInternal(date: string) {
  const { data: rows } = await supabaseAdmin
    .from('feishu_settings')
    .select('id, daily_recap_done_dates')
  for (const r of (rows ?? []) as any[]) {
    const cur: string[] = Array.isArray(r.daily_recap_done_dates) ? r.daily_recap_done_dates : []
    if (cur.includes(date)) continue
    const next = [...cur, date].slice(-60) // 只保留最近 60 天
    await supabaseAdmin
      .from('feishu_settings')
      .update({ daily_recap_done_dates: next } as any)
      .eq('id', r.id)
  }
}

export async function handleRecapCardAction(payload: {
  action: 'done'
  date: string
}): Promise<{ toast: { type: 'success' | 'info' | 'error'; content: string } }> {
  if (payload.action !== 'done' || !payload.date) {
    return { toast: { type: 'error', content: '参数错误' } }
  }
  try {
    await markRecapDoneInternal(payload.date)
    return { toast: { type: 'success', content: `已标记 ${payload.date} 完成` } }
  } catch (e: any) {
    return { toast: { type: 'error', content: e?.message ?? '标记失败' } }
  }
}

/**
 * 处理飞书卡片表单提交：保存小结+日记到 daily_recaps、标记完成、并往选中的飞书日历推一条「✅ 今日小结」事件。
 */
export async function handleRecapSubmit(payload: {
  date: string
  summary?: string
  diary?: string
  mood?: string
}): Promise<{ toast: { type: 'success' | 'info' | 'error'; content: string }; card?: any }> {
  const date = payload.date
  const summary = (payload.summary ?? '').trim()
  const diary = (payload.diary ?? '').trim()
  const moodRaw = (payload.mood ?? '').trim()
  const ALLOWED_MOODS = ['great', 'good', 'ok', 'down', 'tired'] as const
  const mood = (ALLOWED_MOODS as readonly string[]).includes(moodRaw) ? moodRaw : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { toast: { type: 'error', content: '日期参数错误' } }
  }
  if (!summary && !diary && !mood) {
    return { toast: { type: 'info', content: '小结、日记和心情都是空的哦~' } }
  }

  try {
    // 1) 检查是否已存在 → 用于区分「首次提交」与「再次提交」
    const { data: prevRow } = await supabaseAdmin
      .from('daily_recaps')
      .select('date')
      .eq('date', date)
      .maybeSingle()
    const isUpdate = !!prevRow

    // 2) upsert 到 daily_recaps（覆盖最新内容，并刷新 updated_at）
    const nowIso = new Date().toISOString()
    const { error: upErr } = await supabaseAdmin
      .from('daily_recaps')
      .upsert(
        { date, summary, diary, mood: mood || null, source: 'feishu_card', updated_at: nowIso } as any,
        { onConflict: 'date' },
      )
    if (upErr) throw new Error(upErr.message)

    // 3) 标记完成
    await markRecapDoneInternal(date)

    // 4) 同步到飞书日历：通过 feishu_event_map 复用同一事件（local_id = recap:{date}），存在则 PATCH，否则 POST
    let calendarPushed = false
    try {
      const { data: settings } = await supabaseAdmin
        .from('feishu_settings')
        .select('selected_calendar_id')
        .limit(1)
        .maybeSingle()
      const calendarId = (settings as any)?.selected_calendar_id
      if (calendarId) {
        const start = toUnixSeconds(date, '20:30')
        const moodLabel = moodToLabel(mood)
        const desc = [
          summary ? `【今日小结】\n${summary}` : '',
          diary ? `\n\n【日记】\n${diary}` : '',
          moodLabel ? `\n\n【心情】${moodLabel}` : '',
        ].join('').trim()
        const eventBody = {
          summary: `✅ 今日小结 · ${date}${moodLabel ? ` · ${moodLabel}` : ''}`,
          description: desc,
          start_time: { timestamp: String(start), timezone: TZ },
          end_time: { timestamp: String(start + 15 * 60), timezone: TZ },
        }
        const localId = `recap:${date}`

        const { data: existing } = await supabaseAdmin
          .from('feishu_event_map')
          .select('local_id, feishu_event_id, calendar_id')
          .eq('local_id', localId)
          .maybeSingle()

        let pushed = false
        if (existing && (existing as any).calendar_id === calendarId) {
          const r = await feishu<{ code: number; msg: string }>(
            `/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent((existing as any).feishu_event_id)}`,
            { method: 'PATCH', body: JSON.stringify(eventBody) },
          )
          if (r.code === 0) {
            pushed = true
            await supabaseAdmin
              .from('feishu_event_map')
              .update({ last_pushed_at: nowIso })
              .eq('local_id', localId)
          } else if (r.code === 195100) {
            // 事件已被删除 → 清理映射并新建
            await supabaseAdmin.from('feishu_event_map').delete().eq('local_id', localId)
          }
        }

        if (!pushed) {
          const r = await feishu<{
            code: number
            msg: string
            data?: { event?: { event_id?: string } }
          }>(
            `/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events`,
            { method: 'POST', body: JSON.stringify(eventBody) },
          )
          const evId = r.data?.event?.event_id
          if (r.code === 0 && evId) {
            await supabaseAdmin.from('feishu_event_map').upsert(
              {
                local_id: localId,
                feishu_event_id: evId,
                calendar_id: calendarId,
                last_pushed_at: nowIso,
              },
              { onConflict: 'local_id' },
            )
            pushed = true
          }
        }
        calendarPushed = pushed
      }
    } catch (e) {
      console.warn('[recap] calendar push failed', (e as any)?.message)
    }

    return {
      toast: {
        type: 'success',
        content: isUpdate
          ? (calendarPushed ? `已更新并同步到日历 ✅` : `已更新 ${date} 的小结 ✅`)
          : (calendarPushed ? `已记录并在日历上打勾 ✅` : `已记录 ${date} 的小结 ✅`),
      },
      // 返回一张「已完成」的回执卡片替换原卡，展示最新内容
      card: recapDoneCard(date, { summary, diary, mood, calendarPushed, isUpdate, updatedAt: nowIso }),
    }
  } catch (e: any) {
    return { toast: { type: 'error', content: e?.message ?? '保存失败' } }
  }
}

function moodToLabel(m: string): string {
  switch (m) {
    case 'great': return '😄 很棒'
    case 'good': return '🙂 不错'
    case 'ok': return '😐 一般'
    case 'down': return '🙁 低落'
    case 'tired': return '😴 疲惫'
    default: return ''
  }
}

function recapDoneCard(
  date: string,
  opts: { summary: string; diary: string; mood?: string; calendarPushed: boolean; isUpdate?: boolean; updatedAt?: string },
) {
  const parts: string[] = []
  if (opts.summary) parts.push(`**今日小结**\n${opts.summary}`)
  if (opts.diary) parts.push(`**日记 / 心情**\n${opts.diary}`)
  const moodLabel = moodToLabel(opts.mood ?? '')
  if (moodLabel) parts.push(`**心情** ${moodLabel}`)
  const tsLabel = opts.updatedAt ? formatTsInTz(opts.updatedAt, TZ) : ''
  const noteParts: string[] = []
  noteParts.push(opts.isUpdate ? '内容已更新' : '内容已记录')
  if (opts.calendarPushed) noteParts.push(opts.isUpdate ? '已同步覆盖日历事件' : '已同步到飞书日历')
  else noteParts.push('已记录到 Sylva')
  if (tsLabel) noteParts.push(`更新于 ${tsLabel}`)
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      template: 'green',
      title: { tag: 'plain_text', content: `${opts.isUpdate ? '🔄 已更新' : '✅ 已完成'} · ${date}` },
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: parts.join('\n\n') || '_（未填写内容）_',
        },
      },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: noteParts.join(' · '),
          },
        ],
      },
    ],
  }
}

function formatTsInTz(iso: string, tz: string) {
  try {
    const d = new Date(iso)
    const f = new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz,
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    return f.format(d)
  } catch {
    return ''
  }
}


export const markRecapDone = createServerFn({ method: 'POST' })
  .inputValidator((d: { date: string }) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data }) => {
    await markRecapDoneInternal(data.date)
    return { ok: true as const }
  })

/** 撤销「飞书已提交」标记：从 done 列表里移除该日期，并清空当天 daily_recaps 行 */
export const unmarkRecapDone = createServerFn({ method: 'POST' })
  .inputValidator((d: { date: string }) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from('feishu_settings')
      .select('id, daily_recap_done_dates')
    for (const r of (rows ?? []) as any[]) {
      const cur: string[] = Array.isArray(r.daily_recap_done_dates) ? r.daily_recap_done_dates : []
      if (!cur.includes(data.date)) continue
      const next = cur.filter((d) => d !== data.date)
      await supabaseAdmin
        .from('feishu_settings')
        .update({ daily_recap_done_dates: next } as any)
        .eq('id', r.id)
    }
    await supabaseAdmin.from('daily_recaps').delete().eq('date', data.date)
    return { ok: true as const }
  })

/** 返回最近 60 天内被标记为「已完成小结」的日期数组 */
export const getRecapDoneDates = createServerFn({ method: 'GET' }).handler(async () => {
  const { data } = await supabaseAdmin
    .from('feishu_settings')
    .select('daily_recap_done_dates')
    .limit(1)
    .maybeSingle()
  const list = (data as any)?.daily_recap_done_dates
  return { dates: (Array.isArray(list) ? list : []) as string[] }
})

export const getDailyRecap = createServerFn({ method: 'GET' })
  .inputValidator((d: { date: string }) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from('daily_recaps')
      .select('date, summary, diary, mood, updated_at')
      .eq('date', data.date)
      .maybeSingle()
    return row
      ? {
          date: (row as any).date as string,
          summary: ((row as any).summary as string) ?? '',
          diary: ((row as any).diary as string) ?? '',
          mood: ((row as any).mood as string) ?? '',
          updatedAt: (row as any).updated_at as string,
        }
      : null
  })

export const getDailyRecapConfig = createServerFn({ method: 'GET' }).handler(async () => {
  const { data } = await supabaseAdmin
    .from('feishu_settings')
    .select('daily_recap_enabled, daily_recap_hour, daily_recap_timezone')
    .limit(1)
    .maybeSingle()
  return {
    enabled: ((data as any)?.daily_recap_enabled ?? false) as boolean,
    hour: Number((data as any)?.daily_recap_hour ?? 21),
    timezone: ((data as any)?.daily_recap_timezone as string) ?? 'Asia/Shanghai',
  }
})

const dailyRecapSchema = z.object({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
  timezone: z.string().min(1).max(64).regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/),
})

export const setDailyRecapConfig = createServerFn({ method: 'POST' })
  .inputValidator((d) => dailyRecapSchema.parse(d))
  .handler(async ({ data }) => {
    // 校验时区有效性
    try { new Intl.DateTimeFormat('en-US', { timeZone: data.timezone }).format(new Date()) }
    catch { throw new Error(`无效的时区：${data.timezone}`) }

    const { data: row } = await supabaseAdmin
      .from('feishu_settings')
      .select('id')
      .limit(1)
      .maybeSingle()
    const patch = {
      daily_recap_enabled: data.enabled,
      daily_recap_hour: data.hour,
      daily_recap_timezone: data.timezone,
    }
    if (!row) {
      const { error } = await supabaseAdmin.from('feishu_settings').insert(patch as any)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabaseAdmin.from('feishu_settings').update(patch as any).eq('id', row.id)
      if (error) throw new Error(error.message)
    }
    return { ok: true as const }
  })

export const sendDailyRecapNow = createServerFn({ method: 'POST' }).handler(async () => {
  const { data } = await supabaseAdmin
    .from('feishu_settings')
    .select('daily_recap_timezone')
    .limit(1)
    .maybeSingle()
  const tz = ((data as any)?.daily_recap_timezone as string) || 'Asia/Shanghai'
  const today = dateInTz(new Date(), tz)
  return sendCardToFeishu(dailyRecapCard(today))
})

// ============= 卡片回调：参加 / 忽略 =============

/**
 * 处理来自飞书「卡片按钮」的回调。
 * 返回一个 v2 toast 响应给飞书；同时把比赛加入日程并推到选中的日历。
 */
export async function handleHackathonCardAction(payload: {
  id: string
  action: 'accept' | 'dismiss'
}): Promise<{ toast: { type: 'success' | 'info' | 'error'; content: string } }> {
  const { data: row, error } = await supabaseAdmin
    .from('hackathons')
    .select('*')
    .eq('id', payload.id)
    .maybeSingle()
  if (error || !row) {
    return { toast: { type: 'error', content: '未找到该比赛' } }
  }

  if (payload.action === 'dismiss') {
    await supabaseAdmin
      .from('hackathons')
      .update({ status: 'dismissed', decided_at: new Date().toISOString() })
      .eq('id', payload.id)
    return { toast: { type: 'info', content: '已忽略' } }
  }

  // accept：标记 + 写入飞书日历
  await supabaseAdmin
    .from('hackathons')
    .update({ status: 'accepted', decided_at: new Date().toISOString() })
    .eq('id', payload.id)

  const { data: settings } = await supabaseAdmin
    .from('feishu_settings')
    .select('selected_calendar_id')
    .limit(1)
    .maybeSingle()
  const calendarId = (settings as any)?.selected_calendar_id
  if (!calendarId) {
    return { toast: { type: 'success', content: '已标记参加，但未选择日历' } }
  }

  // 解析日期
  const parseDate = (s: string | null): string | null => {
    if (!s) return null
    const m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
    if (!m) return null
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  }
  const startDate = parseDate((row as any).starts_at) ?? parseDate((row as any).deadline)
  const deadlineDate = parseDate((row as any).deadline)

  const evs: { summary: string; date: string; time: string; durationMin: number; description?: string }[] = []
  if (startDate) {
    evs.push({
      summary: `🏆 ${(row as any).title}`,
      date: startDate,
      time: '10:00',
      durationMin: 240,
      description: (row as any).summary ?? (row as any).url,
    })
  }
  if (deadlineDate) {
    evs.push({
      summary: `⏰ 报名截止：${(row as any).title}`,
      date: deadlineDate,
      time: '20:00',
      durationMin: 30,
      description: (row as any).url,
    })
  }

  let pushed = 0
  for (const e of evs) {
    const start = toUnixSeconds(e.date, e.time)
    const body = {
      summary: e.summary,
      description: e.description,
      start_time: { timestamp: String(start), timezone: TZ },
      end_time: { timestamp: String(start + e.durationMin * 60), timezone: TZ },
    }
    try {
      const r = await feishu<{ code: number; msg: string }>(
        `/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events`,
        { method: 'POST', body: JSON.stringify(body) },
      )
      if (r.code === 0) pushed += 1
    } catch {
      /* ignore */
    }
  }

  // 推一张「已加入日程」的回执卡片
  void notifyHackathonAccepted(row as any).catch(() => {})

  return {
    toast: {
      type: 'success',
      content: pushed > 0 ? `已加入日程（${pushed} 条事件）` : '已确认参加',
    },
  }
}


// ---------- 查 open_id ----------
// 用邮箱或手机号反查 open_id，便于用户在设置里一键填入。
// 飞书接口：POST /contact/v3/users/batch_get_id
// 需要开通权限：contact:user.base:readonly（或 contact:contact.base:readonly）
export const lookupFeishuOpenId = createServerFn({ method: 'POST' })
  .inputValidator((input) =>
    z
      .object({
        type: z.enum(['email', 'mobile', 'name', 'employee_id']),
        value: z.string().min(1).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      // 邮箱 / 手机号：走 batch_get_id
      if (data.type === 'email' || data.type === 'mobile') {
        const body =
          data.type === 'email' ? { emails: [data.value] } : { mobiles: [data.value] }
        const res = await feishu<{
          code: number
          msg: string
          data?: { user_list?: Array<{ email?: string; mobile?: string; user_id?: string; open_id?: string }> }
        }>('/contact/v3/users/batch_get_id?user_id_type=open_id', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        if (res.code !== 0) {
          return {
            ok: false as const,
            error: `飞书接口错误 code=${res.code} msg=${res.msg}`,
            hint:
              res.code === 99991672 || /scope/i.test(res.msg ?? '')
                ? '应用缺少 contact:user.base:readonly 权限，请到飞书后台「权限管理」开通后重发布版本'
                : undefined,
          }
        }
        const user = res.data?.user_list?.[0]
        if (!user?.open_id) {
          return { ok: false as const, error: '未匹配到用户，请确认邮箱/手机号属于本企业成员' }
        }
        return { ok: true as const, openId: user.open_id }
      }

      // 工号：直接按 user_id_type=user_id 取用户（飞书将企业工号映射到 user_id）
      if (data.type === 'employee_id') {
        const res = await feishu<{
          code: number
          msg: string
          data?: { user?: { open_id?: string; name?: string } }
        }>(`/contact/v3/users/${encodeURIComponent(data.value)}?user_id_type=user_id`, {
          method: 'GET',
        })
        if (res.code !== 0 || !res.data?.user?.open_id) {
          return {
            ok: false as const,
            error: `未按工号匹配到用户（code=${res.code} ${res.msg ?? ''}）`,
            hint:
              res.code === 99991672 || /scope/i.test(res.msg ?? '')
                ? '应用缺少 contact:user.base:readonly 权限'
                : '请确认输入的是企业「工号 / user_id」而非 open_id',
          }
        }
        return { ok: true as const, openId: res.data.user.open_id, name: res.data.user.name }
      }

      // 姓名：走通讯录搜索
      if (data.type === 'name') {
        const res = await feishu<{
          code: number
          msg: string
          data?: { users?: Array<{ open_id?: string; name?: string; en_name?: string; department_ids?: string[] }> }
        }>(`/search/v1/user?query=${encodeURIComponent(data.value)}&page_size=10`, {
          method: 'GET',
        })
        if (res.code !== 0) {
          return {
            ok: false as const,
            error: `搜索接口错误 code=${res.code} msg=${res.msg}`,
            hint:
              res.code === 99991672 || /scope/i.test(res.msg ?? '')
                ? '应用缺少 search:user.id:readonly 权限。注意：通讯录搜索通常要求 user_access_token；如机器人无此能力，请改用「邮箱 / 手机号 / 工号」查询'
                : undefined,
          }
        }
        const list = (res.data?.users ?? []).filter((u) => u.open_id)
        if (list.length === 0) {
          return { ok: false as const, error: '未匹配到姓名相符的用户' }
        }
        // 精确匹配优先
        const exact = list.find((u) => u.name === data.value || u.en_name === data.value)
        const pick = exact ?? list[0]
        return {
          ok: true as const,
          openId: pick.open_id!,
          name: pick.name,
          candidates: list.slice(0, 5).map((u) => ({ openId: u.open_id!, name: u.name, enName: u.en_name })),
        }
      }

      return { ok: false as const, error: '不支持的查询类型' }
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? '请求失败' }
    }
  })

// ---------- 列出机器人所在群 ----------
export const listFeishuChats = createServerFn({ method: 'POST' }).handler(async () => {
  try {
    const chats: Array<{ chat_id: string; name: string; description?: string }> = []
    let pageToken: string | undefined = undefined
    // 最多翻 5 页（500 个群足够展示）
    for (let i = 0; i < 5; i++) {
      const qs = new URLSearchParams({ page_size: '100' })
      if (pageToken) qs.set('page_token', pageToken)
      const res = await feishu<{
        code: number
        msg: string
        data?: {
          items?: Array<{ chat_id: string; name: string; description?: string }>
          page_token?: string
          has_more?: boolean
        }
      }>(`/im/v1/chats?${qs.toString()}`, { method: 'GET' })
      if (res.code !== 0) {
        return {
          ok: false as const,
          error: `飞书接口错误 code=${res.code} msg=${res.msg}`,
          hint:
            res.code === 99991672 || /scope/i.test(res.msg ?? '')
              ? '应用缺少 im:chat:readonly 权限，请到飞书后台「权限管理」开通后重发布版本'
              : undefined,
        }
      }
      for (const it of res.data?.items ?? []) {
        chats.push({ chat_id: it.chat_id, name: it.name || '(未命名群)', description: it.description })
      }
      if (!res.data?.has_more || !res.data.page_token) break
      pageToken = res.data.page_token
    }
    return { ok: true as const, chats }
  } catch (e: any) {
    return { ok: false as const, error: e?.message ?? '请求失败' }
  }
})

// ---------- 批量查询 open_id ----------
export const batchLookupFeishuOpenId = createServerFn({ method: 'POST' })
  .inputValidator((input) =>
    z
      .object({
        emails: z.array(z.string().min(3).max(120)).max(50).optional(),
        mobiles: z.array(z.string().min(3).max(40)).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const body: Record<string, string[]> = {}
      if (data.emails?.length) body.emails = data.emails
      if (data.mobiles?.length) body.mobiles = data.mobiles
      if (!body.emails && !body.mobiles) {
        return { ok: false as const, error: '请至少输入一个邮箱或手机号' }
      }
      const res = await feishu<{
        code: number
        msg: string
        data?: {
          user_list?: Array<{ email?: string; mobile?: string; open_id?: string; user_id?: string }>
        }
      }>('/contact/v3/users/batch_get_id?user_id_type=open_id', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (res.code !== 0) {
        return {
          ok: false as const,
          error: `飞书接口错误 code=${res.code} msg=${res.msg}`,
          hint:
            res.code === 99991672 || /scope/i.test(res.msg ?? '')
              ? '应用缺少 contact:user.base:readonly 权限，请到飞书后台开通后重发布版本'
              : undefined,
        }
      }
      const list = res.data?.user_list ?? []
      const results = list.map((u) => ({
        input: u.email ?? u.mobile ?? '',
        kind: u.email ? ('email' as const) : ('mobile' as const),
        openId: u.open_id ?? null,
      }))
      return { ok: true as const, results }
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? '请求失败' }
    }
  })
