import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDongqiudiIntelSummary } from "../src/modules/context/dongqiudiContextParsers";
import { DongqiudiClient } from "../src/modules/football/dongqiudiClient";

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
});
