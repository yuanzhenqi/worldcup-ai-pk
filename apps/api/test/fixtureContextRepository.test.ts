import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./support/testDatabase";
import {
  getLatestFixtureContextSummary,
  listFixtureDataSyncLogs,
  saveFixtureContextSnapshot,
  writeFixtureDataSyncLog
} from "../src/modules/context/fixtureContext.repository";

describe("fixture context repository", () => {
  it("stores a context snapshot and returns a public summary", () => {
    const { db } = createTestDatabase();

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
      "Group Stage - 1",
      "2026-06-13T19:00:00.000Z",
      "scheduled",
      "BMO Field",
      "home-1",
      "Home",
      null,
      "away-1",
      "Away",
      null,
      null,
      null,
      "2026-06-13T08:00:00.000Z"
    );

    const snapshot = saveFixtureContextSnapshot(db, {
      matchId: "match-1",
      completeness: "partial",
      domains: [
        { domain: "odds", status: "cached", summary: "主胜 2.10，平局 3.20，客胜 3.50", lastSyncedAt: "2026-06-13T08:10:00.000Z", error: null },
        { domain: "api_prediction", status: "unavailable", summary: "未获取", lastSyncedAt: null, error: null },
        { domain: "head_to_head", status: "not_requested", summary: "未请求", lastSyncedAt: null, error: null },
        { domain: "squad", status: "refresh_failed", summary: "未获取", lastSyncedAt: "2026-06-13T08:11:00.000Z", error: "API-Football returned errors" }
      ],
      raw: { odds: { source: "test" } },
      now: new Date("2026-06-13T08:12:00.000Z")
    });

    expect(snapshot.id).toMatch(/[0-9a-f-]{36}/);
    expect(getLatestFixtureContextSummary(db, "match-1")).toMatchObject({
      matchId: "match-1",
      completeness: "partial",
      createdAt: "2026-06-13T08:12:00.000Z",
      domains: [
        { domain: "odds", status: "cached", summary: "主胜 2.10，平局 3.20，客胜 3.50" },
        { domain: "api_prediction", status: "unavailable", summary: "未获取" },
        { domain: "head_to_head", status: "not_requested", summary: "未请求" },
        { domain: "squad", status: "refresh_failed", summary: "未获取", error: "API-Football returned errors" },
        { domain: "dongqiudi_intel", status: "not_requested", summary: "未请求" }
      ]
    });

    db.close();
  });

  it("stores per-domain sync logs", () => {
    const { db } = createTestDatabase();

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
      "Group Stage - 1",
      "2026-06-13T19:00:00.000Z",
      "scheduled",
      "BMO Field",
      "home-1",
      "Home",
      null,
      "away-1",
      "Away",
      null,
      null,
      null,
      "2026-06-13T08:00:00.000Z"
    );

    writeFixtureDataSyncLog(db, {
      matchId: "match-1",
      domain: "odds",
      status: "refresh_failed",
      error: "API-Football returned errors",
      now: new Date("2026-06-13T08:15:00.000Z")
    });

    expect(listFixtureDataSyncLogs(db, "match-1")).toEqual([
      {
        domain: "odds",
        status: "refresh_failed",
        error: "API-Football returned errors",
        syncedAt: "2026-06-13T08:15:00.000Z"
      }
    ]);

    db.close();
  });
});
