import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database } from "better-sqlite3";
import { z } from "zod";
import {
  createAiModel,
  createAiProvider,
  createPromptTemplate,
  deleteAiModel,
  deleteAiProvider,
  deletePromptTemplate,
  getAdminSummary,
  listAiModels,
  listAiProviders,
  listPromptTemplates,
  updateAiModel,
  updateAiProvider,
  updatePromptTemplate
} from "./adminConfig.repository";
import { refreshFixtureContext } from "../context/fixtureContext.service";
import { importApiFootballFixturesResponse } from "../football/fixtureImport.service";
import { FootballService } from "../football/football.service";
import { writeSystemLog } from "../logs/log.service";
import { getApiFootballKey, hasApiFootballKey, saveApiFootballKey } from "../settings/settings.repository";
import { listTeamDisplayNames, updateTeamDisplayName } from "../teams/teamDisplayName.repository";

export interface AdminRoutesOptions {
  db: Database;
}

const apiFootballSettingsSchema = z.object({
  apiKey: z.string().min(1)
});

const aiProviderSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  enabled: z.boolean()
});

const aiModelSchema = z.object({
  providerId: z.string().min(1),
  modelName: z.string().min(1),
  displayName: z.string().min(1),
  enabled: z.boolean()
});

const promptTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  fullPrompt: z.string().min(1),
  promptSummary: z.string().min(1),
  scope: z.string().min(1),
  enabled: z.boolean(),
  isDefault: z.boolean()
});

const teamDisplayNameUpdateSchema = z.object({
  displayNameZh: z.string().min(1)
});

function getApiFootballErrors(response: unknown): unknown | null {
  if (!response || typeof response !== "object" || !("errors" in response)) {
    return null;
  }

  const errors = (response as { errors: unknown }).errors;
  if (!errors || typeof errors !== "object") {
    return null;
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

function isLocalRequest(request: FastifyRequest): boolean {
  const ip = request.ip;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function getIdParam(request: FastifyRequest, key: string): string {
  const params = request.params as Record<string, string>;
  return params[key];
}

function getSearchQuery(request: FastifyRequest): string {
  const query = request.query as { q?: unknown };
  return typeof query?.q === "string" ? query.q : "";
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

  app.get("/summary", async () => getAdminSummary(options.db));

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

  app.get("/ai-providers", async () => ({
    providers: listAiProviders(options.db)
  }));

  app.post("/ai-providers", async (request, reply) => {
    const parsed = aiProviderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid AI provider payload" });
    }

    return createAiProvider(options.db, parsed.data);
  });

  app.put("/ai-providers/:id", async (request, reply) => {
    const parsed = aiProviderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid AI provider payload" });
    }

    return updateAiProvider(options.db, getIdParam(request, "id"), parsed.data);
  });

  app.delete("/ai-providers/:id", async (request) => {
    deleteAiProvider(options.db, getIdParam(request, "id"));
    return { deleted: true };
  });

  app.get("/ai-models", async () => ({
    models: listAiModels(options.db)
  }));

  app.post("/ai-models", async (request, reply) => {
    const parsed = aiModelSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid AI model payload" });
    }

    return createAiModel(options.db, parsed.data);
  });

  app.put("/ai-models/:id", async (request, reply) => {
    const parsed = aiModelSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid AI model payload" });
    }

    return updateAiModel(options.db, getIdParam(request, "id"), parsed.data);
  });

  app.delete("/ai-models/:id", async (request) => {
    deleteAiModel(options.db, getIdParam(request, "id"));
    return { deleted: true };
  });

  app.get("/prompt-templates", async () => ({
    promptTemplates: listPromptTemplates(options.db)
  }));

  app.post("/prompt-templates", async (request, reply) => {
    const parsed = promptTemplateSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid prompt template payload" });
    }

    return createPromptTemplate(options.db, parsed.data);
  });

  app.put("/prompt-templates/:id", async (request, reply) => {
    const parsed = promptTemplateSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid prompt template payload" });
    }

    return updatePromptTemplate(options.db, getIdParam(request, "id"), parsed.data);
  });

  app.delete("/prompt-templates/:id", async (request) => {
    deletePromptTemplate(options.db, getIdParam(request, "id"));
    return { deleted: true };
  });

  app.get("/team-display-names", async (request) => ({
    teams: listTeamDisplayNames(options.db, getSearchQuery(request))
  }));

  app.put("/team-display-names/:apiFootballTeamId", async (request, reply) => {
    const parsed = teamDisplayNameUpdateSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid team display name payload" });
    }

    return updateTeamDisplayName(options.db, getIdParam(request, "apiFootballTeamId"), parsed.data.displayNameZh);
  });

  app.post("/sync/api-football/fixtures", async (request, reply) => {
    const apiKey = getApiFootballKey(options.db);

    if (!apiKey) {
      return reply.code(400).send({ error: "API-Football key is not configured" });
    }

    const footballService = new FootballService({ apiKey });
    const fixturesResponse = await footballService.getWorldCupFixtures();
    const errors = getApiFootballErrors(fixturesResponse);

    if (errors) {
      writeSystemLog(options.db, {
        level: "error",
        source: "api-football",
        message: "API-Football fixtures sync failed",
        details: { errors }
      });
      return reply.code(502).send({ synced: false, error: "API-Football returned errors", errors });
    }

    const importResult = importApiFootballFixturesResponse(options.db, fixturesResponse);

    writeSystemLog(options.db, {
      level: "info",
      source: "api-football",
      message: "API-Football fixtures synced",
      details: importResult
    });

    return { synced: true, imported: importResult.imported };
  });

  app.post("/sync/api-football/fixtures/raw", async (request, reply) => {
    const apiKey = getApiFootballKey(options.db);

    if (!apiKey) {
      return reply.code(400).send({ error: "API-Football key is not configured" });
    }

    const footballService = new FootballService({ apiKey });
    const fixturesResponse = await footballService.getWorldCupFixtures();
    const errors = getApiFootballErrors(fixturesResponse);

    writeSystemLog(options.db, {
      level: "info",
      source: "api-football",
      message: "Captured raw World Cup fixtures response",
      details: fixturesResponse
    });

    if (errors) {
      return reply.code(502).send({
        captured: false,
        error: "API-Football returned errors",
        errors
      });
    }

    const importResult = importApiFootballFixturesResponse(options.db, fixturesResponse);

    return { captured: true, imported: importResult.imported };
  });

  app.post("/sync/api-football/matches/:matchId/context", async (request, reply) => {
    const apiKey = getApiFootballKey(options.db);

    if (!apiKey) {
      return reply.code(400).send({ error: "API-Football key is not configured" });
    }

    const match = options.db
      .prepare("SELECT id, api_football_fixture_id FROM matches WHERE id = ?")
      .get(getIdParam(request, "matchId")) as { id: string; api_football_fixture_id: number } | undefined;

    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }

    return refreshFixtureContext({
      db: options.db,
      matchId: match.id,
      apiFootballFixtureId: match.api_football_fixture_id,
      footballService: new FootballService({ apiKey }),
      dataOptions: {
        useOdds: true,
        useApiFootballPrediction: true,
        useHeadToHead: true,
        usePlayerLineupInjuries: true
      }
    });
  });
}
