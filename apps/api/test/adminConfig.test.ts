import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { createTestDatabase } from "./support/testDatabase";

const builtInPromptTemplateNames = [
  "稳健胜平负预测",
  "比分预测",
  "体彩选项说明",
  "球员阵容影响",
  "历史交锋模型",
  "爆冷风险评估",
  "综合赛前报告"
];

describe("admin config API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("returns fixture context sync status for admin cache module", async () => {
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
      "2026-06-13T19:00:00.000Z",
      "scheduled",
      null,
      "home-1",
      "Home",
      null,
      "away-1",
      "Away",
      null,
      null,
      null,
      "2026-06-13T07:00:00.000Z"
    );
    db.prepare(
      `
        INSERT INTO fixture_data_sync_logs (id, match_id, domain, status, error, synced_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run("log-1", "match-1", "odds", "cached", null, "2026-06-13T08:00:00.000Z");
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "GET", url: "/api/admin/context-cache", remoteAddress: "127.0.0.1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      logs: [
        {
          matchId: "match-1",
          domain: "odds",
          status: "cached",
          error: null,
          syncedAt: "2026-06-13T08:00:00.000Z"
        }
      ]
    });

    await app.close();
  });

  it("saves sporttery settings and fixture mappings", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const initialSettingsResponse = await app.inject({
      method: "GET",
      url: "/api/admin/settings/sporttery",
      remoteAddress: "127.0.0.1"
    });
    expect(initialSettingsResponse.statusCode).toBe(200);
    expect(initialSettingsResponse.json()).toEqual({ enabled: false });

    const settingsResponse = await app.inject({
      method: "PUT",
      url: "/api/admin/settings/sporttery",
      remoteAddress: "127.0.0.1",
      payload: { enabled: true }
    });
    expect(settingsResponse.statusCode).toBe(200);
    expect(settingsResponse.json()).toEqual({ enabled: true });

    const mappingResponse = await app.inject({
      method: "POST",
      url: "/api/admin/sporttery-mappings",
      remoteAddress: "127.0.0.1",
      payload: {
        apiFootballFixtureId: 1001,
        sportteryMatchId: 2001
      }
    });
    expect(mappingResponse.statusCode).toBe(200);
    expect(mappingResponse.json()).toMatchObject({
      apiFootballFixtureId: 1001,
      sportteryMatchId: 2001
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/admin/sporttery-mappings",
      remoteAddress: "127.0.0.1"
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().mappings).toEqual([
      expect.objectContaining({
        apiFootballFixtureId: 1001,
        sportteryMatchId: 2001
      })
    ]);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/admin/sporttery-mappings/1001",
      remoteAddress: "127.0.0.1"
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({ deleted: true });

    const afterDeleteListResponse = await app.inject({
      method: "GET",
      url: "/api/admin/sporttery-mappings",
      remoteAddress: "127.0.0.1"
    });
    expect(afterDeleteListResponse.statusCode).toBe(200);
    expect(afterDeleteListResponse.json().mappings).toEqual([]);

    await app.close();
  });

  it("syncs sporttery mappings from exact World Cup team names", async () => {
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
      "2026-06-14T17:00:00.000Z",
      "scheduled",
      null,
      "home-1",
      "德国",
      null,
      "away-1",
      "库拉索",
      null,
      null,
      null,
      "2026-06-13T08:00:00.000Z"
    );
    db.close();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          value: {
            matchInfoList: [
              {
                subMatchList: [{ leagueAbbName: "世界杯", leagueAllName: "世界杯", homeTeamAbbName: "德国", awayTeamAbbName: "库拉索", matchId: 2040170 }]
              }
            ]
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "POST", url: "/api/admin/sporttery-mappings/sync", remoteAddress: "127.0.0.1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ matched: 1, unmatched: 0, totalSportteryMatches: 1 });

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

  it("tests an OpenAI-compatible model without returning provider secrets", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const providerResponse = await app.inject({
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
    const provider = providerResponse.json() as { id: string };

    const modelResponse = await app.inject({
      method: "POST",
      url: "/api/admin/ai-models",
      remoteAddress: "127.0.0.1",
      payload: {
        providerId: provider.id,
        modelName: "openai/gpt-4o-mini",
        displayName: "GPT-4o mini",
        enabled: true
      }
    });
    const model = modelResponse.json() as { id: string };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const testResponse = await app.inject({
      method: "POST",
      url: `/api/admin/ai-models/${model.id}/test`,
      remoteAddress: "127.0.0.1"
    });

    expect(testResponse.statusCode).toBe(200);
    expect(testResponse.json()).toMatchObject({
      ok: true,
      status: 200,
      message: "模型测试成功"
    });
    expect(JSON.stringify(testResponse.json())).not.toContain("secret-provider-key");
    expect(fetchMock).toHaveBeenCalledWith("https://openrouter.ai/api/v1/chat/completions", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        authorization: "Bearer secret-provider-key",
        "content-type": "application/json"
      })
    }));

    await app.close();
  });

  it("falls back to /v1 chat completions when the provider root returns HTML", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const providerResponse = await app.inject({
      method: "POST",
      url: "/api/admin/ai-providers",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "newapi",
        displayName: "NewAPI",
        baseUrl: "https://newapi.example.com",
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
        modelName: "glm-5.1",
        displayName: "GLM 5.1",
        enabled: true
      }
    });
    const model = modelResponse.json() as { id: string };

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const testResponse = await app.inject({
      method: "POST",
      url: `/api/admin/ai-models/${model.id}/test`,
      remoteAddress: "127.0.0.1"
    });

    expect(testResponse.statusCode).toBe(200);
    expect(testResponse.json()).toMatchObject({ ok: true, message: "模型测试成功" });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://newapi.example.com/chat/completions", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://newapi.example.com/v1/chat/completions", expect.objectContaining({ method: "POST" }));

    await app.close();
  });

  it("reports event-stream model test responses as unsupported response format", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const providerResponse = await app.inject({
      method: "POST",
      url: "/api/admin/ai-providers",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "newapi",
        displayName: "NewAPI",
        baseUrl: "https://newapi.example.com/v1",
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
        modelName: "gpt-5.5",
        displayName: "GPT 5.5",
        enabled: true
      }
    });
    const model = modelResponse.json() as { id: string };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("data: {\"choices\":[]}\n\ndata: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );

    const testResponse = await app.inject({
      method: "POST",
      url: `/api/admin/ai-models/${model.id}/test`,
      remoteAddress: "127.0.0.1"
    });

    expect(testResponse.statusCode).toBe(200);
    expect(testResponse.json()).toMatchObject({
      ok: false,
      status: 200,
      message: "模型测试失败：接口返回 event-stream，当前需要普通 JSON 响应"
    });

    await app.close();
  });

  it("reports empty assistant content during model tests", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const providerResponse = await app.inject({
      method: "POST",
      url: "/api/admin/ai-providers",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "newapi",
        displayName: "NewAPI",
        baseUrl: "https://newapi.example.com/v1",
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
        modelName: "gemini-3.5-flash",
        displayName: "Gemini 3.5 Flash",
        enabled: true
      }
    });
    const model = modelResponse.json() as { id: string };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "" }, finish_reason: "length" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const testResponse = await app.inject({
      method: "POST",
      url: `/api/admin/ai-models/${model.id}/test`,
      remoteAddress: "127.0.0.1"
    });

    expect(testResponse.statusCode).toBe(200);
    expect(testResponse.json()).toMatchObject({
      ok: false,
      status: 200,
      message: "模型测试失败：模型返回内容为空"
    });

    await app.close();
  });

  it("deletes model provider and prompt template configuration", async () => {
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
    const model = modelResponse.json() as { id: string };

    const promptResponse = await app.inject({
      method: "POST",
      url: "/api/admin/prompt-templates",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "临时模板",
        description: "临时",
        fullPrompt: "请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
        promptSummary: "临时",
        scope: "match_prediction",
        enabled: true,
        isDefault: false
      }
    });
    const prompt = promptResponse.json() as { id: string };

    const modelDeleteResponse = await app.inject({ method: "DELETE", url: `/api/admin/ai-models/${model.id}`, remoteAddress: "127.0.0.1" });
    const providerDeleteResponse = await app.inject({ method: "DELETE", url: `/api/admin/ai-providers/${provider.id}`, remoteAddress: "127.0.0.1" });
    const promptDeleteResponse = await app.inject({ method: "DELETE", url: `/api/admin/prompt-templates/${prompt.id}`, remoteAddress: "127.0.0.1" });

    expect(modelDeleteResponse.statusCode).toBe(200);
    expect(providerDeleteResponse.statusCode).toBe(200);
    expect(promptDeleteResponse.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/admin/ai-models", remoteAddress: "127.0.0.1" })).json().models).toHaveLength(0);
    expect((await app.inject({ method: "GET", url: "/api/admin/ai-providers", remoteAddress: "127.0.0.1" })).json().providers).toHaveLength(0);
    expect(
      ((await app.inject({ method: "GET", url: "/api/admin/prompt-templates", remoteAddress: "127.0.0.1" })).json().promptTemplates as Array<{ id: string }>).some(
        (template) => template.id === prompt.id
      )
    ).toBe(false);

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
    expect(templates).toHaveLength(9);
    expect(templates.filter((template) => template.isDefault)).toHaveLength(1);

    await app.close();
  });

  it("seeds built-in prompt templates for a fresh app database", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const list = await app.inject({ method: "GET", url: "/api/admin/prompt-templates", remoteAddress: "127.0.0.1" });
    const templates = list.json().promptTemplates as Array<{
      id: string;
      name: string;
      scope: string;
      enabled: boolean;
      isDefault: boolean;
      fullPrompt: string;
    }>;

    expect(list.statusCode).toBe(200);
    expect(templates.map((template) => template.name).sort()).toEqual([...builtInPromptTemplateNames].sort());
    expect(templates.every((template) => template.scope === "match_prediction")).toBe(true);
    expect(templates.find((template) => template.id === "builtin-prompt-odds-driven")).toMatchObject({
      name: "体彩选项说明",
      enabled: false
    });
    expect(templates.filter((template) => template.id !== "builtin-prompt-odds-driven").every((template) => template.enabled)).toBe(true);
    expect(templates.filter((template) => template.isDefault).map((template) => template.name)).toEqual(["稳健胜平负预测"]);
    expect(templates.every((template) => template.fullPrompt.includes("{{homeTeam}}") && template.fullPrompt.includes("{{awayTeam}}"))).toBe(true);
    expect(templates.every((template) => template.fullPrompt.includes("prediction_context"))).toBe(true);
    expect(templates.every((template) => template.fullPrompt.includes("不得编造"))).toBe(true);
    expect(templates.map((template) => template.fullPrompt).join("\n")).toContain("体彩选项不得作为赛果预测权重");
    expect(templates.map((template) => template.fullPrompt).join("\n")).toContain("体彩选项只能作为 Agent B 生成投注组合时的可选品类和回报背景");
    expect(templates.map((template) => template.name)).not.toContain("赔率驱动");
    expect(templates.map((template) => template.fullPrompt).join("\n")).not.toContain("赔率驱动");
    expect(templates.map((template) => template.fullPrompt).join("\n")).not.toContain("odds_analysis");
    expect(templates.map((template) => template.fullPrompt).join("\n")).not.toContain("odds_overheat_signal");
    expect(templates.map((template) => template.fullPrompt).join("\n")).not.toContain("优先解释赔率");

    await app.close();
  });

  it("does not seed built-in prompts that weight betting values for score prediction", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/prompt-templates",
      remoteAddress: "127.0.0.1"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { promptTemplates: Array<{ fullPrompt: string; enabled: boolean }> };
    const enabledPromptText = body.promptTemplates
      .filter((template) => template.enabled)
      .map((template) => template.fullPrompt)
      .join("\n");

    expect(enabledPromptText).not.toContain("赔率变化 10%");
    expect(enabledPromptText).not.toContain("按以下权重评估");

    await app.close();
  });

  it("disables existing prompt templates that weight betting values for score prediction", async () => {
    const { db, databasePath } = createTestDatabase();
    db.prepare(
      `
        INSERT INTO prompt_templates (
          id,
          name,
          description,
          full_prompt,
          prompt_summary,
          scope,
          enabled,
          is_default,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "manual-weighted-betting",
      "旧权重模板",
      "旧提示词",
      "按以下权重评估：赔率变化 10%。请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
      "旧权重模板",
      "match_prediction",
      1,
      0,
      "2026-06-13T00:00:00.000Z",
      "2026-06-13T00:00:00.000Z"
    );
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/prompt-templates",
      remoteAddress: "127.0.0.1"
    });

    expect(response.statusCode).toBe(200);
    const templates = response.json().promptTemplates as Array<{ id: string; fullPrompt: string; enabled: boolean }>;
    const legacyTemplate = templates.find((template) => template.id === "manual-weighted-betting");
    const enabledPromptText = templates
      .filter((template) => template.enabled)
      .map((template) => template.fullPrompt)
      .join("\n");

    expect(legacyTemplate).toMatchObject({ id: "manual-weighted-betting", enabled: false });
    expect(enabledPromptText).not.toContain("赔率变化 10%");
    expect(enabledPromptText).not.toContain("按以下权重评估");

    await app.close();
  });

  it("clears default from enabled legacy weighted prompts and restores the built-in steady default", async () => {
    const { db, databasePath } = createTestDatabase();
    db.prepare(
      `
        INSERT INTO prompt_templates (
          id,
          name,
          description,
          full_prompt,
          prompt_summary,
          scope,
          enabled,
          is_default,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "manual-default-weighted-betting",
      "旧默认权重模板",
      "旧默认提示词",
      "按以下权重评估：赔率变化 10%。请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
      "旧默认权重模板",
      "match_prediction",
      1,
      1,
      "2026-06-13T00:00:00.000Z",
      "2026-06-13T00:00:00.000Z"
    );
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/prompt-templates",
      remoteAddress: "127.0.0.1"
    });

    expect(response.statusCode).toBe(200);
    const templates = response.json().promptTemplates as Array<{
      id: string;
      enabled: boolean;
      isDefault: boolean;
    }>;
    const legacyTemplate = templates.find((template) => template.id === "manual-default-weighted-betting");
    const defaultTemplates = templates.filter((template) => template.isDefault);

    expect(legacyTemplate).toMatchObject({
      id: "manual-default-weighted-betting",
      enabled: false,
      isDefault: false
    });
    expect(defaultTemplates).toEqual([
      expect.objectContaining({
        id: "builtin-prompt-steady-1x2",
        enabled: true,
        isDefault: true
      })
    ]);

    await app.close();
  });

  it("updates existing built-in prompt templates when the app starts", async () => {
    const { db, databasePath } = createTestDatabase();
    db.prepare(
      `
        INSERT INTO prompt_templates (
          id,
          name,
          description,
          full_prompt,
          prompt_summary,
          scope,
          enabled,
          is_default,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "builtin-prompt-odds-driven",
      "赔率驱动预测",
      "旧描述",
      "旧提示词：优先解释赔率。",
      "旧摘要",
      "match_prediction",
      1,
      0,
      "2026-06-13T00:00:00.000Z",
      "2026-06-13T00:00:00.000Z"
    );
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const list = await app.inject({ method: "GET", url: "/api/admin/prompt-templates", remoteAddress: "127.0.0.1" });
    const template = (list.json().promptTemplates as Array<{ id: string; name: string; enabled: boolean; fullPrompt: string }>).find(
      (item) => item.id === "builtin-prompt-odds-driven"
    );

    expect(template).toMatchObject({
      id: "builtin-prompt-odds-driven",
      name: "体彩选项说明",
      enabled: false
    });
    expect(template?.fullPrompt).not.toContain("优先解释赔率");

    await app.close();
  });

  it("does not duplicate built-in prompt templates when the app starts repeatedly", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();

    const firstApp = buildApp({ databasePath, logger: false });
    await firstApp.close();
    const secondApp = buildApp({ databasePath, logger: false });
    const list = await secondApp.inject({ method: "GET", url: "/api/admin/prompt-templates", remoteAddress: "127.0.0.1" });
    const templates = list.json().promptTemplates as Array<{ name: string }>;

    expect(templates.map((template) => template.name).sort()).toEqual([...builtInPromptTemplateNames].sort());

    await secondApp.close();
  });

  it("keeps an existing default prompt template when seeding built-ins", async () => {
    const { db, databasePath } = createTestDatabase();
    db.prepare(
      `
        INSERT INTO prompt_templates (
          id,
          name,
          description,
          full_prompt,
          prompt_summary,
          scope,
          enabled,
          is_default,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "manual-default",
      "手动默认",
      "用户已经配置的默认模板",
      "请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
      "手动默认",
      "match_prediction",
      1,
      1,
      "2026-06-13T00:00:00.000Z",
      "2026-06-13T00:00:00.000Z"
    );
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const list = await app.inject({ method: "GET", url: "/api/admin/prompt-templates", remoteAddress: "127.0.0.1" });
    const templates = list.json().promptTemplates as Array<{ name: string; isDefault: boolean }>;
    const defaultTemplates = templates.filter((template) => template.isDefault);

    expect(templates.map((template) => template.name)).toEqual(expect.arrayContaining(["手动默认", ...builtInPromptTemplateNames]));
    expect(defaultTemplates).toHaveLength(1);
    expect(defaultTemplates[0]).toMatchObject({ name: "手动默认", isDefault: true });

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
