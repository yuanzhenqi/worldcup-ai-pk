import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type {
  AgentRole,
  BettingPlanDto,
  BettingRiskLevel,
  FixtureContextSummaryDto,
  MatchAnalysisAgentOutputDto,
  ParlayCombinationRunDto,
  PredictionRequestInputDto,
  PredictionRequestResponseDto,
  PredictionResult,
  PredictionRunHistoryDto,
  PredictionRunLogDto,
  PredictionRunPredictionDto,
  PredictionRunStatusDto,
  SingleCombinationAgentOutputDto
} from "@worldcup-ai-pk/shared";
import type { SingleMatchEnrichment } from "../betting-arena/bettingArena.context";
import { runOpenAiCompatiblePrediction } from "../ai/openAiCompatibleClient";
import { buildMatchAnalysisPrompt, buildSingleCombinationPrompt } from "./predictionAgentPrompts";
import { parseMatchAnalysisOutput, parseSingleCombinationOutput } from "./predictionAgentOutputs";

interface PredictionMatchRow {
  id: string;
  api_football_fixture_id: number;
  stage: string;
  kickoff_at: string;
  status: string;
  venue: string | null;
  home_team_name: string;
  away_team_name: string;
}

interface EnabledModelRow {
  model_id: string;
  model_name: string;
  model_display_name: string;
  provider_display_name: string;
  base_url: string;
  api_key: string;
  context_window_tokens: number;
  max_output_tokens: number;
  request_timeout_ms: number;
  request_retry_count: number;
}

interface PromptTemplateRow {
  id: string;
  name: string;
  full_prompt: string;
  prompt_summary: string;
}

interface ParsedModelPrediction extends MatchAnalysisAgentOutputDto {
  oddsInterpretation: string;
}

interface ExecutePredictionInput {
  db: Database;
  match: PredictionMatchRow;
  requestId: string;
  runId: string;
  predictionInput: PredictionRequestInputDto;
  context: FixtureContextSummaryDto | null;
  enrichment?: SingleMatchEnrichment | null;
  now?: Date;
}

interface ExecutionLog extends PredictionRunLogDto {
  modelId: string | null;
}

interface PredictionRunStatusRow {
  id: string;
  match_id: string;
  status: "running" | "completed" | "failed";
  failure_reason: string | null;
}

interface PredictionRunLogRow {
  level: "info" | "error";
  message: string;
  model_display_name: string | null;
  created_at: string;
}

interface PredictionRunPredictionRow {
  id: string;
  model_id: string;
  model_display_name: string;
  predicted_result: PredictionResult;
  predicted_home_score: number;
  predicted_away_score: number;
  confidence: number;
  short_reason: string;
  analysis_report: string;
  key_factors_json: string;
  odds_interpretation: string;
  risk_points_json: string;
}

interface PredictionAgentOutputRow {
  model_id: string;
  agent_role: AgentRole;
  output_json: string;
}

function listEnabledModels(db: Database): EnabledModelRow[] {
  return db
    .prepare(
      `
        SELECT
          ai_models.id AS model_id,
          ai_models.model_name,
          ai_models.display_name AS model_display_name,
          ai_models.context_window_tokens,
          ai_models.max_output_tokens,
          ai_models.request_timeout_ms,
          ai_models.request_retry_count,
          ai_providers.display_name AS provider_display_name,
          ai_providers.base_url,
          ai_providers.api_key
        FROM ai_models
        INNER JOIN ai_providers ON ai_providers.id = ai_models.provider_id
        WHERE ai_models.enabled = 1
          AND ai_models.deleted_at IS NULL
          AND ai_providers.enabled = 1
          AND ai_providers.deleted_at IS NULL
        ORDER BY ai_models.display_name ASC, ai_models.model_name ASC
      `
    )
    .all() as EnabledModelRow[];
}

function getPromptTemplate(db: Database, id: string | null): PromptTemplateRow | null {
  if (id) {
    return (
      db
        .prepare(
          `
            SELECT id, name, full_prompt, prompt_summary
            FROM prompt_templates
            WHERE id = ?
              AND enabled = 1
          `
        )
        .get(id) as PromptTemplateRow | undefined
    ) ?? null;
  }

  return (
    db
      .prepare(
        `
          SELECT id, name, full_prompt, prompt_summary
          FROM prompt_templates
          WHERE enabled = 1
          ORDER BY is_default DESC, name ASC
          LIMIT 1
        `
      )
      .get() as PromptTemplateRow | undefined
  ) ?? null;
}

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

function createLogWriter(db: Database, input: { runId: string; matchId: string; startedAt: Date }) {
  const logs: ExecutionLog[] = [];

  return {
    logs,
    write(level: PredictionRunLogDto["level"], message: string, model: { id: string; displayName: string } | null = null) {
      const createdAt = addMilliseconds(input.startedAt, logs.length).toISOString();
      db.prepare(
        `
          INSERT INTO prediction_run_logs (
            id,
            prediction_run_id,
            match_id,
            model_id,
            level,
            message,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      ).run(randomUUID(), input.runId, input.matchId, model?.id ?? null, level, message, createdAt);
      logs.push({
        level,
        message,
        modelDisplayName: model?.displayName ?? null,
        modelId: model?.id ?? null,
        createdAt
      });
    }
  };
}

function insertParsedPrediction(db: Database, input: {
  runId: string;
  matchId: string;
  modelId: string;
  promptTemplate: PromptTemplateRow;
  prediction: ParsedModelPrediction;
  rawResponse: string;
  now: Date;
}) {
  db.prepare(
    `
      INSERT INTO ai_predictions (
        id,
        prediction_run_id,
        match_id,
        model_id,
        prompt_template_id,
        predicted_result,
        predicted_home_score,
        predicted_away_score,
        confidence,
        short_reason,
        analysis_report,
        key_factors_json,
        odds_interpretation,
        risk_points_json,
        raw_response,
        parse_status,
        eligible_for_scoring,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    randomUUID(),
    input.runId,
    input.matchId,
    input.modelId,
    input.promptTemplate.id,
    input.prediction.predictedResult,
    input.prediction.predictedHomeScore,
    input.prediction.predictedAwayScore,
    input.prediction.confidence,
    input.prediction.shortReason,
    input.prediction.analysisReport,
    JSON.stringify(input.prediction.keyFactors),
    input.prediction.oddsInterpretation,
    JSON.stringify(input.prediction.riskPoints),
    input.rawResponse,
    "parsed",
    1,
    input.now.toISOString()
  );
}

function insertAgentOutput(db: Database, input: {
  runId: string;
  matchId: string;
  modelId: string;
  agentRole: AgentRole;
  output: unknown;
  rawResponse: string;
  now: Date;
}) {
  db.prepare(
    `
      INSERT INTO prediction_agent_outputs (
        id,
        prediction_run_id,
        match_id,
        model_id,
        agent_role,
        output_json,
        raw_response,
        parse_status,
        error,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    randomUUID(),
    input.runId,
    input.matchId,
    input.modelId,
    input.agentRole,
    JSON.stringify(input.output),
    input.rawResponse,
    "parsed",
    null,
    input.now.toISOString()
  );
}

function readAgentOutputs(db: Database, runId: string): Map<string, {
  matchAnalysis: MatchAnalysisAgentOutputDto | null;
  singleCombination: SingleCombinationAgentOutputDto | null;
}> {
  const rows = db
    .prepare(
      `
        SELECT model_id, agent_role, output_json
        FROM prediction_agent_outputs
        WHERE prediction_run_id = ?
          AND parse_status = 'parsed'
        ORDER BY created_at ASC
      `
    )
    .all(runId) as PredictionAgentOutputRow[];
  const result = new Map<string, {
    matchAnalysis: MatchAnalysisAgentOutputDto | null;
    singleCombination: SingleCombinationAgentOutputDto | null;
  }>();

  for (const row of rows) {
    const current = result.get(row.model_id) ?? { matchAnalysis: null, singleCombination: null };
    if (row.agent_role === "match_analysis") {
      current.matchAnalysis = JSON.parse(row.output_json) as MatchAnalysisAgentOutputDto;
    }
    if (row.agent_role === "single_combo") {
      current.singleCombination = JSON.parse(row.output_json) as SingleCombinationAgentOutputDto;
    }
    result.set(row.model_id, current);
  }

  return result;
}

function parseStringArrayJson(value: string): string[] {
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
}

export function getPredictionRunStatus(db: Database, runId: string): PredictionRunStatusDto | null {
  const run = db
    .prepare(
      `
        SELECT id, match_id, status, failure_reason
        FROM prediction_runs
        WHERE id = ?
      `
    )
    .get(runId) as PredictionRunStatusRow | undefined;

  if (!run) {
    return null;
  }

  const logs = db
    .prepare(
      `
        SELECT
          prediction_run_logs.level,
          prediction_run_logs.message,
          ai_models.display_name AS model_display_name,
          prediction_run_logs.created_at
        FROM prediction_run_logs
        LEFT JOIN ai_models ON ai_models.id = prediction_run_logs.model_id
        WHERE prediction_run_logs.prediction_run_id = ?
        ORDER BY prediction_run_logs.created_at ASC
      `
    )
    .all(runId) as PredictionRunLogRow[];
  const predictions = db
    .prepare(
      `
        SELECT
          ai_predictions.id,
          ai_predictions.model_id,
          ai_models.display_name AS model_display_name,
          ai_predictions.predicted_result,
          ai_predictions.predicted_home_score,
          ai_predictions.predicted_away_score,
          ai_predictions.confidence,
          ai_predictions.short_reason,
          ai_predictions.analysis_report,
          ai_predictions.key_factors_json,
          ai_predictions.odds_interpretation,
          ai_predictions.risk_points_json
        FROM ai_predictions
        INNER JOIN ai_models ON ai_models.id = ai_predictions.model_id
        WHERE ai_predictions.prediction_run_id = ?
          AND ai_predictions.parse_status = 'parsed'
        ORDER BY ai_predictions.created_at ASC
      `
    )
    .all(runId) as PredictionRunPredictionRow[];
  const predictionsCount = predictions.length;
  const agentOutputsByModelId = readAgentOutputs(db, run.id);
  const message =
    run.status === "running"
      ? "模型预测进行中"
      : predictionsCount > 0
        ? `已完成 ${predictionsCount} 个模型预测`
        : run.failure_reason ?? "所有模型预测失败";

  return {
    runId: run.id,
    matchId: run.match_id,
    status: run.status,
    message,
    predictionsCount,
    logs: logs.map((log) => ({
      level: log.level,
      message: log.message,
      modelDisplayName: log.model_display_name,
      createdAt: log.created_at
    })),
    predictions: predictions.map((prediction) => ({
      id: prediction.id,
      modelDisplayName: prediction.model_display_name,
      predictedResult: prediction.predicted_result,
      predictedHomeScore: prediction.predicted_home_score,
      predictedAwayScore: prediction.predicted_away_score,
      confidence: prediction.confidence,
      shortReason: prediction.short_reason,
      keyFactors: parseStringArrayJson(prediction.key_factors_json),
      oddsInterpretation: prediction.odds_interpretation,
      riskPoints: parseStringArrayJson(prediction.risk_points_json),
      analysisReport: prediction.analysis_report,
      matchAnalysis: agentOutputsByModelId.get(prediction.model_id)?.matchAnalysis ?? null,
      singleCombination: agentOutputsByModelId.get(prediction.model_id)?.singleCombination ?? null,
      sportteryOddsPools: []
    }))
  };
}

export function listPredictionRunHistory(db: Database, matchId: string): PredictionRunHistoryDto {
  const rows = db
    .prepare(
      `
        SELECT id
        FROM prediction_runs
        WHERE match_id = ?
          AND status IN ('running', 'completed', 'failed')
        ORDER BY scheduled_at DESC
      `
    )
    .all(matchId) as Array<{ id: string }>;

  return {
    matchId,
    runs: rows
      .map((row) => getPredictionRunStatus(db, row.id))
      .filter((run): run is PredictionRunStatusDto => run !== null)
  };
}

export function markPredictionRunFailed(db: Database, input: { requestId: string; runId: string; matchId: string; message: string; now?: Date }): void {
  const now = input.now ?? new Date();
  db.prepare(
    `
      INSERT INTO prediction_run_logs (
        id,
        prediction_run_id,
        match_id,
        model_id,
        level,
        message,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  ).run(randomUUID(), input.runId, input.matchId, null, "error", input.message, now.toISOString());
  db.prepare("UPDATE prediction_runs SET finished_at = ?, status = ?, failure_reason = ? WHERE id = ?").run(now.toISOString(), "failed", input.message, input.runId);
  db.prepare("UPDATE prediction_requests SET status = ? WHERE id = ?").run("failed", input.requestId);
}

export async function executeManualPredictionRequest(input: ExecutePredictionInput): Promise<Pick<PredictionRequestResponseDto, "status" | "message" | "predictionsCount" | "logs" | "predictions">> {
  const startedAt = input.now ?? new Date();
  const logWriter = createLogWriter(input.db, { runId: input.runId, matchId: input.match.id, startedAt });
  let predictionsCount = 0;
  let failedModelCount = 0;
  const predictions: PredictionRunPredictionDto[] = [];

  input.db
    .prepare("UPDATE prediction_runs SET started_at = ?, status = ? WHERE id = ?")
    .run(startedAt.toISOString(), "running", input.runId);
  logWriter.write("info", "预测请求已创建");

  const models = listEnabledModels(input.db);
  if (models.length === 0) {
    logWriter.write("error", "没有可用的大模型配置");
    const finishedAt = addMilliseconds(startedAt, logWriter.logs.length).toISOString();
    input.db.prepare("UPDATE prediction_runs SET finished_at = ?, status = ? WHERE id = ?").run(finishedAt, "completed", input.runId);
    input.db.prepare("UPDATE prediction_requests SET status = ? WHERE id = ?").run("completed", input.requestId);
    return {
      status: "completed",
      message: "没有可用的大模型配置",
      predictionsCount,
      logs: logWriter.logs,
      predictions
    };
  }

  const promptTemplate = getPromptTemplate(input.db, input.predictionInput.promptTemplateId);
  if (!promptTemplate) {
    logWriter.write("error", "没有可用的提示词模板");
    const finishedAt = addMilliseconds(startedAt, logWriter.logs.length).toISOString();
    input.db.prepare("UPDATE prediction_runs SET finished_at = ?, status = ?, failure_reason = ? WHERE id = ?").run(finishedAt, "failed", "没有可用的提示词模板", input.runId);
    input.db.prepare("UPDATE prediction_requests SET status = ? WHERE id = ?").run("failed", input.requestId);
    return {
      status: "failed",
      message: "没有可用的提示词模板",
      predictionsCount,
      logs: logWriter.logs,
      predictions
    };
  }

  const matchAnalysisPrompt = buildMatchAnalysisPrompt({
    match: input.match,
    taskTypes: input.predictionInput.taskTypes,
    dataOptions: input.predictionInput.dataOptions,
    outputStyle: input.predictionInput.outputStyle,
    customPrompt: input.predictionInput.customPrompt,
    context: input.context,
    promptTemplate,
    enrichment: input.enrichment
  });

  for (const model of models) {
    const logModel = { id: model.model_id, displayName: model.model_display_name };
    logWriter.write("info", `开始调用模型：${model.model_display_name}`, logModel);
    try {
      const matchAnalysisResult = await runOpenAiCompatiblePrediction(
        {
          baseUrl: model.base_url,
          apiKey: model.api_key,
          modelName: model.model_name,
          contextWindowTokens: model.context_window_tokens,
          maxOutputTokens: model.max_output_tokens,
          requestTimeoutMs: model.request_timeout_ms,
          requestRetryCount: model.request_retry_count
        },
        matchAnalysisPrompt
      );
      const matchAnalysis = parseMatchAnalysisOutput(matchAnalysisResult.content);
      insertAgentOutput(input.db, {
        runId: input.runId,
        matchId: input.match.id,
        modelId: model.model_id,
        agentRole: "match_analysis",
        output: matchAnalysis,
        rawResponse: matchAnalysisResult.rawResponse,
        now: addMilliseconds(startedAt, logWriter.logs.length)
      });
      const parsedPrediction: ParsedModelPrediction = {
        ...matchAnalysis,
        oddsInterpretation: "体彩指数仅作为投注选项背景，未作为赛果权重。"
      };
      insertParsedPrediction(input.db, {
        runId: input.runId,
        matchId: input.match.id,
        modelId: model.model_id,
        promptTemplate,
        prediction: parsedPrediction,
        rawResponse: matchAnalysisResult.rawResponse,
        now: addMilliseconds(startedAt, logWriter.logs.length)
      });
      let singleCombination: SingleCombinationAgentOutputDto | null = null;
      const shouldRunSingleCombination = input.predictionInput.taskTypes.includes("single_bet_combo");
      let singleCombinationFailed = false;
      if (shouldRunSingleCombination) {
        logWriter.write("info", `开始生成投注组合：${model.model_display_name}`, logModel);
        try {
          const singleCombinationResult = await runOpenAiCompatiblePrediction(
            {
              baseUrl: model.base_url,
              apiKey: model.api_key,
              modelName: model.model_name,
              contextWindowTokens: model.context_window_tokens,
              maxOutputTokens: model.max_output_tokens,
              requestTimeoutMs: model.request_timeout_ms,
              requestRetryCount: model.request_retry_count
            },
            buildSingleCombinationPrompt({
              match: input.match,
              taskTypes: input.predictionInput.taskTypes,
              dataOptions: input.predictionInput.dataOptions,
              outputStyle: input.predictionInput.outputStyle,
              customPrompt: input.predictionInput.customPrompt,
              context: input.context,
              matchAnalysis,
              enrichment: input.enrichment
            })
          );
          singleCombination = parseSingleCombinationOutput(singleCombinationResult.content);
          insertAgentOutput(input.db, {
            runId: input.runId,
            matchId: input.match.id,
            modelId: model.model_id,
            agentRole: "single_combo",
            output: singleCombination,
            rawResponse: singleCombinationResult.rawResponse,
            now: addMilliseconds(startedAt, logWriter.logs.length)
          });
          logWriter.write("info", `投注组合生成完成：${model.model_display_name}`, logModel);
        } catch (error) {
          singleCombinationFailed = true;
          const message = error instanceof Error ? error.message : "AI prediction failed";
          logWriter.write("error", `投注组合生成失败：${model.model_display_name}：${message}`, logModel);
        }
      }
      predictionsCount += 1;
      predictions.push({
        id: `${input.runId}-${model.model_id}`,
        modelDisplayName: model.model_display_name,
        predictedResult: parsedPrediction.predictedResult,
        predictedHomeScore: parsedPrediction.predictedHomeScore,
        predictedAwayScore: parsedPrediction.predictedAwayScore,
        confidence: parsedPrediction.confidence,
        shortReason: parsedPrediction.shortReason,
        keyFactors: parsedPrediction.keyFactors,
        oddsInterpretation: parsedPrediction.oddsInterpretation,
        riskPoints: parsedPrediction.riskPoints,
        analysisReport: parsedPrediction.analysisReport,
        matchAnalysis,
        singleCombination,
        sportteryOddsPools: []
      });
      logWriter.write(
        "info",
        shouldRunSingleCombination && singleCombinationFailed
          ? `赛果预测完成，投注组合失败：${model.model_display_name}`
          : `模型预测完成：${model.model_display_name}`,
        logModel
      );
    } catch (error) {
      failedModelCount += 1;
      const message = error instanceof Error ? error.message : "AI prediction failed";
      logWriter.write("error", `模型预测失败：${model.model_display_name}：${message}`, logModel);
    }
  }

  const status = predictionsCount > 0 ? "completed" : "failed";
  const message = predictionsCount > 0 ? `已完成 ${predictionsCount} 个模型预测` : "所有模型预测失败";
  const finishedAt = addMilliseconds(startedAt, logWriter.logs.length).toISOString();
  input.db
    .prepare("UPDATE prediction_runs SET finished_at = ?, status = ?, failure_reason = ? WHERE id = ?")
    .run(finishedAt, status, failedModelCount === models.length ? message : null, input.runId);
  input.db.prepare("UPDATE prediction_requests SET status = ? WHERE id = ?").run(status, input.requestId);

  return {
    status,
    message,
    predictionsCount,
    logs: logWriter.logs,
    predictions
  };
}

export function createParlayCombinationRun(db: Database, input: {
  matchIds: string[];
  riskLevel: BettingRiskLevel;
  stakeUnits: number;
  now?: Date;
}): ParlayCombinationRunDto {
  const now = input.now ?? new Date();
  const plans = input.matchIds.map((matchId) => {
    const row = db
      .prepare(
        `
          SELECT output_json
          FROM prediction_agent_outputs
          WHERE match_id = ?
            AND agent_role = 'single_combo'
            AND parse_status = 'parsed'
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .get(matchId) as { output_json: string } | undefined;
    if (!row) {
      throw new Error(`No single combo output for match ${matchId}`);
    }
    const parsed = JSON.parse(row.output_json) as { primaryPlan: BettingPlanDto };
    return parsed.primaryPlan;
  });
  const run: ParlayCombinationRunDto = {
    id: randomUUID(),
    matchIds: input.matchIds,
    riskLevel: input.riskLevel,
    stakeUnits: input.stakeUnits,
    summary: `${plans.length} 场组合：${plans.map((plan) => plan.planName).join(" + ")}`,
    plans,
    riskWarnings: ["串关会放大单场不确定性，请降低单注预算。"],
    createdAt: now.toISOString()
  };
  db.prepare(
    `
      INSERT INTO parlay_combination_runs (
        id,
        match_ids_json,
        risk_level,
        stake_units,
        output_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(run.id, JSON.stringify(input.matchIds), input.riskLevel, input.stakeUnits, JSON.stringify(run), run.createdAt);
  return run;
}
