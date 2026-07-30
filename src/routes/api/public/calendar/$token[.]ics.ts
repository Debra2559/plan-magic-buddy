import { createFileRoute } from "@tanstack/react-router";

// 生成 iCalendar (ICS) 输出，供 iOS / macOS / Google Calendar 订阅
// URL 形如 /api/public/calendar/<token>.ics

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// 把 "YYYY-MM-DD" + "HH:MM" 组合成本地时区下的 ICS "YYYYMMDDTHHMMSS"
function toLocalStamp(date: string, time?: string | null) {
  const [y, m, d] = date.split("-").map(Number);
  if (time && /^\d{1,2}:\d{2}/.test(time)) {
    const [hh, mm] = time.split(":").map(Number);
    return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
  }
  return null; // 全天
}

function addMinutes(date: string, time: string, mins: number) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm + mins);
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
}

function nextDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`;
}

function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// 折行到 75 字节（RFC 5545）
function fold(line: string) {
  const out: string[] = [];
  let s = line;
  while (s.length > 75) {
    out.push(s.slice(0, 75));
    s = " " + s.slice(75);
  }
  out.push(s);
  return out.join("\r\n");
}

export const Route = createFileRoute("/api/public/calendar/$token.ics")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = String(
          (params as any).token ?? (params as any)["token.ics"] ?? "",
        );
        // 路由参数可能带上 .ics 后缀，这里统一去掉
        const token = raw.replace(/\.ics$/i, "");
        if (!token || token.length < 8) {
          return new Response("invalid token", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tokenRow } = await supabaseAdmin
          .from("calendar_tokens")
          .select("user_id, revoked_at")
          .eq("token", token)
          .maybeSingle();
        if (!tokenRow || tokenRow.revoked_at) {
          return new Response("token not found or revoked", { status: 404 });
        }
        const userId = tokenRow.user_id as string;

        const { data: items } = await supabaseAdmin
          .from("schedule_items")
          .select("id, type, title, date, time, duration_min, tag, note, done, updated_at")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .not("date", "is", null);

        const now = new Date();
        const stampNow =
          `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
          `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

        const tzid = "Asia/Shanghai";
        const lines: string[] = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//Sylva//Schedule Sync//CN",
          "CALSCALE:GREGORIAN",
          "METHOD:PUBLISH",
          "X-WR-CALNAME:Sylva 日程",
          "X-WR-TIMEZONE:" + tzid,
          "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
          "X-PUBLISHED-TTL:PT1H",
        ];

        for (const it of items ?? []) {
          const date = it.date as string;
          const time = (it.time as string | null) ?? null;
          const title = escapeText((it.title as string) ?? "(无标题)");
          const noteBits: string[] = [];
          if (it.type) noteBits.push(`类型：${it.type}`);
          if (it.tag) noteBits.push(`标签：${it.tag}`);
          if (it.done) noteBits.push("✅ 已完成");
          if (it.note) noteBits.push(String(it.note));
          const desc = escapeText(noteBits.join("\n"));
          const uid = `${it.id}@sylva`;

          lines.push("BEGIN:VEVENT");
          lines.push(`UID:${uid}`);
          lines.push(`DTSTAMP:${stampNow}`);
          lines.push(`SUMMARY:${title}`);
          if (desc) lines.push(fold(`DESCRIPTION:${desc}`));
          if (it.tag) lines.push(`CATEGORIES:${escapeText(String(it.tag))}`);

          const startStamp = toLocalStamp(date, time);
          if (startStamp) {
            const dur = Math.max(15, (it.duration_min as number | null) ?? 30);
            const endStamp = addMinutes(date, time as string, dur);
            lines.push(`DTSTART;TZID=${tzid}:${startStamp}`);
            lines.push(`DTEND;TZID=${tzid}:${endStamp}`);
          } else {
            // 全天事件
            const startDay = date.replaceAll("-", "");
            lines.push(`DTSTART;VALUE=DATE:${startDay}`);
            lines.push(`DTEND;VALUE=DATE:${nextDay(date)}`);
          }
          lines.push("END:VEVENT");
        }
        lines.push("END:VCALENDAR");

        const body = lines.join("\r\n");
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Content-Disposition": 'inline; filename="sylva.ics"',
          },
        });
      },
    },
  },
});
