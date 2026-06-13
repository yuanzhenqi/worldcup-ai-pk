import type { Database } from "better-sqlite3";

interface BuiltInPromptTemplate {
  id: string;
  name: string;
  description: string;
  fullPrompt: string;
  promptSummary: string;
  scope: string;
  enabled: boolean;
  isDefault: boolean;
}

export const builtInPromptTemplates: BuiltInPromptTemplate[] = [
  {
    id: "builtin-prompt-steady-1x2",
    name: "稳健胜平负预测",
    description: "偏保守地判断胜平负结果，要求输出置信度与主要风险。",
    fullPrompt:
      "你是世界杯赛前预测分析师。请基于球队实力、近期状态、阵容完整度、战术匹配、赛程压力、比赛地点和赔率信号，预测 {{homeTeam}} 对阵 {{awayTeam}} 的胜平负结果。请输出：1. 推荐赛果；2. 主胜/平局/客胜概率；3. 置信度；4. 关键理由；5. 主要风险。不要夸大不确定信息。",
    promptSummary: "稳健胜平负，强调置信度和风险",
    scope: "match_prediction",
    enabled: true,
    isDefault: true
  },
  {
    id: "builtin-prompt-scoreline",
    name: "比分预测",
    description: "聚焦精确比分、进球节奏和比分区间。",
    fullPrompt:
      "你是足球比分预测模型。请预测 {{homeTeam}} 对阵 {{awayTeam}} 的最可能比分，并给出两个备选比分。请说明上半场节奏、双方进球方式、总进球区间，以及比分预测的不确定性。输出必须包含 predicted_home_score 和 predicted_away_score 的明确整数判断。",
    promptSummary: "预测精确比分和备选比分",
    scope: "match_prediction",
    enabled: true,
    isDefault: false
  },
  {
    id: "builtin-prompt-upset-risk",
    name: "爆冷风险评估",
    description: "专门评估弱势方爆冷路径和热门方失分信号。",
    fullPrompt:
      "你是世界杯爆冷风险分析师。请评估 {{homeTeam}} 对阵 {{awayTeam}} 是否存在爆冷风险。请识别更被看好的一方、弱势方爆冷路径、热门方风险点、赔率或市场过热信号、比赛早段关键情境，并给出低/中/高爆冷风险等级。",
    promptSummary: "识别爆冷概率、路径和风险信号",
    scope: "match_prediction",
    enabled: true,
    isDefault: false
  },
  {
    id: "builtin-prompt-weighted-data",
    name: "数据权重型预测",
    description: "按固定权重拆解影响因素，适合模型之间横向对比。",
    fullPrompt:
      "你是数据权重型足球预测分析师。请对 {{homeTeam}} 对阵 {{awayTeam}} 进行结构化预测，并按以下权重评估：球队整体实力 25%，近期状态 20%，阵容与伤停 15%，战术克制 15%，赔率变化 10%，场地与旅行 10%，赛程压力 5%。请给出每项评分、总分、预测赛果、预测比分、置信度和三条关键因素。",
    promptSummary: "固定权重拆解球队实力、状态、阵容和赔率",
    scope: "match_prediction",
    enabled: true,
    isDefault: false
  }
];

export function seedBuiltInPromptTemplates(db: Database, now = new Date()): void {
  const hasDefaultPromptTemplate = Boolean(
    db.prepare("SELECT id FROM prompt_templates WHERE is_default = 1 LIMIT 1").get()
  );
  const createdAt = now.toISOString();

  const insert = db.prepare(
    `
      INSERT INTO prompt_templates (
        id,
        name,
        description,
        full_prompt,
        prompt_summary,
        scope,
        enabled,
        is_default,
        created_at,
        updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM prompt_templates WHERE id = ?
      )
    `
  );

  const transaction = db.transaction(() => {
    for (const template of builtInPromptTemplates) {
      insert.run(
        template.id,
        template.name,
        template.description,
        template.fullPrompt,
        template.promptSummary,
        template.scope,
        template.enabled ? 1 : 0,
        template.isDefault && !hasDefaultPromptTemplate ? 1 : 0,
        createdAt,
        createdAt,
        template.id
      );
    }
  });

  transaction();
}
