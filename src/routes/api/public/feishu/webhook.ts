import { createFileRoute } from '@tanstack/react-router'
import { handleHackathonCardAction, handleRecapCardAction } from '@/lib/feishu.functions'

/**
 * 飞书事件回调入口
 *
 * 处理：
 *  1) url_verification（明文校验）
 *  2) 卡片按钮回调 card.action.trigger（v2）/ action（v1 老结构）
 *  3) 其它事件先 ACK，等接业务
 */

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

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

        // 1) URL 校验：明文模式
        if (body?.type === 'url_verification' && body?.challenge) {
          return json({ challenge: body.challenge })
        }

        // 加密模式占位
        if (body?.encrypt && !body?.type && !body?.header) {
          console.log('[feishu/webhook] encrypted payload; encrypt key not configured')
          return json({ ok: true, note: 'encrypt key not configured' })
        }

        // 2) 卡片按钮回调 —— v2 事件结构
        // header.event_type === 'card.action.trigger'
        const eventType: string | undefined = body?.header?.event_type
        const v2Action = body?.event?.action?.value
        const v1Action = body?.action?.value // 旧版直接挂在顶层

        const value = v2Action ?? v1Action
        if (eventType === 'card.action.trigger' || value) {
          try {
            if (value?.kind === 'hackathon' && value?.id && (value?.action === 'accept' || value?.action === 'dismiss')) {
              const result = await handleHackathonCardAction({ id: String(value.id), action: value.action })
              // 飞书 v2 卡片回调要求返回 { toast } 来轻提示
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
