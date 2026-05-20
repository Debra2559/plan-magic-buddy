## 目标

1. 加登录（邮箱 + Google），每人一套数据。
2. 现有公共工作区的数据全部归到「第一个登录的账号」（也就是你）。
3. 加 AI 人设设置，所有 AI 输出（提醒文案、早安总结、AI 规划、雷达卡片、日记反馈）都按该人设说话。
4. 默认人设：「称呼我为主人；幽默搞笑、贱贱的，但很专业」。

## 一、账号系统

- 启用邮箱 + 密码 + Google（managed Lovable OAuth）。
- 新增 `/login` 路由：tabs（登录 / 注册），底部一个「用 Google 继续」。
- 把整个 app 套进 `_authenticated` layout，未登录跳 `/login`。
- 顶部加用户菜单（头像 + 邮箱 + 退出）。
- `__root.tsx` 监听 `onAuthStateChange` → `router.invalidate()` + `queryClient.invalidateQueries()`。

## 二、数据按用户隔离

每张业务表加 `user_id uuid not null`，重写 RLS 为「只能读写自己 user_id 的行」。涉及：
`schedule_items` / `notes` / `habits` / `diary_entries` / `comics` / `feishu_settings` / `ai_news_settings` / `ai_news` / `hackathon_settings` / `hackathons` / `daily_recaps` / `feishu_event_map`。

**数据迁移**：用 trigger + `claim_legacy_data()` 函数 —— 第一次有用户注册成功后，把所有现存 `user_id IS NULL` 的行批量更新成该用户的 id（你抢到沙发）。之后所有 NULL 列改成 NOT NULL。

`cloud-sync.ts` 里 upsert / fetch 全部带上当前 `auth.uid()`（让 supabase-js 在 insert 时由 default 写入即可，RLS 自动过滤 select）。

## 三、AI 人设

### DB
新表 `user_profiles`：
- `user_id uuid pk references auth.users on delete cascade`
- `display_name text`（AI 怎么称呼你，默认「主人」）
- `persona_prompt text`（一段自由文本，默认预填那段「幽默搞笑贱贱但专业」）
- `persona_traits jsonb`（结构化标签：幽默度 1-5 / 礼貌度 1-5 / 是否允许玩梗 / 禁忌话题数组），方便以后拖滑块调整
- `tone_examples text`（可选：放两三句示范语气，让模型对齐）

### UI
`SettingsView` 顶部加 `AiPersonaPanel`：
- 「AI 怎么称呼我」单行输入
- 「人设描述」多行 textarea（默认填上「幽默搞笑、贱贱的但很专业，称呼我为主人」）
- 四个滑块：幽默度 / 贱度 / 专业度 / 啰嗦度
- 「试一句」按钮 —— 调一次 AI 用当前设定输出一句晨间问候，让你即时感受效果

### 注入
新建 `src/lib/persona.ts` 暴露 `getActivePersona()` + `buildPersonaSystemPrompt(persona)`，所有 server function 调 AI 的地方（`plan.functions.ts` / `feishu.functions.ts` 的日报卡 / `ai-news.functions.ts` 的归类提示词 / `comic.functions.ts` 的 caption）都改为：
```
system = personaSystemPrompt + "\n\n" + 原有任务 prompt
```
任务指令保持不变，只是说话风格被人设包裹。本地的 `ReminderRunner` 提醒文案目前是模板字符串，会改成「先按人设模板渲染，模板里塞 displayName + persona 短摘要」。

## 四、范围之外（这次不做）

- 多用户互相协作 / 分享某条日程。
- 人设的「记忆」自动学习（先用静态 prompt，够用了再说）。
- 现有飞书 webhook 路由的鉴权改造（webhook 是公共的，按 receive_id 路由到对应 user_id —— 这次先保留单用户行为，后续单独做）。

## 风险提醒

- 一旦切换到「登录后可用」，你目前没登录的预览窗口会立刻被踢到 `/login`。
- 现存数据会自动归到「第一个登录成功的账号」，请确保第一个登录的是你自己的邮箱，否则数据会跟到别人那。
- 飞书侧推过来的事件目前认不出是谁的，会先全部归到你的账号（和迁移规则一致）。

确认 OK 就开干。
