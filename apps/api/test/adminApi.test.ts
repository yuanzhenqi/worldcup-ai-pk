import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createTestDatabase } from "./support/testDatabase";

describe("admin API", () => {
  it("allows local health checks", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "GET", url: "/api/admin/health", remoteAddress: "127.0.0.1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "worldcup-ai-pk-admin"
    });

    await app.close();
  });

  it("allows private LAN callers and rejects public remote callers", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();

    const app = buildApp({ databasePath, logger: false });

    const lanResponse = await app.inject({ method: "GET", url: "/api/admin/health", remoteAddress: "192.168.1.23" });
    expect(lanResponse.statusCode).toBe(200);

    const publicResponse = await app.inject({ method: "GET", url: "/api/admin/health", remoteAddress: "8.8.8.8" });
    expect(publicResponse.statusCode).toBe(403);

    await app.close();
  });

  it("re-collects context for all matches of a betting arena round", async () => {
    const { db, databasePath } = createTestDatabase();
    db.prepare(
      `INSERT INTO matches (id, api_football_fixture_id, stage, kickoff_at, status, venue, home_team_id, home_team_name, away_team_id, away_team_name, last_synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "match-1",
      900111,
      "Group Stage - 1",
      "2026-06-24T19:00:00.000Z",
      "finished",
      "Test Stadium",
      "25",
      "Germany",
      "12",
      "Japan",
      "2026-06-23T00:00:00.000Z"
    );
    db.prepare(
      `INSERT INTO betting_arena_rounds (id, round_date, round_sequence, status, lock_time, battle_context_json, external_intel_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "round-1",
      "2026-06-24",
      1,
      "settled",
      "2026-06-24T12:00:00.000Z",
      JSON.stringify({ matches: [{ matchId: "match-1", homeTeamName: "Germany", awayTeamName: "Japan" }] }),
      "{}",
      "2026-06-24T12:00:00.000Z",
      "2026-06-24T12:00:00.000Z"
    );
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/betting-arena/rounds/round-1/refresh-context",
      remoteAddress: "127.0.0.1"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.refreshed).toBe(1);
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0]).toMatchObject({ matchId: "match-1", externalIntelStatus: "not_configured" });

    await app.close();
  });

  it("returns 404 for an unknown betting arena round", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/betting-arena/rounds/missing/refresh-context",
      remoteAddress: "127.0.0.1"
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
