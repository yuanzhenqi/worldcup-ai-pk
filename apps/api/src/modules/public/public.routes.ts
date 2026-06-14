import type { FastifyInstance } from "fastify";
import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MatchStatus, PredictionDataOptionsDto, PredictionRequestInputDto, PredictionRequestResponseDto } from "@worldcup-ai-pk/shared";
import { getFixtureContextSummary, refreshFixtureContext } from "../context/fixtureContext.service";
import { FootballService } from "../football/football.service";
import { listPublicLeaderboard } from "../leaderboard/leaderboard.repository";
import { listMatches } from "../matches/match.repository";
import { executeManualPredictionRequest, getPredictionRunStatus, listPredictionRunHistory, markPredictionRunFailed } from "../predictions/predictionExecutor.service";
import { planPredictionRequest } from "../predictions/prediction.service";
import { DongqiudiClient } from "../football/dongqiudiClient";
import { getDongqiudiMappingByFixtureId } from "../football/dongqiudiMapping.repository";
import { getApiFootballKey, isDongqiudiEnabled } from "../settings/settings.repository";

export interface PublicRoutesOptions {
  db: Database;
}

const predictionDataOptionsSchema = z.object({
  useOdds: z.boolean(),
  useApiFootballPrediction: z.boolean(),
  useHeadToHead: z.boolean(),
  usePlayerLineupInjuries: z.boolean(),
  useDongqiudiIntel: z.boolean()
});

const contextRefreshSchema = z.object({
  dataOptions: predictionDataOptionsSchema
});

const predictionRequestSchema = z.object({
  taskTypes: z.array(z.enum(["result_1x2", "scoreline", "odds_interpretation", "player_lineup_impact", "head_to_head", "upset_risk"])).min(1),
  dataOptions: predictionDataOptionsSchema,
  promptTemplateId: z.string().min(1).nullable(),
  customPrompt: z.string(),
  outputStyle: z.enum(["concise", "detailed"]),
  refreshContext: z.boolean()
});

const defaultPredictionRequestInput: PredictionRequestInputDto = {
  taskTypes: ["result_1x2", "scoreline"],
  dataOptions: {
    useOdds: false,
    useApiFootballPrediction: false,
    useHeadToHead: true,
    usePlayerLineupInjuries: true,
    useDongqiudiIntel: true
  },
  promptTemplateId: null,
  customPrompt: "",
  outputStyle: "concise",
  refreshContext: true
};

function parsePredictionRequestBody(body: unknown): PredictionRequestInputDto {
  const parsed = predictionRequestSchema.safeParse(body);
  return parsed.success ? parsed.data : defaultPredictionRequestInput;
}

export async function registerPublicRoutes(app: FastifyInstance, options: PublicRoutesOptions): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "worldcup-ai-pk-api"
  }));

  app.get("/matches", async () => ({
    matches: listMatches(options.db)
  }));

  app.get("/leaderboard", async () => listPublicLeaderboard(options.db));

  app.get<{ Params: { runId: string } }>("/prediction-runs/:runId", async (request, reply) => {
    const status = getPredictionRunStatus(options.db, request.params.runId);
    if (!status) {
      return reply.code(404).send({ error: "Prediction run not found" });
    }
    reply.header("cache-control", "no-store");
    return status;
  });

  app.get<{ Params: { matchId: string } }>("/matches/:matchId/prediction-runs", async (request, reply) => {
    const match = options.db.prepare("SELECT id FROM matches WHERE id = ?").get(request.params.matchId) as { id: string } | undefined;

    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }

    reply.header("cache-control", "no-store");
    return listPredictionRunHistory(options.db, match.id);
  });

  app.get<{ Params: { matchId: string } }>("/matches/:matchId/context", async (request, reply) => {
    const match = options.db.prepare("SELECT id FROM matches WHERE id = ?").get(request.params.matchId) as { id: string } | undefined;

    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }

    return getFixtureContextSummary(options.db, match.id);
  });

  app.post<{ Params: { matchId: string } }>("/matches/:matchId/context/refresh", async (request, reply) => {
    const parsed = contextRefreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid context refresh payload" });
    }

    const match = options.db
      .prepare("SELECT id, api_football_fixture_id, home_team_id, away_team_id FROM matches WHERE id = ?")
      .get(request.params.matchId) as { id: string; api_football_fixture_id: number; home_team_id: string; away_team_id: string } | undefined;

    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }

    const apiKey = getApiFootballKey(options.db);
    const footballService = apiKey ? new FootballService({ apiKey }) : null;

    return refreshFixtureContext({
      db: options.db,
      matchId: match.id,
      apiFootballFixtureId: match.api_football_fixture_id,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
      footballService,
      dongqiudiClient: isDongqiudiEnabled(options.db) ? new DongqiudiClient() : null,
      dongqiudiMatchId: getDongqiudiMappingByFixtureId(options.db, match.api_football_fixture_id)?.dongqiudiMatchId ?? null,
      dataOptions: parsed.data.dataOptions as PredictionDataOptionsDto
    });
  });

  app.post<{ Params: { matchId: string } }>("/matches/:matchId/prediction-request", async (request, reply) => {
    const match = options.db
      .prepare(
        `
          SELECT
            id,
            api_football_fixture_id,
            stage,
            kickoff_at,
            status,
            venue,
            home_team_id,
            away_team_id,
            home_team_name,
            away_team_name
          FROM matches
          WHERE id = ?
        `
      )
      .get(request.params.matchId) as
      | {
          id: string;
          api_football_fixture_id: number;
          stage: string;
          kickoff_at: string;
          status: MatchStatus;
          venue: string | null;
          home_team_id: string;
          away_team_id: string;
          home_team_name: string;
          away_team_name: string;
        }
      | undefined;

    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }

    const predictionInput = parsePredictionRequestBody(request.body);
    let context = getFixtureContextSummary(options.db, match.id);

    if (predictionInput.refreshContext) {
      const apiKey = getApiFootballKey(options.db);
      const footballService = apiKey ? new FootballService({ apiKey }) : null;
      context = await refreshFixtureContext({
        db: options.db,
        matchId: match.id,
        apiFootballFixtureId: match.api_football_fixture_id,
        homeTeamId: match.home_team_id,
        awayTeamId: match.away_team_id,
        footballService,
        dongqiudiClient: isDongqiudiEnabled(options.db) ? new DongqiudiClient() : null,
        dongqiudiMatchId: getDongqiudiMappingByFixtureId(options.db, match.api_football_fixture_id)?.dongqiudiMatchId ?? null,
        dataOptions: predictionInput.dataOptions
      });
    }

    const latestSuccessfulRun = options.db
      .prepare(
        `
          SELECT finished_at
          FROM prediction_runs
          WHERE match_id = ?
            AND finished_at IS NOT NULL
            AND failure_reason IS NULL
          ORDER BY finished_at DESC
          LIMIT 1
        `
      )
      .get(match.id) as { finished_at: string } | undefined;

    const now = new Date();
    const plan = planPredictionRequest({
      now,
      kickoffAt: new Date(match.kickoff_at),
      matchStatus: match.status,
      latestSuccessfulRunAt: latestSuccessfulRun ? new Date(latestSuccessfulRun.finished_at) : null
    });
    const requestedAt = now.toISOString();
    const scheduledFor = plan.status === "scheduled" ? null : plan.scheduledFor?.toISOString() ?? null;
    const latestContextSnapshot = options.db
      .prepare("SELECT id FROM fixture_context_snapshots WHERE match_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(match.id) as { id: string } | undefined;
    const requestId = randomUUID();
    const runId = randomUUID();

    if (plan.status === "rejected" || plan.status === "rate_limited") {
      options.db
        .prepare(
          `
            INSERT INTO prediction_requests (
              id,
              match_id,
              requested_at,
              status,
              next_executable_at,
              context_snapshot_id,
              task_types_json,
              data_options_json,
              prompt_template_id,
              custom_prompt,
              output_style
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          requestId,
          match.id,
          requestedAt,
          plan.status,
          scheduledFor,
          latestContextSnapshot?.id ?? null,
          JSON.stringify(predictionInput.taskTypes),
          JSON.stringify(predictionInput.dataOptions),
          predictionInput.promptTemplateId,
          predictionInput.customPrompt,
          predictionInput.outputStyle
        );

      const response: PredictionRequestResponseDto = {
        matchId: match.id,
        status: plan.status,
        message: plan.message,
        scheduledFor,
        context,
        runId: null,
        predictionsCount: 0,
        logs: [],
        predictions: []
      };

      return response;
    }

    options.db
      .transaction(() => {
        options.db
          .prepare(
            `
              INSERT INTO prediction_requests (
                id,
                match_id,
                requested_at,
                status,
                next_executable_at,
                context_snapshot_id,
                task_types_json,
                data_options_json,
                prompt_template_id,
                custom_prompt,
                output_style
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
            requestId,
            match.id,
            requestedAt,
            "running",
            scheduledFor,
            latestContextSnapshot?.id ?? null,
            JSON.stringify(predictionInput.taskTypes),
            JSON.stringify(predictionInput.dataOptions),
            predictionInput.promptTemplateId,
            predictionInput.customPrompt,
            predictionInput.outputStyle
          );

        options.db
          .prepare(
            `
              INSERT INTO prediction_runs (
                id,
                match_id,
                scheduled_at,
                started_at,
                finished_at,
                status,
                failure_reason
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(runId, match.id, requestedAt, null, null, "running", null);
      })();

    const executionPromise = executeManualPredictionRequest({
      db: options.db,
      match,
      requestId,
      runId,
      predictionInput,
      context,
      now
    });
    void executionPromise.catch((error) => {
      const message = error instanceof Error ? error.message : "Prediction run failed";
      markPredictionRunFailed(options.db, { requestId, runId, matchId: match.id, message });
    });
    const runStatus = getPredictionRunStatus(options.db, runId);

    const response: PredictionRequestResponseDto = {
      matchId: match.id,
      status: runStatus?.status ?? "running",
      message: runStatus?.message ?? "模型预测进行中",
      scheduledFor,
      context,
      runId,
      predictionsCount: runStatus?.predictionsCount ?? 0,
      logs: runStatus?.logs ?? [],
      predictions: runStatus?.predictions ?? []
    };

    return response;
  });
}
