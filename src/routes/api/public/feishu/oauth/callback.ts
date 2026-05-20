import { createFileRoute } from '@tanstack/react-router'
import { exchangeCodeAndSave } from '@/lib/feishu-user-auth.functions'

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>飞书授权</title>
<style>body{font-family:system-ui;background:#0b0b0f;color:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{max-width:420px;padding:24px 28px;border:1px solid #333;border-radius:14px;background:#15151c}
h1{font-size:18px;margin:0 0 8px}p{color:#aaa;font-size:13px;line-height:1.6;margin:6px 0}
code{background:#000;padding:2px 6px;border-radius:4px;color:#ffb86b}
button{margin-top:14px;padding:8px 14px;border:0;border-radius:8px;background:#ffb86b;color:#000;font-weight:600;cursor:pointer}</style></head>
<body><div class="card">${body}
<button onclick="window.close()">关闭窗口</button></div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

export const Route = createFileRoute('/api/public/feishu/oauth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')
        if (error) {
          return html(`<h1>❌ 授权被拒绝</h1><p><code>${error}</code></p>`)
        }
        if (!code) {
          return html(`<h1>❌ 缺少 code 参数</h1>`)
        }
        // 与发起授权时一致的 redirect_uri
        const redirectUri = `${url.origin}/api/public/feishu/oauth/callback`
        try {
          const r = await exchangeCodeAndSave(code, redirectUri)
          return html(
            `<h1>✅ 授权成功</h1>
<p>已保存你的飞书用户访问令牌。</p>
${r.name ? `<p>用户：<code>${r.name}</code></p>` : ''}
${r.openId ? `<p>open_id：<code>${r.openId}</code></p>` : ''}
<p>可关闭本页面，回到应用继续按姓名 / 工号搜索。</p>`,
          )
        } catch (e: any) {
          return html(`<h1>❌ 换取 token 失败</h1><p>${e?.message ?? 'unknown'}</p>`, 500)
        }
      },
    },
  },
})
