import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { scanAiNewsNow } from "@/lib/ai-news.functions";

export const Route = createFileRoute("/api/public/hooks/scan-ai-news")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await scanAiNewsNow();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
      GET: async () => {
        const result = await scanAiNewsNow();
        return new Response(JSON.stringify(result, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
