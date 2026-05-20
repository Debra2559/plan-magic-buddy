import { createFileRoute } from '@tanstack/react-router'
import { createHash, createDecipheriv, randomUUID } from 'crypto'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { handleHackathonCardAction, handleRecapCardAction, handleRecapSubmit } from '@/lib/feishu.functions'

/**
 * 飞书事件回调入口（带可追踪日志）
 *
 * 处理：
 *  1) url_verification（明文 + 加密模式）
 *  2) 卡片按钮回调 card.action.trigger
 *  3) 其它事件先 ACK
 */

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// 飞书 AES-256-CBC 解密：key = SHA256(encrypt_key)，IV = 密文前 16 字节
function decryptFeishu(encrypt: string, encryptKey: string): any {
  const key = createHash('sha256').update(encryptKey).digest()
  const buf = Buffer.from(encrypt, 'base64')
  const iv = buf.subarray(0, 16)
  const data = buf.subarray(16)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(decrypted.toString('utf8'))
}

type LogLevel = 'info' | 'warn' | 'error'
interface LogRow {
  request_id: string
  step: string
  level: LogLevel
  event_type?: string | null
  status?: number | null
  duration_ms?: number | null
  message?: string | null
  error?: string | null
  payload?: any
}

function clip(obj: any, max = 4000): any {
  try {
    const s = JSON.stringify(obj)
    if (s.length <= max) return obj
    return { _truncated: true, preview: s.slice(0, max) }
  } catch {
    return { _unserializable: String(obj) }
  }
}

async function persistLog(row: LogRow) {
  // 非阻塞：写日志失败不影响响应
  try {
    await supabaseAdmin.from('feishu_webhook_logs').insert({
      request_id: row.request_id,
      step: row.step,
      level: row.level,
      event_type: row.event_type ?? null,
      status: row.status ?? null,
      duration_ms: row.duration_ms ?? null,
      message: row.message ?? null,
      error: row.error ?? null,
      payload: row.payload ?? null,
    })
  } catch (e: any) {
    console.error('[feishu/webhook] persistLog failed:', e?.message)
  }
}

function mkLogger(request_id: string) {
  return (row: Omit<LogRow, 'request_id'>) => {
    const tag = `[feishu/webhook ${request_id} ${row.step}]`
    const msg = row.message ?? ''
    if (row.level === 'error') console.error(tag, msg, row.error ?? '')
    else if (row.level === 'warn') console.warn(tag, msg)
    else console.log(tag, msg)
    // 写库（不 await，避免拖慢响应）
    void persistLog({ request_id, ...row })
  }
}

export const Route = createFileRoute('/api/public/feishu/webhook')({
  server: {
    handlers: {
      GET: async () =>
        json({ ok: true, service: 'feishu-webhook', ts: Date.now() }),

      POST: async ({ request }) => {
        const request_id = randomUUID()
        const startedAt = Date.now()
        const log = mkLogger(request_id)

        let raw = ''
        let body: any = {}
        try {
          raw = await request.text()
          body = raw ? JSON.parse(raw) : {}
          log({
            step: 'rx',
            level: 'info',
            message: `received ${raw.length} bytes`,
            payload: { headers: { 'content-type': request.headers.get('content-type') }, bodyPreview: raw.slice(0, 500) },
          })
        } catch (e: any) {
          log({ step: 'parse', level: 'error', error: e?.message, message: 'invalid json', payload: { raw: raw.slice(0, 500) } })
          return json({ error: 'invalid json' }, 400)
        }

        // 加密模式：先解密
        if (body?.encrypt && typeof body.encrypt === 'string') {
          const encryptKey = process.env.FEISHU_ENCRYPT_KEY
          if (!encryptKey) {
            log({ step: 'decrypt', level: 'error', message: 'FEISHU_ENCRYPT_KEY not set' })
            return json({ error: 'encrypt key not configured' }, 500)
          }
          try {
            body = decryptFeishu(body.encrypt, encryptKey)
            log({ step: 'decrypt', level: 'info', message: 'decrypted ok' })
          } catch (e: any) {
            log({ step: 'decrypt', level: 'error', error: e?.message, message: 'decrypt failed' })
            return json({ error: 'decrypt failed' }, 400)
          }
        }

        const eventType: string | undefined = body?.header?.event_type ?? body?.type

        // 1) URL 校验
        if (body?.type === 'url_verification' && body?.challenge) {
          log({
            step: 'url_verification',
            level: 'info',
            event_type: 'url_verification',
            status: 200,
            duration_ms: Date.now() - startedAt,
            message: 'challenge returned',
          })
          return json({ challenge: body.challenge })
        }

        // 2) 卡片回调
        const v2Action = body?.event?.action?.value
        const v1Action = body?.action?.value
        const value = v2Action ?? v1Action
        const formValue: Record<string, any> | undefined =
          body?.event?.action?.form_value ?? body?.action?.form_value

        if (eventType === 'card.action.trigger' || value) {
          log({
            step: 'dispatch',
            level: 'info',
            event_type: eventType ?? 'card.action',
            message: `card action kind=${value?.kind} action=${value?.action}`,
            payload: clip({ value, formValue }),
          })
          try {
            if (value?.kind === 'hackathon' && value?.id && (value?.action === 'accept' || value?.action === 'dismiss')) {
              const result = await handleHackathonCardAction({ id: String(value.id), action: value.action })
              log({ step: 'handler', level: 'info', event_type: eventType, status: 200, duration_ms: Date.now() - startedAt, message: 'hackathon handled' })
              return json({ toast: result.toast })
            }
            if (value?.kind === 'recap' && value?.action === 'submit' && value?.date) {
              const result = await handleRecapSubmit({
                date: String(value.date),
                summary: String(formValue?.summary ?? ''),
                diary: String(formValue?.diary ?? ''),
                mood: String(formValue?.mood ?? ''),
              })
              log({ step: 'handler', level: 'info', event_type: eventType, status: 200, duration_ms: Date.now() - startedAt, message: 'recap submit handled' })
              return json({
                toast: result.toast,
                ...(result.card ? { card: { type: 'raw', data: result.card } } : {}),
              })
            }
            if (value?.kind === 'recap' && value?.action === 'done' && value?.date) {
              const result = await handleRecapCardAction({ action: 'done', date: String(value.date) })
              log({ step: 'handler', level: 'info', event_type: eventType, status: 200, duration_ms: Date.now() - startedAt, message: 'recap done handled' })
              return json({ toast: result.toast })
            }
          } catch (e: any) {
            log({
              step: 'handler',
              level: 'error',
              event_type: eventType,
              status: 200,
              duration_ms: Date.now() - startedAt,
              error: e?.stack || e?.message,
              message: 'card action handler threw',
              payload: clip({ value, formValue }),
            })
            return json({ toast: { type: 'error', content: '处理失败，请稍后重试' } })
          }
          log({
            step: 'handler',
            level: 'warn',
            event_type: eventType,
            status: 200,
            duration_ms: Date.now() - startedAt,
            message: 'unknown card action value',
            payload: clip({ value, formValue }),
          })
          return json({ toast: { type: 'info', content: '未识别的操作' } })
        }

        // 2.5) 收到用户消息：自动捕获 sender.open_id 保存为通知接收人
        if (eventType === 'im.message.receive_v1') {
          const senderOpenId: string | undefined =
            body?.event?.sender?.sender_id?.open_id ?? body?.event?.sender?.open_id
          if (senderOpenId) {
            try {
              const { data: row } = await supabaseAdmin
                .from('feishu_settings')
                .select('id, notify_receive_id, notify_receive_id_type')
                .limit(1)
                .maybeSingle()
              const patch = {
                notify_receive_id: senderOpenId,
                notify_receive_id_type: 'open_id',
              }
              if (!row) {
                await supabaseAdmin.from('feishu_settings').insert(patch as any)
              } else {
                await supabaseAdmin.from('feishu_settings').update(patch as any).eq('id', row.id)
              }
              log({
                step: 'capture_open_id',
                level: 'info',
                event_type: eventType,
                status: 200,
                duration_ms: Date.now() - startedAt,
                message: `saved sender open_id ${senderOpenId.slice(0, 8)}…`,
                payload: { senderOpenId, receiveIdType: 'open_id' },
              })
            } catch (e: any) {
              log({ step: 'capture_open_id', level: 'error', event_type: eventType, error: e?.message, message: 'save open_id failed' })
            }
          } else {
            log({ step: 'capture_open_id', level: 'warn', event_type: eventType, message: 'no sender.open_id in payload', payload: clip(body?.event?.sender) })
          }
          return json({ ok: true })
        }

        // 3) 其它事件先 ACK
        log({
          step: 'ack',
          level: 'info',
          event_type: eventType ?? 'unknown',
          status: 200,
          duration_ms: Date.now() - startedAt,
          message: 'event ack',
          payload: clip(body),
        })
        return json({ ok: true })
      },
    },
  },
})
