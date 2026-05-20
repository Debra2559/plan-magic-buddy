import { createFileRoute } from "@tanstack/react-router";
import { runScheduledInsights } from "@/lib/insights.functions";

export const Route = createFileRoute("/api/public/hooks/generate-insights")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const r = await runScheduledInsights();
          return Response.json({ ok: true, ...r });
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
        }
      },
    },
  },
});
