# 产品功能与解决问题总结

> 文档依据：代码库全量阅读（app/、components/、lib/、hooks/、types/、env.local.example）  
> 分析日期：2026-07-08  
> 标注说明：✅ 已完成 ／ 🔶 部分完成 ／ ❌ 未实现 ／ 💡 推测

---

## 1. 项目一句话定位

### 这个工具是什么？

**Design QA Tool** 是一个面向 UI 设计和前端交付场景的**设计走查效率工具**，分为两大核心模块：

1. **设计走查**（`/`）：上传设计稿与线上页面截图，通过像素差异计算和 AI 分析，快速发现视觉还原问题
2. **跨端一致性走查**（`/cross-platform`）：上传 iOS 与 Android 截图，发现跨平台布局、内容、样式不一致问题

### 面向哪些用户？

| 用户角色 | 使用场景 |
|---|---|
| UI 设计师 | 验收前端还原质量，发现与设计稿偏差 |
| QA 工程师 | 系统化排查设计规范符合度，生成走查报告 |
| 前端开发者 | 自查实现与设计的差距，对齐跨端表现 |
| 产品经理 | 交付前确认多端视觉一致性 |

### 核心价值是什么？

- **效率**：将人工逐像素比对替换为自动化差异检测，将主观评估升级为 AI 辅助的结构化问题报告
- **系统化**：提供从上传、对比、标注、分析到结果的完整闭环流程
- **零门槛启动**：无需配置任何 API Key，默认以 Mock 数据运行，可立即体验全流程

---

## 2. 功能总览

| # | 功能模块 | 具体功能 | 用户如何使用 | 解决的问题 | 代码/文件依据 |
|---|---|---|---|---|---|
| 1 | 设计走查 | 图片上传（本地拖拽） | 拖入或点击上传 PNG/JPG/WebP | 手动截图烦恼、格式不统一 | `components/upload/DropZone.tsx` |
| 2 | 设计走查 | Figma 链接导入设计稿 | 粘贴 Figma URL，点击导入 | 无需手动截图导出设计稿 | `components/upload/FigmaImport.tsx`, `app/api/figma-export/route.ts` |
| 3 | 设计走查 | URL 自动截图线上页面 | 粘贴线上 URL，点击截图 | 无需手动截取线上页面 | `components/upload/UrlCapture.tsx`, `app/api/screenshot/route.ts` |
| 4 | 设计走查 | 并排对比 | 切换「并排对比」Tab | 直觉式左右对照查看差异 | `components/comparison/SideBySideView.tsx` |
| 5 | 设计走查 | 滑动对比 | 拖动分割线左右滑动 | 精准对位同一位置的设计与实现 | `components/comparison/SliderView.tsx` |
| 6 | 设计走查 | 差异高亮 | 切换「差异高亮」Tab | 自动标出像素级差异位置 | `components/comparison/DiffHighlightView.tsx`, `lib/diffEngine.ts` |
| 7 | 设计走查 | 输入设计规范辅助 AI | 在文本框填写色值、字号等规范 | 让 AI 理解设计标准，提高分析准确率 | `components/analysis/SpecInput.tsx` |
| 8 | 设计走查 | AI 走查分析 | 点击「开始 AI 走查」 | 将视觉差异转化为结构化问题清单 | `hooks/useAnalysis.ts`, `app/api/analyze/route.ts` |
| 9 | 设计走查 | 问题列表展示 | 查看 Critical/Major/Minor 分级问题 | 快速定位最高优先级问题 | `components/analysis/AnalysisPanel.tsx`, `components/analysis/IssueCard.tsx` |
| 10 | 跨端走查 | 上传 iOS/Android 截图 | 分别上传两端截图（设计稿可选） | 不依赖真实设备，截图即可分析 | `app/cross-platform/page.tsx`, `components/upload/DropZone.tsx` |
| 11 | 跨端走查 | 区域标注（框选） | 在截图上拖拽绘制关注区域 | 让报告聚焦于特定模块 | `components/cross-platform/RegionAnnotator.tsx` |
| 12 | 跨端走查 | 区域移动 | 拖动已标注区域改变位置 | 标注不准时可以修正 | `components/cross-platform/RegionAnnotator.tsx` |
| 13 | 跨端走查 | 区域调整大小 | 拖动 8 个 resize handle | 快速调整标注范围 | `components/cross-platform/RegionAnnotator.tsx` |
| 14 | 跨端走查 | 设备型号选择 | 从 4 款内置设备中选择 | 正确计算安全区高度，精准忽略系统区域 | `lib/crossPlatform/deviceProfiles.ts` |
| 15 | 跨端走查 | 忽略系统区域 | 勾选状态栏/底部安全区忽略选项 | 排除 iOS/Android 系统 UI 差异干扰 | `lib/crossPlatform/mockAnalyzer.ts` `buildIgnoredRegions()` |
| 16 | 跨端走查 | 场景命名 | 输入或选择预设场景名称 | 让报告有上下文，便于存档和分享 | `app/cross-platform/page.tsx` `SCENARIO_PRESETS` |
| 17 | 跨端走查 | 跨端一致性分析 | 点击「开始跨端走查」 | 系统化发现 iOS/Android 不一致 | `app/api/cross-platform-audit/route.ts` |
| 18 | 跨端走查 | 综合评分卡片 | 查看 4 个维度分数 | 量化跨端质量，便于横向对比和追踪 | `components/cross-platform/ScoreGrid.tsx` |
| 19 | 跨端走查 | 问题详情与平台归因 | 展开问题卡片 | 快速定位是哪一端有问题、如何修复 | `components/cross-platform/ConsistencyIssueCard.tsx` |
| 20 | 跨端走查 | 图片对比与区域高亮 | 点击问题查看图上高亮 | 问题与图片区域直接关联，直观定位 | `components/cross-platform/PlatformComparison.tsx` |
| 21 | 通用 | Provider 热切换 | 设置环境变量即可切换 AI/截图/Figma 实现 | 灵活对接不同服务，不锁定单一 API | `lib/aiProviders/index.ts`, `lib/crossPlatform/index.ts` 等 |
| 22 | 通用 | Mock 数据完整运行 | 默认无需任何 API Key | 零配置演示，快速上手 | 所有 `*mockProvider.ts` |

---

## 3. 详细功能说明

### 3.1 设计走查（主页 `/`）

---

#### 功能 A：图片上传与来源多样化

**功能描述**  
支持三种方式导入图片：本地拖拽上传、Figma 链接导入、线上 URL 自动截图。

**使用场景**  
- 设计稿：Figma 链接导入 or 本地拖拽
- 线上页面：粘贴页面 URL 自动截图 or 本地拖拽

**解决的痛点**  
走查时需要反复手动截图、格式转换、尺寸对齐，流程繁琐。

**典型用户流程**
```
粘贴 Figma URL → API 返回设计稿图片 → 自动显示尺寸
粘贴线上 URL  → API 截图返回         → 自动显示尺寸
```

**相关文件**
- `components/upload/UploadPanel.tsx` — 上传面板布局协调
- `components/upload/FigmaImport.tsx` — Figma 导入 UI + 调用 `/api/figma-export`
- `components/upload/UrlCapture.tsx` — URL 截图 UI + 调用 `/api/screenshot`
- `components/upload/DropZone.tsx` — 通用拖拽上传组件
- `lib/imageUtils.ts` — `loadImageFile()` / `loadImageFromUrl()`
- `app/api/figma-export/route.ts` — Figma 导出 API Route
- `app/api/screenshot/route.ts` — 截图 API Route

**完成度**  
✅ UI 流程完整 ／ 🔶 Figma 真实导入（`RealFigmaProvider` 抛错，待实现）／ 🔶 URL 截图（`PlaywrightProvider` 抛错，待实现）

---

#### 功能 B：三种可视化对比模式

**功能描述**  
提供并排对比（side-by-side）、滑动对比（slider）、差异高亮（diff）三种对比视图，前两种适合人眼直觉判断，差异高亮通过 pixelmatch 实现像素级自动检测。

**使用场景**  
- 并排对比：整体版式和颜色初判
- 滑动对比：精确对位同一区域比较（仅两图尺寸相同时可用）
- 差异高亮：快速定位差异位置，获取定量差异百分比

**解决的痛点**  
人眼很难精确发现 2px 的间距偏差或微小的颜色差异，差异高亮可以准确定位。

**典型用户流程**
```
两图均上传 → 默认展示并排对比
→ 切换到「滑动对比」tab → 拖动分割线逐区域比对
→ 切换到「差异高亮」tab → 查看红色差异像素和差异百分比
```

**相关文件**
- `components/comparison/ComparisonViewer.tsx` — Tab 切换容器，差异百分比展示
- `components/comparison/SideBySideView.tsx` — 并排视图
- `components/comparison/SliderView.tsx` — 滑动视图（`clipPath` 实现）
- `components/comparison/DiffHighlightView.tsx` — 差异高亮视图
- `lib/diffEngine.ts` — `computeDiff()`，pixelmatch 封装
- `hooks/useImageDiff.ts` — 差异计算状态管理 Hook

**完成度** ✅ 完整实现

**注意**：滑动对比和差异高亮要求两图像素尺寸完全一致（`checkDimensionsMatch()`），尺寸不一致时功能禁用并提示。

---

#### 功能 C：AI 辅助走查分析

**功能描述**  
用户输入设计规范文本（色值、字号、圆角等），结合差异图，调用 AI 生成结构化问题清单，按 Critical / Major / Minor 三级分类，每条问题含描述、影响分析、修复建议。

**使用场景**  
设计验收时，希望获得可落地的改进清单，而非仅靠人工主观判断。

**解决的痛点**  
- 人工走查需要同时记忆设计规范和逐一比对，效率低
- 走查结论难以结构化，缺乏优先级区分

**典型用户流程**
```
输入规范（可选）：「主色 #1677FF，正文 14px，卡片圆角 8px」
→ 点击「开始 AI 走查」
→ 查看 Critical/Major/Minor 分级问题列表
→ 展开每条问题查看修复建议
```

**相关文件**
- `components/analysis/SpecInput.tsx` — 规范文本输入框
- `components/analysis/AnalysisPanel.tsx` — 分析结果面板
- `components/analysis/IssueCard.tsx` — 单条问题折叠卡片
- `hooks/useAnalysis.ts` — 分析状态管理 Hook
- `app/api/analyze/route.ts` — AI 分析 API Route
- `lib/aiProviders/index.ts` — Provider 工厂（claude / openai / mock）
- `lib/aiProviders/claudeProvider.ts` — Claude 实现（存根）
- `lib/aiProviders/openaiProvider.ts` — OpenAI 实现（存根）
- `lib/aiProviders/mockProvider.ts` — Mock 实现（完整）
- `lib/mockData.ts` — 内置 Mock 问题数据

**完成度**  
✅ UI 流程完整 ／ ✅ Mock 分析完整 ／ ❌ Claude 和 OpenAI 真实实现未完成（均 `throw Error`）

---

### 3.2 跨端一致性走查（`/cross-platform`）

---

#### 功能 D：多步引导式工作流

**功能描述**  
四步式结构化流程：上传截图 → 标注关注区域（可选）→ 选择设备与选项 → 命名场景 → 执行走查。

**使用场景**  
iOS/Android 双端开发后的视觉验收，或 QA 回归测试。

**解决的痛点**  
跨端问题涉及多种维度（布局、内容、样式、交互、平台规范），没有结构化流程容易遗漏。

**典型用户流程**
```
上传 iOS 截图 + Android 截图（+ 设计稿可选）
→ [可选] 框选关注模块并命名
→ 选择设备型号（如 iPhone 14 / Pixel 7）
→ 选择忽略选项
→ 输入或选择场景名称（如「首页」）
→ 点击「开始跨端走查」
→ 查看评分和问题列表
→ 点击问题查看图上高亮位置
→ 点击「清空重来」开始下一轮
```

**相关文件**
- `app/cross-platform/page.tsx` — 整体页面状态协调

**完成度** ✅ 完整实现

---

#### 功能 E：区域标注与编辑

**功能描述**  
在截图上以可视化方式框选需重点关注的模块（如导航栏、主按钮、商品卡片），支持命名、分类、移动位置和调整大小。iOS/Android 使用相同名称的区域，在提交走查时会被自动配对为同一个 `TargetRegion`。

**使用场景**  
走查前精确指定关注范围，让 AI 报告针对特定模块生成有针对性的问题。

**解决的痛点**  
全页面走查结果泛泛，标注后可聚焦于最关键的交互区域。

**典型用户流程**
```
在 iOS 截图上拖拽框选「主按钮」区域 → 输入名称「主按钮」→ 确认
在 Android 截图上同样框选同名区域「主按钮」
→ 走查时两端「主按钮」自动配对比较
→ 可拖动移动标注框到更准确的位置
→ 可拖动 8 个 resize handle 调整框的大小
→ 可在区域列表中点击 × 删除
```

**相关文件**
- `components/cross-platform/RegionAnnotator.tsx` — 标注核心（绘制/移动/Resize）
- `components/cross-platform/AnnotationStep.tsx` — 标注步骤容器
- `lib/crossPlatform/types.ts` — `DrawingRegion`、`TargetRegion`、`NormalizedRect`
- `app/cross-platform/page.tsx` — `mergeRegions()` 合并双端同名区域

**完成度** ✅ 完整实现

**技术亮点**：所有坐标使用 0–1 归一化坐标系（`NormalizedRect`），与图片像素尺寸完全解耦；三种交互模式（绘制/移动/Resize）通过 `stopPropagation` + `setPointerCapture` 精确隔离，互不干扰。

---

#### 功能 F：设备配置与安全区管理

**功能描述**  
内置 4 款主流设备配置（iPhone 14、iPhone 15 Pro、Pixel 7、Samsung S23），精确记录各设备视口尺寸和安全区高度，走查时可选择性忽略顶部状态栏和底部系统导航区域，避免平台规范差异被误报为问题。

**使用场景**  
当开发者已正确处理安全区适配，不希望状态栏高度差异出现在报告中时。

**解决的痛点**  
iOS Dynamic Island 和 Android 矩形摄像头在状态栏高度上本就不同，不应算作 Bug。

**相关文件**
- `lib/crossPlatform/deviceProfiles.ts` — `DEVICE_PROFILES`、安全区数据
- `lib/crossPlatform/mockAnalyzer.ts` — `buildIgnoredRegions()` 归一化安全区坐标
- `app/cross-platform/page.tsx` — `ignoreStatusBar`、`ignoreBottomSafeArea`、`useNormalizedCoordinates` 选项

**完成度** ✅ 完整实现（设备数据和忽略逻辑均完整；归一化坐标选项已设计但对 Mock 分析无实质影响）

---

#### 功能 G：跨端一致性分析与报告

**功能描述**  
调用 AI 分析器，生成包含四项量化评分（iOS 还原度、Android 还原度、跨端一致性、综合分）和结构化问题列表的走查报告。每条问题含：严重度、类型（内容/布局/样式/交互/平台规范）、影响平台、关联区域名、问题描述、影响分析、修复建议、AI 置信度。

**使用场景**  
双端开发完成后的系统化验收，或 QA 团队作为走查工作底稿。

**解决的痛点**  
跨端对比全靠人眼切换截图，主观性强，容易遗漏细节；结论无法量化，难以追踪改进。

**典型用户流程**
```
走查完成 → 自动滚动到结果区
→ 查看 4 个评分卡片（iOS 还原度 88 / Android 还原度 76 / 跨端一致性 72 / 综合 79）
→ 查看问题摘要标签（high × 2, medium × 2, low × 1）
→ 查看问题列表，按 critical/high/medium/low 分组
→ 展开某条问题查看：描述 + 影响 + 建议 + 置信度
→ 点击问题 → 图片对比区域自动高亮对应区域
→ 满意后点击「清空重来」开始下一个场景
```

**相关文件**
- `app/api/cross-platform-audit/route.ts` — 走查 API Route
- `lib/crossPlatform/index.ts` — 分析器工厂
- `lib/crossPlatform/mockAnalyzer.ts` — Mock 分析器（完整）
- `lib/crossPlatform/realAnalyzer.ts` — 真实分析器（存根）
- `components/cross-platform/ScoreGrid.tsx` — 评分卡片
- `components/cross-platform/ConsistencyIssueCard.tsx` — 问题卡片
- `components/cross-platform/PlatformComparison.tsx` — 图片对比与区域高亮

**完成度**  
✅ UI 和 Mock 完整 ／ ❌ 真实 AI 分析器未实现（`RealCrossPlatformAnalyzer` 抛错）

---

### 3.3 通用基础能力

---

#### 功能 H：多 Provider 可插拔架构

**功能描述**  
AI 分析、Figma 导入、截图、跨端分析器均采用统一 Provider 接口，通过环境变量热切换实现（Mock / 真实）。

**所有环境变量一览**

| 变量 | 默认 | 真实选项 | 状态 |
|---|---|---|---|
| `AI_PROVIDER` | mock | claude / openai | 🔶 真实未实现 |
| `ANTHROPIC_API_KEY` | — | sk-ant-... | ❌ 待配置 |
| `OPENAI_API_KEY` | — | sk-... | ❌ 待配置 |
| `FIGMA_PROVIDER` | mock | figma | 🔶 真实未实现 |
| `FIGMA_ACCESS_TOKEN` | — | figd_... | ❌ 待配置 |
| `SCREENSHOT_PROVIDER` | mock | playwright | 🔶 真实未实现 |
| `CROSS_PLATFORM_ANALYZER` | mock | real | ❌ 真实未实现 |
| `USE_MOCKS` | — | true | ✅ 强制 Mock 开关 |

**相关文件**
- `lib/aiProviders/index.ts`、`lib/figmaProviders/index.ts`、`lib/screenshotProviders/index.ts`、`lib/crossPlatform/index.ts`
- `env.local.example`

**完成度** ✅ 架构完整 ／ 🔶 真实 Provider 均为存根

---

## 4. 解决的问题总结（用户视角）

### 设计还原效率问题
走查时需要打开多个工具（设计稿、浏览器、对比软件），频繁切换导致效率低下。本工具将上传、对比、分析整合在单一页面，减少工具切换。

### 差异识别准确性问题
人眼对 2–4px 的间距偏差、1–2% 的色差不敏感。像素差异引擎（pixelmatch）和差异高亮视图可以准确定位肉眼难以发现的微小偏差，差异百分比量化严重程度。

### 走查结论结构化问题
口头或文档走查结论主观性强，难以追踪和复现。AI 分析生成结构化问题清单（含严重度、描述、影响、建议），便于开发者按优先级处理。

### 跨端一致性管理问题
iOS 和 Android 双端截图切换比对，依赖个人记忆力，容易遗漏细节。跨端走查模块将双端截图并排展示，AI 系统化输出差异问题，并按类型和严重度归类。

### 平台规范差异误报问题
iOS 和 Android 在状态栏高度、底部安全区上本身不同，不应算作设计缺陷。安全区忽略选项可排除这类干扰，让报告聚焦于真正需要对齐的问题。

### 走查范围聚焦问题
全页走查信息量大，重点不突出。区域标注功能让用户显式指定关注模块，报告问题与标注区域关联，点击问题自动高亮对应图像区域。

### 量化质量基线问题
「这个页面还原度怎么样？」难以量化答复。四维评分（iOS 还原度、Android 还原度、跨端一致性、综合分）将质量量化，便于横向对比版本迭代效果。

---

## 5. 与同类工具的差异点

| 维度 | 传统方案 | 本工具 |
|---|---|---|
| 设计稿获取 | 手动从 Figma 导出图片 | URL 直接导入（Figma Provider 接口已设计） |
| 线上页面获取 | 手动截图 | URL 自动截图（Playwright 接口已设计） |
| 差异检测 | 人眼对比 | pixelmatch 像素级自动检测，量化差异百分比 |
| 问题输出 | 主观文字描述 | AI 结构化问题清单（含严重度/描述/影响/建议/置信度） |
| 跨端比对 | 分别查看两端截图 | 双端并排 + 区域标注 + 问题与图像联动高亮 |
| 平台差异处理 | 手动忽略 | 设备配置 + 安全区归一化自动忽略 |
| 分析 Provider | 锁定单一 AI | 可插拔 Provider 架构（Claude / OpenAI / Mock / 自定义） |
| 上手门槛 | 需配置 API Key | 零配置 Mock 模式，立即可用 |
| 坐标系 | 像素绝对值 | 0–1 归一化坐标，分辨率无关，支持任意设备 |

---

## 6. 当前不足与缺失能力

### 功能尚未完成

| 功能 | 状态 | 文件 | 说明 |
|---|---|---|---|
| Claude Vision 分析 | ❌ | `lib/aiProviders/claudeProvider.ts` | `throw Error`，预留了实现注释 |
| OpenAI Vision 分析 | ❌ | `lib/aiProviders/openaiProvider.ts` | `throw Error`，预留了实现注释 |
| 真实跨端 AI 分析 | ❌ | `lib/crossPlatform/realAnalyzer.ts` | `throw Error`，预留了实现注释 |
| Figma API 真实导入 | ❌ | `lib/figmaProviders/figmaProvider.ts` | `throw Error`，预留了实现注释 |
| Playwright 自动截图 | ❌ | `lib/screenshotProviders/playwrightProvider.ts` | `throw Error`，预留了实现注释 |
| 图像对齐（尺寸不同时） | ❌ | `lib/imageUtils.ts` `applyAlignment()` | 4 种策略（none/scale/crop/smart）均 `throw Error`，类型已定义 |

### 功能只有雏形

| 功能 | 状态 | 说明 |
|---|---|---|
| 区域标注重命名 | ❌ 缺失 | 删除和新建已有；重命名（inline edit）未实现 |
| 走查报告导出 | ❌ 缺失 | 无 PDF / CSV / JSON 导出能力 |
| 走查历史记录 | ❌ 缺失 | 页面刷新后结果即丢失，无持久化 |
| 多场景批量走查 | ❌ 缺失 | 目前每次只能走查单一场景 |
| 差异注释 / 人工批注 | ❌ 缺失 | 用户无法在差异图上手工标记和注释 |
| 走查结果分享 | ❌ 缺失 | 无 permalink 或分享链接 |

### 需要补充文档

| 缺失文档 | 说明 |
|---|---|
| README 产品介绍 | 当前 README 仅为 Next.js 脚手架默认内容，无任何产品说明 |
| 部署配置指南 | 各 Provider 的配置方法、所需 key 的获取步骤 |
| Playwright 安装指引 | `npm install playwright && npx playwright install chromium` 步骤未文档化 |
| API 接口文档 | 4 个 API Route 无任何接口说明 |
| 开发者贡献指南 | 如何新增 Provider、扩展设备配置等 |

### 用户痛点尚未解决

- **无法处理不同尺寸图片的对比**：滑动对比和差异高亮都要求完全相同的像素尺寸，实际场景中设计稿和截图往往尺寸不同（图像对齐策略已设计但全部未实现）
- **移动端标注体验差**：区域标注依赖精确拖拽，在手机上几乎无法使用，但工具在移动端仍然可以浏览
- **真实 AI 分析缺失**：所有 AI 分析均为 Mock 数据，核心价值主张尚未在真实场景中验证
- **严重度标签为英文**：`critical / high / medium / low` 在中文界面中混排，体验不一致（审计已记录的待办项）

---

## 7. 可用于官网 / README 的总结文案

### 极简版

> 上传截图，秒级发现设计与实现的差距——支持设计稿还原度分析和 iOS / Android 跨端一致性走查。

---

### 标准版

> **Design QA Tool** 是一款面向 UI 设计师和 QA 工程师的设计走查效率工具。  
>
> 上传设计稿与线上截图，三种对比视图（并排 / 滑动 / 差异高亮）帮你快速定位像素级偏差；AI 分析引擎基于你提供的设计规范，自动输出按优先级分类的结构化问题清单。
>
> 跨端走查模块支持同时上传 iOS 和 Android 截图，可视化标注关注区域，一键生成跨端一致性评分和差异问题报告，精准区分「真正的跨端 Bug」和「平台规范合理差异」。
>
> 默认无需配置任何 API Key，Mock 模式下即可体验完整流程；生产环境接入 Claude / OpenAI / Figma API 后，所有分析能力自动升级为真实 AI 结果。

---

### 详细版（适合 README 或官网首页）

> ## Design QA Tool — 让设计验收告别截图切换
>
> Design QA Tool 是一款开箱即用的设计走查平台，将图片上传、视觉对比、AI 问题分析、跨端一致性检查整合在一个页面，帮助设计师、QA 工程师和前端开发者在交付前快速发现并量化设计问题。
>
> ### 核心功能
>
> **设计还原走查**
> - 支持本地拖拽、Figma 链接、线上 URL 三种方式导入图片
> - 三种对比视图：左右并排、拖拽滑动、像素差异高亮
> - 差异百分比量化偏差程度（pixelmatch 引擎）
> - AI 分析生成 Critical / Major / Minor 三级问题清单，含修复建议
>
> **跨端一致性走查**
> - 同时对比 iOS 和 Android 截图，发现布局、内容、样式、交互不一致
> - 内置 4 款主流设备配置，自动识别并可选忽略系统安全区差异
> - 可视化区域标注：在截图上框选关注模块，支持拖动移动和 Resize
> - 四维量化评分：iOS/Android 还原度、跨端一致性、综合分
> - 问题与图像联动：点击问题自动高亮对应区域
>
> **零门槛上手**
> - 无需配置任何 API Key 即可体验完整流程（Mock 模式）
> - 支持接入 Claude Vision、GPT-4o、Figma API、Playwright 截图（通过环境变量切换）
> - 可插拔 Provider 架构，方便扩展自定义分析器
>
> ### 技术栈
> Next.js 16 · React 19 · Tailwind CSS · TypeScript · pixelmatch · Vercel 部署
