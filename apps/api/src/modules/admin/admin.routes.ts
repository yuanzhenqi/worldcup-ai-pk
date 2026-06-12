import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database } from "better-sqlite3";
import { z } from "zod";
import { FootballService } from "../football/football.service";
import { writeSystemLog } from "../logs/log.service";
import { getApiFootballKey, hasApiFootballKey, saveApiFootballKey } from "../settings/settings.repository";

export interface AdminRoutesOptions {
  db: Database;
}

const apiFootballSettingsSchema = z.object({
  apiKey: z.string().min(1)
});

function isLocalRequest(request: FastifyRequest): boolean {
  const ip = request.ip;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export async function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    if (!isLocalRequest(request)) {
      return reply.code(403).send({ error: "Admin API is local-only" });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "worldcup-ai-pk-admin"
  }));

  app.get("/settings/api-football", async () => ({
    configured: hasApiFootballKey(options.db)
  }));

  app.put("/settings/api-football", async (request, reply) => {
    const parsed = apiFootballSettingsSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid API-Football settings payload" });
    }

    saveApiFootballKey(options.db, parsed.data.apiKey);
    return { configured: true };
  });

  app.post("/sync/api-football/fixtures/raw", async (request, reply) => {
    const apiKey = getApiFootballKey(options.db);

    if (!apiKey) {
      return reply.code(400).send({ error: "API-Football key is not configured" });
    }

    const footballService = new FootballService({ apiKey });
    const fixturesResponse = await footballService.getWorldCupFixtures();

    writeSystemLog(options.db, {
      level: "info",
      source: "api-football",
      message: "Captured raw World Cup fixtures response",
      details: fixturesResponse
    });

    return { captured: true };
  });
}
