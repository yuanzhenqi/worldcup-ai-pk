import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createTestDatabase } from "./support/testDatabase";

describe("admin config API", () => {
  it("returns admin summary counts", async () => {
    const { db, databasePath } = createTestDatabase();
    db.prepare(
      `
        INSERT INTO matches (
          id,
          api_football_fixture_id,
          stage,
          kickoff_at,
          status,
          venue,
          home_team_id,
          home_team_name,
          home_team_logo_url,
          away_team_id,
          away_team_name,
          away_team_logo_url,
          home_score,
          away_score,
          last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "match-1",
      1001,
      "Group Stage",
      "2026-06-12T19:00:00.000Z",
      "finished",
      null,
      "16",
      "Mexico",
      null,
      "1531",
      "South Africa",
      null,
      2,
      0,
      "2026-06-12T10:00:00.000Z"
    );
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "GET", url: "/api/admin/summary", remoteAddress: "127.0.0.1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchCount: 1,
      scheduledCount: 0,
      liveCount: 0,
      finishedCount: 1
    });

    await app.close();
  });

  it("saves OpenAI-compatible providers without returning API keys", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/admin/ai-providers",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "openrouter",
        displayName: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "secret-provider-key",
        enabled: true
      }
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      name: "openrouter",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      enabled: true,
      apiKeyConfigured: true
    });
    expect(JSON.stringify(createResponse.json())).not.toContain("secret-provider-key");

    const listResponse = await app.inject({ method: "GET", url: "/api/admin/ai-providers", remoteAddress: "127.0.0.1" });
    expect(listResponse.statusCode).toBe(200);
    expect(JSON.stringify(listResponse.json())).not.toContain("secret-provider-key");

    await app.close();
  });

  it("saves models under a provider", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const providerResponse = await app.inject({
      method: "POST",
      url: "/api/admin/ai-providers",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "deepseek",
        displayName: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "secret-provider-key",
        enabled: true
      }
    });
    const provider = providerResponse.json() as { id: string };

    const modelResponse = await app.inject({
      method: "POST",
      url: "/api/admin/ai-models",
      remoteAddress: "127.0.0.1",
      payload: {
        providerId: provider.id,
        modelName: "deepseek-chat",
        displayName: "DeepSeek Chat",
        enabled: true
      }
    });

    expect(modelResponse.statusCode).toBe(200);
    expect(modelResponse.json()).toMatchObject({
      providerId: provider.id,
      modelName: "deepseek-chat",
      displayName: "DeepSeek Chat",
      enabled: true
    });

    const listResponse = await app.inject({ method: "GET", url: "/api/admin/ai-models", remoteAddress: "127.0.0.1" });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().models).toHaveLength(1);

    await app.close();
  });

  it("keeps one default prompt template", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const first = await app.inject({
      method: "POST",
      url: "/api/admin/prompt-templates",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "保守预测",
        description: "偏重不败概率",
        fullPrompt: "请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
        promptSummary: "保守预测",
        scope: "match_prediction",
        enabled: true,
        isDefault: true
      }
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/admin/prompt-templates",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "赔率参考",
        description: "结合赔率",
        fullPrompt: "结合赔率预测 {{homeTeam}} 对阵 {{awayTeam}}。",
        promptSummary: "赔率参考",
        scope: "match_prediction",
        enabled: true,
        isDefault: true
      }
    });
    expect(second.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/api/admin/prompt-templates", remoteAddress: "127.0.0.1" });
    const templates = list.json().promptTemplates as Array<{ isDefault: boolean }>;
    expect(templates).toHaveLength(2);
    expect(templates.filter((template) => template.isDefault)).toHaveLength(1);

    await app.close();
  });

  it("updates team Chinese display names", async () => {
    const { db, databasePath } = createTestDatabase();
    db.prepare(
      `
        INSERT INTO team_display_names (
          api_football_team_id,
          original_name,
          display_name_zh,
          logo_url,
          source,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    ).run("16", "Mexico", "墨西哥", null, "seed", "2026-06-12T10:00:00.000Z", "2026-06-12T10:00:00.000Z");
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/api/admin/team-display-names/16",
      remoteAddress: "127.0.0.1",
      payload: { displayNameZh: "墨西哥队" }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      apiFootballTeamId: "16",
      originalName: "Mexico",
      displayNameZh: "墨西哥队",
      source: "admin"
    });

    const listResponse = await app.inject({ method: "GET", url: "/api/admin/team-display-names?q=墨西哥队", remoteAddress: "127.0.0.1" });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().teams).toHaveLength(1);

    await app.close();
  });
});
