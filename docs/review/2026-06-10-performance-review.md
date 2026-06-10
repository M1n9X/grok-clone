# Performance Review — 2026-06-10

部署目标：Vercel。症状：首屏/导航访问偏慢，发消息与流式输出过程有卡顿。

本文档为代码级 review 的核实结论（所有要点均已对照源码与 `node_modules/next/dist/docs/` 中的 Next.js 16 文档验证），按影响排序，并标注落地状态。

---

## A. 网络延迟（TTFB / 操作响应）

### A1. 每个请求串行打 1–2 次 Supabase Auth 网络往返 ⭐ 最大元凶

- `src/proxy.ts` 对所有页面与 API 请求执行 `updateSession()`，其中
  `supabase.auth.getUser()`（`src/lib/supabase/middleware.ts:31`）是一次到
  Supabase Auth 服务器的网络往返。
- Route handler 内部再次 `getUser()`：`api/chat/route.ts`、`api/messages/route.ts`、
  `lib/db/queries.ts`（createSession / saveMessage）。
- Next 16 文档（`01-getting-started/16-proxy.md`）明确：*"Proxy is not intended for
  slow data fetching… should not be used as a full session management or
  authorization solution."*

**实测核实**：`@supabase/auth-js`（随 supabase-js 2.106 安装）的 `getClaims()`：
- 项目使用**非对称 JWT signing keys**（RS256/ES256 + kid）时：通过 JWKS 本地验签，
  **零网络往返**（JWKS 有进程内缓存）；
- 仍为对称 HS256 时：自动回退 `getUser()`，行为与现状一致（不会更差）；
- 无参调用时内部走 `getSession()`，保留过期 token 自动刷新与 cookie 写回语义，
  proxy 的 session 刷新职责不受影响。

**修复**：proxy 与所有 route handler / queries 改用 `getClaims()`，用户 id 取
`claims.sub`。
**手动操作（必需，才能拿到全部收益）**：Supabase Dashboard → Settings → API →
JWT Keys → 迁移到 asymmetric signing keys（迁移前代码已兼容）。

状态：✅ 已落地（代码侧）；⚠️ 需要手动迁移 signing keys。

### A2. 发消息的串行瀑布

原链路（从首页发第一条消息到模型开始生成）：

```
POST /api/sessions   （proxy auth + handler auth + insert ≈ 3 次串行往返）
→ router.push /chat/[id] → 页面挂载
→ await POST /api/messages（proxy auth + handler auth + 归属校验 SELECT + insert ≈ 4 次）
→ 才发起 POST /api/chat（再 2 次 auth）→ 上游模型
```

review 补充发现：`/api/messages` POST 在插入前还有一次会话归属校验 SELECT
（`api/messages/route.ts:29`，防 IDOR，RLS 的 insert policy 只校验 user_id，
该检查不能删，但可以与"懒创建会话"合并）。

**修复**：
1. 首页发送改为乐观导航：客户端 `crypto.randomUUID()` 生成会话 id，写入
   pending-msg 后**立即** `router.push`，不再等待 POST /api/sessions（schema 的
   `chat_sessions.id` 为 UUID PK，支持客户端供值）；
2. `/api/messages` POST 在会话不存在时按需创建（处理 23505 唯一冲突 + 归属复查，
   语义安全：RLS WITH CHECK 限制 user_id，重复 id 撞他人会话返回 404）；
3. `saveUserMessage` 与 `streamResponse` 并行执行，模型流立即启动；assistant
   消息持久化前 await 用户消息保存结果，保证 created_at 顺序。

状态：✅ 已落地。

### A3. Vercel 函数区域与 Supabase 区域未对齐（无 vercel.json）

每次 DB/Auth 往返若跨区会放大 100–300ms，并被 A1/A2 的串行链路成倍放大。

**手动操作**：确认 Supabase 项目所在区域（Dashboard → Settings →
Infrastructure），在 `vercel.json` 中设置一致的函数区域，例如 Supabase 在
`ap-northeast-1` 时：

```json
{ "functions": { "src/app/api/**": { "regions": ["hnd1"] } } }
```

（或项目级 `"regions": ["hnd1"]`。本仓库无法得知实际区域，故不代写。）

状态：⚠️ 手动操作。

---

## B. 前端结构（导航卡顿）

### B1. Sidebar/TopBar 在每个 page 内重复渲染，未提升到 layout

`app/page.tsx` 与 `app/chat/[id]/page.tsx` 各自渲染 `<Sidebar>`：每次
`router.push` 都导致 Sidebar 卸载重挂 → 重新 fetch `/api/sessions`（再过一遍
proxy）→ 闪 "Loading..." → 折叠状态丢失。

review 补充发现：sidebar 的新会话刷新依赖"挂载时读 `refreshSessions`
sessionStorage flag"（`sidebar.tsx:68`）——一旦提升到 layout 不再重挂，该机制
失效，必须同步改为事件驱动。

**修复**：新建 `app/(chat)/layout.tsx`（client）持有 Sidebar/TopBar/移动端
header/快捷键与侧栏状态；两个页面移入 route group 只渲染主内容；
`refreshSessions` flag 与 `sessionTitleUpdated` 全量重拉改为
`session-upsert` CustomEvent（携带 id/title，本地 upsert 列表项）；
sidebar "New Chat" 改为与 TopBar 一致的 `router.push("/")`（顺带消除一次
预创建空会话的 POST）。

状态：✅ 已落地。

### B2. 会话列表项无预取

`sidebar.tsx` 用可点击 div + `router.push`，无 `<Link>` 预取。考虑到列表项内嵌
编辑/删除按钮（`<a>` 内嵌 `<button>` 为非法嵌套），采用 hover/touchstart 时
`router.prefetch()` 方案。

状态：✅ 已落地。

---

## C. 流式渲染卡顿

### C1. 每帧全量重新解析 Markdown

`streamResponse` 每个 rAF flush 一次（`chat/[id]/page.tsx:132`）；
`ChatMessage` 的 memo 比较器保证只有正在流式的消息重渲，但该消息每次 flush 都
将**全文**重新过一遍 react-markdown（remark 解析 + DOM diff），叠加自动滚动的
强制 layout，长回复时掉帧明显。

**修复**：flush 节流至 ~100ms（肉眼无感，渲染次数降 5–8 倍）。后续可选：按块
拆分 markdown 并 memo 已完成块（本次未做，收益已大部分被节流覆盖）。

状态：✅ 已落地（节流）。

### C2. react-syntax-highlighter 加载全量 Prism

`markdown-renderer.tsx:33` 动态导入 `dist/esm/prism` 为含全部语言的完整构建
（数百 KB），首个代码块出现时下载+解析造成一顿。

**修复**：改用 `PrismLight` + 手动注册常用语言（refractor 语言定义自带别名，
`js`/`ts` 等别名可用），未注册语言优雅降级为纯文本。

状态：✅ 已落地。

---

## D. 小项

| 项 | 结论 | 状态 |
|---|---|---|
| 打开已有会话先闪"空会话 + 提示语"界面（`messages.length===0` 兼作加载态） | 增加 history loading 态 | ✅ 已落地 |
| `sessionTitleUpdated` 触发 sidebar 全量重拉 | 并入 B1 的事件本地更新 | ✅ 已落地 |
| `GET /api/sessions` 的 `Cache-Control: private, max-age=1` 基本无效果 | 无害，保留不动 | — |
| `chat_sessions.updated_at` 由 DB 触发器在消息插入时自动更新（schema.sql） | 无需客户端额外动作，现状正确 | — |
| favicon 图片用 `unoptimized`、字体 next/font、重依赖 dynamic import | 现状已正确 | — |

## 初版分析的修正记录

1. ✅ getClaims 可用性与回退语义已实测确认（asymmetric 本地验签 / HS256 回退
   getUser，不会更差）。
2. ➕ 新发现：`/api/messages` POST 的归属校验 SELECT 使保存消息达 4 次串行往返。
3. ➕ 新发现：sidebar 的 `refreshSessions` flag 机制与 layout 提升互斥，需事件化。
4. ✏️ 修正：会话列表项不宜直接换 `<Link>`（内嵌按钮非法嵌套），改用
   `router.prefetch`。
5. ➕ 新发现：DB 已有 updated_at 触发器，A2 的懒创建无需担心排序字段。

## 验证结果（2026-06-10）

- `next build`（Turbopack + TypeScript 检查）：✅ 通过。注意：本地构建需提供
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`（预渲染 `/`
  时 Sidebar 创建 browser client 需要；Vercel 上环境变量已配置，不受影响）。
- `tsx --test tests/*.test.ts`：✅ 28/28 通过。
- `eslint src`：✅ 无告警。

附带行为变更：sidebar 的 "New Chat" 改为与 TopBar 一致的返回首页（会话改为
首条消息发送时懒创建），不再预创建空 "New Chat" 会话。

## 待办事项

### 必做（代码收益的前提，仪表盘手动操作）

- [ ] **Supabase**：Dashboard → Settings → API → JWT Keys，迁移至
      asymmetric signing keys（A1 零网络验签的前提；迁移前代码自动回退
      `getUser()`，不会更差）。
- [ ] **Vercel**：确认 Supabase 项目区域（Dashboard → Settings →
      Infrastructure），在 `vercel.json` 设置一致的函数 region（A3）。

### 部署后验证

- [ ] 登录/登出重定向与 401 行为回归正常（proxy 鉴权路径改动）。
- [ ] 移动端 PWA、侧栏开合、会话重命名/删除回归正常（layout 重构）。
- [ ] 新会话首条消息：标题正确出现在侧栏、刷新后消息完整（懒创建链路）。

### 可选后续优化（本轮未做）

- [ ] Markdown 按块拆分并 memo 已完成块，进一步降低超长回复的流式渲染开销
      （C1 节流已覆盖大部分收益）。
- [ ] chat 页初始消息改为 server component 获取，首屏直出内容（需配合
      Supabase 服务端 fetch，改动面较大）。
- [ ] `/api/sessions` POST 已无 UI 调用方，可在确认无外部依赖后移除。
