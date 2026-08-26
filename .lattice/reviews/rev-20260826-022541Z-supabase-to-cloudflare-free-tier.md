---
id: rev-20260826-022541Z
slug: supabase-to-cloudflare-free-tier
title: "grok-clone：Supabase 迁移至 Cloudflare 免费套餐可行性评估"
kind: research
status: concluded
outcome: inform_only
summary: "Supabase 依赖面窄(Auth+两表)，可完整映射到 CF 免费 Workers+D1；配额充裕；需 RLS 隔离重构、Auth 重建、部署适配三件事"
created: 2026-08-26
updated: 2026-08-26
related_specs: []
related_tickets: []
related_prs: []
---

# Review: grok-clone — Supabase 迁移至 Cloudflare 免费套餐可行性评估

> **TL;DR:** 无硬性阻塞——本项目仅使用 Supabase Auth + 两张 Postgres 表，可完整映射到 Cloudflare 免费套餐（Workers + D1 + Rate Limiting binding，Auth 可选 Access）；配额远超实际流量模型；真正的迁移成本在代码侧：RLS 数据隔离重构、认证重建、Next.js 16 部署适配器兼容。
> **Kind:** research · **Status:** concluded · **Outcome:** inform_only
> **Next:** 若决定启动迁移，走 `create-spec` 锁定交付范围

## Context

- **触发**：项目当前后端为 Supabase 集成（Vercel 部署）。Owner 想知道能否整体迁到 **Cloudflare 免费套餐**（明确非付费），并要求基于实际代码给出系统性结论。
- **仓库**：`grok-clone` — Grok 风格 AI 聊天应用。Next.js 16.2.6 (App Router, Turbopack)、React 19、Tailwind 4；`@supabase/ssr ^0.10.3` + `@supabase/supabase-js ^2.106.1`。
- **本 Review 的附加义务**：所有外部限额数据于 2026-08-26 通过官方文档二次核实（见 References），修正了首轮分析中的两处不精确表述（见 Finding 7）。

## Problem Audit

| Layer | Notes |
| --- | --- |
| Validity | 问题真实且有时间压力：Supabase 免费层「项目 7 天不活跃即暂停、限 2 个活跃项目」（官方 pricing 页原文确认），不适合长期挂着的 demo；Cloudflare 免费层无此暂停机制。 |
| Information | 足够。Supabase 使用面经全量 grep 确认；CF 免费额度取自官方 docs（Workers/D1/KV/pricing 页，2026-08 抓取）。唯一残留未知项：OpenNext 适配器对 Next 16 `proxy.ts` 的运行时行为是否已完全无坑（issue 已关闭但未见官方修复声明）→ 列为迁移期必须实测项，不影响可行性结论。 |
| Hidden issues | ① 安全模型一半压在 RLS 上，脱离 Supabase 后若照搬查询代码会产生越权漏洞（详见 Finding 2）；② Rate Limiting binding 按**单个 PoP** 计数而非全局限流（Finding 7）；③ D1 对带索引列的每次写操作计 2 行写入（表+索引）（Finding 7）；④ 事务邮件发送 CF 原生不覆盖（Finding 5）。 |

## Findings

### 1. Supabase 依赖面很窄：只有 Auth + 两张表

全量 grep `src/**` 确认**未使用** Realtime、Storage、Edge Functions（`package-lock.json` 里的 `realtime-js`/`storage-js` 仅是 `supabase-js` 的传递依赖）。实际依赖：

| 能力 | 使用位置 |
| --- | --- |
| Auth 邮箱密码登录/注册 | `src/components/login-form.tsx`（`signInWithPassword`）、`src/components/register-form.tsx`（`signUp`） |
| SSR cookie 会话 + JWT 本地校验 | `src/lib/supabase/server.ts`、`client.ts`、`middleware.ts`（`auth.getClaims()` 本地验签） |
| 邮箱确认回调 | `src/app/auth/callback/route.ts`（`exchangeCodeForSession`） |
| 路由保护 | `src/proxy.ts` → `src/lib/auth-routing.ts`（未登录跳 `/login`，`/api/*` 返回 401；注册开关 `ENABLE_REGISTRATION` 默认关闭=邀请制） |
| Postgres 数据层 | `supabase/schema.sql`：`chat_sessions`/`chat_messages` 两表，UUID 主键、FK 级联删除、`updated_at` 触发器、2 个索引、7 条 RLS policy |

→ 结论：没有用到任何「Supabase 特有」的深水区能力，映射成本低。

### 2. 【安全关键】数据隔离目前一半依赖 RLS，迁移时必须收拢到应用层

`src/lib/db/queries.ts` 中 `getSessions()`、`getSession()`、`getMessages()` 均**不带 `user_id` 过滤**，靠 RLS policy（`auth.uid() = user_id`）兜底。而 `src/app/api/messages/route.ts` 反而做了显式 ownership 校验（注释明确说明是为防 IDOR）。当前状态是「安全责任分裂」：

- 迁移后 RLS 消失（D1/SQLite 无行级安全），以下函数将直接成为越权漏洞：
  - `getSessions()` — 可读任意用户会话列表
  - `getSession(id)` / `getMessages(id)` — 可读任意用户会话内容
  - `updateSessionTitle(id)` / `deleteSession(id)`（`src/app/api/sessions/[id]/route.ts` 与 `route.ts` 的 DELETE 分支）— 任意传 id 即可改/删他人会话
- 改造方式机械但不可遗漏：每条查询显式 `WHERE user_id = ?`，或统一封装「先校验归属再操作」。

### 3. 功能映射完整，免费额度已逐项核实（2026-08-26 官方文档）

| 现有功能 | Cloudflare 免费替代 | 核实结果 |
| --- | --- | --- |
| Vercel 托管 | Workers + Static Assets（`@opennextjs/cloudflare`） | ✅ Workers Free 100,000 请求/天、10ms CPU/次；**静态资源请求免费且不限量** |
| Postgres 两表 | D1 | ✅ Free：500 万行读/天、10 万行写/天、5GB 总存储；官方 FAQ 明确「D1 将始终有免费计划」 |
| FK 级联删除 | D1 外键约束 | ✅ SQLite 原生支持 |
| `updated_at` 触发器 | SQLite trigger 或应用层补一条 UPDATE | ✅ |
| `uuid_generate_v4()` | 应用层 `crypto.randomUUID()` | ✅ 前端已有 optimistic UUID 模式（`api/messages` 校验客户端 UUID），模式现成 |
| `TIMESTAMPTZ` | TEXT ISO-8601 | ✅ |
| RLS | **无对应物** | ⚠️ 必须 Finding 2 的重构 |
| 内存限流 20 次/60s | Workers Rate Limiting binding | ✅ 见 Finding 7 语义修正 |
| KV | 不适用存消息（免费仅 1000 写/天、100k 读/天） | — 本架构无需 KV |

### 4. 配额适配：对本项目流量模型零压力

- **请求数**：一次聊天约消耗 3–6 个请求（SSR 页 + sessions GET + chat 流式 + messages 写入），100k/天 ≈ 1.5 万次页面访问级/天。
- **D1 写入**：每条消息 1 行 insert + 触发器更新 session（索引再翻倍也只 ×4），10 万行/天 ≈ 2 万条消息+/天，聊天场景远达不到。
- **CPU**：chat 路由（`src/app/api/chat/route.ts`）是 I/O 密集的 SSE 流式代理，fetch 等待时间不计 CPU，此类 Worker 通常 <3ms CPU/次，远低于 10ms。
- **时长**：Workers 不按墙钟计费/限制，NDJSON 长流式输出无 Vercel `maxDuration = 300` 的等价焦虑。
- **subrequest**：chat 路由最多 2 个上游调用（search-miss 续跑第二遍），Free 上限 50 次/请求，无压力。
- 对照：Supabase 免费层 7 天不活跃暂停 + 500MB 库存，对长期 demo 反而是更大的运营负担。

### 5. Auth 是最大工作项，两条路线

- **方案 A（推荐，保留现有 UI）— 自建**：D1 建 `users` 表；注册用 WebCrypto PBKDF2 哈希（Workers 无原生 bcrypt）；登录签发 HS256 JWT 存 httpOnly cookie；`proxy.ts` 内本地验签——与现有 Supabase SSR 会话模式同构，改造集中在 `lib/supabase/*` 三文件 + 两个表单组件 + `auth/callback`。
- **方案 B（零代码，适合纯自用）— Cloudflare Access**：Zero Trust 免费层覆盖 ≤50 用户，Email OTP 登录；Worker 校验 Access JWT 后现有 login/register 页面整体废弃。与「注册默认关闭」的邀请制现状高度契合。
- **邮件环节缺口**：Cloudflare Email Routing 只能转发、不能程序化发送事务邮件；邮箱验证/重置密码需第三方发件（如 Resend 免费 100 封/天），或第一版直接砍掉验证流程（邀请制下可接受）。

### 6. 部署适配器现状比首轮结论更乐观，但仍需迁移期实测

- Next.js 16 将 `middleware.ts` 更名 `proxy.ts`（本项目已用新约定 `src/proxy.ts`）。
- `@opennextjs/cloudflare` 曾不支持 proxy.ts（issue opennextjs-cloudflare#962，另见 workers-sdk#13937/#13755），**现已关闭**；社区当时验证过的 workaround：改回 `middleware.ts` 命名（仅 deprecation warning）+ `next build --webpack` 绕开 Turbopack。
- 最新版 **1.20.2**（2026-07-21 发布）peer dependency 明确升至 **Next.js 15.5.21 / 16.2.11**，release notes 含 Turbopack runtime patching 与 middleware 路径处理修复；本项目 next 16.2.6 在支持区间内。
- 残留风险：未见「proxy.ts 原生支持」的官方声明 → 迁移第一步应在 preview deploy 实测 `proxy.ts` 行为，不通则退回改名 workaround 并锁定版本。
- 备选观察项：Cloudflare 官方 **vinext**（Vite 重实现 Next.js 运行时）原生支持 `proxy.ts`，但非完整 Next.js 实现，早期阶段，不作首选。

### 7. 二次核实修正的两处表述（相对首轮口头结论）

- **Rate Limiting binding**：「period 只能 10s 或 60s」是该 binding API 的**通用设计约束**（对所有计划如此），并非免费套餐特有限制；且计数按**单个 Cloudflare 位置(PoP)** 进行——多地区访问时不是全局窗口。对本项目（20 次/60s/用户）语义仍成立且优于现有进程内 Map（跨 isolate 全局生效于同 PoP）。
- **D1 写入计量**：带索引列的写操作计 **2 行写入**（表行 + 索引行）；本项目两张表各有一个复合索引，配额估算已按此口径复核，结论不变。

## Recommendations

分四阶段迁移（预估总量 2–4 人日；DB 替换约占半天，Auth 与部署调试占大头）：

1. **Phase 1 — 数据层**：schema 转 SQLite DDL → 建 D1 导入数据 → 重写 `src/lib/db/queries.ts` 为参数化 SQL，**同步完成 Finding 2 的 user_id 过滤改造** → 用 wrangler D1 local 模式跑通 CRUD。
2. **Phase 2 — Auth**：选定方案 A/B 并替换 `lib/supabase/*`、`app/auth/callback`、两个表单组件；邀请制第一版可砍邮箱验证。
3. **Phase 3 — 部署**：接入 `@opennextjs/cloudflare@1.20.x`，preview 实测 `proxy.ts`（不通则改名回退并锁版本）；Rate Limiting binding 替换内存 Map；环境变量迁 Workers secrets（`XAI_API_KEY` 等）。
4. **Phase 4 — 回归**：重点验证 NDJSON 流式输出、cookie 会话刷新、以及全部越权路径（用他人 sessionId 试读/改/删应全部 404）。

若采纳迁移决策，建议以 `create-spec` 锁定上述范围后再拆票实施。

## Outcome (required to conclude)

| outcome | 选择理由 |
| --- | --- |
| `inform_only` | Owner 要求的是决策参考文档，本轮不启动迁移交付；后续若拍板迁移，从 Follow-ups 进入 spawn_spec。 |

### Follow-ups

- [ ] Owner 决策：是否迁移到 Cloudflare 免费套餐（或维持 Supabase/Vercel）
- [ ] 若迁移：Auth 选方案 A（自建）还是 B（Access ≤50 用户）
- [ ] 迁移启动时 → `create-spec` 锁定 Phase 1–4 范围

## References

**代码证据**（均于 2026-08-26 通读）：
- `supabase/schema.sql`（两表 DDL、触发器、7 条 RLS policy）
- `src/lib/db/queries.ts`（RLS 依赖型查询）
- `src/app/api/chat/route.ts`、`src/lib/chat-request-guard.ts`（流式代理、内存限流、`maxDuration = 300`）
- `src/app/api/messages/route.ts`（显式 ownership 校验 + lazy session 创建）
- `src/app/api/sessions/route.ts`、`src/app/api/sessions/[id]/route.ts`
- `src/lib/supabase/{server,client,middleware}.ts`、`src/proxy.ts`、`src/lib/auth-routing.ts`、`src/app/auth/callback/route.ts`
- `src/components/{login-form,register-form,sidebar}.tsx`
- `package.json`、`vercel.json`（region sin1）、`next.config.ts`

**外部核实**（抓取日期 2026-08-26）：
- Workers 定价（Free 100k req/day、10ms CPU、静态资源免费）：developers.cloudflare.com/workers/platform/pricing/
- Workers 限额（subrequest 50/req 等）：developers.cloudflare.com/workers/platform/limits/
- D1 定价（5M 读/10 万写/5GB、FAQ 永久免费承诺）：developers.cloudflare.com/d1/platform/pricing/
- Rate Limiting binding（period∈{10,60}s、per-PoP 计数）：developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Supabase 定价（Free 7 天不活跃暂停、限 2 项目）：supabase.com/pricing
- opennextjs-cloudflare#962（proxy.ts bug，已关闭，含 workaround）：github.com/opennextjs/opennextjs-cloudflare/issues/962
- opennextjs-cloudflare Releases（v1.20.2，peer dep Next 16.2.11）：github.com/opennextjs/opennextjs-cloudflare/releases
- Zero Trust 免费层 ≤50 用户：zerometric.net/research/cloudflare-zero-trust-free-plan-limits-2026（2026-07-18 核实）

## Links

Bare ids only in front matter lists (`spc-N`, not slugful). 当前无关联 Spec/Ticket/PR。
