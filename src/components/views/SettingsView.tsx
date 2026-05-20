import { Bell, Cloud, Palette, Keyboard, User, Info } from "lucide-react";
import { FeishuSyncPanel } from "@/components/FeishuSyncPanel";

const sections = [
  {
    title: "通用",
    icon: User,
    rows: [
      { label: "登录账户", value: "lov@sylva.app", action: "管理" },
      { label: "界面语言", value: "简体中文", action: "切换" },
      { label: "外观主题", value: "森林沉浸 · 自动", action: "更改" },
    ],
  },
  {
    title: "其他同步",
    icon: Cloud,
    rows: [
      { label: "iCloud 同步", value: "已开启", action: "管理" },
      { label: "Apple 日历", value: "未连接", action: "连接" },
    ],
  },
  {
    title: "提醒",
    icon: Bell,
    rows: [
      { label: "桌面通知", value: "开启 · 不打扰：22:00 - 08:00", action: "调整" },
      { label: "AI 早安总结", value: "每天 7:30", action: "更改" },
    ],
  },
  {
    title: "外观",
    icon: Palette,
    rows: [
      { label: "桌面壁纸", value: "Redwood Forest", action: "更换" },
      { label: "字体", value: "DM Serif · Plus Jakarta", action: "调整" },
    ],
  },
  {
    title: "快捷键",
    icon: Keyboard,
    rows: [
      { label: "唤起 AI 输入", value: "⌘ + ⇧ + Space", action: "改键" },
      { label: "添加随手记", value: "⌘ + N", action: "改键" },
    ],
  },
];

export function SettingsView() {
  return (
    <div className="p-7 overflow-auto h-full max-w-3xl mx-auto">
      <p className="text-[10px] tracking-widest text-amber-glow mb-1">偏好设置</p>
      <h2 className="font-display text-3xl text-white mb-7">让 Sylva 长成你的样子。</h2>

      <div className="space-y-7">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.title}>
              <div className="flex items-center gap-2 mb-3">
                <Icon className="w-4 h-4 text-amber-glow" />
                <h3 className="font-display text-lg text-white">{s.title}</h3>
              </div>
              <div className="widget overflow-hidden divide-y divide-white/8">
                {s.rows.map((row) => (
                  <div key={row.label} className="flex items-center px-4 py-3 hover:bg-white/[0.03]">
                    <div className="flex-1">
                      <div className="text-sm text-white/90">{row.label}</div>
                      <div className="text-xs text-white/50 mt-0.5">{row.value}</div>
                    </div>
                    <button className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/10">
                      {row.action}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div className="flex items-center gap-2 text-xs text-white/40 pt-4">
          <Info className="w-3 h-3" />
          <span>Sylva v0.9.0 · 像森林一样陪你长出节奏</span>
        </div>
      </div>
    </div>
  );
}
