import { describe, expect, it, vi } from "vitest";
import type { WebSearchProvider } from "../src/modules/external-intel/webSearchProvider";
import { buildExternalIntelQueries, collectExternalIntelForMatch } from "../src/modules/external-intel/externalIntelCollector";
import { createTestDatabase } from "./support/testDatabase";

const summarizePredict = vi.fn();

vi.mock("../src/modules/ai/openAiCompatibleClient", () => ({
  runOpenAiCompatiblePrediction: (...args: unknown[]) => summarizePredict(...args)
}));

function seedMatch(db: ReturnType<typeof createTestDatabase>["db"]) {
  db.prepare(
    `INSERT INTO matches (
      id, api_football_fixture_id, stage, kickoff_at, status, venue,
      home_team_id, home_team_name, away_team_id, away_team_name, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "match-1",
    1001,
    "Group Stage",
    "2026-06-22T10:00:00.000Z",
    "scheduled",
    "Test Stadium",
    "home-1",
    "Germany",
    "away-1",
    "Japan",
    "2026-06-21T10:00:00.000Z"
  );
}

describe("external intelligence collector", () => {
  it("builds bilingual match queries", () => {
    expect(
      buildExternalIntelQueries({
        homeTeamName: "Germany",
        awayTeamName: "Japan",
        kickoffAt: "2026-06-22T10:00:00.000Z",
        maxQueries: 4
      })
    ).toEqual([
      "Germany Japan 伤停 首发 世界杯",
      "Germany Japan injury lineup World Cup",
      "Germany Japan press conference team news",
      "Germany Japan motivation rotation World Cup"
    ]);
  });

  it("collects search results and writes a cached summary without a summarizer model", async () => {
    const { db } = createTestDatabase();
    seedMatch(db);
    const provider: WebSearchProvider = {
      search: vi.fn().mockResolvedValue([
        {
          title: "Germany team news",
          url: "https://example.com/germany-news",
          snippet: "Germany may rotate midfield.",
          sourceDomain: "example.com",
          publishedAt: "2026-06-21T09:00:00.000Z"
        }
      ])
    };

    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(
      "externalIntel.enabled",
      "true",
      "2026-06-21T10:00:00.000Z"
    );

    const result = await collectExternalIntelForMatch(db, {
      matchId: "match-1",
      homeTeamName: "Germany",
      awayTeamName: "Japan",
      kickoffAt: "2026-06-22T10:00:00.000Z",
      webSearchProvider: provider,
      now: new Date("2026-06-21T10:00:00.000Z"),
      forceRefresh: false
    });

    expect(provider.search).toHaveBeenCalledTimes(8);
    expect(result.summary.status).toBe("summary_failed");
    expect(result.summary.summary).toContain("Germany team news");
    expect(result.summary.sourceLinks[0]).toMatchObject({ url: "https://example.com/germany-news" });
  });

  it("lets callers override the query count", async () => {
    const { db } = createTestDatabase();
    seedMatch(db);
    const provider: WebSearchProvider = {
      search: vi.fn().mockResolvedValue([
        {
          title: "Germany team news",
          url: "https://example.com/germany-news",
          snippet: "Germany may rotate midfield.",
          sourceDomain: "example.com",
          publishedAt: null
        }
      ])
    };

    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(
      "externalIntel.enabled",
      "true",
      "2026-06-21T10:00:00.000Z"
    );

    await collectExternalIntelForMatch(db, {
      matchId: "match-1",
      homeTeamName: "Germany",
      awayTeamName: "Japan",
      kickoffAt: "2026-06-22T10:00:00.000Z",
      maxQueries: 2,
      webSearchProvider: provider,
      now: new Date("2026-06-21T10:00:00.000Z"),
      forceRefresh: false
    });

    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it("keeps successful search results when one query fails", async () => {
    const { db } = createTestDatabase();
    seedMatch(db);
    const provider: WebSearchProvider = {
      search: vi
        .fn()
        .mockResolvedValueOnce([
          {
            title: "Germany injury update",
            url: "https://example.com/germany-injury",
            snippet: "Germany report one late fitness check.",
            sourceDomain: "example.com",
            publishedAt: null
          }
        ])
        .mockRejectedValueOnce(new Error("search timeout"))
        .mockResolvedValue([])
    };

    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(
      "externalIntel.enabled",
      "true",
      "2026-06-21T10:00:00.000Z"
    );

    const result = await collectExternalIntelForMatch(db, {
      matchId: "match-1",
      homeTeamName: "Germany",
      awayTeamName: "Japan",
      kickoffAt: "2026-06-22T10:00:00.000Z",
      webSearchProvider: provider,
      now: new Date("2026-06-21T10:00:00.000Z"),
      forceRefresh: false
    });

    expect(result.status).toBe("summary_failed");
    expect(result.searchResults).toHaveLength(1);
    expect(result.summary.summary).toContain("Germany injury update");
    expect(result.summary.dataGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "external_intel",
          code: "search_partial_failed",
          message: "部分外部情报搜索失败：search timeout"
        })
      ])
    );
  });

  it("reuses a fresh cached snapshot", async () => {
    const { db } = createTestDatabase();
    seedMatch(db);
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(
      "externalIntel.enabled",
      "true",
      "2026-06-21T10:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO fixture_external_intel_snapshots (
        id, match_id, provider, query_json, search_results_json, summary_json, status, error, collected_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "intel-1",
      "match-1",
      "duckduckgo_html",
      "[]",
      "[]",
      JSON.stringify({
        status: "cached",
        summary: "Cached summary",
        injuryNews: [],
        lineupNews: [],
        motivation: [],
        recentFormNews: [],
        riskSignals: [],
        sourceLinks: [],
        confidence: "low",
        dataGaps: [],
        collectedAt: "2026-06-21T10:00:00.000Z"
      }),
      "cached",
      null,
      "2026-06-21T10:00:00.000Z",
      "2026-06-21T11:00:00.000Z",
      "2026-06-21T10:00:00.000Z"
    );
    const provider: WebSearchProvider = { search: vi.fn() };

    const result = await collectExternalIntelForMatch(db, {
      matchId: "match-1",
      homeTeamName: "Germany",
      awayTeamName: "Japan",
      kickoffAt: "2026-06-22T10:00:00.000Z",
      webSearchProvider: provider,
      now: new Date("2026-06-21T10:30:00.000Z"),
      forceRefresh: false
    });

    expect(provider.search).not.toHaveBeenCalled();
    expect(result.summary.summary).toBe("Cached summary");
  });

  it("fills structured injury/lineup/motivation fields when the summarizer model succeeds", async () => {
    const { db } = createTestDatabase();
    seedMatch(db);

    db.prepare(
      `INSERT INTO ai_providers (id, name, display_name, base_url, api_key, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("prov-1", "p", "P", "https://example.com/v1", "key", 1, "2026-06-21T10:00:00.000Z", "2026-06-21T10:00:00:00Z");
    db.prepare(
      `INSERT INTO ai_models (id, provider_id, model_name, display_name, enabled, context_window_tokens, max_output_tokens, request_timeout_ms, request_retry_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("model-1", "prov-1", "kimi-k2.6", "kimi", 1, 50000, 0, 150000, 1, "2026-06-21T10:00:00.000Z", "2026-06-21T10:00:00.00Z");

    for (const [key, value] of [
      ["externalIntel.enabled", "true"],
      ["externalIntel.provider", "duckduckgo_html"],
      ["externalIntel.summarizerModelId", "model-1"],
      ["externalIntel.cacheMinutes", "60"],
      ["externalIntel.maxResultsPerQuery", "5"],
      ["externalIntel.maxQueriesPerMatch", "8"]
    ]) {
      db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(key, value, "2026-06-21T10:00:00.000Z");
    }

    const provider: WebSearchProvider = {
      search: vi.fn().mockResolvedValue([
        {
          title: "Germany team news",
          url: "https://example.com/news",
          snippet: "Germany may rotate midfield.",
          sourceDomain: "example.com",
          publishedAt: "2026-06-21T09:00:00.000Z"
        }
      ])
    };

    summarizePredict.mockResolvedValueOnce({
      content: JSON.stringify({
        status: "cached",
        summary: "德国可能轮换中场。",
        injuryNews: ["穆西亚拉伤缺"],
        lineupNews: ["中场轮换"],
        motivation: ["争取出线"],
        recentFormNews: [],
        riskSignals: [],
        sourceLinks: [],
        confidence: "medium",
        dataGaps: []
      })
    });

    const result = await collectExternalIntelForMatch(db, {
      matchId: "match-1",
      homeTeamName: "Germany",
      awayTeamName: "Japan",
      kickoffAt: "2026-06-22T10:00:00.000Z",
      webSearchProvider: provider,
      now: new Date("2026-06-21T10:00:00.000Z"),
      forceRefresh: true
    });

    expect(result.status).toBe("cached");
    expect(result.summary.status).toBe("cached");
    expect(result.summary.injuryNews).toEqual(["穆西亚拉伤缺"]);
    expect(result.summary.lineupNews).toEqual(["中场轮换"]);
    expect(result.summary.motivation).toEqual(["争取出线"]);

    // 模型如实返回 no_search_results（搜索为空）时不应降级为 summary_failed
    summarizePredict.mockResolvedValueOnce({
      content: JSON.stringify({
        status: "no_search_results",
        summary: "外部搜索无结果。",
        injuryNews: [],
        lineupNews: [],
        motivation: [],
        recentFormNews: [],
        riskSignals: [],
        sourceLinks: [],
        confidence: "none",
        dataGaps: ["外部搜索暂无结果"]
      })
    });
    const emptyResult = await collectExternalIntelForMatch(db, {
      matchId: "match-1",
      homeTeamName: "Germany",
      awayTeamName: "Japan",
      kickoffAt: "2026-06-22T10:00:00.000Z",
      webSearchProvider: provider,
      now: new Date("2026-06-21T10:00:00.000Z"),
      forceRefresh: true
    });
    expect(emptyResult.summary.status).toBe("cached");
    expect(emptyResult.summary.summary).toBe("外部搜索无结果。");

    // 总结调用应使用足够大的输出预算（覆盖 max_output_tokens=0 的默认 4000 截断）
    const callConfig = summarizePredict.mock.calls[0]?.[0];
    expect(callConfig?.maxOutputTokens).toBeGreaterThanOrEqual(8000);
    vi.clearAllMocks();
  });

  it("parses structured fields even when the model wraps JSON in markdown fences", async () => {
    const { db } = createTestDatabase();
    seedMatch(db);
    db.prepare(
      `INSERT INTO ai_providers (id, name, display_name, base_url, api_key, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("prov-1", "p", "P", "https://example.com/v1", "key", 1, "2026-06-21T10:00:00.000Z", "2026-06-21T10:00:00:00Z");
    db.prepare(
      `INSERT INTO ai_models (id, provider_id, model_name, display_name, enabled, context_window_tokens, max_output_tokens, request_timeout_ms, request_retry_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("model-1", "prov-1", "kimi-k2.6", "kimi", 1, 50000, 0, 150000, 1, "2026-06-21T10:00:00.000Z", "2026-06-21T10:00:00:00Z");
    for (const [key, value] of [
      ["externalIntel.enabled", "true"],
      ["externalIntel.provider", "duckduckgo_html"],
      ["externalIntel.summarizerModelId", "model-1"],
      ["externalIntel.cacheMinutes", "60"],
      ["externalIntel.maxResultsPerQuery", "5"],
      ["externalIntel.maxQueriesPerMatch", "8"]
    ]) {
      db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(key, value, "2026-06-21T10:00:00.000Z");
    }

    const provider: WebSearchProvider = { search: vi.fn().mockResolvedValue([]) };

    summarizePredict.mockResolvedValueOnce({
      content: "好的，以下是情报总结：\n```json\n" + JSON.stringify({
        status: "cached",
        summary: "瑞士对阵加拿大。",
        injuryNews: ["科内伤缺"],
        lineupNews: [],
        motivation: [],
        recentFormNews: [],
        riskSignals: [],
        sourceLinks: [],
        confidence: "medium",
        dataGaps: []
      }) + "\n```"
    });

    const result = await collectExternalIntelForMatch(db, {
      matchId: "match-1",
      homeTeamName: "Germany",
      awayTeamName: "Japan",
      kickoffAt: "2026-06-22T10:00:00.000Z",
      webSearchProvider: provider,
      now: new Date("2026-06-21T10:00:00.000Z"),
      forceRefresh: true
    });

    expect(result.summary.status).toBe("cached");
    expect(result.summary.injuryNews).toEqual(["科内伤缺"]);
    vi.clearAllMocks();
  });
});
