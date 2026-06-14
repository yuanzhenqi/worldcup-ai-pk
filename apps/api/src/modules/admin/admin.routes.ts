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
  getAiModelConnectionConfig,
  listAiModels,
  listAiProviders,
  listContextCacheLogs,
  listPromptTemplates,
  updateAiModel,
  updateAiProvider,
  updatePromptTemplate
} from "./adminConfig.repository";
import { testOpenAiCompatibleModel } from "../ai/openAiCompatibleClient";
import { refreshFixtureContext } from "../context/fixtureContext.service";
import { importApiFootballFixturesResponse } from "../football/fixtureImport.service";
import { FootballService } from "../football/football.service";
import { writeSystemLog } from "../logs/log.service";
import { DongqiudiClient } from "../football/dongqiudiClient";
import { deleteDongqiudiMapping, getDongqiudiMappingByFixtureId, listDongqiudiMappings, upsertDongqiudiMapping } from "../football/dongqiudiMapping.repository";
import { SportteryClient } from "../football/sportteryClient";
import {
  deleteSportteryMapping,
  getSportteryMappingByFixtureId,
  listSportteryMappings,
  syncSportteryMappingsForMatches,
  upsertSportteryMapping
} from "../football/sportteryMapping.repository";
import { listMatches } from "../matches/match.repository";
import { getApiFootballKey, hasApiFootballKey, isDongqiudiEnabled, isSportteryEnabled, saveApiFootballKey, saveDongqiudiEnabled, saveSportteryEnabled } from "../settings/settings.repository";
import { listTeamDisplayNames, updateTeamDisplayName } from "../teams/teamDisplayName.repository";
import { worldCupTeamNamesZh } from "../teams/worldCupTeamNames.zh";

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

const dongqiudiSettingsSchema = z.object({
  enabled: z.boolean()
});

const dongqiudiMappingSchema = z.object({
  apiFootballFixtureId: z.number().int(),
  dongqiudiMatchId: z.number().int()
});

const sportterySettingsSchema = z.object({
  enabled: z.boolean()
});

const sportteryMappingSchema = z.object({
  apiFootballFixtureId: z.number().int(),
  sportteryMatchId: z.number().int()
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
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    return true;
  }
  const ipv4 = ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  const parts = ipv4.split(".").map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
  }
  return ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:");
}

function getIdParam(request: FastifyRequest, key: string): string {
  const params = request.params as Record<string, string>;
  return params[key];
}

function getSearchQuery(request: FastifyRequest): string {
  const query = request.query as { q?: unknown };
  return typeof query?.q === "string" ? query.q : "";
}

function resolveDisplayNameZh(input: { teamId: string; originalName: string; displayNameZh: string | null; displayNameSource: string | null }): string {
  return input.displayNameSource === "admin" ? input.displayNameZh ?? input.originalName : worldCupTeamNamesZh[input.teamId] ?? input.displayNameZh ?? input.originalName;
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

  app.get("/context-cache", async () => ({
    logs: listContextCacheLogs(options.db)
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

  app.get("/settings/dongqiudi", async () => ({
    enabled: isDongqiudiEnabled(options.db)
  }));

  app.put("/settings/dongqiudi", async (request, reply) => {
    const parsed = dongqiudiSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid dongqiudi settings payload" });
    }
    saveDongqiudiEnabled(options.db, parsed.data.enabled);
    return { enabled: parsed.data.enabled };
  });

  app.get("/dongqiudi-mappings", async () => ({
    mappings: listDongqiudiMappings(options.db)
  }));

  app.post("/dongqiudi-mappings", async (request, reply) => {
    const parsed = dongqiudiMappingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid dongqiudi mapping payload" });
    }
    return upsertDongqiudiMapping(options.db, parsed.data.apiFootballFixtureId, parsed.data.dongqiudiMatchId);
  });

  app.delete("/dongqiudi-mappings/:apiFootballFixtureId", async (request) => {
    deleteDongqiudiMapping(options.db, Number(getIdParam(request, "apiFootballFixtureId")));
    return { deleted: true };
  });

  app.get("/settings/sporttery", async () => ({
    enabled: isSportteryEnabled(options.db)
  }));

  app.put("/settings/sporttery", async (request, reply) => {
    const parsed = sportterySettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid sporttery settings payload" });
    }
    saveSportteryEnabled(options.db, parsed.data.enabled);
    return { enabled: parsed.data.enabled };
  });

  app.get("/sporttery-mappings", async () => ({
    mappings: listSportteryMappings(options.db)
  }));

  app.post("/sporttery-mappings", async (request, reply) => {
    const parsed = sportteryMappingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid sporttery mapping payload" });
    }
    return upsertSportteryMapping(options.db, parsed.data.apiFootballFixtureId, parsed.data.sportteryMatchId);
  });

  app.post("/sporttery-mappings/sync", async () => {
    const sportteryClient = new SportteryClient();
    const matchList = await sportteryClient.getMatchList();
    const matches = listMatches(options.db);

    return syncSportteryMappingsForMatches(options.db, {
      matches: matches.map((match) => ({
        apiFootballFixtureId: match.apiFootballFixtureId,
        homeTeamName: match.homeTeam.displayNameZh,
        awayTeamName: match.awayTeam.displayNameZh
      })),
      sportteryMatchList: matchList
    });
  });

  app.delete("/sporttery-mappings/:apiFootballFixtureId", async (request) => {
    deleteSportteryMapping(options.db, Number(getIdParam(request, "apiFootballFixtureId")));
    return { deleted: true };
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

  app.post("/ai-models/:id/test", async (request, reply) => {
    try {
      const config = getAiModelConnectionConfig(options.db, getIdParam(request, "id"));
      return testOpenAiCompatibleModel({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        modelName: config.modelName
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI model test failed";
      return reply.code(404).send({ ok: false, status: 404, message, latencyMs: 0 });
    }
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

    const match = options.db
      .prepare(
        `
          SELECT
            matches.id,
            matches.api_football_fixture_id,
            matches.home_team_id,
            matches.home_team_name,
            home_display.display_name_zh AS home_team_display_name_zh,
            home_display.source AS home_team_display_name_source,
            matches.away_team_id,
            matches.away_team_name,
            away_display.display_name_zh AS away_team_display_name_zh,
            away_display.source AS away_team_display_name_source
          FROM matches
          LEFT JOIN team_display_names AS home_display ON home_display.api_football_team_id = matches.home_team_id
          LEFT JOIN team_display_names AS away_display ON away_display.api_football_team_id = matches.away_team_id
          WHERE matches.id = ?
        `
      )
      .get(getIdParam(request, "matchId")) as
      | {
          id: string;
          api_football_fixture_id: number;
          home_team_id: string;
          home_team_name: string;
          home_team_display_name_zh: string | null;
          home_team_display_name_source: string | null;
          away_team_id: string;
          away_team_name: string;
          away_team_display_name_zh: string | null;
          away_team_display_name_source: string | null;
        }
      | undefined;

    if (!match) {
      return reply.code(404).send({ error: "Match not found" });
    }

    return refreshFixtureContext({
      db: options.db,
      matchId: match.id,
      apiFootballFixtureId: match.api_football_fixture_id,
      homeTeamId: match.home_team_id,
      homeTeamName: resolveDisplayNameZh({
        teamId: match.home_team_id,
        originalName: match.home_team_name,
        displayNameZh: match.home_team_display_name_zh,
        displayNameSource: match.home_team_display_name_source
      }),
      awayTeamId: match.away_team_id,
      awayTeamName: resolveDisplayNameZh({
        teamId: match.away_team_id,
        originalName: match.away_team_name,
        displayNameZh: match.away_team_display_name_zh,
        displayNameSource: match.away_team_display_name_source
      }),
      footballService: apiKey ? new FootballService({ apiKey }) : null,
      dongqiudiClient: isDongqiudiEnabled(options.db) ? new DongqiudiClient() : null,
      dongqiudiMatchId: getDongqiudiMappingByFixtureId(options.db, match.api_football_fixture_id)?.dongqiudiMatchId ?? null,
      sportteryClient: isSportteryEnabled(options.db) ? new SportteryClient() : null,
      sportteryMatchId: getSportteryMappingByFixtureId(options.db, match.api_football_fixture_id)?.sportteryMatchId ?? null,
      dataOptions: {
        useOdds: false,
        useApiFootballPrediction: false,
        useHeadToHead: false,
        usePlayerLineupInjuries: false,
        useDongqiudiIntel: false,
        useSporttery: true
      }
    });
  });
}
