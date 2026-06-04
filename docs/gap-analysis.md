# Grok Clone — UI/UX Gap Analysis

> 对比目标：[grok.com](https://grok.com) 官方界面 (2026-06)
> 分析日期：2026-06-04
> 数据来源：Grok Release Notes、官方界面观察、Grok Search MCP 交叉验证

---

## 1. 现状总结

### 技术栈
- **框架**: Next.js 16 + React 19 + TypeScript
- **样式**: Tailwind CSS 4 + CSS 变量 (shadcn 风格)
- **字体**: Geist Sans + Geist Mono (Google Fonts)
- **图标**: lucide-react
- **Markdown**: react-markdown + remark-gfm
- **认证**: Supabase Auth
- **部署**: Vercel

### 已实现功能 ✅
| 功能 | 实现状态 |
|------|----------|
| 暗色主题 (Dark Mode) | ✅ CSS 变量体系，`#141414` 背景 |
| 侧边栏 | ✅ 折叠/展开、时间分组、编辑/删除 |
| 模型选择器 | ✅ Fast/Auto/Expert + X Search toggle |
| 输入框 | ✅ 圆角 pill 造型、自动伸缩、发送/停止 |
| Thinking Panel | ✅ 可折叠、token 统计、计时器 |
| 消息操作 | ✅ Copy/Edit/Regenerate/ThumbsUp/ThumbsDown |
| Markdown 渲染 | ✅ GFM 表格、列表、代码块 |
| 流式响应 | ✅ SSE streaming + 实时 thinking |
| Optimistic UI | ✅ 发送后立即显示 |
| 移动端响应式 | ✅ 抽屉侧边栏、safe-area |
| 空状态居中布局 | ✅ Logo + 输入框垂直居中 |

---

## 2. 差异分析

### 🔴 P0 — 高优先级 (核心体验差距)

#### 2.1 缺少 Assistant 头像图标
- **官方**: Assistant 消息左侧有 Grok 小头像 (SVG 图标)
- **Clone**: Assistant 消息无任何图标
- **影响**: 视觉上缺少辨识度，用户消息和 AI 消息区分不够直观
- **方案**: 在 assistant 消息左侧添加 Grok SVG 小图标

#### 2.2 代码块缺少功能
- **官方**: 代码块有语言标签、一键复制按钮、完整语法高亮
- **Clone**: 纯 `<pre>` 渲染，无复制按钮、无语法高亮、无语言标识
- **影响**: 代码片段无法快速复制，阅读体验差
- **方案**: 自定义 code 组件 + 语言标签 + 复制按钮 + `react-syntax-highlighter`

#### 2.3 空状态缺少 Prompt 建议
- **官方**: 空状态展示推荐 prompt 卡片 (如 "Explain quantum computing", "Write a poem")
- **Clone**: 仅 Logo + 输入框 + 免责声明
- **影响**: 新用户不知道能做什么
- **方案**: 添加 4-6 个 prompt 建议卡片，点击自动填入

### 🟡 P1 — 中优先级 (体验完善)

#### 2.4 缺少 Scroll-to-Bottom 浮动按钮
- **官方**: 长对话中滚动后，右下角有浮动按钮回到底部
- **Clone**: 仅靠 auto-scroll，手动滚动后无法回底
- **方案**: 监听滚动位置，显示浮动按钮

#### 2.5 缺少 Toast 通知系统
- **官方**: 复制成功、操作确认等都有 toast 反馈
- **Clone**: 仅图标变化 (Copy→Check)，无文字反馈
- **方案**: 轻量 toast 组件，支持 success/error/info

#### 2.6 缺少桌面端顶部导航栏
- **官方**: 顶部有模型模式指示器 (Think/Expert/DeepSearch)、分享按钮、用户头像
- **Clone**: 桌面端完全没有顶部栏
- **方案**: 添加 desktop top bar，显示当前模型、设置入口

#### 2.7 缺少 Light/Dark 主题切换
- **官方**: Light / Dark / System / Darkest 四种模式
- **Clone**: 硬编码 `className="dark"`
- **方案**: 集成 `next-themes`，添加主题切换器

#### 2.8 缺少键盘快捷键
- **官方**: Cmd+K 快速切换、Cmd+N 新建对话
- **Clone**: 无键盘快捷键
- **方案**: 全局 keydown 监听

### 🟢 P2 — 低优先级 (功能扩展)

#### 2.9 缺少侧边栏对话搜索
- **官方**: 侧边栏可搜索历史对话
- **Clone**: 对话列表无搜索功能
- **方案**: 添加搜索输入框，前端过滤

#### 2.10 缺少 Share/Export 功能
- **官方**: 可分享对话链接、导出 PDF
- **方案**: 后续迭代

#### 2.11 缺少 Imagine/图片生成入口
- **官方**: 输入栏有 Imagine 按钮
- **方案**: 需后端支持，后续迭代

#### 2.12 缺少 Voice 语音入口
- **官方**: 输入栏有麦克风按钮
- **方案**: 需 Web Speech API 集成，后续迭代

#### 2.13 缺少文件上传/附件
- **官方**: 拖拽上传 PDF/图片/文件
- **方案**: 需 Supabase Storage，后续迭代

#### 2.14 缺少 Projects/Workspaces
- **官方**: 项目/工作空间组织功能
- **方案**: 需后端架构改动，后续迭代

---

## 3. 视觉细节差异

| 细节 | 官方 Grok | Clone 当前状态 | 差异 |
|------|-----------|---------------|------|
| 用户气泡 | 右侧，accent 背景 | ✅ `bg-user-bubble` | 一致 |
| Assistant 消息 | 左侧 + Grok 头像 | ❌ 无头像 | 缺头像 |
| 输入框按钮 | Search/Model 标签 | ✅ 标签，输入时隐藏 | 一致 |
| 发送/停止 | 圆形 morph 动画 | ✅ scale 动画 | 一致 |
| 滚动条 | 6px subtle | ✅ 6px | 一致 |
| Sidebar 宽度 | ~256px | ✅ w-64 | 一致 |
| 最大内容宽度 | max-w-3xl | ✅ max-w-3xl | 一致 |
| 代码块 | 深色 + border + 高亮 + 复制 | ⚠️ 深色 + border，无高亮无复制 | 缺功能 |
| 链接颜色 | 蓝色 | ✅ `#3b82f6` | 一致 |

---

## 4. 实施计划

### Phase 1 — 核心体验对齐 (本次实施)
1. ✅ Assistant 头像图标
2. ✅ 代码块复制按钮 + 语法高亮
3. ✅ 空状态 Prompt 建议卡片
4. ✅ Scroll-to-Bottom 浮动按钮
5. ✅ Toast 通知系统

### Phase 2 — 体验完善 (本次实施)
6. ✅ 桌面端顶部导航栏
7. ✅ Light/Dark 主题切换
8. ✅ 键盘快捷键
9. ✅ 侧边栏对话搜索

### Phase 3 — 功能扩展 (后续迭代)
- Share/Export、Imagine、Voice、文件上传、Projects

---

## 5. 设计 Token 参考

### 色彩体系 (Dark Mode)
```
--background:       #141414    主背景
--foreground:       #e5e5e5    主文字
--muted:            #1a1a1a    次要表面
--muted-foreground: #9a9a9a    次要文字
--border:           #2a2a2a    边框
--accent:           #212121    强调表面
--sidebar:          #0d0d0d    侧边栏背景
--sidebar-hover:    #1a1a1a    侧边栏 hover
--sidebar-active:   #252525    侧边栏 active
--input:            #212121    输入框背景
--input-ring:       #3a3a3a    输入框 focus ring
--user-bubble:      #1a1a1a    用户消息气泡
```

### 色彩体系 (Light Mode — 目标)
```
--background:       #fdfdfd
--foreground:       #0d0d0d
--muted:            #f0f0f0
--muted-foreground: #6b6b6b
--border:           #e5e5e5
--accent:           #f8f8f8
--sidebar:          #f8f8f8
--sidebar-hover:    #efefef
--sidebar-active:   #e8e8e8
--input:            #f8f8f8
--input-ring:       #d0d0d0
--user-bubble:      #f0f0f0
```

### 字体
```
--font-sans: Geist Sans, system-ui, sans-serif
--font-mono: Geist Mono, monospace
```

### 间距/尺寸
```
Sidebar expanded:   w-64 (256px)
Sidebar collapsed:  w-14 (56px)
Max content width:  max-w-3xl (768px)
Input bar:          rounded-[1.75rem] / rounded-3xl
Header height:      h-14 (56px)
Scrollbar:          width: 6px
```
