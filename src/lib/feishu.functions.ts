import { createServerFn } from '@tanstack/react-start'

const FEISHU_BASE = 'https://open.feishu.cn/open-apis'

/**
 * 用 App ID + App Secret 换 tenant_access_token
 * 这是飞书所有 server-to-server 调用的前置步骤
 * 文档: https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal
 */
async function fetchTenantAccessToken(): Promise<{
  token: string
  expire: number
}> {
  const appId = process.env.FEISHU_APP_ID
  const appSecret = process.env.FEISHU_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('FEISHU_APP_ID / FEISHU_APP_SECRET 未配置')
  }

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
    throw new Error(`飞书返回错误: code=${json.code} msg=${json.msg}`)
  }
  return { token: json.tenant_access_token, expire: json.expire ?? 0 }
}

/** 测试连接：换 token 并返回过期秒数 */
export const testFeishuConnection = createServerFn({ method: 'POST' }).handler(
  async () => {
    try {
      const { expire } = await fetchTenantAccessToken()
      return { ok: true as const, expire }
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? '未知错误' }
    }
  }
)
