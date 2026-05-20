import { createFileRoute } from '@tanstack/react-router'

/**
 * 飞书事件回调入口
 *
 * 飞书在配置「请求地址」时会先发一个 url_verification 包：
 *   { "challenge": "xxxx", "token": "...", "type": "url_verification" }
 * 服务端必须原样返回 { "challenge": "xxxx" } 才会校验通过。
 *
 * 之后的真实事件会带 encrypt 字段（如果在飞书后台配置了 Encrypt Key），
 * 这里先把 mock 的流程跑通 —— 校验地址 + 接收事件 + 200 ACK。
 * 真正的解密 & 反查 mapping 在接入 Lovable Cloud 数据表后补上。
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

        // 2) URL 校验：加密模式 —— 飞书会把 challenge 放在 encrypt 内
        //    在没拿到 Encrypt Key 之前，先把原文回吐，方便排查。
        //    （生产环境会解密后再返回 challenge。）
        if (body?.encrypt && !body?.type) {
          console.log('[feishu/webhook] encrypted payload received, encrypt key not configured yet')
          return json({ ok: true, note: 'encrypt key not configured' })
        }

        // 3) 正常事件：先 ACK，业务逻辑后续接入 Lovable Cloud 后补
        console.log('[feishu/webhook] event:', JSON.stringify(body).slice(0, 500))
        return json({ ok: true })
      },
    },
  },
})
