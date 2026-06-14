# 体彩赛前情报数据源设计

## 背景

当前工作区已经存在一组体彩数据源相关改动：`SportteryClient`、体彩映射表、体彩摘要解析、context 刷新链路、前端数据选项和相关测试。它们已经形成雏形，但还没有被整理成一个清晰的功能边界。

这次目标是把这组改动收口为“体彩赛前情报数据源”，让它稳定参与比赛数据卡和 AI 预测上下文，而不是扩展成完整的数据管理后台。

## 目标

把体彩公开接口提供的数据作为赛前情报来源接入预测链路。

成功标准：

- 比赛上下文支持 `sporttery` 域。
- 用户请求预测或打开数据卡时，可以选择是否使用体彩数据。
- 已配置映射且启用体彩数据源时，系统抓取体彩数据并写入 fixture context snapshot。
- 体彩接口失败、未启用或未配置映射时，不阻断预测流程。
- 提示词模板明确说明：体彩赔率只能作为官方市场背景，不得作为胜平负预测权重。
- 全仓测试、类型检查和 lint 通过。

## 范围

本次包含：

- 共享 DTO 增加 `PredictionDataOptionsDto.useSporttery`。
- 共享 context domain 增加 `sporttery`。
- SQLite schema 增加 `fixture_context_snapshots.sporttery_summary_json`。
- SQLite schema 增加 `fixture_sporttery_mappings`。
- API 增加体彩启用配置与映射 CRUD。
- Context refresh 支持抓取体彩赛前情报。
- 前端数据卡展示 `体彩数据`。
- 前端预测请求抽屉增加 `使用体彩数据` 开关。
- 自动映射脚本保留为开发/运维工具。
- 测试覆盖 parser、client、repository、API refresh、前端请求参数。

本次不包含：

- 完整体彩后台管理 UI。
- 手工映射的复杂可视化页面。
- 队名模糊匹配交互。
- 将体彩赔率作为预测权重。
- 修改排行榜计分规则。
- 替换懂球帝数据源。

## 数据模型

共享类型：

- `PredictionDataOptionsDto` 增加 `useSporttery: boolean`。
- `FixtureContextDomain` 增加 `"sporttery"`。

数据库：

- `fixture_context_snapshots` 增加 `sporttery_summary_json TEXT NOT NULL DEFAULT '{}'`。
- `fixture_sporttery_mappings` 保存 `api_football_fixture_id` 到 `sporttery_match_id` 的映射。

迁移要求：

- 新库建表时包含 `sporttery_summary_json`。
- 老库启动时通过 `ALTER TABLE` 增加 `sporttery_summary_json`。
- 老库启动时创建 `fixture_sporttery_mappings`。
- 重复启动不能因为列或表已存在而失败。

## 数据获取

`SportteryClient` 负责访问体彩公开接口：

- `getMatchList()` 获取全赛程和玩法赔率。
- `getResultHistory(matchId)` 获取历史交锋。
- `getMatchTables(matchId)` 获取积分榜。
- `getMatchResult(matchId)` 获取近期战绩。
- `getMatchFeature(matchId)` 获取特征胜率。
- `getInjurySuspension(matchId)` 获取伤停。

体彩接口请求需要携带：

- `User-Agent`
- `Accept`
- `Referer: https://www.sporttery.cn/`

任何非 2xx 响应都抛出明确错误，由 context refresh 捕获并转成 `refresh_failed`。

## 摘要解析

`parseSportterySummary` 将体彩数据压缩为中文摘要，包含：

- 官方胜平负赔率。
- 官方让球胜平负赔率。
- 历史交锋。
- 积分榜。
- 近期战绩。
- 特征胜率。
- 伤停明细。

摘要规则：

- 有有效信息时返回 `cached`。
- 全部为空时返回 `unavailable` 和 `未获取体彩数据`。
- 原始输入保留在 snapshot 的 `raw.sporttery` 中。

赔率处理：

- 赔率只作为官方市场背景进入摘要。
- 提示词必须强调不得把赔率作为胜平负预测权重。
- 前端公开页不以赔率作为主叙事。

## 映射

`fixture_sporttery_mappings` 通过 API-Football fixture id 关联体彩 match id。

API：

- `GET /api/admin/settings/sporttery`
- `PUT /api/admin/settings/sporttery`
- `GET /api/admin/sporttery-mappings`
- `POST /api/admin/sporttery-mappings`
- `DELETE /api/admin/sporttery-mappings/:apiFootballFixtureId`

自动映射脚本：

- `apps/api/scripts/syncSportteryMappings.mjs`
- 从 `/api/public/matches` 读取 API-Football 比赛。
- 从体彩全赛程读取中文主客队。
- 按 `主队中文|客队中文` 精确匹配并写入 mapping。
- 未匹配比赛只打印日志，不阻断已匹配比赛写入。

## Context Refresh

`refreshFixtureContext` 接收：

- `sportteryClient`
- `sportteryMatchId`
- `dataOptions.useSporttery`

行为：

- `useSporttery === true` 且 `sportteryClient` 与 `sportteryMatchId` 都存在时，抓取体彩六类数据并解析摘要。
- 抓取成功后写入 `domain: "sporttery"`。
- 抓取失败后写入 `domain: "sporttery"`、`status: "refresh_failed"`、`summary: "未获取体彩数据"`。
- 未启用、未配置映射或未传 client 时，写入 `not_requested`。

预测流程不能因为体彩失败中断。

## 前端

数据卡：

- `MatchContextDrawer` 增加 `sporttery: "体彩数据"`。
- 展示方式沿用现有 context domain 列表。

预测请求：

- `PredictionRequestDrawer` 默认 `useSporttery: true`。
- 数据选项区域增加 `使用体彩数据` checkbox。
- 提交预测请求时包含 `useSporttery`。

赛程数据卡自动刷新：

- `FixturesPage` 的默认 context data options 增加 `useSporttery: true`。
- 打开数据卡自动刷新时带上该字段。

## 提示词

内置提示词模板增加体彩数据使用规则：

- 体彩数据可以提供官方胜平负/让球赔率、历史交锋、积分榜、近期战绩、特征胜率、伤停明细。
- 让球盘口可作为官方市场观点背景。
- 积分榜用于判断小组出线形势。
- 伤停明细用于判断阵容影响。
- 官方赔率不得作为胜平负预测权重。

## 测试

API 测试：

- `sporttery.test.ts` 覆盖 parser、odds extraction、client headers、非 2xx 错误。
- `fixtureContextRepository.test.ts` 覆盖 snapshot 保存和读取 `sporttery` domain。
- `fixtureContextApi.test.ts` 覆盖 request body 包含 `useSporttery`。
- `publicPredictionRequest.test.ts` 覆盖预测请求保存 `useSporttery`。
- `schemaMigration.test.ts` 覆盖新列和映射表迁移。
- 后台 API 测试覆盖体彩启用配置和 mapping CRUD。

Web 测试：

- `PredictionRequestDrawer` 覆盖 `useSporttery` 默认提交。
- `FixturesPage` 覆盖打开数据卡刷新时传 `useSporttery: true`。
- `client.test.ts` 覆盖 API client 序列化 `useSporttery`。

最终验证：

- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm lint`

## 风险

- 体彩公开接口没有正式稳定性承诺，字段可能变化。
- 精确中文队名映射可能漏掉简称差异。
- 全赛程接口可能包含非世界杯比赛，自动映射只能写入精确匹配项。
- 赔率文本容易误导模型，因此提示词必须持续强调赔率不能作为预测权重。

## 收口策略

当前工作区已有实现雏形。实施阶段不重写架构，只做收口：

- 保留已存在的模块边界。
- 补齐缺失测试。
- 修正 schema migration 幂等性。
- 确保全仓验证通过。
- 将体彩数据源作为单独提交落地。
