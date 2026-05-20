import { createFileRoute } from '@tanstack/react-router'
import { runDailyRecapTick } from '@/lib/feishu.functions'

export const Route = createFileRoute('/api/public/hooks/daily-recap')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const r = await runDailyRecapTick()
          return Response.json({ ok: true, ...r })
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? 'failed' }, { status: 500 })
        }
      },
    },
  },
})
