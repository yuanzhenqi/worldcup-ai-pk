import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { parseApiFootballFixturePrediction, parseFixtureOddsSummary } from "../src/modules/context/apiFootballContextParsers";
import { saveApiFootballKey } from "../src/modules/settings/settings.repository";
import { createTestDatabase } from "./support/testDatabase";

function insertContextApiMatch(db: ReturnType<typeof createTestDatabase>["db"]) {
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
    "2099-06-13T19:00:00.000Z",
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
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API-Football context parsers", () => {
  it("extracts 1X2 odds from a captured odds response", () => {
    expect(
      parseFixtureOddsSummary({
        response: [
          {
            bookmakers: [
              {
                name: "10Bet",
                bets: [
                  {
                    name: "Match Winner",
                    values: [
                      { value: "Home", odd: "13.50" },
                      { value: "Draw", odd: "6.20" },
                      { value: "Away", odd: "1.21" }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      })
    ).toEqual({
      status: "cached",
      summary: "10Bet：主胜 13.50，平局 6.20，客胜 1.21",
      raw: expect.any(Object)
    });
  });

  it("extracts API-Football official prediction percentages", () => {
    expect(
      parseApiFootballFixturePrediction({
        response: [
          {
            predictions: {
              winner: { id: 1569, name: "Qatar", comment: "Win or draw" },
              advice: "Double chance : Qatar or draw",
              percent: { home: "50%", draw: "50%", away: "0%" }
            }
          }
        ]
      })
    ).toEqual({
      status: "cached",
      summary: "预测赢家：Qatar；建议：Double chance : Qatar or draw；主胜 50%，平局 50%，客胜 0%",
      raw: expect.any(Object)
    });
  });
});

describe("fixture context API", () => {
  it("returns base-only context before refresh", async () => {
    const { db, databasePath } = createTestDatabase();
    insertContextApiMatch(db);
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "GET", url: "/api/public/matches/match-1/context" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchId: "match-1",
      completeness: "base_only",
      createdAt: null
    });

    await app.close();
  });

  it("refreshes odds and official prediction context for one match", async () => {
    const { db, databasePath } = createTestDatabase();
    insertContextApiMatch(db);
    saveApiFootballKey(db, "secret-api-football-key");
    db.close();

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: [
              {
                bookmakers: [
                  {
                    name: "10Bet",
                    bets: [
                      {
                        name: "Match Winner",
                        values: [
                          { value: "Home", odd: "13.50" },
                          { value: "Draw", odd: "6.20" },
                          { value: "Away", odd: "1.21" }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: [
              {
                predictions: {
                  winner: { id: 1569, name: "Qatar", comment: "Win or draw" },
                  advice: "Double chance : Qatar or draw",
                  percent: { home: "50%", draw: "50%", away: "0%" }
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/public/matches/match-1/context/refresh",
      payload: {
        dataOptions: {
          useOdds: true,
          useApiFootballPrediction: true,
          useHeadToHead: true,
          usePlayerLineupInjuries: true
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchId: "match-1",
      completeness: "partial",
      domains: expect.arrayContaining([
        expect.objectContaining({ domain: "odds", status: "cached" }),
        expect.objectContaining({ domain: "api_prediction", status: "cached" }),
        expect.objectContaining({ domain: "head_to_head", status: "unavailable" }),
        expect.objectContaining({ domain: "squad", status: "unavailable" })
      ])
    });

    await app.close();
  });
});
