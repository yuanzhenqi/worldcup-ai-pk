import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "./support/testDatabase";
import {
  getExternalIntelSettings,
  getFreshExternalIntelSnapshot,
  getLatestExternalIntelSnapshotByMatch,
  insertExternalIntelSnapshot,
  saveExternalIntelSettings
} from "../src/modules/external-intel/externalIntel.repository";

describe("external intelligence repository", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses disabled defaults when no settings exist", () => {
    const { db } = createTestDatabase();

    expect(getExternalIntelSettings(db)).toEqual({
      enabled: false,
      provider: "duckduckgo_html",
      summarizerModelId: "",
      cacheMinutes: 60,
      maxResultsPerQuery: 5,
      maxQueriesPerMatch: 4
    });
  });

  it("saves and reads external intelligence settings", () => {
    const { db } = createTestDatabase();

    expect(
      saveExternalIntelSettings(
        db,
        {
          enabled: true,
          provider: "duckduckgo_html",
          summarizerModelId: "model-1",
          cacheMinutes: 45,
          maxResultsPerQuery: 6,
          maxQueriesPerMatch: 3
        },
        new Date("2026-06-21T10:00:00.000Z")
      )
    ).toEqual({
      enabled: true,
      provider: "duckduckgo_html",
      summarizerModelId: "model-1",
      cacheMinutes: 45,
      maxResultsPerQuery: 6,
      maxQueriesPerMatch: 3
    });

    expect(getExternalIntelSettings(db).summarizerModelId).toBe("model-1");
  });

  it("stores latest and fresh snapshots by match", () => {
    const { db } = createTestDatabase();
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

    const row = insertExternalIntelSnapshot(db, {
      id: "intel-1",
      matchId: "match-1",
      provider: "duckduckgo_html",
      queryJson: JSON.stringify(["Germany Japan team news"]),
      searchResultsJson: JSON.stringify([{ title: "Team news", url: "https://example.com/news", snippet: "Lineup notes" }]),
      summaryJson: JSON.stringify({
        status: "cached",
        summary: "Lineup notes",
        sourceLinks: [{ title: "Team news", url: "https://example.com/news" }],
        dataGaps: []
      }),
      status: "cached",
      error: null,
      collectedAt: "2026-06-21T10:00:00.000Z",
      expiresAt: "2026-06-21T11:00:00.000Z",
      createdAt: "2026-06-21T10:00:00.000Z"
    });

    expect(row).toMatchObject({ id: "intel-1", match_id: "match-1", status: "cached" });
    expect(getLatestExternalIntelSnapshotByMatch(db, "match-1")).toMatchObject({ id: "intel-1" });
    expect(getFreshExternalIntelSnapshot(db, { matchId: "match-1", now: new Date("2026-06-21T10:30:00.000Z") })).toMatchObject({
      id: "intel-1"
    });
    expect(getFreshExternalIntelSnapshot(db, { matchId: "match-1", now: new Date("2026-06-21T11:30:00.000Z") })).toBeNull();
  });
});
