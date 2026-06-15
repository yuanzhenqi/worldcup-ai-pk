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

  return [
    replacePromptVariables(input.promptTemplate.full_prompt, input.match),
    "",
    "你是 Agent A：比赛结果预测 Agent。你只负责预测赛果、比分、关键因素和风险。",
    "体彩指数只能作为可选投注品类的背景，不得把指数高低作为赛果或比分权重。",
    "prediction_context:",
    JSON.stringify(buildBaseContext(input), null, 2),
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

  return [
    "你是 Agent B：投注组合方案 Agent。你必须基于 Agent A 的比赛判断和 prediction_context 中已存在的体彩选项生成方案。",
    "不要重新预测赛果，不要覆盖 Agent A 的比分判断。若体彩选项缺失，必须在 data_gaps 写明，并在 pass_recommendation 中降低参与建议。",
    "只输出娱乐参考方案，不承诺收益，不使用本金翻倍、稳赚、必中等表达。",
    "prediction_context:",
    JSON.stringify({
      ...buildBaseContext(input),
      matchAnalysis: input.matchAnalysis
    }, null, 2),
    "",
    "Return JSON only. Required JSON shape:",
    JSON.stringify(outputContract, null, 2)
  ].join("\n");
}
