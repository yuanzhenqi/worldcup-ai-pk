import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type {
  FixtureContextSummaryDto,
  PredictionRequestInputDto,
  PredictionRequestResponseDto,
  PredictionResult,
  PredictionRunHistoryDto,
  PredictionRunLogDto,
  PredictionRunPredictionDto,
  PredictionRunStatusDto
} from "@worldcup-ai-pk/shared";
import { runOpenAiCompatiblePrediction } from "../ai/openAiCompatibleClient";

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
}

interface PromptTemplateRow {
  id: string;
  name: string;
  full_prompt: string;
  prompt_summary: string;
}

interface ParsedModelPrediction {
  predictedResult: PredictionResult;
  predictedHomeScore: number;
  predictedAwayScore: number;
  confidence: number;
  shortReason: string;
  analysisReport: string;
  keyFactors: string[];
  oddsInterpretation: string;
  riskPoints: string[];
}

interface ExecutePredictionInput {
  db: Database;
  match: PredictionMatchRow;
  requestId: string;
  runId: string;
  predictionInput: PredictionRequestInputDto;
  context: FixtureContextSummaryDto | null;
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

function listEnabledModels(db: Database): EnabledModelRow[] {
  return db
    .prepare(
      `
        SELECT
          ai_models.id AS model_id,
          ai_models.model_name,
          ai_models.display_name AS model_display_name,
          ai_providers.display_name AS provider_display_name,
          ai_providers.base_url,
          ai_providers.api_key
        FROM ai_models
        INNER JOIN ai_providers ON ai_providers.id = ai_models.provider_id
        WHERE ai_models.enabled = 1
          AND ai_providers.enabled = 1
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

function replacePromptVariables(template: string, match: PredictionMatchRow): string {
  return template
    .replaceAll("{{homeTeam}}", match.home_team_name)
    .replaceAll("{{awayTeam}}", match.away_team_name)
    .replaceAll("{{kickoffAt}}", match.kickoff_at)
    .replaceAll("{{stage}}", match.stage)
    .replaceAll("{{venue}}", match.venue ?? "场馆待同步");
}

function buildPredictionPrompt(input: {
  match: PredictionMatchRow;
  predictionInput: PredictionRequestInputDto;
  context: FixtureContextSummaryDto | null;
  promptTemplate: PromptTemplateRow;
}): string {
  const predictionContext = {
    match: {
      id: input.match.id,
      apiFootballFixtureId: input.match.api_football_fixture_id,
      stage: input.match.stage,
      kickoffAt: input.match.kickoff_at,
      venue: input.match.venue,
      homeTeam: input.match.home_team_name,
      awayTeam: input.match.away_team_name
    },
    taskTypes: input.predictionInput.taskTypes,
    dataOptions: input.predictionInput.dataOptions,
    outputStyle: input.predictionInput.outputStyle,
    customPrompt: input.predictionInput.customPrompt,
    context: input.context
  };
  const outputContract = {
    predicted_result: "home | draw | away",
    predicted_home_score: "integer",
    predicted_away_score: "integer",
    confidence: "number between 0 and 1",
    short_reason: "Chinese text",
    analysis_report: "Detailed Chinese analysis report",
    key_factors: ["Chinese text"],
    odds_interpretation: "Chinese text",
    risk_points: ["Chinese text"]
  };

  return [
    replacePromptVariables(input.promptTemplate.full_prompt, input.match),
    "",
    "prediction_context:",
    JSON.stringify(predictionContext, null, 2),
    "",
    "Return JSON only. Required JSON shape:",
    JSON.stringify(outputContract, null, 2)
  ].join("\n");
}

function parseJsonObject(content: string): unknown {
  const fencedMatch = /```json\s*([\s\S]*?)\s*```/.exec(content);
  const jsonText = fencedMatch?.[1] ?? content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
  return JSON.parse(jsonText);
}

function isPredictionResult(value: unknown): value is PredictionResult {
  return value === "home" || value === "draw" || value === "away";
}

function getStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`AI response field ${fieldName} must be a string array`);
  }
  return value;
}

function getInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`AI response field ${fieldName} must be an integer`);
  }
  return value;
}

function parseModelPrediction(content: string): ParsedModelPrediction {
  const value = parseJsonObject(content);
  if (!value || typeof value !== "object") {
    throw new Error("AI response JSON must be an object");
  }

  const record = value as Record<string, unknown>;
  if (!isPredictionResult(record.predicted_result)) {
    throw new Error("AI response field predicted_result is invalid");
  }
  if (typeof record.confidence !== "number") {
    throw new Error("AI response field confidence must be a number");
  }
  if (typeof record.short_reason !== "string") {
    throw new Error("AI response field short_reason must be a string");
  }
  if (typeof record.odds_interpretation !== "string") {
    throw new Error("AI response field odds_interpretation must be a string");
  }

  return {
    predictedResult: record.predicted_result,
    predictedHomeScore: getInteger(record.predicted_home_score, "predicted_home_score"),
    predictedAwayScore: getInteger(record.predicted_away_score, "predicted_away_score"),
    confidence: record.confidence,
    shortReason: record.short_reason,
    analysisReport: typeof record.analysis_report === "string" && record.analysis_report.trim() ? record.analysis_report : record.short_reason,
    keyFactors: getStringArray(record.key_factors, "key_factors"),
    oddsInterpretation: record.odds_interpretation,
    riskPoints: getStringArray(record.risk_points, "risk_points")
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
      analysisReport: prediction.analysis_report
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

  const prompt = buildPredictionPrompt({
    match: input.match,
    predictionInput: input.predictionInput,
    context: input.context,
    promptTemplate
  });

  for (const model of models) {
    const logModel = { id: model.model_id, displayName: model.model_display_name };
    logWriter.write("info", `开始调用模型：${model.model_display_name}`, logModel);
    try {
      const result = await runOpenAiCompatiblePrediction(
        {
          baseUrl: model.base_url,
          apiKey: model.api_key,
          modelName: model.model_name
        },
        prompt
      );
      const parsedPrediction = parseModelPrediction(result.content);
      insertParsedPrediction(input.db, {
        runId: input.runId,
        matchId: input.match.id,
        modelId: model.model_id,
        promptTemplate,
        prediction: parsedPrediction,
        rawResponse: result.rawResponse,
        now: addMilliseconds(startedAt, logWriter.logs.length)
      });
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
        analysisReport: parsedPrediction.analysisReport
      });
      logWriter.write("info", `模型预测完成：${model.model_display_name}`, logModel);
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
