---
name: Design QA Tool
description: 跨端 UI 走查工作台 —— Figma 与三端实现的差异一次看清
colors:
  primary: "#2563eb"
  primary-hover: "#1d4ed8"
  primary-tint: "#eff6ff"
  ink: "#0f172a"
  ink-secondary: "#334155"
  neutral-body: "#475569"
  neutral-muted: "#94a3b8"
  neutral-line: "#e2e8f0"
  neutral-line-soft: "rgba(226, 232, 240, 0.60)"
  neutral-surface: "#ffffff"
  neutral-canvas: "#f8fafc"
  severity-critical: "#dc2626"
  severity-critical-tint: "#fef2f2"
  severity-major: "#ea580c"
  severity-major-tint: "#fff7ed"
  severity-minor: "#ca8a04"
  severity-minor-tint: "#fefce8"
  platform-ios: "#3b82f6"
  platform-android: "#22c55e"
  platform-harmony: "#a855f7"
  status-pending: "#a855f7"
  status-fixed: "#10b981"
  status-warning: "#f59e0b"
typography:
  display-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  display-headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  display-title-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
  2xl: "1.5rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  2xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.neutral-canvas}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    typography: "{typography.label}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-body}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    typography: "{typography.label}"
  input-text:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.neutral-surface}"
    rounded: "{rounded.xl}"
    padding: "1rem"
  chip-severity-critical:
    backgroundColor: "{colors.severity-critical-tint}"
    textColor: "{colors.severity-critical}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.625rem"
    typography: "{typography.micro}"
  chip-severity-major:
    backgroundColor: "{colors.severity-major-tint}"
    textColor: "{colors.severity-major}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.625rem"
    typography: "{typography.micro}"
  chip-severity-minor:
    backgroundColor: "{colors.severity-minor-tint}"
    textColor: "{colors.severity-minor}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.625rem"
    typography: "{typography.micro}"
---

# Design System: Design QA Tool

## Overview

**Creative North Star: "The Design Inspector's Workbench"**

这套系统的性格是"专业审图工作台"——像编辑室 / 打样房 / 校色间，让设计师面对多平台截图时手边的**每一个工具都触手可及，但没有一件抢镜**。视觉决定服从任务：被走查的截图才是主角，UI 骨架是玻璃、灯、尺子，是那种越好用越透明的东西。灵感来自 macOS 系统级 UI（Finder / Preview / Keynote）——大量真实内容 + 半透明材质 chrome + 极克制的品牌色点缀，色彩只在需要传达信号（严重度、平台归属、状态）的地方发声。

密度偏紧凑（专业工具惯例），信息层级用**排版粗细 + 半透明材质 + 阴影景深**建立，而不是靠框和色块。整个界面刻意让四边留白呼吸，让走查画板本身成为视觉中心。

拒绝的方向：无来源的意大利斜体大字、渐变堆砌、脉冲点、AI 米色（beige/warm cream），以及任何"给一个工具的官网做视觉"的偏企业站审美。这是一款工具，不是一张 landing。

**Key Characteristics:**

- 系统字体（-apple-system → SF Pro → PingFang SC）+ 负 tracking 大字型
- 白底 + slate 灰阶为骨架；主色 blue-600 仅用于 primary action 与状态强调
- 半透明材质（material-thick / regular / thin）区分结构层与浮层，绝不双层叠加
- 严重度三档硬色（red / orange / yellow）+ 平台三色（blue / green / purple），使用严格受控
- Spring 动画替代瞬时显隐；所有交互元素支持 `:active { scale(0.97) }` 反馈
- 全套 `prefers-reduced-motion` / `-transparency` / `-contrast` 降级

## Colors

以中性 slate 为绝对主体，蓝色为唯一品牌色，严重度与平台的语义色严格受控用于信号，而非装饰。

### Primary

- **Signal Blue** (#2563eb / blue-600)：primary action、focus ring、logo 底色、指向未来行为的"下一步"按钮。**这是产品里唯一的品牌色**，出现即代表"操作或链接"。
- **Signal Blue Hover** (#1d4ed8 / blue-700)：primary 按钮 hover 与 pressed 深一档。
- **Signal Blue Tint** (#eff6ff / blue-50)：主色的柔和背景（chip、hover 面、focus ring 底）。

### Neutral

- **Ink** (#0f172a / slate-900)：主要文字、大标题、高对比场合。
- **Ink Secondary** (#334155 / slate-700)：次级正文、控件文字。
- **Body** (#475569 / slate-600)：说明文字、标签。
- **Muted** (#94a3b8 / slate-400)：辅助文字、占位符、图标默认色。
- **Line** (#e2e8f0 / slate-200)：分隔线、边框默认色。
- **Line Soft** (rgba slate-200 60%)：材质层上的柔化边框。
- **Surface** (#ffffff)：卡片、Dialog / Drawer 主体、内容密集面板。**vibrancy 规则要求文字密集面必须是实心白，不能透明。**
- **Canvas** (#f8fafc / slate-50)：页面根背景（会渐变到白再回一档灰）；也是 secondary 按钮的静止色。

### Severity (受控信号色)

- **Critical** (#dc2626 / red-600)：Critical 级问题、破坏性操作提示。永远配 red-50 底 + red-200 边。
- **Major** (#ea580c / orange-600)：Major 级问题。永远配 orange-50 底 + orange-200 边。
- **Minor** (#ca8a04 / yellow-600)：Minor 级问题。永远配 yellow-50 底 + yellow-200 边。

### Platform (标识色)

- **iOS** (#3b82f6 / blue-500)：iOS 平台标识。
- **Android** (#22c55e / green-500)：Android 平台标识。
- **HarmonyOS** (#a855f7 / purple-500)：HarmonyOS 平台标识。

### Status (进度色)

- **Status Pending** (#a855f7 / purple-500)：手工标注、待处理状态。
- **Status Fixed** (#10b981 / emerald-500)：已修复、已确认状态。
- **Status Warning** (#f59e0b / amber-500)：需注意但非严重（如 mock 提示条）。

### Named Rules

**The One Blue Rule.** 主色 Signal Blue 只用于**用户可以点击的东西**和"下一步"引导；不做装饰、不做点缀、不做背景色块。任何 landing 页习惯做的"品牌色渐变 hero"都不属于这里。

**The Severity Palette Is Locked.** Critical / Major / Minor 的三档配色严禁被用于非严重度语义（比如把 red 用作装饰性 badge、把 orange 用作 warm accent）。它们是**功能色**，用即代表严重度。

**The Platform Colors Are Identifiers.** iOS 蓝、Android 绿、HarmonyOS 紫只作为平台标识 chip / dot 出现，不做主题化的更大范围扩展（不做"iOS 主题蓝背景"这种事）。

**The Neutral-Only Chrome Rule.** 导航栏、侧栏、工具栏、下拉、Portal 浮层——所有骨架 chrome 一律 slate 灰阶 + 半透明材质，不引入任何主色作为背景。

## Typography

**Sans Font Stack:** -apple-system → BlinkMacSystemFont → SF Pro Text → PingFang SC → Hiragino Sans GB → Microsoft YaHei → Helvetica Neue → Arial → sans-serif。

**Character:** 完全跟随系统字体家族。macOS 上是 SF Pro + PingFang SC 的中英组合，其光学尺寸表和 tracking table 让大字型自动收紧、正文自动放松。不引入 Google Fonts / 自托管 web font，避免加载抖动，也让工具在任何系统上都感觉"原生"。

### Hierarchy

- **Display Title** (700, 1.875rem / 30px, line-height 1.05, letter-spacing -0.02em)：极少用；预留给未来主入口页的欢迎大标题。当前工作台没有此级。
- **Display Headline** (700, 1.5rem / 24px, line-height 1.15, letter-spacing -0.015em)：InsightsBar 大数字（"12 项差异"）、VersionDiffDialog 对比数值。**永远配 `tabular-nums`。**
- **Display Title Md** (600, 1.125rem / 18px, line-height 1.25, letter-spacing -0.01em)：Drawer / Dialog 标题、Empty State 主标题、Session 名称。
- **Body** (400, 0.875rem / 14px, line-height 1.5)：正文默认、说明、表单。
- **Label** (500, 0.75rem / 12px, line-height 1.4)：按钮文字、chip 文字、控件文字、列头。
- **Micro** (500, 0.6875rem / 11px)：极密集处的辅助文字，如 InsightsBar 副标签、时间戳、"共 N 项"这类。

### Named Rules

**The Negative-Tracking-Only-For-Large Rule.** letter-spacing 的负值只加在 ≥18px 的字型上（Display 三档）。正文 body 与 label 保持 tracking 0，永远不加负 tracking。

**The Tabular Nums Rule.** 任何"数字比大小 / 版本对比 / 变化量"场合必须 `tabular-nums`。走查工具的数字变化很多，普通比例字宽会让 12 与 22 视觉宽度不同，破坏对齐。

**The System Only Rule.** 不引入 web font。任何"我们换 Inter 试试"或"加个 Serif 显示标题"的提议要被这条挡回来——工具类产品的字体不该有存在感。

## Layout

三栏工作台是核心布局：

- **左侧 HistorySidebar**（固定宽度）：Session 历史列表，material-thick 结构层。
- **中间 WorkbenchMain**（flex 1，最小 0）：Session header + 工具栏 + 画板 CanvasBoard，画板是弹性区域可缩放。
- **右侧 IssuesSidebar**（固定宽度）：问题列表、按平台/严重度筛选、批量操作。

**根背景**是从 slate-50 → 白 → slate-100 的对角柔渐变，让半透明 chrome 层有东西可透。**结构层用材质、内容层用实心**。

响应式：当前只针对桌面（≥1280px）优化，移动端不作为目标。

**Spacing scale**：0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 rem（xs-2xl），密度偏紧凑（专业工具惯例）。卡片内 padding 通常 `p-4` 到 `p-5`，chip 内 padding `px-2.5 py-0.5`。

### Named Rules

**The Three-Column Invariant.** 三栏结构是走查工作流的骨架，不因视觉偏好被换成"一栏 + Tab 切换"或"两栏 + 抽屉"。设计师在同一个视野里必须同时看到"我在处理哪个 session、图上什么问题、右侧问题清单在哪里"。

**The Canvas Owns the Middle.** 中栏的画板 CanvasBoard 优先获得剩余空间，工具栏本身贴顶紧凑，缩放控件浮于画板右下不占静态空间。任何"再往画板上叠一个大 chip / hero 提示"都不允许。

## Elevation & Depth

**混合体系**：半透明材质分层 + 三档阴影，不用扁平"无阴影"策略，也不做 Material 那种严格 elevation ladder。

### Material Vocabulary (光学层)

- **material-thick** (bg rgba 白 70% + blur 20px + saturate 180%)：结构层，用于 AppHeader、HistorySidebar、IssuesSidebar、Session header。用户会**长期停留**在这一层上，需要最厚实的材质感 + 最深的模糊。
- **material-regular** (bg rgba 白 80% + blur 16px)：中间过渡层。工具栏使用。
- **material-thin** (bg rgba 白 90% + blur 12px)：浮层，用于版本下拉、缩放控件、Portal 弹出。**存在时间短 + 需要看清内容**，所以最薄。

### Shadow Vocabulary (物理层)

- **shadow-chip** (0 1px 2px rgba slate-900 5%)：小 chip、静止卡片。几乎不可见的接地气。
- **shadow-float** (0 6px 20px + 0 2px 6px)：Portal 浮层、悬停激活的卡片。中距离浮起。
- **shadow-drawer** (0 25px 60px + 0 8px 20px, alpha 更深)：Drawer / Dialog 主体。远距离浮起于全局 scrim 之上。

### Named Rules

**The No Double Translucency Rule.** 半透明层之上**绝不再放半透明层**。IssuesSidebar 是 material-thick，那么它内部的 sticky 顶栏必须是实心 `bg-white`；Drawer 主体是实心白，只有它外面的 scrim 才半透明。任何两层半透明叠加会导致模糊糊成一团。

**The Vibrancy Rule.** 文字密集的面板（Drawer 主体、Dialog 主体、IssueCard 展开内容）必须是**实心白 + shadow-drawer** 组合，不使用材质。材质只用于 chrome 与浮层。

**The Depth Comes From Material Rule.** 深度感优先由材质厚薄传达，阴影是辅助。任何"给一个 chip 加大投影让它看起来能按"这种想法要被挡回去——那是 AI slop 里典型的 `generic-drop-shadows` 反模式。

## Shapes

**Radius 语言**：全线圆角，无尖角。radius 尺寸随组件大小递增：

- **rounded-sm** (0.375rem / 6px)：极小 chip、单行 tab item。
- **rounded-md** (0.5rem / 8px)：**默认按钮、input、小工具项**。绝大多数点击目标是这一档。
- **rounded-lg** (0.75rem / 12px)：中等卡片、下拉浮层、Portal 面板。
- **rounded-xl** (1rem / 16px)：主内容卡片（IssueCard、SpecInput、图片框）。
- **rounded-2xl** (1.5rem / 24px)：Drawer / Dialog 主体（大表面用大圆角）。
- **rounded-full**：severity chip、status dot、状态徽章。

**Borders**：默认 1px slate-200；材质层用 slate-200/60 柔化；highlight 状态提升到主色或严重度色的 200~300 档。**不使用**双层边、内阴影模拟边、渐变边。

**Dividers**：横向 `border-b border-slate-200`；材质层上柔化到 `/60`。

### Named Rules

**The Radius Scales With Size Rule.** 圆角大小与组件大小正相关：越大的表面越大的圆角。反例（AI slop）：给一个小 chip 用 rounded-3xl，或给一个 500px 宽的 Dialog 用 rounded-md。

**The No Sharp Corners Rule.** 完全禁用 `rounded-none` 与 `rounded-sm` 以下的方角/微圆。这是工具类产品，不是编辑器主题。

## Components

### Buttons

- **Shape:** rounded-md (0.5rem)，全线一致。
- **Primary:** bg Signal Blue #2563eb + white 文字 + hover Blue #1d4ed8 + `shadow-sm`。padding `0.5rem 1rem`（sm 尺寸 `0.375rem 0.75rem`）。
- **Secondary:** bg slate-100 + slate-700 文字 + hover slate-200，无阴影。
- **Ghost:** transparent + slate-600 文字 + hover bg slate-100。
- **Disabled:** primary 用 blue-300；secondary 用 slate-400 文字；ghost 用 slate-300。
- **Press (通用):** 所有 button 在 `:active` 时 `scale(0.97)` 100ms 弹回。opt-out 类 `.no-press` 用于遮罩、Portal scrim 等不该抖的元素。
- **Focus:** 依赖浏览器默认 focus-visible，不刻意做 focus ring（依赖 tab 切换时的系统默认，未来对外后再补）。

### Chips (Severity / Status)

- **Shape:** rounded-full。
- **Style:** `bg-{color}-50` 底 + `text-{color}-700` 字 + `ring-1 ring-{color}-200` 环边。
- **Padding:** `px-2.5 py-0.5` micro 字号。
- **禁用**：不允许纯色底 chip（AI slop 常见的 `bg-red-500 text-white`）；只用 tint + ring 的浅色 chip。

### Cards / Containers

- **Corner Style:** rounded-xl 默认，rounded-2xl 用于最大表面。
- **Background:** `bg-white`；材质结构层用 material-* utility。
- **Border:** 1px slate-200 默认，材质层柔化到 /60。
- **Shadow Strategy:** 静止用 shadow-chip，悬停用 shadow-float，大表面用 shadow-drawer。
- **Internal Padding:** 密集卡 `p-4`，中等卡 `p-5`。

### Inputs / Fields

- **Style:** `bg-white` + `border border-slate-200` + `rounded-md/lg`（textarea 用 lg/xl）。
- **Focus:** `border-blue-400` + `ring-2 ring-blue-100` + `outline-none`。**这是 Signal Blue 唯一装饰化的场景**，因为 focus 需要强视觉锚点。
- **Placeholder:** `placeholder:text-slate-300`。
- **Disabled:** `opacity-50 cursor-not-allowed`。

### Navigation (AppHeader)

- **Style:** sticky top-0 + material-thick + border-b slate-200/60。
- **Logo:** rounded-lg + bg-blue-600 底的 7x7 方图（当前极简）。
- **Nav items:** ghost 按钮样式，激活态 `bg-blue-50 text-blue-600`。

### Drawer / Dialog

- **Scrim:** `bg-slate-900/50 + backdrop-blur-md`（modal push-back）。用 `.no-press` 关掉抖动。
- **Body:** 实心白 + rounded-2xl + shadow-drawer + hairline-top 光泽边。
- **Motion:** Drawer slide-in spring (bounce 0.2, duration 0.3s)；Dialog scale-in spring。

### IssueCard (Signature Component)

走查工具的核心信号卡片：

- **Shape:** rounded-xl border white。
- **Header:** severity chip（round-full tint）+ 标题 + status badge（round-full tint）。
- **Body:** 折叠区（Collapse spring 组件），展开显示位置 / 建议 / 关联平台。
- **Highlight:** 选中态 shadow-float。
- **禁用**：不允许在 IssueCard 上再叠一层 accent 色底。信号色只在 chip 里出现。

### Canvas Zoom Controls

- **Shape:** rounded-lg + material-thin + shadow-float。
- **Position:** 右下浮层，非静止占位。
- **Interaction:** spring 缩放（bounce 0, duration 0.25s），Pointer Events 驱动。

## Do's and Don'ts

### Do:

- **Do** 用 material-thick 给 chrome（顶导、侧栏），material-thin 给浮层，Drawer / Dialog 主体保持实心白。
- **Do** 大字型（≥18px）加负 tracking（-0.01em ~ -0.02em）+ tight leading。
- **Do** 所有 button / [role=button] 依赖全局 `:active { scale(0.97) }` 反馈，不为个别按钮重复实现。
- **Do** 数字对齐场景（走查计数、版本对比）全部 `tabular-nums`。
- **Do** Severity 三色只在 severity 语义 chip 上出现，Platform 三色只在平台标识 chip 上出现。
- **Do** 全局 spring 参数用 motion 库的 `bounce + duration` 声明（Drawer bounce 0.2 / 普通 UI bounce 0）。
- **Do** 提供 reduced-motion / reduced-transparency / high-contrast 降级；三个 media query 已在 globals.css 就位，新组件不要重新引入 transform-only 动画绕过它们。
- **Do** 圆角与组件大小正相关：越大的表面用越大的 radius。

### Don't:

- **Don't** 用 italic serif 大字型（"editorial hero" AI slop）。这是工具，不是杂志。
- **Don't** 用 AI beige / warm cream / 沙漠色。全线 slate 灰阶 + 实心白。
- **Don't** 用 gradient 作为大表面背景（root 那个 slate-50 微渐变除外，且强度极低）。任何 hero、chip、button 上的渐变都是 AI slop 反模式。
- **Don't** 在同一层视觉里堆多个 status chip（"status-chip soup"）。severity + status 二选一，不并列。
- **Don't** 在半透明层上再放半透明层。
- **Don't** 用脉冲点 / pulsing dot 表示 "live"。走查工具没有实时含义。
- **Don't** 给小 chip / 小按钮加大投影。shadow 只在真正需要景深的浮层（float）和大表面（drawer）出现。
- **Don't** 用 hero eyebrow chip（"Introducing" 那种小胶囊）。工具无 landing 属性。
- **Don't** 在 Drawer / Dialog 里塞超过 3 步的表单。超过 3 步应该拆成子流程。
- **Don't** 引入 web font（Google Fonts / 自托管）。系统字体栈是硬承诺。
- **Don't** 让品牌色 Signal Blue 出现在非交互元素上。它不是装饰色，只是"这可以点"的符号。
- **Don't** 用纯色底 badge（`bg-red-500 text-white` 这种）。所有 badge / chip 都用 tint + ring 组合。
- **Don't** 假造用户见证 / 客户案例 / benchmark 数据；对外时只用真实内部数据。
