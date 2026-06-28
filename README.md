# ⚽ 2026 世界杯 AI 预测 PK

> **多个 AI 大模型同场预测世界杯，赛后真实结算，用排行榜看谁更懂比赛。**

不是 demo，不是聊天——这是一个**完整的 AI 实盘预测竞技系统**：多个大模型独立预测同一场比赛，注入相同的数据源，生成结构化投注方案，赛后自动结算盈亏。

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 🔥 核心亮点

### 🤖 多模型同场竞技
- 同时接入**任意数量的 OpenAI 兼容大模型**（GPT、Claude、Gemini、Kimi、DeepSeek 等）
- 每个模型独立预测、独立出单，互不干扰
- 赛后自动结算，排行榜实时更新命中率和收益率

### 📊 7 大数据源注入
预测不是拍脑袋——每个模型都拿到**完全相同的多维数据**：

| 数据源 | 内容 |
|--------|------|
| 🏟️ **API-Football** | 赛程、比分、比赛状态实时同步 |
| 🎯 **体彩赛前情报** | 可购玩法、赔率、历史交锋、伤停 |
| 📰 **懂球帝情报** | 赛前对比、球队近况、阵容线索 |
| 🔍 **外部新闻情报** | DuckDuckGo 实时搜索最新新闻、动机、风险信号 |
| 👥 **球队资料** | 教练、风格、核心球员、伤停、世界杯履历 |
| 📋 **小组积分榜** | 出线形势、战意、轮换动机 |
| ⚔️ **历史交锋** | 世界杯历史对决、胜平负分布 |

### 💰 AI 实盘投注场
- 每个模型拥有**独立虚拟账户**（初始资金 10000）
- 模型自主决定：下注 or 空仓，投入多少，买什么
- **分桶策略**：稳胆（高置信）→ 价值（赔率偏差）→ 保护（对冲）→ 防冷（冷门）→ 回避
- 赛后自动结算，实时计算盈亏和收益率

### ⚡ 一键批量预测
- 一键预测明日全部比赛，或**多选自定义批量预测**
- 可配置预测任务类型、数据源、输出格式
- 进度实时展示，逐场串行执行

### 🏆 排行榜与审计
- 模型排行榜：命中率、收益率、盈利出单数
- 每次预测的**完整审计链**：提示词 → 原始返回 → 解析输出 → 结算结果
- 投注单详情：实时赛果判定，无需等全部完赛

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────┐
│  React SPA (Vite + TypeScript)                          │
│  ├─ 赛程预测控制台                                       │
│  ├─ AI 实盘投注场                                        │
│  ├─ 投注输入与情报审计                                    │
│  ├─ 排行榜                                              │
│  └─ 后台配置                                             │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────┐
│  Fastify API Server (TypeScript)                        │
│  ├─ 赛程同步（API-Football）                              │
│  ├─ 情报采集（体彩 + 懂球帝 + 外部搜索）                    │
│  ├─ AI 预测引擎（多模型并行调用）                          │
│  ├─ 投注解析与结算                                        │
│  └─ SQLite 持久化                                        │
└─────────────────────────────────────────────────────────┘
```

**Monorepo 结构：**

```
worldcup-ai-pk/
├── apps/
│   ├── api/          # Fastify 后端
│   └── web/          # React 前端
├── packages/
│   └── shared/       # 共享类型定义
└── package.json      # pnpm workspace
```

---

## 🚀 快速开始

### 环境要求

- Node.js >= 22
- pnpm >= 10

### 安装

```bash
git clone https://github.com/yuanzhenqi/worldcup-ai-pk.git
cd worldcup-ai-pk
pnpm install
```

### 配置

1. 启动后端服务：

```bash
cd apps/api
pnpm dev
```

2. 打开后台配置页面，添加：

   - **API-Football Key**（获取世界杯赛程和实时比分）
   - **AI 模型配置**（至少一个 OpenAI 兼容的模型端点）
     - 支持任意 OpenAI 兼容 API：OpenAI、DeepSeek、Kimi、智谱、Moonshot 等
     - 配置 baseUrl、apiKey、modelName 即可
   - **数据源开关**（体彩、懂球帝等）

3. 启动前端：

```bash
cd apps/web
pnpm dev
```

### 使用

1. **同步赛程** → 赛程控制台自动加载比赛
2. **一键预测明日** → 批量触发所有模型预测
3. **AI 投注场** → 生成今日出单，查看各模型投注方案
4. **赛后结算** → 比赛结束后自动结算，排行榜更新

---

## 🎮 功能详解

### 赛程预测控制台
- 按日期分组展示比赛，支持搜索和轮次筛选
- 单场比赛可触发多模型预测，实时轮询进度
- 预测结果汇总：综合观点、参考比分、各模型对比
- 支持串关组合生成

### AI 实盘投注场
- **资金榜**：余额、冻结、收益率、命中率、盈利出单数
- **出单详情**：单场投注、串关、风险分桶、赛果实时判定
- **结算系统**：已完赛投注自动判定命中，支持让球玩法
- **历史追溯**：查看历史轮次详情，支持重新采集情报

### 后台配置
- AI Provider / Model 管理（增删改、测试连通性）
- 提示词模板管理（支持变量替换）
- 数据源开关（API-Football、体彩、懂球帝）
- 球队中文名映射

---

## 📁 关键目录

```
apps/api/src/modules/
├── ai/                 # AI 模型调用客户端
├── betting-arena/      # 投注场核心逻辑（上下文、提示词、解析、结算）
├── context/            # 数据源采集（体彩、懂球帝、球队资料）
├── external-intel/     # 外部新闻情报采集
├── football/           # API-Football 客户端
├── matches/            # 赛程数据
├── predictions/        # 赛程预测引擎
└── public/             # 公开 API 路由
```

---

## 🛠️ Tech Stack

| 层 | 技术 |
|----|------|
| 前端 | React 19, Vite, TypeScript |
| 后端 | Fastify, TypeScript |
| 数据库 | SQLite (better-sqlite3) |
| AI | OpenAI 兼容 API（支持任意 provider）|
| 赛程 | API-Football |
| 彩票 | 体彩 webapi |
| 情报 | 懂球帝 + DuckDuckGo |
| 包管理 | pnpm workspace |

---

## 📄 License

MIT
