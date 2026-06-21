import { describe, expect, it, vi } from "vitest";
import type { WebSearchProvider } from "../src/modules/external-intel/webSearchProvider";
import { buildExternalIntelQueries, collectExternalIntelForMatch } from "../src/modules/external-intel/externalIntelCollector";
import { createTestDatabase } from "./support/testDatabase";

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

    expect(provider.search).toHaveBeenCalledTimes(4);
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
});
