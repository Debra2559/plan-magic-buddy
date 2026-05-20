# Plan Magic Buddy

一个基于 **TanStack Start + React 19 + Lovable Cloud (Supabase)** 构建的 AI 助手项目，集成飞书 Webhook、AI 人设管理、头像缓存与性能监控等能力。

预览地址：<https://plan-magic-buddy.lovable.app>

## ✨ 主要功能

- 🤖 **AI 人设系统**：自定义角色人设，检测异常回退并支持一键重新生成
- 🖼️ **头像缓存**：懒加载 + 内存缓存，减少切换面板时的重复请求
- 📊 **性能监控**：开发模式下显示头像加载耗时、命中率、失败原因
- 📝 **资料变更历史**：保存头像 / 昵称 / 人设变更，支持一键恢复
- 🔌 **飞书 Webhook**：接收并解密事件，附带字段含义与常见故障原因提示
- 🔐 **认证系统**：基于 Lovable Cloud 的邮箱 + Google OAuth 登录

## 🛠️ 技术栈

| 类别 | 技术 |
| --- | --- |
| 框架 | TanStack Start v1, React 19, Vite 7 |
| 样式 | Tailwind CSS v4, shadcn/ui, Radix UI |
| 状态/数据 | TanStack Query, TanStack Router |
| 表单/校验 | React Hook Form, Zod |
| 后端 | Lovable Cloud (Supabase) — Auth / DB / Storage |
| AI | Lovable AI Gateway (Gemini / GPT 系列) |
| 运行时 | Cloudflare Workers (`nodejs_compat`) |

## 🚀 本地开发

```bash
# 安装依赖
bun install

# 启动开发服务器
bun run dev

# 生产构建
bun run build

# 代码检查 / 格式化
bun run lint
bun run format
```

环境变量由 Lovable Cloud 自动注入到 `.env`，**无需手动配置**：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

## 📁 项目结构

```
src/
├── routes/              # 文件式路由 (TanStack Router)
│   ├── __root.tsx       # 根布局
│   ├── index.tsx        # 首页
│   └── api/             # 服务端路由 / Webhook
├── components/          # 业务与 UI 组件
│   ├── ui/              # shadcn/ui 基础组件
│   ├── AiPersonaPanel.tsx
│   ├── CachedAvatar.tsx
│   ├── AvatarStatsOverlay.tsx
│   ├── ProfileHistoryPanel.tsx
│   └── FeishuWebhookLogsPanel.tsx
├── lib/                 # 工具与 server functions (*.functions.ts)
├── integrations/        # Supabase 客户端（自动生成）
└── styles.css           # Tailwind v4 主题与设计 token
```

## 🔧 关键模块说明

### AI 人设回退提示
位于 `src/lib/persona.tsx`。在 INSERT/UPDATE/DELETE 后检测人设是否回退为默认，触发后弹出提示并提供「重新生成」按钮。

### 头像缓存与监控
- `CachedAvatar`：懒加载 + 本地 Map 缓存（loaded / failed / inflight）。
- `AvatarStatsOverlay`：开发环境右下角浮窗，展示请求量、命中率、平均/P95 耗时、失败分布。

### 资料变更历史
所有头像 / 昵称 / 人设修改都会写入 `profile_history` 表，支持在设置面板查看最近变更并一键恢复。

### 飞书 Webhook 日志
`FeishuWebhookLogsPanel` 展示 `rx` 与 `decrypt` 每一步，并附带：
- **字段含义**：encrypt、key_len、headers 等
- **常见原因**：ENCRYPT_KEY 不匹配、CDN 重写、Content-Type、加密库差异

## 🌐 部署

由 **Lovable** 托管自动部署：

- 预览环境：每次保存自动更新 `*-dev.lovable.app`
- 正式发布：在 Lovable 编辑器中点击 **Publish**

如需自定义域名，可在 Project Settings → Domains 中绑定。

## 📄 License

MIT
