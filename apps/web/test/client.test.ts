import { afterEach, describe, expect, it, vi } from "vitest";
import type { PredictionRequestInputDto } from "@worldcup-ai-pk/shared";
import {
  captureApiFootballFixturesRaw,
  deleteAdminAiModel,
  deleteAdminAiProvider,
  deleteAdminPromptTemplate,
  getAdminApiFootballSettings,
  getAdminSummary,
  getMatchContext,
  getPublicHealth,
  listAdminAiModels,
  listAdminAiProviders,
  listAdminContextCacheLogs,
  listAdminPromptTemplates,
  listAdminTeamDisplayNames,
  refreshMatchContext,
  saveAdminAiModel,
  saveAdminAiProvider,
  saveAdminApiFootballKey,
  saveAdminPromptTemplate,
  saveAdminTeamDisplayName,
  requestMatchPrediction,
  syncApiFootballFixtures,
  testAdminAiModel,
  updateAdminPromptTemplate
} from "../src/api/client";

describe("web API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("falls back to XMLHttpRequest when fetch is unavailable", async () => {
    let latestRequest: FakeXMLHttpRequest | null = null;

    class FakeXMLHttpRequest {
      method = "";
      url = "";
      requestBody: string | undefined;
      responseText = JSON.stringify({ ok: true, service: "worldcup-ai-pk-api" });
      status = 200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
        latestRequest = this;
      }

      setRequestHeader() {
        return undefined;
      }

      send(body?: string) {
        this.requestBody = body;
        this.onload?.();
      }
    }

    vi.stubGlobal("fetch", undefined);
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);

    await expect(getPublicHealth()).resolves.toEqual({ ok: true, service: "worldcup-ai-pk-api" });
    expect(latestRequest).toMatchObject({
      method: "GET",
      url: "http://127.0.0.1:4000/api/public/health"
    });
  });

  it("loads API-Football configuration status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ configured: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(getAdminApiFootballSettings()).resolves.toEqual({ configured: true });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/admin/settings/api-football");
  });

  it("saves API-Football key through local admin API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ configured: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(saveAdminApiFootballKey("secret-api-football-key")).resolves.toEqual({ configured: true });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/admin/settings/api-football", {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ apiKey: "secret-api-football-key" })
    });
  });

  it("triggers raw API-Football fixtures capture", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ captured: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(captureApiFootballFixturesRaw()).resolves.toEqual({ captured: true });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/admin/sync/api-football/fixtures/raw", {
      method: "POST"
    });
  });

  it("loads admin summary", async () => {
    const summary = {
      matchCount: 72,
      scheduledCount: 70,
      liveCount: 0,
      finishedCount: 2,
      latestSyncLog: null
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(summary), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(getAdminSummary()).resolves.toEqual(summary);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/admin/summary");
  });

  it("triggers normal API-Football fixtures sync", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ synced: true, imported: 72 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(syncApiFootballFixtures()).resolves.toEqual({ synced: true, imported: 72 });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/admin/sync/api-football/fixtures", {
      method: "POST"
    });
  });

  it("requests a prediction for a public match", async () => {
    const result = {
      matchId: "match-1",
      status: "completed",
      message: "已完成 1 个模型预测",
      scheduledFor: null,
      context: null,
      runId: "run-1",
      predictionsCount: 1,
      logs: [
        {
          level: "info",
          message: "模型预测完成：GPT-4o mini",
          modelDisplayName: "GPT-4o mini",
          createdAt: "2026-06-13T08:00:00.000Z"
        }
      ]
    };
    const input: PredictionRequestInputDto = {
      taskTypes: ["result_1x2", "scoreline", "odds_interpretation"],
      dataOptions: {
        useOdds: true,
        useApiFootballPrediction: true,
        useHeadToHead: true,
        usePlayerLineupInjuries: true
      },
      promptTemplateId: "prompt-1",
      customPrompt: "偏重上半场节奏。",
      outputStyle: "detailed",
      refreshContext: true
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(requestMatchPrediction("match-1", input)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/public/matches/match-1/prediction-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
  });

  it("loads public match context", async () => {
    const context = {
      matchId: "match-1",
      completeness: "base_only",
      createdAt: null,
      domains: []
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(context), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(getMatchContext("match-1")).resolves.toEqual(context);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/public/matches/match-1/context");
  });

  it("refreshes public match context", async () => {
    const context = {
      matchId: "match-1",
      completeness: "partial",
      createdAt: "2026-06-13T08:00:00.000Z",
      domains: []
    };
    const dataOptions = {
      useOdds: true,
      useApiFootballPrediction: true,
      useHeadToHead: true,
      usePlayerLineupInjuries: true
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(context), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(refreshMatchContext("match-1", dataOptions)).resolves.toEqual(context);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/public/matches/match-1/context/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataOptions })
    });
  });

  it("saves OpenAI-compatible provider configuration", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "provider-1",
          name: "openrouter",
          displayName: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          enabled: true,
          apiKeyConfigured: true
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    await expect(
      saveAdminAiProvider({
        name: "openrouter",
        displayName: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "secret-provider-key",
        enabled: true
      })
    ).resolves.toMatchObject({ apiKeyConfigured: true });

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/admin/ai-providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "openrouter",
        displayName: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "secret-provider-key",
        enabled: true
      })
    });
  });

  it("loads and saves admin model configuration", async () => {
    const model = {
      id: "model-1",
      providerId: "provider-1",
      modelName: "deepseek-chat",
      displayName: "DeepSeek Chat",
      enabled: true
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [model] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(model), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    await expect(listAdminAiModels()).resolves.toEqual([model]);
    await expect(saveAdminAiModel({
      providerId: "provider-1",
      modelName: "deepseek-chat",
      displayName: "DeepSeek Chat",
      enabled: true
    })).resolves.toEqual(model);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:4000/api/admin/ai-models");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:4000/api/admin/ai-models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        providerId: "provider-1",
        modelName: "deepseek-chat",
        displayName: "DeepSeek Chat",
        enabled: true
      })
    });
  });

  it("tests and deletes admin AI model configuration", async () => {
    const testResult = {
      ok: true,
      status: 200,
      message: "模型测试成功",
      latencyMs: 128
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(testResult), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    await expect(testAdminAiModel("model-1")).resolves.toEqual(testResult);
    await expect(deleteAdminAiModel("model-1")).resolves.toEqual({ deleted: true });
    await expect(deleteAdminAiProvider("provider-1")).resolves.toEqual({ deleted: true });
    await expect(deleteAdminPromptTemplate("prompt-1")).resolves.toEqual({ deleted: true });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:4000/api/admin/ai-models/model-1/test", {
      method: "POST"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:4000/api/admin/ai-models/model-1", {
      method: "DELETE"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://127.0.0.1:4000/api/admin/ai-providers/provider-1", {
      method: "DELETE"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, "http://127.0.0.1:4000/api/admin/prompt-templates/prompt-1", {
      method: "DELETE"
    });
  });

  it("loads provider and prompt template configuration", async () => {
    const provider = {
      id: "provider-1",
      name: "openrouter",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      enabled: true,
      apiKeyConfigured: true
    };
    const promptTemplate = {
      id: "prompt-1",
      name: "保守预测",
      description: "偏重不败概率",
      fullPrompt: "请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
      promptSummary: "保守预测",
      scope: "match_prediction",
      enabled: true,
      isDefault: true
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ providers: [provider] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ promptTemplates: [promptTemplate] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(promptTemplate), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    await expect(listAdminAiProviders()).resolves.toEqual([provider]);
    await expect(listAdminPromptTemplates()).resolves.toEqual([promptTemplate]);
    await expect(saveAdminPromptTemplate({
      name: "保守预测",
      description: "偏重不败概率",
      fullPrompt: "请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
      promptSummary: "保守预测",
      scope: "match_prediction",
      enabled: true,
      isDefault: true
    })).resolves.toEqual(promptTemplate);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:4000/api/admin/ai-providers");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:4000/api/admin/prompt-templates");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://127.0.0.1:4000/api/admin/prompt-templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "保守预测",
        description: "偏重不败概率",
        fullPrompt: "请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
        promptSummary: "保守预测",
        scope: "match_prediction",
        enabled: true,
        isDefault: true
      })
    });
  });

  it("loads admin context cache logs", async () => {
    const logs = [
      {
        matchId: "match-1",
        domain: "odds",
        status: "cached",
        error: null,
        syncedAt: "2026-06-13T08:00:00.000Z"
      }
    ];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ logs }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(listAdminContextCacheLogs()).resolves.toEqual(logs);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/admin/context-cache");
  });

  it("updates an existing prompt template", async () => {
    const promptTemplate = {
      id: "prompt-1",
      name: "保守预测",
      description: "偏重不败概率",
      fullPrompt: "请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
      promptSummary: "保守预测",
      scope: "match_prediction",
      enabled: true,
      isDefault: true
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(promptTemplate), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(updateAdminPromptTemplate("prompt-1", {
      name: "保守预测",
      description: "偏重不败概率",
      fullPrompt: "请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
      promptSummary: "保守预测",
      scope: "match_prediction",
      enabled: true,
      isDefault: true
    })).resolves.toEqual(promptTemplate);

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/admin/prompt-templates/prompt-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "保守预测",
        description: "偏重不败概率",
        fullPrompt: "请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
        promptSummary: "保守预测",
        scope: "match_prediction",
        enabled: true,
        isDefault: true
      })
    });
  });

  it("loads and saves team display names", async () => {
    const team = {
      apiFootballTeamId: "16",
      originalName: "Mexico",
      displayNameZh: "墨西哥队",
      logoUrl: null,
      source: "admin"
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ teams: [team] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(team), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    await expect(listAdminTeamDisplayNames("墨西哥")).resolves.toEqual([team]);
    await expect(saveAdminTeamDisplayName("16", "墨西哥队")).resolves.toEqual(team);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:4000/api/admin/team-display-names?q=%E5%A2%A8%E8%A5%BF%E5%93%A5");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:4000/api/admin/team-display-names/16", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayNameZh: "墨西哥队" })
    });
  });
});
