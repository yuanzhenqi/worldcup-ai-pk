import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { parseFixtureHeadToHeadSummary, parseFixtureOddsSummary, parseFixtureSquadSummary } from "../src/modules/context/apiFootballContextParsers";
import { upsertSportteryMapping } from "../src/modules/football/sportteryMapping.repository";
import { saveApiFootballKey, saveSportteryEnabled } from "../src/modules/settings/settings.repository";
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

  it("extracts head-to-head summaries from captured fixture responses", () => {
    expect(
      parseFixtureHeadToHeadSummary({
        response: [
          {
            fixture: { date: "2022-11-21T16:00:00+00:00" },
            teams: { home: { name: "USA" }, away: { name: "Wales" } },
            goals: { home: 1, away: 1 }
          },
          {
            fixture: { date: "2014-11-12T20:00:00+00:00" },
            teams: { home: { name: "Wales" }, away: { name: "USA" } },
            goals: { home: 0, away: 0 }
          }
        ]
      })
    ).toEqual({
      status: "cached",
      summary: "历史交锋 2 场；最近：USA 1-1 Wales；Wales 0-0 USA",
      raw: expect.any(Object)
    });
  });

  it("extracts squad injury and lineup summaries", () => {
    expect(
      parseFixtureSquadSummary({
        injuries: {
          response: [
            { player: { name: "Player A" }, team: { name: "USA" }, player_type: "Midfielder", reason: "Knee Injury" }
          ]
        },
        lineups: {
          response: [
            { team: { name: "USA" }, formation: "4-3-3", startXI: [{ player: { name: "Starter A" } }] }
          ]
        },
        homeSquad: {
          response: [{ players: [{ name: "Starter A" }, { name: "Player B" }] }]
        },
        awaySquad: {
          response: [{ players: [{ name: "Away Player" }] }]
        }
      })
    ).toEqual({
      status: "cached",
      summary: "伤停 1 人：USA Player A Knee Injury；已公布阵容：USA 4-3-3；名单人数：主队 2 人，客队 1 人",
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

  it("refreshes odds head-to-head and squad context for one match", async () => {
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
                fixture: { date: "2022-11-21T16:00:00+00:00" },
                teams: { home: { name: "Home" }, away: { name: "Away" } },
                goals: { home: 1, away: 1 }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ response: [{ player: { name: "Player A" }, team: { name: "Home" }, reason: "Muscle Injury" }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ response: [{ team: { name: "Home" }, formation: "4-4-2", startXI: [] }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ response: [{ players: [{ name: "Home Player" }] }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ response: [{ players: [{ name: "Away Player" }] }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/public/matches/match-1/context/refresh",
      payload: {
        dataOptions: {
          useOdds: true,
          useApiFootballPrediction: false,
          useHeadToHead: true,
          usePlayerLineupInjuries: true,
          useDongqiudiIntel: false,
          useSporttery: false
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchId: "match-1",
      completeness: "full",
      domains: expect.arrayContaining([
        expect.objectContaining({ domain: "odds", status: "cached" }),
        expect.objectContaining({ domain: "api_prediction", status: "not_requested" }),
        expect.objectContaining({ domain: "head_to_head", status: "cached" }),
        expect.objectContaining({ domain: "squad", status: "cached" })
      ])
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "https://v3.football.api-sports.io/fixtures/headtohead?h2h=home-1-away-1",
      expect.any(Object)
    );

    await app.close();
  });

  it("refreshes sporttery context when enabled and mapped", async () => {
    const { db, databasePath } = createTestDatabase();
    insertContextApiMatch(db);
    saveSportteryEnabled(db, true);
    upsertSportteryMapping(db, 1001, 2040170);
    db.close();

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: {
              matchInfoList: [
                {
                  subMatchList: [
                    {
                      matchId: 2040170,
                      oddsList: [
                        { poolCode: "HAD", h: "2.50", d: "3.20", a: "2.80", goalLine: "" },
                        { poolCode: "HHAD", h: "1.90", d: "3.50", a: "3.80", goalLine: "-1.00" }
                      ]
                    }
                  ]
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: {
              statistics: {
                totalLegCnt: "6",
                winProbability: "50%",
                drawProbability: "20%",
                lossProbability: "30%"
              }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: {
              homeTables: { total: { ranking: "1", points: "3" } },
              awayTables: { total: { ranking: "3", points: "0" } }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: {
              home: {
                matchList: [
                  {
                    homeTeamShortName: "主队",
                    homeTeamFullCourtGoalCnt: "3",
                    awayTeamFullCourtGoalCnt: "1",
                    awayTeamShortName: "客队"
                  }
                ]
              },
              away: { matchList: [] }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: {
              eachHomeAway: {
                totalLegCnt: "10",
                homeScoreRatio: "70",
                awayScoreRatio: "40"
              }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            value: {
              home: {
                injuriesAndSuspensionsList: [{ personName: "球员A", playerPositionDesc: "中场" }]
              },
              away: { injuriesAndSuspensionsList: [] }
            }
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
          useOdds: false,
          useApiFootballPrediction: false,
          useHeadToHead: false,
          usePlayerLineupInjuries: false,
          useDongqiudiIntel: false,
          useSporttery: true
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchId: "match-1",
      completeness: "full",
      domains: expect.arrayContaining([
        expect.objectContaining({
          domain: "sporttery",
          status: "cached",
          summary: expect.stringContaining("历史交锋 6场")
        })
      ])
    });
    expect(response.json().domains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "sporttery",
          summary: expect.stringContaining("胜平负赔率 主2.50/平3.20/客2.80")
        }),
        expect.objectContaining({
          domain: "sporttery",
          summary: expect.stringContaining("伤停 主[球员A·中场]")
        })
      ])
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "https://webapi.sporttery.cn/gateway/uniform/football/getMatchListV1.qry?clientCode=3001",
      expect.any(Object)
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);

    await app.close();
  });
});
