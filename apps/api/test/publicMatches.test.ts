import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createTestDatabase } from "./support/testDatabase";

describe("public matches API", () => {
  it("returns matches from SQLite without exposing secrets", async () => {
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
      "scheduled",
      "Estadio Azteca",
      "team-home",
      "墨西哥",
      null,
      "team-away",
      "加拿大",
      null,
      null,
      null,
      "2026-06-12T10:00:00.000Z"
    );
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "GET", url: "/api/public/matches" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0]).toMatchObject({
      id: "match-1",
      apiFootballFixtureId: 1001,
      stage: "Group Stage",
      kickoffAt: "2026-06-12T19:00:00.000Z",
      status: "scheduled",
      venue: "Estadio Azteca",
      homeTeam: {
        id: "team-home",
        name: "墨西哥",
        logoUrl: null
      },
      awayTeam: {
        id: "team-away",
        name: "加拿大",
        logoUrl: null
      },
      homeScore: null,
      awayScore: null,
      hasAiPrediction: false,
      canRequestPrediction: true
    });
    expect(JSON.stringify(body)).not.toContain("api_key");
    expect(JSON.stringify(body)).not.toContain("raw_response");

    await app.close();
  });
});
