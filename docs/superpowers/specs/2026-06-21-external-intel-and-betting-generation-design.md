# 统一情报采集与投注生成优化设计

## 背景

AI 实盘投注场目前已经能基于赛程、体彩玩法、部分懂球帝和本地球队资料生成投注方案，但还有四个问题会直接影响出单质量和操作体验：

- `externalIntel` 仍是固定的“统一外部情报未配置”。
- 部分输入字段为空或来自旧轮次缓存，用户难以判断模型到底吃到了哪些数据。
- 单独请求模型出单时，前端和后端都缺少清晰的多模型并发状态与幂等保护。
- 当前提示词虽然要求赔率不能作为赛果判断权重，但还没有强制模型构建“稳胆、价值、防冷、回避”的组合型投注方案。

本设计把这些问题作为同一轮工作处理。第一版不依赖模型自带联网，也不接 Perplexity/Sonar。外部情报由后端自己的 websearch 采集器生成、缓存并统一注入所有投注模型。

## 目标

1. 新增统一 websearch 情报采集器，用公开搜索结果补齐赛前外部情报。
2. 将外部情报缓存到数据库，并注入 AI 实盘投注场的 `battle_context`。
3. 在投注输入面板中展示每场比赛的数据完整度、外部情报摘要、来源和缺口。
4. 支持多个模型同时手动生成投注方案，且同一模型同一轮不重复生成。
5. 优化投注提示词，让模型构建更像人工投注技巧的组合，而不是简单押低赔率热门。

## 非目标

- 第一版不接入真实身价数据源。`marketValue` 仍作为明确缺口展示，不编造身价。
- 第一版不做网页全文抓取，只使用搜索结果标题、摘要、URL、来源域名和可用发布时间。
- 第一版不依赖 Kimi `$web_search`、Perplexity、Gemini grounding 或 OpenAI Responses API web search。
- 第一版不改变体彩作为投注玩法和赔率来源的边界。API-Football 仍只用于赛程。

## 数据来源边界

投注场输入分为以下来源：

- API-Football：仅赛程字段，包括比赛时间、场地、主客队、状态、比分。
- 体彩：可购买玩法、选项、赔率，以及体彩可获取的历史交锋、积分、近期状态、特征、伤停摘要。
- 懂球帝：赛前对比和球队相关摘要，按现有接口能力注入。
- 本地球队资料：教练、打法、核心球员、世界杯履历、本地伤停和历史交锋。
- 统一外部情报：由后端 websearch 采集器生成，包含新闻、伤停、预计首发、战意、风险信号和来源链接。
- 账户历史：模型资金、最近出单、最近结算和历史资金表现。
- 数据缺口：所有无法确认或未接入的数据都必须结构化记录。

## 统一 Websearch 情报采集器

新增 `external_intel` 模块，包含三个边界清晰的单元：

1. `webSearchProvider`
   - 输入：搜索词、语言、时间范围、最大结果数。
   - 输出：搜索结果数组，每条包含 `title`、`url`、`snippet`、`sourceDomain`、`publishedAt`。
   - 第一版使用可替换接口实现，具体 provider 通过后台配置选择。若没有配置真实搜索 API，模块返回结构化失败结果并写入缺口。

2. `externalIntelCollector`
   - 输入：比赛、主队、客队、开球时间、已有体彩和本地资料。
   - 为每场比赛生成多组搜索词：
     - 中文：`主队 客队 伤停 首发 世界杯`
     - 英文：`home away injury lineup World Cup`
     - 英文：`home away press conference team news`
   - 对 URL 去重，过滤明显无关结果，限制每场比赛进入总结模型的搜索结果数量。

3. `externalIntelSummarizer`
   - 输入：搜索结果和比赛基础信息。
   - 使用普通 OpenAI-compatible 模型总结，不要求该模型联网。
   - 输出严格 JSON：
     - `summary`
     - `injuryNews`
     - `lineupNews`
     - `motivation`
     - `recentFormNews`
     - `riskSignals`
     - `sourceLinks`
     - `confidence`
     - `dataGaps`
     - `collectedAt`

## 缓存与刷新

新增数据库表 `fixture_external_intel_snapshots`：

- `id`
- `match_id`
- `provider`
- `query_json`
- `search_results_json`
- `summary_json`
- `status`
- `error`
- `collected_at`
- `expires_at`
- `created_at`

缓存策略：

- 默认缓存 60 分钟。
- 生成投注轮次前，如果缓存有效，直接复用。
- 缓存过期或不存在时，自动采集。
- 手动刷新情报可以绕过缓存。
- 采集失败不阻塞出单，但必须写入 `dataGaps` 和同步日志。

## Battle Context 注入

`battle_context.matches[]` 增加：

```json
{
  "externalIntel": {
    "status": "cached",
    "summary": "...",
    "injuryNews": [],
    "lineupNews": [],
    "motivation": [],
    "recentFormNews": [],
    "riskSignals": [],
    "sourceLinks": [],
    "confidence": "medium",
    "dataGaps": [],
    "collectedAt": "..."
  }
}
```

如果采集失败：

```json
{
  "externalIntel": {
    "status": "failed",
    "summary": "",
    "sourceLinks": [],
    "dataGaps": ["外部情报采集失败：..."]
  }
}
```

`dataGaps` 要从字符串列表升级为更清晰的来源标记，至少包含：

- `source`
- `code`
- `message`

前端可以继续兼容字符串列表，但新的投注输入面板优先展示结构化缺口。

## 多模型并发出单

前端：

- 用 `busyModelIds` 代替单个 `busyModelId`。
- 每个模型按钮独立显示 `生成中`。
- 一个模型请求中时只禁用该模型按钮，不影响其他模型。
- 顶部状态展示“正在生成 N 个模型”。

后端：

- 对 `roundId + modelId` 做生成幂等。
- 如果该模型已有生成中的记录，返回当前投注场摘要和明确状态，不重复请求模型。
- 不同模型允许并发。
- 单个模型完成后只更新自己的 slip。
- round 状态由所有模型的生成状态汇总：
  - 任一模型生成中：`generating`
  - 所有模型完成、失败或已有结果：`locked`

## 组合型投注提示词

投注提示词增加“组合框架”，要求模型按以下层次评估：

- 稳胆区：高把握单场，必须有球队实力、阵容、战意或情报支撑。
- 让球保护区：强队能赢但穿盘不稳时使用。
- 价值区：中赔率选项，模型判断真实概率高于市场隐含概率。
- 防冷区：小注平局、受让或冷门，只在有明确比赛逻辑时允许。
- 回避区：明确说明赔率看似可买但不出手的原因。

硬约束：

- 禁止把全部资金押到低赔率热门。
- 赔率只能作为可购买价格、潜在返还和资金配置依据，不能替代赛果判断。
- 每个投注项必须写“命中路径”和“失败路径”。
- 串关必须说明每一关为什么适合组合。
- 总投入仍不得超过可用资金 50%，实际投入比例由模型决定。
- 输出 JSON 增加 `portfolio_buckets`，方便 UI 展示：
  - `safe`
  - `value`
  - `hedge`
  - `upset`
  - `avoid`

## 前端展示

投注输入面板增加：

- 数据完整度总览：赛程、体彩玩法、体彩情报、懂球帝、本地球队资料、历史交锋、外部情报、身价、账户历史。
- 每场比赛外部情报卡片：
  - 摘要
  - 伤停新闻
  - 预计首发或轮换线索
  - 战意和赛程压力
  - 风险信号
  - 来源链接
  - 采集时间
  - 数据缺口
- 手动刷新情报按钮。

模型出单详情增加：

- 组合分桶摘要。
- 单场和串关继续展示中文比赛名、中文玩法、赔率、投入和潜在返还。
- 详细报告里保留完整提示词、输入、输出和来源审计。

## 错误处理

- 搜索 API 未配置：外部情报状态为 `not_configured`，不阻塞出单。
- 搜索 API 超时：状态为 `failed`，写入日志和缺口。
- 总结模型失败：保留原始搜索结果，状态为 `summary_failed`。
- JSON 解析失败：保存原始响应，前端显示“情报总结解析失败”。
- 单模型重复生成：返回当前状态，不重复扣请求。
- 多模型并发时某模型失败：该模型状态为 `generation_failed`，不影响其他模型完成。

## 测试

API 测试：

- 搜索结果能写入 `fixture_external_intel_snapshots`。
- 缓存有效时不重复搜索。
- 缓存过期时重新搜索。
- 搜索失败不阻塞投注轮次生成。
- `battle_context` 注入外部情报。
- 同一 `roundId + modelId` 重复触发不会重复生成。
- 不同模型可以并发触发。
- 提示词包含组合型投注框架和 `portfolio_buckets` 要求。

Web 测试：

- 投注输入面板展示外部情报、来源和采集时间。
- 数据完整度能展示空数据和缺口。
- 多个模型按钮能同时进入生成中。
- 单个模型失败不会清掉其他模型状态。
- 出单详情展示组合分桶摘要。

类型检查：

- `corepack pnpm typecheck`

## 实施顺序

1. 先建外部情报数据结构、缓存表和 repository。
2. 实现 websearch provider 接口和空配置失败路径。
3. 实现情报采集与总结流程。
4. 注入 `battle_context`。
5. 改投注提示词输出结构。
6. 改后端单模型并发生成逻辑。
7. 改前端输入面板和多模型按钮状态。
8. 补齐 API 与 Web 测试。

