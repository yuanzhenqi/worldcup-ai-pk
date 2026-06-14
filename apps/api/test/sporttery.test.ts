import { afterEach, describe, expect, it, vi } from "vitest";
import { extractOddsForMatch, parseSportterySummary } from "../src/modules/context/sportteryContextParsers";
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
    expect(r.summary).toContain("胜平负赔率 主2.50/平3.20/客2.80");
    expect(r.summary).toContain("让球胜平负 主1.90/平3.50/客3.80(让-1.00)");
    expect(r.summary).toContain("历史交锋 6场 胜50%/平20%/负30%");
    expect(r.summary).toContain("积分榜 主排名1积3 客排名3积0");
    expect(r.summary).toContain("近10场胜率 主70% 客40%");
    expect(r.summary).toContain("伤停 主[穆西亚拉·中场]");
  });

  it("returns unavailable when all empty", () => {
    const r = parseSportterySummary({ odds: [], history: {}, tables: {}, result: {}, feature: {}, injuries: {} });
    expect(r.status).toBe("unavailable");
    expect(r.summary).toBe("未获取体彩数据");
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
