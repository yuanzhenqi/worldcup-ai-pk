import type { SingleMatchEnrichment } from "../betting-arena/bettingArena.context";
import type {
  FixtureContextSummaryDto,
  MatchAnalysisAgentOutputDto,
  PredictionDataOptionsDto,
  PredictionOutputStyle,
  PredictionTaskType
} from "@worldcup-ai-pk/shared";

export interface AgentPromptMatch {
  id: string;
  api_football_fixture_id: number;
  stage: string;
  kickoff_at: string;
  venue: string | null;
  home_team_name: string;
  away_team_name: string;
}

export interface PromptTemplateForAgent {
  full_prompt: string;
}

function replacePromptVariables(template: string, match: AgentPromptMatch): string {
  return template
    .replaceAll("{{homeTeam}}", match.home_team_name)
    .replaceAll("{{awayTeam}}", match.away_team_name)
    .replaceAll("{{kickoffAt}}", match.kickoff_at)
    .replaceAll("{{stage}}", match.stage)
    .replaceAll("{{venue}}", match.venue ?? "场馆待同步");
}

function buildBaseContext(input: {
  match: AgentPromptMatch;
  taskTypes: PredictionTaskType[];
  dataOptions: PredictionDataOptionsDto;
  outputStyle: PredictionOutputStyle;
  customPrompt: string;
  context: FixtureContextSummaryDto | null;
}) {
  return {
    match: {
      id: input.match.id,
      apiFootballFixtureId: input.match.api_football_fixture_id,
      stage: input.match.stage,
      kickoffAt: input.match.kickoff_at,
      venue: input.match.venue,
      homeTeam: input.match.home_team_name,
      awayTeam: input.match.away_team_name
    },
    taskTypes: input.taskTypes,
    dataOptions: input.dataOptions,
    outputStyle: input.outputStyle,
    customPrompt: input.customPrompt,
    context: input.context
  };
}

export function buildMatchAnalysisPrompt(input: {
  match: AgentPromptMatch;
  taskTypes: PredictionTaskType[];
  dataOptions: PredictionDataOptionsDto;
  outputStyle: PredictionOutputStyle;
  customPrompt: string;
  context: FixtureContextSummaryDto | null;
  promptTemplate: PromptTemplateForAgent;
  enrichment?: SingleMatchEnrichment | null;
}): string {
  const outputContract = {
    predicted_result: "home | draw | away",
    predicted_home_score: "integer",
    predicted_away_score: "integer",
    confidence: "number between 0 and 1",
    short_reason: "Chinese text",
    key_factors: ["Chinese text"],
    risk_points: ["Chinese text"],
    analysis_report: "Detailed Chinese analysis report",
    data_gaps: ["Chinese text"]
  };

  const enrichmentBlock = input.enrichment
    ? [
        "",
        "--- 以下数据来自多数据源采集，与 AI 投注场共享 ---",
        "球队资料 (team_profiles):",
        `  主队 ${input.match.home_team_name}: ${JSON.stringify(input.enrichment.homeTeamProfile)}`,
        `  客队 ${input.match.away_team_name}: ${JSON.stringify(input.enrichment.awayTeamProfile)}`,
        "",
        "历史交锋 (historical_matchup):",
        JSON.stringify(input.enrichment.historicalMatchup, null, 2),
        "",
        "体彩可购玩法与赔率 (sporttery_pools):",
        JSON.stringify(input.enrichment.sportteryPools, null, 2),
        "注意：赔率仅作为投注选项背景和可能的投入回报计算参考，不得作为赛果判断权重。",
        "",
        "外部情报 (external_intel):",
        JSON.stringify(input.enrichment.externalIntel, null, 2),
        "",
        input.enrichment.groupStandings
          ? `小组积分榜 (group_standings):\n${JSON.stringify(input.enrichment.groupStandings, null, 2)}\n`
          : "",
        input.enrichment.dongqiudiComparison
          ? `懂球帝对比 (dongqiudi_comparison):\n${JSON.stringify(input.enrichment.dongqiudiComparison, null, 2)}\n`
          : "",
        "数据缺口 (data_gaps):",
        JSON.stringify(input.enrichment.dataGaps, null, 2),
        "--- 富数据结束 ---"
      ].join("\n")
    : "";

  return [
    replacePromptVariables(input.promptTemplate.full_prompt, input.match),
    "",
    "你是 Agent A：比赛结果预测 Agent。你只负责预测赛果、比分、关键因素和风险。",
    "体彩指数只能作为可选投注品类的背景，不得把指数高低作为赛果或比分权重。",
    "prediction_context:",
    JSON.stringify(buildBaseContext(input), null, 2),
    enrichmentBlock,
    "",
    "Return JSON only. Required JSON shape:",
    JSON.stringify(outputContract, null, 2)
  ].join("\n");
}

export function buildSingleCombinationPrompt(input: {
  match: AgentPromptMatch;
  taskTypes: PredictionTaskType[];
  dataOptions: PredictionDataOptionsDto;
  outputStyle: PredictionOutputStyle;
  customPrompt: string;
  context: FixtureContextSummaryDto | null;
  matchAnalysis: MatchAnalysisAgentOutputDto;
  enrichment?: SingleMatchEnrichment | null;
}): string {
  const outputContract = {
    summary: "Chinese text",
    primary_plan: {
      plan_name: "Chinese text",
      risk_level: "low | medium | high",
      legs: [
        {
          pool_code: "Sporttery poolCode",
          selection_code: "Sporttery option code",
          selection_label: "Chinese text",
          reason: "Chinese text"
        }
      ],
      stake_units: "integer",
      expected_scenario: "Chinese text",
      avoid_reason: "Chinese text or null"
    },
    backup_plans: [
      {
        plan_name: "Chinese text",
        risk_level: "low | medium | high",
        legs: [
          {
            pool_code: "Sporttery poolCode",
            selection_code: "Sporttery option code",
            selection_label: "Chinese text",
            reason: "Chinese text"
          }
        ],
        stake_units: "integer",
        expected_scenario: "Chinese text",
        avoid_reason: "Chinese text or null"
      }
    ],
    pass_recommendation: "Chinese text",
    risk_warnings: ["Chinese text"],
    data_gaps: ["Chinese text"]
  };

  const enrichmentBlock = input.enrichment
    ? [
        "",
        "--- 以下数据来自多数据源采集，与 AI 投注场共享 ---",
        "体彩可购玩法与赔率 (sporttery_pools):",
        JSON.stringify(input.enrichment.sportteryPools, null, 2),
        "注意：所有投注项必须从 sporttery_pools 中选择，poolCode/selectionCode 必须精确匹配。",
        "赔率仅作为可购买价格和潜在返还计算依据，不得作为赛果判断权重。",
        "",
        "外部情报 (external_intel):",
        JSON.stringify(input.enrichment.externalIntel, null, 2),
        "",
        "数据缺口 (data_gaps):",
        JSON.stringify(input.enrichment.dataGaps, null, 2),
        "--- 富数据结束 ---"
      ].join("\n")
    : "";

  return [
    "你是 Agent B：投注组合方案 Agent。你必须基于 Agent A 的比赛判断和 prediction_context 中已存在的体彩选项生成方案。",
    "不要重新预测赛果，不要覆盖 Agent A 的比分判断。若体彩选项缺失，必须在 data_gaps 写明，并在 pass_recommendation 中降低参与建议。",
    "只输出娱乐参考方案，不承诺收益，不使用本金翻倍、稳赚、必中等表达。",
    "prediction_context:",
    JSON.stringify({
      ...buildBaseContext(input),
      matchAnalysis: input.matchAnalysis
    }, null, 2),
    enrichmentBlock,
    "",
    "Return JSON only. Required JSON shape:",
    JSON.stringify(outputContract, null, 2)
  ].join("\n");
}
