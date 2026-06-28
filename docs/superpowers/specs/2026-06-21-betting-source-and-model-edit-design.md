# Betting Source And Model Edit Design

## Goal

统一 AI 实盘投注场的数据来源边界、提示词输入结构和结果展示，同时修复后台模型配置只能新增不能编辑的问题。

## Requirements

- 模型列表支持编辑已有模型：点击“编辑”后表单填入当前模型，保存时更新该模型，不要求重新输入模型标识。
- 串关展示面向中文用户：隐藏 `poolCode` 等内部字段作为主展示，使用“胜平负”“让球胜平负”“比分”“2 串 1”等中文投注语义。
- 投注输入和提示词必须明确数据来源：API-Football 仅用于赛程；体彩提供投注玩法、赔率和体彩侧赛前情报；懂球帝和本地资料作为球队状态补充；外部联网情报没有统一采集时必须明确标注未配置。
- 提示词要把数据模块和投注任务关联起来：先做赛果判断，再在体彩可购买选项内生成投注方案；赔率只用于价格、返还和风险收益，不作为赛果权重。

## Current Findings

- [apps/web/src/pages/AdminPage.tsx](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/web/src/pages/AdminPage.tsx) 只有 `saveAdminAiModel` 新增流程，没有 `editingModelId` 和更新请求。
- [apps/web/src/pages/BettingArenaPage.tsx](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/web/src/pages/BettingArenaPage.tsx) 串关详情直接展示 `poolCode`、`parlayName`、`legs.length` 等内部字段。
- [apps/api/src/modules/betting-arena/bettingArena.service.ts](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/api/src/modules/betting-arena/bettingArena.service.ts) 投注场刷新时仍开启 API-Football 的赔率、官方预测、历史交锋、阵容伤停。
- [apps/api/src/modules/betting-arena/bettingArenaPrompts.ts](/Users/yzq/Desktop/project/worldcup-ai-pk/apps/api/src/modules/betting-arena/bettingArenaPrompts.ts) 已有投注规则，但 `battle_context` 没有明确拆分为赛程、体彩、懂球帝、本地资料、账户历史和数据缺口。

## Design

### Model Editing

前端新增 `editingModelId`。点击表格中的“编辑”按钮后，将该行模型复制到 `modelForm`。提交表单时：

- `editingModelId` 有值：调用新的 `updateAdminAiModel(id, input)`，请求 `PUT /api/admin/ai-models/:id`。
- `editingModelId` 为空：沿用 `saveAdminAiModel(input)`。
- 保存成功后清空编辑状态并刷新模型列表。
- 表单增加“取消编辑”按钮，避免误把编辑流程当新增流程。

### Betting Source Boundary

AI 实盘投注场的上下文刷新不再调用 API-Football 的非赛程接口。`refreshBettingArenaMatchContext` 中数据选项固定为：

- `useOdds: false`
- `useApiFootballPrediction: false`
- `useHeadToHead: false`
- `usePlayerLineupInjuries: false`
- `useDongqiudiIntel: Boolean(dongqiudiClient)`
- `useSporttery: Boolean(sportteryClient)`
- `useTeamProfile: true`

投注上下文展示中，API-Football 来源说明改为“仅赛程”。不再把 API-Football 赔率、官方预测、历史交锋、阵容伤停列为投注输入来源。

### Prompt Structure

`buildBettingArenaPrompt` 输出固定模块说明：

- `schedule`：赛程、开赛时间、场地、状态、比分。
- `sporttery_betting_options`：体彩可购买玩法和锁定赔率。
- `sporttery_intel`：体彩历史交锋、积分形势、近期状态、特征对比、伤停影响。
- `dongqiudi_intel`：懂球帝赛前对比。
- `team_profiles`：本地球队资料、核心球员、伤停、身价状态。
- `account_history`：模型资金、最近出单和最近结算。
- `data_gaps`：不可编造的数据缺口。

提示词明确：赛果判断先使用球队和赛事情报；投注方案只能落在体彩可购买选项里；赔率只用于返还计算和投入风险管理。

### Parlay Display

Web 层新增投注展示 helper：

- `poolDisplayName("HAD")` 返回“胜平负”。
- `poolDisplayName("HHAD")` 返回“让球胜平负”。
- `poolDisplayName("CRS")` 返回“比分”。
- `formatParlayType(parlay)` 返回“2 串 1”等中文标题。
- `formatPotentialReturn(stake, odds)` 统一格式化潜在返还。

串关一级展示改为结构化摘要：组合类型、投入、组合赔率、潜在返还、信心、风险说明。腿项用二级列表展示：比赛、玩法、选择、赔率。

## Test Plan

- API tests:
  - 投注场刷新请求不再调用 API-Football 非赛程数据选项。
  - 投注提示词包含新的模块名和 API-Football 仅赛程说明。
- Web tests:
  - 模型表格点击“编辑”后表单填入当前模型，保存时调用 PUT。
  - 串关详情展示“2 串 1”“胜平负”“让球胜平负”等中文文案。
  - 投注输入面板显示 API-Football 仅赛程，体彩作为赔率和投注玩法来源。

