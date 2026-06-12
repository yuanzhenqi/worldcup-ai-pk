import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureApiFootballFixturesRaw,
  getAdminApiFootballSettings,
  getAdminSummary,
  listAdminAiModels,
  listAdminAiProviders,
  listAdminPromptTemplates,
  listAdminTeamDisplayNames,
  saveAdminAiModel,
  saveAdminAiProvider,
  saveAdminApiFootballKey,
  saveAdminPromptTemplate,
  saveAdminTeamDisplayName,
  syncApiFootballFixtures
} from "../src/api/client";

describe("web API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
