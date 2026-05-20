import { createFileRoute } from '@tanstack/react-router'
import { createHash, createDecipheriv } from 'crypto'
import { handleHackathonCardAction, handleRecapCardAction, handleRecapSubmit } from '@/lib/feishu.functions'

/**
 * 飞书事件回调入口
 *
 * 处理：
 *  1) url_verification（明文 + 加密模式）
 *  2) 卡片按钮回调 card.action.trigger（v2）/ action（v1 老结构）
 *  3) 其它事件先 ACK，等接业务
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

export const Route = createFileRoute('/api/public/feishu/webhook')({
  server: {
    handlers: {
      GET: async () =>
        json({ ok: true, service: 'feishu-webhook', ts: Date.now() }),

      POST: async ({ request }) => {
        let body: any = {}
        try {
          body = await request.json()
        } catch {
          return json({ error: 'invalid json' }, 400)
        }

        // 加密模式：先解密成明文 body
        if (body?.encrypt && typeof body.encrypt === 'string') {
          const encryptKey = process.env.FEISHU_ENCRYPT_KEY
          if (!encryptKey) {
            console.error('[feishu/webhook] FEISHU_ENCRYPT_KEY not set')
            return json({ error: 'encrypt key not configured' }, 500)
          }
          try {
            body = decryptFeishu(body.encrypt, encryptKey)
          } catch (e: any) {
            console.error('[feishu/webhook] decrypt failed:', e?.message)
            return json({ error: 'decrypt failed' }, 400)
          }
        }

        // 1) URL 校验
        if (body?.type === 'url_verification' && body?.challenge) {
          return json({ challenge: body.challenge })
        }

        // 2) 卡片按钮/表单回调 —— v2 事件结构
        const eventType: string | undefined = body?.header?.event_type
        const v2Action = body?.event?.action?.value
        const v1Action = body?.action?.value
        const value = v2Action ?? v1Action
        // 表单提交时的字段值（飞书会把表单各 input 的值放进 form_value）
        const formValue: Record<string, any> | undefined =
          body?.event?.action?.form_value ?? body?.action?.form_value

        if (eventType === 'card.action.trigger' || value) {
          try {
            if (value?.kind === 'hackathon' && value?.id && (value?.action === 'accept' || value?.action === 'dismiss')) {
              const result = await handleHackathonCardAction({ id: String(value.id), action: value.action })
              return json({ toast: result.toast })
            }
            if (value?.kind === 'recap' && value?.action === 'submit' && value?.date) {
              const result = await handleRecapSubmit({
                date: String(value.date),
                summary: String(formValue?.summary ?? ''),
                diary: String(formValue?.diary ?? ''),
                mood: String(formValue?.mood ?? ''),
              })
              return json({
                toast: result.toast,
                ...(result.card
                  ? { card: { type: 'raw', data: result.card } }
                  : {}),
              })
            }
            if (value?.kind === 'recap' && value?.action === 'done' && value?.date) {
              const result = await handleRecapCardAction({ action: 'done', date: String(value.date) })
              return json({ toast: result.toast })
            }
          } catch (e: any) {
            console.error('[feishu/webhook] card action error:', e?.message)
            return json({ toast: { type: 'error', content: '处理失败，请稍后重试' } })
          }
          return json({ toast: { type: 'info', content: '未识别的操作' } })
        }

        // 3) 其它事件先 ACK
        console.log('[feishu/webhook] event:', JSON.stringify(body).slice(0, 500))
        return json({ ok: true })
      },
    },
  },
})
