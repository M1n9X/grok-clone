# Performance Follow-up — 2026-07-16

延续 `2026-06-10-performance-review.md`。症状：访问（首屏/切会话）与联网搜索仍偏慢。

## 根因（本轮核实）

| 项 | 发现 |
|---|---|
| Vercel 区域 | 曾为 `syd1`（悉尼），与 Supabase 边缘（探针 CF ray `SIN`）错位 |
| 模型代理 | `api.codebreeze.dev`（偏美），首 token 前固定多一跳 |
| 默认模型 | UI 默认 Auto = multi-agent medium；开 Search 更慢 |
| 数据加载 | chat 页与侧栏均为 client mount 后再 `fetch` API |

## 本轮已落地

### 配置
- `vercel.json` `regions`: `syd1` → **`sin1`**（贴近新加坡边缘）

### 访问路径
- **SSR 会话消息**：`chat/[id]/page.tsx` 服务端 `getSessionWithMessages`，client 只做交互/流式；乐观 UUID **不** `notFound()`
- **SSR 侧栏列表**：`(chat)/layout.tsx` server + `ChatShell`；`Sidebar` 用 `initialSessions` 首屏直出
- **`getSessionWithMessages`**：单 Supabase client 并行查 session + messages；API `GET /api/sessions/[id]` 复用

### 搜索 / 发消息
- 开启 Web Search 且当前为 Auto 时 **自动切到 Fast**（可再手动改回 Auto/Expert）
- `/api/chat` 合并 status：Search 时直接 `Searching the web` / `Searching X`
- `/api/messages` 首条懒创建：**直接 INSERT session**（跳过先 SELECT）；仅 23505 时 recheck 归属。后续消息仍 ownership SELECT（防 IDOR：message RLS 只校验 message.user_id）

## 仍需手动（Dashboard）

- [ ] Supabase Infrastructure 确认 DB 区域；若实际在 Tokyo 则把 Vercel 改为 `hnd1`
- [ ] JWT Keys 迁移 asymmetric（`getClaims` 零网络的前提）
- [ ] 可选：换更近的 `OPENAI_API_BASE_URL`（当前 codebreeze 保留）

## 验证

- `npx tsx --test tests/*.test.ts`
- `npm run build`
- 手动：旧会话首屏有消息、新会话 pending 流式、Search→Fast、侧栏无 Loading 闪烁
