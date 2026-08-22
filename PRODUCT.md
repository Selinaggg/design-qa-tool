# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

主要用户：**设计师**（当前内部使用，未来考虑对外开放；当前单人使用，未来支持多人协作）。使用场景是在联调与发版前，需要把 Figma 设计稿和 iOS / Android / HarmonyOS 三端已实现的截图放到一起，判断实现与设计的偏差、以及不同端之间实现的一致性。

## Product Purpose

用 AI 视觉分析代替人工肉眼比对，帮设计师在跨端走查中快速找出 UI 实现与设计稿的差异，以及三端实现之间的不一致。产出结果是图上标注的问题清单 + 可导出的报告，成功的标准是"一次跑完就能给到开发一份可执行的走查反馈"。

## Positioning

区别于 Figma 官方 Dev Mode 只提供尺寸/色值 spec、也区别于 Pixel Perfect 类插件只做单端叠层对比，本产品的独特机制是：

- **多平台一次对比**：iOS + Android + HarmonyOS 与 Figma 设计稿在同一次走查里并排分析。
- **多 AI 模型交叉验证**：多个 vision provider 并行跑同一批图，只保留被多个模型共同发现的问题，压低单模型幻觉。
- **场景化忽略规则**：允许"平台原生差异"（如状态栏、导航条等）这类问题被声明为可忽略，避免刷屏噪声。
- **闭环工作台**：图上标注、多版本对比、手工问题标注、PDF/JSON 报告导出在同一工作台完成。

## Operating Context

- 单次走查的输入是：一组 Figma 帧（可通过 URL 或 node-id 导入）+ 每个平台对应的实现截图（PNG/JPEG，可批量）。
- 一个 session 内允许维护最多 3 个版本，用于版本间差异对比。
- AI 分析结果以问题卡片形式落到画板上，用户可以在原图上手工再补标注。
- 走查完成后导出结构化报告交给开发。
- Provider 支持 Claude / OpenAI / MaaS（内部 Bedrock 网关）/ MaaS Direct（Qwen）。MaaS 相关 provider 需要办公网或 VPN。

## Capabilities and Constraints

**已实现能力**：

- Figma 帧导入（支持批量导入 + node-id 定位）与 Figma spec 提取（层级 ≤ 6、节点 ≤ 200）。
- 跨端图片上传（PNG/JPEG），前端 canvas 压缩至 4.5MB 以内。
- 4 个 vision provider：Claude / OpenAI / MaaS-Claude / MaaS-Direct-Qwen；支持多模型交叉验证（Promise.allSettled 并行，按 IoU 0.3 / Jaccard 0.55 合并）。
- 三栏工作台：左侧历史 sidebar、中间画板、右侧问题 sidebar。
- 画板：spring 缩放、多平台并排视图、Portal hover、清屏（Z 键）、差异 Tab。
- 版本管理：单 session 最多 3 个版本，支持版本对比 Dialog。
- 手工问题标注 + 场景化忽略规则（7 分组 24 条规则 + 场景预设）。
- 报告导出（PDF via @react-pdf/renderer，以及 JSON）。
- AI 配置 UI：provider / key / model 存 localStorage，通过 header 传后端。

**技术约束**：

- Next.js 16.2.9 + React 19 + TypeScript + Tailwind 4 + motion 13。
- 历史记录内存存储（未接持久化数据库）。
- 未设 API key 或 `USE_MOCKS=true` 时自动走 mock provider。
- Bedrock 单张图 5MB 硬限制。
- Qwen 模型不保证支持 `response_format: json_object`，依赖 prompt 强约束 + JSON 剥离兜底。
- 部署目标：公网 Vercel（届时切回官方 sk key）。
- 目前**单用户内存态**，多人协作是未来能力，不是当前约束。

**明确未决**：

- 多人协作的存储方案（数据库选型、权限模型）。
- 对外开放后的账号体系。
- 深色模式（暂不做）。

## Brand Commitments

无品牌视觉约束。不使用 rednote 品牌色 / 字体。产品名称与既有资产均未锁定，未来对外开放时再定。

## Evidence on Hand

- 桌面测试图集：`~/Desktop/走查工具测试图/`，12 张 PNG，覆盖多平台样例。
- 内部 MaaS 网关的真实调用链已跑通（Bedrock 网关 + DirectLLM 网关）。
- Figma 真实文件导入已在开发者本人的 Figma 空间验证。

明确不存在的证据：无客户案例、无外部用户见证、无 benchmark 数据；未来任何对外文案不得凭空捏造这些。

## Product Principles

1. **AI 是助手不是裁判**：所有 AI 发现的问题都可以被用户手工消除或补充；用户始终有最终解释权。
2. **降噪优先于全量**：宁可漏报也不要刷屏。多模型交叉验证 + 场景化忽略规则的存在都为此服务。
3. **一次跑完能交付**：产出必须是"可以直接发给开发"的报告，不要求二次整理。
4. **不锁定单一 provider**：AI provider 是可插拔的，任何单一模型的能力都不该被写死进产品逻辑。
5. **视觉与产品事实分离**：视觉表达可以迭代重做，产品事实（用户是设计师、工具是走查、多平台并行）不动。

## Accessibility & Inclusion

用户未主动指定标准。默认按 web 通用无障碍良好实践处理：键盘可操作、reduced-motion / reduced-transparency / high-contrast 三个 media query 已在 CSS 中降级，颜色对比度按 WCAG AA 为参照（不做正式认证）。
