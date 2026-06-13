import type { FastifyInstance } from "fastify";
import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MatchStatus, PredictionDataOptionsDto, PredictionRequestResponseDto } from "@worldcup-ai-pk/shared";
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
      .prepare("SELECT id, kickoff_at, status FROM matches WHERE id = ?")
      .get(request.params.matchId) as { id: string; kickoff_at: string; status: MatchStatus } | undefined;

    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
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
                next_executable_at
              ) VALUES (?, ?, ?, ?, ?)
            `
          )
          .run(randomUUID(), match.id, requestedAt, plan.status, scheduledFor);

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
      context: null
    };

    return response;
  });
}
