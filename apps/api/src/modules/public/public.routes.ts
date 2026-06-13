import type { FastifyInstance } from "fastify";
import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MatchStatus, PredictionDataOptionsDto, PredictionRequestInputDto, PredictionRequestResponseDto } from "@worldcup-ai-pk/shared";
import { getFixtureContextSummary, refreshFixtureContext } from "../context/fixtureContext.service";
import { FootballService } from "../football/football.service";
import { listMatches } from "../matches/match.repository";
import { planPredictionRequest } from "../predictions/prediction.service";
import { getApiFootballKey } from "../settings/settings.repository";

export interface PublicRoutesOptions {
  db: Database;
}

const predictionDataOptionsSchema = z.object({
  useOdds: z.boolean(),
  useApiFootballPrediction: z.boolean(),
  useHeadToHead: z.boolean(),
  usePlayerLineupInjuries: z.boolean()
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
  taskTypes: ["result_1x2", "scoreline", "odds_interpretation"],
  dataOptions: {
    useOdds: true,
    useApiFootballPrediction: true,
    useHeadToHead: true,
    usePlayerLineupInjuries: true
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
      .prepare("SELECT id, api_football_fixture_id FROM matches WHERE id = ?")
      .get(request.params.matchId) as { id: string; api_football_fixture_id: number } | undefined;

    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }

    const apiKey = getApiFootballKey(options.db);
    const footballService = apiKey ? new FootballService({ apiKey }) : null;

    return refreshFixtureContext({
      db: options.db,
      matchId: match.id,
      apiFootballFixtureId: match.api_football_fixture_id,
      footballService,
      dataOptions: parsed.data.dataOptions as PredictionDataOptionsDto
    });
  });

  app.post<{ Params: { matchId: string } }>("/matches/:matchId/prediction-request", async (request, reply) => {
    const match = options.db
      .prepare("SELECT id, api_football_fixture_id, kickoff_at, status FROM matches WHERE id = ?")
      .get(request.params.matchId) as { id: string; api_football_fixture_id: number; kickoff_at: string; status: MatchStatus } | undefined;

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
        footballService,
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
    const scheduledFor = plan.scheduledFor?.toISOString() ?? null;
    const latestContextSnapshot = options.db
      .prepare("SELECT id FROM fixture_context_snapshots WHERE match_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(match.id) as { id: string } | undefined;

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
            randomUUID(),
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

        if (plan.status === "scheduled" || plan.status === "running") {
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
            .run(randomUUID(), match.id, scheduledFor ?? requestedAt, null, null, plan.status, null);
        }
      })();

    const response: PredictionRequestResponseDto = {
      matchId: match.id,
      status: plan.status,
      message: plan.message,
      scheduledFor,
      context
    };

    return response;
  });
}
