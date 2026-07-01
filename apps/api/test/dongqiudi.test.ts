import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDongqiudiIntelSummary } from "../src/modules/context/dongqiudiContextParsers";
import { DongqiudiClient, parseImportantMatchesHtml } from "../src/modules/football/dongqiudiClient";
import { syncDongqiudiMappingsForMatches } from "../src/modules/football/dongqiudiMapping.service";
import { getDongqiudiMappingByFixtureId } from "../src/modules/football/dongqiudiMapping.repository";
import { createTestDatabase } from "./support/testDatabase";
import type { DongqiudiScheduleResponse } from "../src/modules/football/dongqiudiClient";

const preAnalyzeResponse = {
  data: {
    comprehensive: {
      title: "综合实力",
      team_A_score: "43%",
      team_B_score: "57%",
      winner: "team_B",
      data: [
        { title: "近6场交锋", team_A: { match_info: "1胜1平4负" }, team_B: { match_info: "4胜1平1负" }, winner: "team_B" },
        { title: "近10场战绩", team_A: { match_info: "0胜4平6负" }, team_B: { match_info: "3胜3平4负" } },
        { title: "场均进球", team_A: { match_info: "1.0球" }, team_B: { match_info: "1.3球" } },
        { title: "场均失球", team_A: { match_info: "2.5球" }, team_B: { match_info: "1.7球" } },
        { title: "身价", team_A: { match_info: "873万欧" }, team_B: { match_info: "1648万欧" } }
      ]
    },
    statistics: {
      title: "事件统计（近10场）",
      data: [
        { title: "红黄牌", team_A: { match_info: "3.4张" }, team_B: { match_info: "3.2张" } },
        { title: "犯规", team_A: { match_info: "12.4次" }, team_B: { match_info: "10.6次" } }
      ]
    }
  },
  errno: 0,
  message: "success"
};

describe("Dongqiudi intel parser", () => {
  it("parses pre_analyze_data_contrast into a cached summary", () => {
    const result = parseDongqiudiIntelSummary(preAnalyzeResponse);

    expect(result.status).toBe("cached");
    expect(result.summary).toContain("综合实力 主43% : 客57%");
    expect(result.summary).toContain("近6场交锋 主1胜1平4负 / 客4胜1平1负");
    expect(result.summary).toContain("近10场战绩 主0胜4平6负 / 客3胜3平4负");
    expect(result.summary).toContain("身价 主873万欧 / 客1648万欧");
    expect(result.summary).toContain("近10场场均红黄牌 主3.4张 / 客3.2张");
    expect(result.raw).toBe(preAnalyzeResponse);
  });

  it("extracts structured contrast pairs including market value", () => {
    const result = parseDongqiudiIntelSummary(preAnalyzeResponse);
    expect(result.structured).not.toBeNull();
    expect(result.structured?.comprehensive).toEqual({ home: "43%", away: "57%" });
    expect(result.structured?.marketValue).toEqual({ home: "873万欧", away: "1648万欧" });
    expect(result.structured?.h2h).toEqual({ home: "1胜1平4负", away: "4胜1平1负" });
    expect(result.structured?.avgGoals).toEqual({ home: "1.0球", away: "1.3球" });
    expect(result.structured?.cards).toEqual({ home: "3.4张", away: "3.2张" });
  });

  it("returns unavailable when data is null", () => {
    const result = parseDongqiudiIntelSummary({ errno: 1, message: "fail", data: null });
    expect(result.status).toBe("unavailable");
    expect(result.summary).toBe("未获取懂球帝情报");
  });

  it("returns unavailable for an empty response", () => {
    const result = parseDongqiudiIntelSummary({});
    expect(result.status).toBe("unavailable");
  });
});

describe("DongqiudiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches pre_analyze_data_contrast by dongqiudi match id with mobile referer", async () => {
    const body = { data: { comprehensive: { title: "综合实力" } }, errno: 0 };
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
    );

    const client = new DongqiudiClient();
    const result = await client.getPreAnalyzeContrast(54341169);

    expect(result).toEqual(body);
    expect(spy).toHaveBeenCalledWith(
      "https://sport-data.dongqiudi.com/soccer/biz/dqd/match/pre_analyze_data_contrast/54341169?app=dqd",
      expect.objectContaining({ headers: expect.objectContaining({ Referer: "https://m.dongqiudi.com/" }) })
    );
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("forbidden", { status: 403 }));

    const client = new DongqiudiClient();
    await expect(client.getPreAnalyzeContrast(1)).rejects.toThrow(/status 403/);
  });

  it("fetches schedule by season, round and gameweek", async () => {
    const body: DongqiudiScheduleResponse = {
      template: "schedule",
      content: {
        matches: [
          {
            match_id: "54341169",
            team_A_id: "1",
            team_A_name: "德国",
            team_A_short_name: "德国",
            team_B_id: "12",
            team_B_name: "日本",
            team_B_short_name: "日本",
            start_play: "2026-06-22 18:00:00",
            status: "Fixture"
          }
        ]
      }
    };
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
    );

    const client = new DongqiudiClient();
    const result = await client.getSchedule({ seasonId: 10219, roundId: 10918, gameweek: 1 });

    expect(result.content?.matches?.[0]?.match_id).toBe("54341169");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/soccer/biz/data/schedule?season_id=10219&round_id=10918&gameweek=1"),
      expect.objectContaining({ headers: expect.objectContaining({ Referer: "https://m.dongqiudi.com/" }) })
    );
  });

  it("parses important matches from m-site SSR html", async () => {
    const html = `<script>window.__x__=1;var state={"other":"x","matchListStore":{"matchList":[{"match_id":"54329952","team_A_name":"厄瓜多尔","team_B_name":"德国","start_play":"2026-06-25 20:00:00","status":"Fixture"}]}};</script>`;
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(html, { status: 200, headers: { "content-type": "text/html" } })
    );

    const client = new DongqiudiClient();
    const result = await client.getImportantMatches({ tabId: 70 });

    expect(result).toEqual([
      { matchId: 54329952, homeTeamName: "厄瓜多尔", awayTeamName: "德国", kickoffAt: "2026-06-25 20:00:00", status: "Fixture", competitionName: "", roundName: "" }
    ]);
    expect(spy).toHaveBeenCalledWith(
      "https://m.dongqiudi.com/match/70",
      expect.objectContaining({ headers: expect.objectContaining({ Referer: "https://m.dongqiudi.com/" }) })
    );
  });

  it("parses important matches html directly", () => {
    const html = `{"matchListStore":{"matchList":[{"match_id":"111","team_A_name":"a","team_B_name":"b","start_play":"2026-06-25 20:00:00","status":"Fixture"},{"match_id":"222","team_A_name":"c","team_B_name":"d"}]}}`;
    const result = parseImportantMatchesHtml(html);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ matchId: 111, homeTeamName: "a", awayTeamName: "b" });
  });

  it("returns empty when matchList is absent", () => {
    expect(parseImportantMatchesHtml("<html>no match list here</html>")).toEqual([]);
  });
});

describe("Dongqiudi mapping sync", () => {
  function seedMatch(db: ReturnType<typeof createTestDatabase>["db"]) {
    db.prepare(
      `INSERT INTO matches (
        id, api_football_fixture_id, stage, kickoff_at, status, venue,
        home_team_id, home_team_name, away_team_id, away_team_name, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "match-1",
      900111,
      "Group Stage - 1",
      "2026-06-22T10:00:00.000Z",
      "scheduled",
      "Test Stadium",
      "25",
      "Germany",
      "12",
      "Japan",
      "2026-06-21T10:00:00.000Z"
    );
  }

  it("matches dongqiudi fixtures by team name and kickoff time and writes mappings", async () => {
    const { db } = createTestDatabase();
    seedMatch(db);

    const fakeClient = {
      getImportantMatches: vi.fn().mockResolvedValue([
        {
          matchId: 54341169,
          homeTeamName: "德国",
          awayTeamName: "日本",
          kickoffAt: "2026-06-22 18:00:00",
          status: "Fixture",
          competitionName: "世界杯",
          roundName: "小组赛"
        }
      ])
    };

    const result = await syncDongqiudiMappingsForMatches(db, {
      // @ts-expect-error injecting a fake client for testing
      client: fakeClient
    });

    expect(result.matched).toBe(1);
    expect(result.totalDongqiudiMatches).toBe(1);
    expect(getDongqiudiMappingByFixtureId(db, 900111)?.dongqiudiMatchId).toBe(54341169);
  });

  it("leaves unmatched fixtures untouched", async () => {
    const { db } = createTestDatabase();
    seedMatch(db);

    const fakeClient = {
      getImportantMatches: vi.fn().mockResolvedValue([
        {
          matchId: 99999999,
          homeTeamName: "未知球队",
          awayTeamName: "另一支球队",
          kickoffAt: "2026-06-22 18:00:00",
          status: "Fixture",
          competitionName: "世界杯",
          roundName: "小组赛"
        }
      ])
    };

    const result = await syncDongqiudiMappingsForMatches(db, {
      // @ts-expect-error injecting a fake client for testing
      client: fakeClient
    });

    expect(result.matched).toBe(0);
    expect(result.unmatched).toBe(1);
    expect(getDongqiudiMappingByFixtureId(db, 900111)).toBeNull();
  });
});
