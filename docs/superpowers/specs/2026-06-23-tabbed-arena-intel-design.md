# Tabbed Arena And Betting Intelligence Design

## Goal

把当前公开主页面从“所有模块纵向堆叠”改成清晰的一级 Tab 工作台，并优先补强 AI 实盘投注场的数据透明度、外部情报展示、提示词质量和历史投注追溯体验。

这次设计覆盖：

- P0-2：外部情报和输入数据补强展示。
- P0-2 扩展：外部情报采集调用补强，记录实际查询词、返回来源和失败缺口。
- P0-4：AI 实盘投注场 UI 重新收敛，桌面和手机都要可读。
- P1 全部：提示词调优、投注输入面板完整化、历史投注追溯体验。
- 新增优先项：主页面按 Tab 分区，避免赛程、排行榜、投注场、后台全部挤在同一屏。

## Current State

当前主入口是 [App.tsx](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/web/src/App.tsx)，页面结构为：

- 顶部 `topbar` 使用锚点导航：`#fixtures`、`#leaderboard`、`#betting-arena`、`#admin`。
- 首屏 `intro` 后依次渲染：
  - [FixturesPage.tsx](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/web/src/pages/FixturesPage.tsx)
  - [LeaderboardPage.tsx](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/web/src/pages/LeaderboardPage.tsx)
  - [BettingArenaPage.tsx](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/web/src/pages/BettingArenaPage.tsx)
  - [AdminPage.tsx](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/web/src/pages/AdminPage.tsx)

当前投注场已经具备：

- `AI 资金榜`
- `当前出单`
- `历史结算`
- `投注账本`
- `投注输入面板`
- 模型详情弹窗中的 `提示词拆解`、`账户上下文`、`比赛数据`、`完整原文`

当前后端投注提示词在 [bettingArenaPrompts.ts](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/api/src/modules/betting-arena/bettingArenaPrompts.ts) 中构建，已经包含以下输入模块：

- `schedule`
- `sporttery_betting_options`
- `sporttery_intel`
- `dongqiudi_intel`
- `team_profiles`
- `account_history`
- `data_gaps`

当前共享 DTO 在 [types.ts](/Users/yzq/Desktop/project/worldcup-ai-pk/packages/shared/src/types.ts) 中已经暴露：

- `BettingArenaDto`
- `BettingArenaRoundDto`
- `BettingArenaSlipDto`
- `BettingArenaLedgerDto`
- `BettingArenaPortfolioBucketDto`
- `BettingArenaSettlementDto`

## Non-Goals

这轮不做以下事情：

- 不引入 React Router。继续保持单页应用，使用内部 state 切换 Tab。
- 不新增真实身价数据源。身价缺失继续作为 `dataGaps` 展示。
- 不抓取网页正文。外部情报第一阶段仍使用搜索结果标题、摘要、URL、来源域名和可用发布时间。
- 不把 API-Football 重新用于投注赔率、历史交锋、阵容或伤停。AI 实盘投注场中 API-Football 仍只提供赛程、状态、比分、场地和球队身份。
- 不改投注结算核心规则。结算规则只在发现 bug 时另行修复。
- 不重做后台配置页全部视觉，只把它放入独立 Tab。

## Information Architecture

主页面改成 5 个一级 Tab。

### 1. 赛程预测

内容：

- 比赛赛程列表。
- 比赛数据卡片。
- 手动请求预测。
- 每场比赛预测历史。
- 串关组合入口。

来源组件：

- 继续使用 `FixturesPage`。

页面目标：

- 用户进入后先看比赛。
- 赛程相关动作不再和实盘投注场、后台配置混在一起。

### 2. AI 实盘投注场

内容：

- 今日投注场概览。
- AI 资金榜。
- 当前出单卡片。
- 单模型生成按钮。
- 结算当前轮按钮。
- 查看投注账本入口。
- 历史结算摘要。

来源组件：

- 继续使用 `BettingArenaPage` 的投注核心区域。

页面目标：

- 第一层只放可扫读信息。
- 长文本、原始输入、原始输出全部进入详情弹窗或独立输入 Tab。

### 3. 投注输入与情报

内容：

- 当前投注轮次的输入数据审计。
- 每场比赛的数据源完整度。
- 外部联网情报详情。
- 数据缺口。
- 完整 `battleContext` 快照。

实现方式：

- 从 `BettingArenaPage` 中抽出当前 `投注输入面板` 的核心逻辑。
- 新建页面组件：
  - `apps/web/src/pages/BettingIntelPage.tsx`
- 新建纯 helper：
  - `apps/web/src/pages/bettingArenaViewModels.ts`

页面目标：

- 用户能直接看清楚模型到底吃到了什么数据。
- 空数据必须可见，不允许只藏在 JSON 里。

### 4. 排行榜

内容：

- 赛果命中榜。
- 比分命中榜。
- 投注收益榜。
- 资金榜入口提示。

来源组件：

- 继续使用 `LeaderboardPage`。
- 资金榜仍由 `AI 实盘投注场` 负责，不把资金榜复制进公共排行榜。

页面目标：

- 排行榜口径更直观。
- 减少“近 5 场”等不够直接的解释负担。

### 5. 后台配置

内容：

- 模型配置。
- 提示词模板。
- API key。
- 外部情报配置。
- 日志。

来源组件：

- 继续使用 `AdminPage`。

页面目标：

- 后台能力和公开展示分离。
- 普通查看比赛时不会被配置项干扰。

## Tab Shell Design

### Component

在 `App.tsx` 内增加：

```ts
type MainTab = "fixtures" | "betting" | "intel" | "leaderboard" | "admin";
```

Tab 配置：

```ts
const mainTabs: Array<{ id: MainTab; label: string; description: string }> = [
  { id: "fixtures", label: "赛程预测", description: "比赛、预测和历史" },
  { id: "betting", label: "AI 实盘投注场", description: "资金、出单和结算" },
  { id: "intel", label: "投注输入与情报", description: "模型输入数据审计" },
  { id: "leaderboard", label: "排行榜", description: "模型成绩对比" },
  { id: "admin", label: "后台配置", description: "模型和数据源设置" }
];
```

`App` 使用 `useState<MainTab>("fixtures")` 控制当前页。

### Behavior

- 默认打开 `赛程预测`。
- 点击 Tab 只切换视图，不重新请求所有数据。
- 原 60 秒自动刷新仍保留。
- 如果投注场处于 `generating`，轮询逻辑仍按当前实现保留。
- 错误状态只显示在对应 Tab 内，避免一个模块失败污染整个页面。

### Visual Direction

整体是“比赛控制台”而不是营销页：

- 顶部标题收敛为产品级标题：`World Cup AI Match Lab` / `世界杯 AI 模型竞技场`。
- Tab 使用横向 segmented navigation。
- 桌面端 Tab 位于标题下方，宽度与内容容器对齐。
- 手机端 Tab 横向滚动，按钮高度固定，文字不换行撑开布局。
- 内容区使用“单页工作台”风格，不使用嵌套卡片。

## Betting Arena UI Restructure

### First-Level Layout

`AI 实盘投注场` Tab 中保留三块：

1. 顶部状态带
   - 当前轮次。
   - 轮次状态。
   - 可投注比赛数。
   - 已出单模型数。
   - 总投入。
   - 潜在返还。

2. 资金榜
   - 模型名。
   - 排名。
   - 可用资金。
   - 冻结资金。
   - 收益率。
   - 投注项命中率。
   - 盈利出单。

3. 当前出单
   - 模型名。
   - 状态。
   - 投入。
   - 潜在返还或实际返还。
   - 盈亏或待结算。
   - 组合分桶摘要。
   - 操作：
     - `单独生成`
     - `账本`
     - `详情`

### Detail Drawer

模型详情弹窗保留并整理为固定顺序：

1. 策略摘要。
2. 投注组合摘要。
3. 单关。
4. 串关。
5. 组合分桶。
6. 赛果进度。
7. 结算明细。
8. 输入 / 输出审计。

长文本规则：

- 第一层不展示大段 `strategySummary`。
- `rationale`、`bankrollPlan`、原始 prompt、原始 response 只在详情里显示。
- 投注组合一级摘要用表格或紧凑列表呈现。

### Mobile Rules

- 主卡片字号下调，避免一屏只显示一条。
- 当前出单卡片按钮改成两列或一行横向工具条。
- 资金榜在手机端改为列表，不使用多列 grid 强撑。
- 抽屉宽度在手机端占满屏，顶部固定关闭按钮。

## Betting Intelligence Page

## External Data Collection Enhancement

当前外部情报已经通过后端 `DuckDuckGoHtmlWebSearchProvider` 调用 DuckDuckGo HTML 搜索，并由 `collectExternalIntelForMatch` 写入 `fixture_external_intel_snapshots`。这轮要补强的是“调用覆盖面”和“前端可审计性”，不是引入新的外部服务。

### Provider

继续使用现有 provider：

- [webSearchProvider.ts](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/api/src/modules/external-intel/webSearchProvider.ts)
- `DuckDuckGoHtmlWebSearchProvider`
- 请求目标：`https://html.duckduckgo.com/html/`

返回数据仍限定为：

- `title`
- `url`
- `snippet`
- `sourceDomain`
- `publishedAt`

### Query Packs

`buildExternalIntelQueries` 从固定 4 条扩展为按主题生成查询，并受 `maxQueries` 限制截断。查询主题按顺序排列，优先覆盖最影响投注判断的信息：

1. 伤停和首发：
   - `${homeTeamName} ${awayTeamName} 伤停 首发 世界杯`
   - `${homeTeamName} ${awayTeamName} injury lineup World Cup`
2. 发布会和球队新闻：
   - `${homeTeamName} ${awayTeamName} press conference team news`
3. 轮换和比赛动机：
   - `${homeTeamName} ${awayTeamName} motivation rotation World Cup`
4. 预计阵容：
   - `${homeTeamName} ${awayTeamName} predicted lineup`
5. 近期状态：
   - `${homeTeamName} ${awayTeamName} recent form last matches`
6. 关键球员：
   - `${homeTeamName} ${awayTeamName} key players availability`
7. 身价与阵容实力线索：
   - `${homeTeamName} ${awayTeamName} squad market value`

如果 `maxQueriesPerMatch` 仍为 4，系统只调用前 4 条；如果用户在后台提高配置，会自动覆盖更多主题。

### Auditability

每次采集必须保留：

- 实际执行的 `queries`
- 去重后的 `searchResults`
- 搜索失败列表，写入 `dataGaps`
- 总结模型失败原因，写入 `dataGaps`

`投注输入与情报` 页面必须展示：

- 本场实际查询词。
- 返回来源数量。
- 来源链接。
- 搜索失败原因。
- 总结状态：`cached`、`not_configured`、`failed`、`summary_failed`。

### Manual Refresh

保留现有单场手动刷新接口：

- `POST /api/admin/matches/:matchId/external-intel/refresh`

新增当前投注轮外部情报刷新入口：

- `POST /api/admin/betting-arena/external-intel/refresh-current-round`

行为：

- 读取当前投注轮 `battle_context.matches[]`。
- 对每场比赛调用 `collectExternalIntelForMatch(..., forceRefresh: true)`。
- 返回每场比赛的 `matchId`、`status`、`queries` 数量、`searchResults` 数量、`dataGaps`。
- 单场失败不阻塞其他比赛。

### Battle Context Injection

`BettingArenaPage` 和 `BettingIntelPage` 不直接发起外部搜索。它们只展示后端注入到 `battleContext.matches[].externalIntel` 的结果。

`externalIntel` 需要包含：

- `status`
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
- `queries`
- `searchResults`

### Page Structure

`投注输入与情报` Tab 分 4 块：

1. 输入总览
   - 当前轮次。
   - 比赛数。
   - 体彩玩法池数。
   - 体彩选项数。
   - 数据缺口数。

2. 比赛情报列表
   - 每场比赛一个可展开条目。
   - 标题格式：`德国 对 科特迪瓦`
   - 副信息：`玩法 1 · 选项 1 · 缺口 2`

3. 单场情报详情
   - 数据来源拆解。
   - 体彩玩法与选项。
   - 球队资料。
   - 历史交锋。
   - 外部联网情报。
   - 数据缺口。

4. 完整输入快照
   - 展示格式化后的 `arena.currentRound.battleContext`。
   - 默认折叠。

### Source Breakdown

每场比赛都展示 5 个来源：

1. API-Football
   - 固定文案：`仅赛程：比赛时间、场地、球队、状态和比分`

2. 体彩
   - 展示玩法池数量。
   - 展示每个 `poolCode` 的中文名。
   - 展示选项、赔率、让球线。
   - 若为空，显示：`未读取到体彩可投注玩法`

3. 懂球帝
   - 展示 `dongqiudi_intel` 摘要。
   - 若为空，显示：`未读取到懂球帝赛前对比数据`

4. 本地球队资料
   - 展示教练、踢法、核心球员、世界杯履历、伤停、身价状态。
   - `marketValue` 为空时展示：`暂无球队身价数据源`

5. 外部联网情报
   - 展示 `summary`。
   - 展示本场实际查询词。
   - 展示返回来源数量。
   - 拆分展示：
     - `injuryNews`
     - `lineupNews`
     - `motivation`
     - `recentFormNews`
     - `riskSignals`
     - `sourceLinks`
   - `sourceLinks` 必须可点击。
   - 若 `status` 为 `not_configured`，显示：`统一外部情报未启用`
   - 若 `status` 为 `failed` 或 `summary_failed`，显示对应缺口。

### Empty Data Rules

所有空数据都用统一样式：

- `未采集`
- `未配置`
- `暂无数据`
- `采集失败`

不得只显示空数组、空对象或空白区域。

## Prompt Improvements

修改 [bettingArenaPrompts.ts](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/api/src/modules/betting-arena/bettingArenaPrompts.ts)。

### Core Prompt Contract

提示词继续要求输出 JSON 对象，字段保持：

- `action`
- `total_stake`
- `singles`
- `parlays`
- `portfolio_buckets`
- `strategy_summary`
- `risk_level`
- `bankroll_plan`
- `skip_reasons`
- `data_gaps`

### New Reasoning Requirements

增加明确步骤：

1. 先判断比赛结果方向。
2. 再判断哪些比赛适合单场。
3. 再判断哪些比赛适合串关。
4. 再根据账户资金决定投入比例。
5. 最后输出投注组合。

### Strategy Requirements

提示词新增规则：

- 不允许只挑低赔率热门。
- 至少评估一组价值区机会。
- 至少评估一组防冷或回避理由。
- 串关必须说明每一腿为什么能组合。
- 每个投注项必须有：
  - 命中路径。
  - 失败路径。
  - 资金占比说明。
- 如果数据不足，允许空仓，但必须说明：
  - 哪些数据缺失。
  - 哪些比赛被回避。
  - 需要什么情报才会下注。

### Data Module Mapping

提示词必须明确各数据模块用途：

- `schedule`：只用于比赛时间、状态、比分、场地和主客队。
- `sporttery_betting_options`：只用于可购买玩法、赔率、潜在返还和风险收益。
- `sporttery_intel`：用于赛前摘要、体彩侧历史交锋、近期状态和伤停影响。
- `dongqiudi_intel`：用于球队对比、近期趋势、阵容舆情和公开赛事情报。
- `team_profiles`：用于教练、踢法、核心球员、世界杯履历、伤停、身价缺口。
- `external_intel`：用于最新新闻、阵容、伤停、动机、风险信号和来源链接。
- `account_history`：用于模型历史投入风格、命中情况、亏损回撤和可用资金。
- `data_gaps`：用于判断是否降低投入或空仓。

### Odds Rule

继续保留并强化：

赔率不得作为赛果判断权重；赔率只能用于：

- 可购买选项确认。
- 潜在返还计算。
- 资金投入比例。
- 风险收益比较。

## Betting History Traceability

### Ledger Enhancements

`投注账本` 保留现有接口：

- `getBettingArenaLedger({ modelId, limit, offset })`
- `GET /api/public/betting-arena/ledger`

UI 增强：

- 全量账本入口仍在投注场顶部。
- 每个模型卡片保留模型账本入口。
- 账本行展示：
  - 轮次。
  - 模型。
  - 状态。
  - 投入。
  - 潜在返还或实际返还。
  - 盈亏或待结算。
  - 命中项数量。

### Historical Slip Detail

点击账本行进入模型出单详情，展示：

- 当时账户上下文。
- 当时比赛输入。
- 单关和串关。
- 结算明细。
- 每个投注项命中、未中或退回。

### Filters

第一版只实现已有能力范围内的筛选：

- 全量账本。
- 按模型账本。

不新增日期筛选接口。日期和轮次先在账本行展示。

## Component Boundaries

### Keep Existing Components

- `FixturesPage`
- `LeaderboardPage`
- `AdminPage`
- `BettingArenaPage`

### Add New Components

- `BettingIntelPage`
  - 输入：`arena: BettingArenaDto | null`
  - 职责：展示投注输入与情报，不触发投注动作。

- `refreshCurrentRoundExternalIntel`
  - 位置：`apps/api/src/modules/betting-arena/bettingArena.service.ts`
  - 输入：`db: Database, now?: Date`
  - 输出：当前轮每场比赛外部情报采集结果摘要。
  - 职责：为当前投注轮强制刷新外部情报。

- `MainTabShell`
  - 可以先内联在 `App.tsx`，若超过可读范围再抽成组件。
  - 职责：一级 Tab 渲染和切换。

- `bettingArenaViewModels.ts`
  - 纯函数：
    - `getBattleContextSummary`
    - `buildSourceBreakdown`
    - `formatTeamProfile`
    - `formatDataGap`
    - `poolDisplayName`
  - 从 `BettingArenaPage.tsx` 移出，供 `BettingArenaPage` 和 `BettingIntelPage` 共用。

## Error Handling

- `matchesStatus === "failed"` 只在 `赛程预测` Tab 内显示。
- `bettingArenaStatus === "failed"` 同时影响：
  - `AI 实盘投注场`
  - `投注输入与情报`
- `投注输入与情报` 在 `arena.currentRound` 为空时显示空状态：
  - `暂无投注轮次，先在 AI 实盘投注场生成今日出单。`
- 外部情报失败不阻塞页面渲染。
- 数据缺口用结构化列表展示，不把错误埋在 JSON 中。

## Testing Plan

### Web Tests

修改 [app.test.tsx](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/web/test/app.test.tsx)：

- 默认展示 `赛程预测` Tab。
- 点击 `AI 实盘投注场` 后出现 `生成今日出单`。
- 点击 `投注输入与情报` 后出现 `投注输入总览`。
- 点击 `排行榜` 后渲染 `LeaderboardPage`。
- 点击 `后台配置` 后渲染 `AdminPage`。
- 自动刷新和投注场轮询不因 Tab 切换失效。

修改 [bettingArenaPage.test.tsx](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/web/test/bettingArenaPage.test.tsx)：

- 投注场第一层仍显示资金榜、当前出单、历史结算。
- 当前出单卡片不展示长篇原始 prompt。
- 模型详情仍能打开提示词拆解、结算明细、投注组合。
- 模型账本入口仍调用 `onLoadLedger({ modelId, limit: 50, offset: 0 })`。

新增 [bettingIntelPage.test.tsx](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/web/test/bettingIntelPage.test.tsx)：

- 显示 `API-Football：仅赛程`。
- 显示 `体彩：投注玩法与赔率`。
- 显示外部情报分组：伤停、阵容、动机、近期、风险、来源。
- 显示外部情报实际查询词和返回来源数量。
- 显示 `暂无球队身价数据源`。
- 显示结构化 `dataGaps`。
- `arena.currentRound` 为空时显示空状态。

### API Tests

修改 [externalIntelCollector.test.ts](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/api/test/externalIntelCollector.test.ts)：

- 断言增强后的 query pack 包含预计阵容、近期状态、关键球员、身价与阵容实力线索。
- 断言 `maxQueries` 会截断查询数量。
- 断言采集结果保留 `queries` 和 `searchResults`，可供前端审计。

修改 [bettingArenaApi.test.ts](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/api/test/bettingArenaApi.test.ts)：

- 断言 `POST /api/admin/betting-arena/external-intel/refresh-current-round` 会对当前轮每场比赛触发强制刷新。
- 断言单场搜索失败不会阻塞其他比赛。

修改 [bettingArenaPrompts.test.ts](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/api/test/bettingArenaPrompts.test.ts)：

- 断言提示词包含分阶段推理要求。
- 断言提示词包含 `external_intel` 模块说明。
- 断言提示词包含资金占比、命中路径、失败路径。
- 断言提示词继续包含赔率限制规则。

### Typecheck

运行：

```bash
corepack pnpm --filter @worldcup-ai-pk/web typecheck
corepack pnpm --filter @worldcup-ai-pk/api typecheck
```

### Visual Verification

启动服务后检查：

- 桌面端：`赛程预测`、`AI 实盘投注场`、`投注输入与情报`、`排行榜`、`后台配置` 五个 Tab 不拥挤。
- 手机端：Tab 可横向滚动，当前出单卡片按钮不重叠。
- 投注输入页展开单场情报后，外部情报和数据缺口可读。
- 模型详情弹窗在手机端可以滚动，关闭按钮可见。

## Implementation Order

1. 写 Tab shell 测试，确认默认 Tab 和切换行为。
2. 实现 `App.tsx` Tab shell。
3. 增强外部情报采集 query、结果审计字段和当前轮手动刷新接口。
4. 抽出 `bettingArenaViewModels.ts`，保持现有投注场测试通过。
5. 新建 `BettingIntelPage.tsx` 和测试。
6. 调整 `BettingArenaPage.tsx`，移除独立输入面板按钮或改为跳转提示。
7. 优化投注提示词和 API 测试。
8. 调整 CSS，重点处理桌面和手机布局。
9. 跑 Web/API 相关测试和 typecheck。
10. 启动服务做浏览器视觉验收。

## Acceptance Criteria

- 主页面不再同时展示赛程、排行榜、投注场和后台配置。
- 用户可以通过一级 Tab 切换核心模块。
- `投注输入与情报` 成为独立主页面，不再藏在投注场弹窗里。
- 投注输入页能清楚展示每场比赛的数据来源、可投注选项、外部情报和数据缺口。
- 外部情报采集会记录实际查询词、返回来源、失败缺口，并能通过当前投注轮刷新入口强制更新。
- 提示词明确把外部情报、历史资金表现、数据缺口、资金占比纳入投注策略。
- AI 实盘投注场第一层比当前更清爽，不展示长段原始文本。
- 模型历史投注仍可通过账本追溯到每次出单详情。
- 现有投注生成、单模型生成、结算、账本、历史轮次详情功能不回退。
- API-Football 在投注场中仍只用于赛程、状态、比分、场地和球队身份。

## Risks

- `BettingArenaPage.tsx` 当前职责较多，抽 helper 时要避免一次性大重构。
- `App.tsx` 当前测试 mock 了部分页面，Tab 化后测试需要同步更新 mock 策略。
- 外部情报真实数据质量不稳定，UI 必须把失败和缺口作为正常状态展示。
- 手机端 Tab 和投注卡片容易挤压，需要浏览器截图验证，不只依赖单元测试。

## Out Of Scope Follow-Ups

- 新增真实身价数据源。
- 新增日期范围账本筛选 API。
- 将单页应用迁移到路由系统。
- 对后台配置页做完整设计重构。
- 增加真实模型巡检矩阵页面。
- 抓取外部网页正文并做全文抽取。
