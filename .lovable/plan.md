## 背景

目前 `sylva-store` 里所有用户数据（日程/待办、随手记、日记、习惯、漫画）都只存在浏览器的 `localStorage`，**根本没有写到数据库**。两台设备之间互不可见，所以「手机记录 → Mac 实时刷新」当前完全做不到。

要做到真正的实时联动，需要把这些状态搬到 Supabase，并通过 Postgres Changes（Realtime）推送到其他设备。

## 设计原则

- **无登录**：你选了「不加账号系统」。所有设备共享同一个 **全局工作区**（一个固定的 workspace 行）。优点是上手零摩擦，缺点是任何人打开链接都能看到/改你的内容 —— 这点必须先确认你能接受。
- **本地优先 + 实时合并**：写操作仍然先改本地 state（保持 UI 反应快），再 upsert 到数据库；其它设备通过 Realtime 收到 row change 后合并到本地。
- **localStorage 仍保留**：作为离线兜底 + 启动时的 instant render；联网后立刻被远端覆盖。

## 数据库（新增 5 张表）

每张表都带 `updated_at`（用来做 last-write-wins 合并）和触发器自动维护。

```text
schedule_items   id text PK, type, title, date, time, duration_min, tag, note, done, updated_at, deleted_at
notes            id text PK, text, mood, tags text[], pinned, images text[], created_at, updated_at, deleted_at
habits           id text PK, name, emoji, history text[], updated_at, deleted_at
diary_entries    date text PK, content, mood, updated_at
comics           date text PK, image_url, provider, caption, created_at, updated_at
```

RLS：因为是「公开共享工作区」，对 anon 开放 select/insert/update/delete（不存敏感字段；漫画、随手记里可能有图片 dataURL，这点你要确认可接受）。如果以后加登录，再补 user_id 列和策略即可。

删除采用**软删除**（`deleted_at`），这样其它设备能正确同步「这条被删掉了」。

## 同步层（`src/lib/sync.ts` 新文件）

每种实体一个 hook：`useSyncedItems()`、`useSyncedNotes()` 等。统一职责：

1. 首次挂载：`select * where deleted_at is null`，结果合并进 store（远端优先）。
2. 订阅 `postgres_changes`（INSERT/UPDATE/DELETE）→ 按 `updated_at` 合并。
3. 暴露 `upsertRemote(row)` / `softDeleteRemote(id)` 给 store 的 mutator 调用。

`sylva-store` 内的 `addItems`、`updateItem`、`addNote`、`toggleHabitOn` 等方法改成：本地 set + fire-and-forget upsert 到 Supabase。

## 服务端

- 新增一个 migration：建表 + 启用 Realtime（`alter publication supabase_realtime add table …` + `replica identity full`）+ RLS。
- 不需要新 server function —— 直接用浏览器 `supabase` client 读写就行（公开表）。

## 迁移现有数据

挂载时如果远端表为空 而本地有 seed 数据，则一次性把本地推上去（避免你打开就看到空白）。之后远端永远是 source of truth。

## 不做的事（避免范围爆炸）

- 不引入登录 / 多账户隔离（你已经选了「不加」）。
- 不做冲突 UI —— 用最朴素的 `updated_at` 比较即可。
- 不动飞书同步、AI 雷达这些已经在 DB 里的功能。
- 漫画历史 `comicHistory`（80 条循环缓存）保持本地，没有跨端价值。

## 风险提醒（请确认）

1. **公开访问**：任何拿到你预览链接的人都能读写你的日程/随手记/日记。如果不接受 → 必须加登录，请告诉我。
2. **图片体积**：随手记的图片是 dataURL（最大压到 1280px），存进 Postgres 会让行很大。如果图片多建议改成 Supabase Storage —— 但那是另一块工作，本次默认仍然存 dataURL。

确认接受这两点之后我就开干。