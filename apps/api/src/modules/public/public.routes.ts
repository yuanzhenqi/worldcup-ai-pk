import type { FastifyInstance } from "fastify";
import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { MatchStatus, PredictionRequestResponseDto } from "@worldcup-ai-pk/shared";
import { listMatches } from "../matches/match.repository";
import { planPredictionRequest } from "../predictions/prediction.service";

export interface PublicRoutesOptions {
  db: Database;
}

export async function registerPublicRoutes(app: FastifyInstance, options: PublicRoutesOptions): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "worldcup-ai-pk-api"
  }));

  app.get("/matches", async () => ({
    matches: listMatches(options.db)
  }));

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
