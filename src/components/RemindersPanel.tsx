import { useState } from "react";
import { Bell, Sunrise, BellOff, AlarmClock, Moon, Check } from "lucide-react";
import { isInQuietHours, useReminderSettings } from "@/lib/reminder-settings";

function Toggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full transition border shrink-0 ${
        on ? "bg-amber-glow/40 border-amber-glow/60" : "bg-foreground/10 border-border"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value || "00:00")}
      className="bg-foreground/5 border border-border rounded-md px-2 py-1 text-sm text-foreground font-mono outline-none focus:border-amber-glow/60"
    />
  );
}

export function RemindersPanel() {
  const { settings, update } = useReminderSettings();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );
  const inQuiet = isInQuietHours(settings);

  const requestPerm = async () => {
    if (permission === "unsupported") return;
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
    } catch { /* ignore */ }
  };

  const sendTest = () => {
    if (permission !== "granted") return;
    try {
      new Notification("提醒预览", {
        body: `这是一条测试通知 · ${new Date().toLocaleTimeString()}`,
        icon: "/favicon.ico",
      });
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      {/* 桌面通知 */}
      <div className="widget overflow-hidden divide-y divide-border/70">
        <div className="flex items-center px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-glow" />
              <div className="text-sm text-foreground font-medium">桌面通知</div>
              {settings.desktopEnabled && inQuiet && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/70">
                  当前正在静音
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              日程开始前推送提醒，浏览器需授权通知权限
            </div>
          </div>
          <Toggle on={settings.desktopEnabled} onChange={(v) => update({ desktopEnabled: v })} />
        </div>

        <div className={`flex items-center px-4 py-3 ${!settings.desktopEnabled ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex-1">
            <div className="text-sm text-foreground">提前提醒</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              事件开始前 {settings.leadMinutes} 分钟提示
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[1, 5, 10, 15, 30].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => update({ leadMinutes: n })}
                className={`text-xs px-2 py-1 rounded-md border transition ${
                  settings.leadMinutes === n
                    ? "bg-amber-glow/25 border-amber-glow/60 text-foreground font-medium"
                    : "bg-foreground/5 border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {n}分
              </button>
            ))}
          </div>
        </div>

        <div className={`px-4 py-3 ${!settings.desktopEnabled ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex items-center mb-2">
            <Moon className="w-3.5 h-3.5 text-foreground/60 mr-1.5" />
            <div className="flex-1">
              <div className="text-sm text-foreground">勿扰时段</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                这个时间段内不会弹出通知（支持跨夜）
              </div>
            </div>
            <Toggle on={settings.quietEnabled} onChange={(v) => update({ quietEnabled: v })} />
          </div>
          <div className={`flex items-center gap-2 ${!settings.quietEnabled ? "opacity-50 pointer-events-none" : ""}`}>
            <TimeInput value={settings.quietStart} onChange={(v) => update({ quietStart: v })} />
            <span className="text-xs text-muted-foreground">至</span>
            <TimeInput value={settings.quietEnd} onChange={(v) => update({ quietEnd: v })} />
          </div>
        </div>

        <div className="flex items-center px-4 py-3">
          <div className="flex-1">
            <div className="text-sm text-foreground">浏览器权限</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {permission === "granted" && "已授权"}
              {permission === "denied" && "已被浏览器拒绝，请在地址栏权限里手动开启"}
              {permission === "default" && "尚未授权"}
              {permission === "unsupported" && "当前浏览器不支持桌面通知"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {permission === "granted" ? (
              <button
                type="button"
                onClick={sendTest}
                className="text-xs px-3 py-1 rounded-full bg-amber-glow/20 border border-amber-glow/50 text-foreground font-medium hover:bg-amber-glow/30 inline-flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> 发送测试
              </button>
            ) : permission === "default" ? (
              <button
                type="button"
                onClick={requestPerm}
                className="text-xs px-3 py-1 rounded-full bg-foreground/10 border border-border text-foreground hover:bg-foreground/15"
              >
                申请权限
              </button>
            ) : (
              <span className="text-xs text-muted-foreground/70 inline-flex items-center gap-1">
                <BellOff className="w-3 h-3" />
                不可用
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 早安总结 */}
      <div className="widget overflow-hidden divide-y divide-border/70">
        <div className="flex items-center px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Sunrise className="w-4 h-4 text-amber-glow" />
              <div className="text-sm text-foreground font-medium">AI 早安总结</div>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              每天清晨自动汇总当日日程，向你说声早安
            </div>
          </div>
          <Toggle on={settings.morningEnabled} onChange={(v) => update({ morningEnabled: v })} />
        </div>

        <div className={`flex items-center px-4 py-3 ${!settings.morningEnabled ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex-1">
            <div className="text-sm text-foreground">推送时间</div>
            <div className="text-xs text-muted-foreground mt-0.5">每天 {settings.morningTime}</div>
          </div>
          <div className="flex items-center gap-2">
            {["07:00", "07:30", "08:00", "09:00"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update({ morningTime: t })}
                className={`text-xs px-2 py-1 rounded-md border transition font-mono ${
                  settings.morningTime === t
                    ? "bg-amber-glow/25 border-amber-glow/60 text-foreground"
                    : "bg-foreground/5 border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
            <TimeInput value={settings.morningTime} onChange={(v) => update({ morningTime: v })} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
        <AlarmClock className="w-3 h-3" />
        提醒由当前浏览器在后台轮询触发，关掉标签页将不会送达。
      </div>
    </div>
  );
}
