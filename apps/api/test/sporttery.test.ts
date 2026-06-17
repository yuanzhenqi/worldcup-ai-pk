import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshFixtureContext } from "../src/modules/context/fixtureContext.service";
import { extractOddsForMatch, parseSportteryOddsPools, parseSportterySummary } from "../src/modules/context/sportteryContextParsers";
import { SportteryClient } from "../src/modules/football/sportteryClient";
import { ensureSportteryMappingForFixture, syncSportteryMappingsForMatches } from "../src/modules/football/sportteryMapping.repository";
import { createTestDatabase } from "./support/testDatabase";

const fullInput = {
  odds: [
    { poolCode: "HAD", h: "2.50", d: "3.20", a: "2.80", goalLine: "" },
    { poolCode: "HHAD", h: "1.90", d: "3.50", a: "3.80", goalLine: "-1.00" }
  ],
  history: { value: { statistics: { totalLegCnt: "6", winProbability: "50%", drawProbability: "20%", lossProbability: "30%" } } },
  tables: { value: { homeTables: { total: { ranking: "1", points: "3" } }, awayTables: { total: { ranking: "3", points: "0" } } } },
  result: { value: { home: { matchList: [{ homeTeamShortName: "德国", homeTeamFullCourtGoalCnt: "3", awayTeamFullCourtGoalCnt: "1", awayTeamShortName: "法国" }] }, away: { matchList: [] } } },
  feature: { value: { eachHomeAway: { homeScoreRatio: "70", awayScoreRatio: "40", totalLegCnt: "10" } } },
  injuries: { value: { home: { injuriesAndSuspensionsList: [{ personName: "穆西亚拉", playerPositionDesc: "中场" }] }, away: { injuriesAndSuspensionsList: [] } } }
};

describe("Sporttery parser", () => {
  it("parses 6 dimensions into a cached summary", () => {
    const r = parseSportterySummary(fullInput);
    expect(r.status).toBe("cached");
    expect(r.summary).toContain("官方指数：胜平负 主2.50/平3.20/客2.80；让球胜平负 主1.90/平3.50/客3.80(让-1.00)");
    expect(r.summary).toContain("历史交锋：6场 胜50%/平20%/负30%");
    expect(r.summary).toContain("积分形势：主排名1积3 客排名3积0");
    expect(r.summary).toContain("特征对比：近10场胜率 主70% 客40%");
    expect(r.summary).toContain("伤停影响：主[穆西亚拉·中场] 客[无]");
  });

  it("returns unavailable when all empty", () => {
    const r = parseSportterySummary({ odds: [], history: {}, tables: {}, result: {}, feature: {}, injuries: {} });
    expect(r.status).toBe("unavailable");
    expect(r.summary).toBe("未获取体彩数据");
  });

  it("parses Sporttery HAD and HHAD pools while preserving unavailable pools", () => {
    const pools = parseSportteryOddsPools([
      {
        poolCode: "HAD",
        h: "1.85",
        d: "3.20",
        a: "4.10",
        goalLine: "",
        updateDate: "2026-06-15",
        updateTime: "10:00:00"
      },
      {
        poolCode: "HHAD",
        h: "2.15",
        d: "3.60",
        a: "2.75",
        goalLine: "-1.00",
        updateDate: "2026-06-15",
        updateTime: "10:00:00"
      },
      {
        poolCode: "CRS",
        h: "",
        d: "",
        a: "",
        odds: "",
        updateDate: "2026-06-15",
        updateTime: "10:00:00"
      }
    ]);

    expect(pools).toMatchObject([
      {
        poolCode: "HAD",
        status: "available",
        goalLine: null,
        updateDate: "2026-06-15",
        updateTime: "10:00:00",
        options: [
          { code: "h", label: "主胜", value: "1.85" },
          { code: "d", label: "平", value: "3.20" },
          { code: "a", label: "客胜", value: "4.10" }
        ]
      },
      {
        poolCode: "HHAD",
        status: "available",
        goalLine: "-1.00",
        options: [
          { code: "h", label: "让球主胜", value: "2.15" },
          { code: "d", label: "让球平", value: "3.60" },
          { code: "a", label: "让球客胜", value: "2.75" }
        ]
      },
      {
        poolCode: "CRS",
        status: "unavailable",
        options: []
      }
    ]);
    expect(pools[2]?.raw).toMatchObject({ poolCode: "CRS", odds: "" });
  });

  it("keeps malformed Sporttery odds entries unavailable", () => {
    expect(parseSportteryOddsPools([null, "bad-entry"])).toEqual([
      {
        poolCode: "UNKNOWN",
        status: "unavailable",
        goalLine: null,
        updateDate: null,
        updateTime: null,
        options: [],
        raw: null
      },
      {
        poolCode: "UNKNOWN",
        status: "unavailable",
        goalLine: null,
        updateDate: null,
        updateTime: null,
        options: [],
        raw: "bad-entry"
      }
    ]);
  });

  it("extractOddsForMatch locates the oddsList for a given matchId", () => {
    const resp = { value: { matchInfoList: [{ subMatchList: [{ matchId: 2040170, oddsList: [{ poolCode: "HAD", h: "1.50" }] }] }] } };
    expect(extractOddsForMatch(resp, 2040170)).toEqual([{ poolCode: "HAD", h: "1.50" }]);
    expect(extractOddsForMatch(resp, 99999)).toBeNull();
  });
});

describe("SportteryClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches endpoints with sporttery referer", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ value: {} }), { status: 200, headers: { "content-type": "application/json" } })
    );
    const client = new SportteryClient();
    await client.getMatchList();
    expect(spy).toHaveBeenCalledWith(
      "https://webapi.sporttery.cn/gateway/uniform/football/getMatchListV1.qry?clientCode=3001",
      expect.objectContaining({ headers: expect.objectContaining({ Referer: "https://www.sporttery.cn/" }) })
    );
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 500 }));
    const client = new SportteryClient();
    await expect(client.getResultHistory(1)).rejects.toThrow(/status 500/);
  });
});

describe("Sporttery fixture context refresh", () => {
  it("writes structured odds pools into the raw context snapshot", async () => {
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
    const sportteryClient = {
      getMatchList: async () => ({
        value: {
          matchInfoList: [
            {
              subMatchList: [
                {
                  matchId: 2040170,
                  oddsList: [
                    {
                      poolCode: "HAD",
                      h: "1.85",
                      d: "3.20",
                      a: "4.10",
                      goalLine: "",
                      updateDate: "2026-06-15",
                      updateTime: "10:00:00"
                    }
                  ]
                }
              ]
            }
          ]
        }
      }),
      getResultHistory: async () => ({}),
      getMatchTables: async () => ({}),
      getMatchResult: async () => ({}),
      getMatchFeature: async () => ({}),
      getInjurySuspension: async () => ({})
    } as unknown as SportteryClient;

    await refreshFixtureContext({
      db,
      matchId: "match-1",
      apiFootballFixtureId: 1001,
      homeTeamId: "home-1",
      homeTeamName: "Home",
      awayTeamId: "away-1",
      awayTeamName: "Away",
      footballService: null,
      dongqiudiClient: null,
      dongqiudiMatchId: null,
      sportteryClient,
      sportteryMatchId: 2040170,
      dataOptions: {
        useOdds: false,
        useApiFootballPrediction: false,
        useHeadToHead: false,
        usePlayerLineupInjuries: false,
        useDongqiudiIntel: false,
        useSporttery: true,
        useTeamProfile: false
      },
      now: new Date("2026-06-15T10:00:00.000Z")
    });

    const row = db.prepare("SELECT raw_json FROM fixture_context_snapshots WHERE match_id = ?").get("match-1") as { raw_json: string };
    const raw = JSON.parse(row.raw_json) as { sporttery: { oddsPools: unknown } };
    expect(raw.sporttery.oddsPools).toMatchObject([
      {
        poolCode: "HAD",
        status: "available",
        options: expect.arrayContaining([{ code: "h", label: "主胜", value: "1.85" }])
      }
    ]);
    db.close();
  });
});

describe("Sporttery fixture mapping sync", () => {
  it("syncs exact World Cup Sporttery fixture mappings", () => {
    const { db } = createTestDatabase();
    const result = syncSportteryMappingsForMatches(db, {
      matches: [
        { apiFootballFixtureId: 1001, homeTeamName: "德国", awayTeamName: "库拉索" },
        { apiFootballFixtureId: 1002, homeTeamName: "荷兰", awayTeamName: "日本" }
      ],
      sportteryMatchList: {
        value: {
          matchInfoList: [
            {
              subMatchList: [
                { leagueAbbName: "世界杯", leagueAllName: "世界杯", homeTeamAbbName: "德国", awayTeamAbbName: "库拉索", matchId: 2040170 },
                { leagueAbbName: "芬超", leagueAllName: "芬超", homeTeamAbbName: "荷兰", awayTeamAbbName: "日本", matchId: 9999999 }
              ]
            }
          ]
        }
      }
    });

    expect(result).toEqual({
      matched: 1,
      unmatched: 0,
      totalSportteryMatches: 1
    });
    expect(db.prepare("SELECT api_football_fixture_id, sporttery_match_id FROM fixture_sporttery_mappings").all()).toEqual([
      { api_football_fixture_id: 1001, sporttery_match_id: 2040170 }
    ]);
    db.close();
  });

  it("ensures a single Sporttery mapping when exact names match", () => {
    const { db } = createTestDatabase();
    const mapping = ensureSportteryMappingForFixture(db, {
      apiFootballFixtureId: 1001,
      homeTeamName: "德国",
      awayTeamName: "库拉索",
      sportteryMatchList: {
        value: {
          matchInfoList: [
            {
              subMatchList: [
                { leagueAbbName: "世界杯", leagueAllName: "世界杯", homeTeamAbbName: "德国", awayTeamAbbName: "库拉索", matchId: 2040170 }
              ]
            }
          ]
        }
      }
    });

    expect(mapping).toMatchObject({ apiFootballFixtureId: 1001, sportteryMatchId: 2040170 });
    db.close();
  });
});
