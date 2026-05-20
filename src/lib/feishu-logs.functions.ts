import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

export const listFeishuWebhookLogs = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).optional(),
        level: z.enum(['all', 'info', 'warn', 'error']).optional(),
        requestId: z.string().max(64).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context
    let q = supabase
      .from('feishu_webhook_logs')
      .select('id, request_id, step, level, event_type, status, duration_ms, message, error, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(data.limit ?? 100)
    if (data.level && data.level !== 'all') q = q.eq('level', data.level)
    if (data.requestId) q = q.eq('request_id', data.requestId)
    const { data: rows, error } = await q
    if (error) return { rows: [], error: error.message }
    return { rows: rows ?? [], error: null }
  })
