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

const contextRules = [
  "你必须只使用 prediction_context 中已经提供的数据。",
  "对缺失的球员、伤停、阵容、历史交锋、官方指数或官方预测，必须写明未获取；不得编造任何球员状态、伤停、历史战绩、官方指数或阵容信息。",
  "若 prediction_context 包含官方指数，只能把它作为赛前市场背景说明，不得作为胜平负或比分预测的权重。",
  "不要因为官方指数更低或市场更热而直接提高某一结果概率。",
  "如果你的足球判断与市场背景不一致，可以说明差异原因，但最终结论必须来自球队状态、阵容、战术、赛程和历史交锋等足球数据分析。",
  "若 prediction_context 包含懂球帝情报（dongqiudi_intel，含两队综合实力、近期战绩、历史交锋、身价对比、场均红黄牌等赛前情报），应结合近期战绩和历史交锋辅助判断球队状态与纪律风险；场均红黄牌可用于评估犯规与红牌风险；身价对比和综合实力百分比仅作实力参考，不得单独作为预测依据，也不得替代阵容、伤停等更直接的情报。",
  "若 prediction_context 包含体彩赛前情报（sporttery，含官方指数、历史交锋、积分形势、近期状态、特征对比、伤停影响），官方指数只可作为市场背景说明，不得直接决定预测；积分形势用于判断小组出线压力；伤停影响用于判断阵容完整性和关键球员缺阵风险；官方指数不得作为胜平负预测的权重。",
  "输出必须包含结构化字段和中文摘要。"
].join("\n");

export const builtInPromptTemplates: BuiltInPromptTemplate[] = [
  {
    id: "builtin-prompt-steady-1x2",
    name: "稳健胜平负预测",
    description: "偏保守地判断胜平负结果，要求输出置信度与主要风险。",
    fullPrompt: [
      contextRules,
      "你是世界杯赛前预测分析师。请基于 prediction_context 预测 {{homeTeam}} 对阵 {{awayTeam}} 的胜平负结果。",
      "输出：1. recommended_outcome；2. home_win_probability/draw_probability/away_win_probability；3. confidence；4. key_reasons；5. risk_factors。"
    ].join("\n\n"),
    promptSummary: "稳健胜平负，强调置信度和风险",
    scope: "match_prediction",
    enabled: true,
    isDefault: true
  },
  {
    id: "builtin-prompt-scoreline",
    name: "比分预测",
    description: "聚焦精确比分、进球节奏和比分区间。",
    fullPrompt: [
      contextRules,
      "你是足球比分预测模型。请基于 prediction_context 预测 {{homeTeam}} 对阵 {{awayTeam}} 的最可能比分，并给出两个备选比分。",
      "输出：1. predicted_home_score；2. predicted_away_score；3. alternative_scorelines；4. first_half_pattern；5. total_goals_range；6. scoreline_uncertainty。"
    ].join("\n\n"),
    promptSummary: "预测精确比分和备选比分",
    scope: "match_prediction",
    enabled: true,
    isDefault: false
  },
  {
    id: "builtin-prompt-odds-driven",
    name: "市场背景说明",
    description: "仅用于解释市场信息，不参与默认预测权重。",
    fullPrompt: [
      contextRules,
      "你是赛前市场背景分析师。请基于 prediction_context 中已经提供的市场信息和比赛基础信息，说明 {{homeTeam}} 对阵 {{awayTeam}} 的市场关注点。",
      "输出：1. market_context_note；2. market_attention_note；3. football_data_gap；4. conflict_with_football_analysis；5. non_weighting_notice。"
    ].join("\n\n"),
    promptSummary: "说明市场背景，不参与默认预测权重",
    scope: "match_prediction",
    enabled: false,
    isDefault: false
  },
  {
    id: "builtin-prompt-player-lineup",
    name: "球员阵容影响",
    description: "聚焦球员、阵容、伤停对比赛结果和比分的影响。",
    fullPrompt: [
      contextRules,
      "你是阵容影响分析师。请基于 prediction_context 中已经提供的球员、阵容、伤停和比赛信息，分析 {{homeTeam}} 对阵 {{awayTeam}}。",
      "输出：1. lineup_availability_status；2. key_player_impact；3. tactical_impact；4. 1x2_prediction；5. predicted_scoreline；6. missing_data_note。"
    ].join("\n\n"),
    promptSummary: "评估球员、阵容、伤停对预测的影响",
    scope: "match_prediction",
    enabled: true,
    isDefault: false
  },
  {
    id: "builtin-prompt-head-to-head",
    name: "历史交锋模型",
    description: "聚焦历史交锋、风格克制和心理优势。",
    fullPrompt: [
      contextRules,
      "你是历史交锋分析师。请基于 prediction_context 中已经提供的历史交锋、官方预测和比赛信息，分析 {{homeTeam}} 对阵 {{awayTeam}}。",
      "输出：1. head_to_head_status；2. historical_pattern；3. style_matchup；4. 1x2_prediction；5. predicted_scoreline；6. confidence_adjustment。"
    ].join("\n\n"),
    promptSummary: "结合历史交锋和风格克制预测",
    scope: "match_prediction",
    enabled: true,
    isDefault: false
  },
  {
    id: "builtin-prompt-upset-risk",
    name: "爆冷风险评估",
    description: "专门评估弱势方爆冷路径和热门方失分信号。",
    fullPrompt: [
      contextRules,
      "你是世界杯爆冷风险分析师。请基于 prediction_context 评估 {{homeTeam}} 对阵 {{awayTeam}} 是否存在爆冷风险。",
      "输出：1. favorite_side；2. upset_risk_level；3. underdog_paths；4. favorite_risk_points；5. market_attention_note；6. predicted_scoreline。"
    ].join("\n\n"),
    promptSummary: "识别爆冷概率、路径和风险信号",
    scope: "match_prediction",
    enabled: true,
    isDefault: false
  },
  {
    id: "builtin-prompt-comprehensive-report",
    name: "综合赛前报告",
    description: "综合球队状态、官方预测、历史交锋和阵容信息生成赛前报告。",
    fullPrompt: [
      contextRules,
      "你是世界杯综合赛前报告分析师。请基于 prediction_context 为 {{homeTeam}} 对阵 {{awayTeam}} 输出一份可读性强的赛前预测报告。",
      "输出：1. executive_summary；2. data_completeness；3. 1x2_prediction；4. scoreline_prediction；5. market_context_note；6. player_lineup_note；7. head_to_head_note；8. confidence；9. risks。"
    ].join("\n\n"),
    promptSummary: "综合上下文生成赛前预测报告",
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
  const update = db.prepare(
    `
      UPDATE prompt_templates
      SET
        name = ?,
        description = ?,
        full_prompt = ?,
        prompt_summary = ?,
        scope = ?,
        enabled = ?,
        is_default = CASE WHEN ? = 0 THEN 0 ELSE is_default END,
        updated_at = ?
      WHERE id = ?
    `
  );

  const transaction = db.transaction(() => {
    for (const template of builtInPromptTemplates) {
      const existing = db.prepare("SELECT id FROM prompt_templates WHERE id = ?").get(template.id);
      if (existing) {
        update.run(
          template.name,
          template.description,
          template.fullPrompt,
          template.promptSummary,
          template.scope,
          template.enabled ? 1 : 0,
          template.enabled ? 1 : 0,
          createdAt,
          template.id
        );
        continue;
      }

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
