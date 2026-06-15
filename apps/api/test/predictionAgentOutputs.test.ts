import { describe, expect, it } from "vitest";
import { parseMatchAnalysisOutput, parseSingleCombinationOutput } from "../src/modules/predictions/predictionAgentOutputs";

describe("prediction agent output parsers", () => {
  it("parses match analysis output", () => {
    expect(
      parseMatchAnalysisOutput(
        JSON.stringify({
          predicted_result: "home",
          predicted_home_score: 2,
          predicted_away_score: 1,
          confidence: 0.66,
          short_reason: "主队攻防更均衡。",
          key_factors: ["近期状态", "阵容完整性"],
          risk_points: ["客队反击速度"],
          analysis_report: "主队控球更稳定，客队依赖转换。",
          data_gaps: ["未获取首发名单"]
        })
      )
    ).toEqual({
      predictedResult: "home",
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      confidence: 0.66,
      shortReason: "主队攻防更均衡。",
      keyFactors: ["近期状态", "阵容完整性"],
      riskPoints: ["客队反击速度"],
      analysisReport: "主队控球更稳定，客队依赖转换。",
      dataGaps: ["未获取首发名单"]
    });
  });

  it("parses fenced match analysis JSON", () => {
    expect(
      parseMatchAnalysisOutput(
        "```json\n" +
          JSON.stringify({
            predicted_result: "draw",
            predicted_home_score: 1,
            predicted_away_score: 1,
            confidence: 0.51,
            short_reason: "双方均衡。",
            key_factors: ["中场接近"],
            risk_points: ["定位球"],
            analysis_report: "比赛节奏接近。",
            data_gaps: []
          }) +
          "\n```"
      )
    ).toMatchObject({ predictedResult: "draw", predictedHomeScore: 1, predictedAwayScore: 1 });
  });

  it("parses prose wrapped match analysis JSON", () => {
    expect(
      parseMatchAnalysisOutput(
        "分析如下：" +
          JSON.stringify({
            predicted_result: "away",
            predicted_home_score: 0,
            predicted_away_score: 1,
            confidence: 0.6,
            short_reason: "客队反击更清晰。",
            key_factors: ["反击"],
            risk_points: ["主队压迫"],
            analysis_report: "客队转换效率更高。",
            data_gaps: []
          }) +
          "请参考。"
      )
    ).toMatchObject({ predictedResult: "away", predictedHomeScore: 0, predictedAwayScore: 1 });
  });

  it("throws a clear error for malformed JSON", () => {
    expect(() => parseMatchAnalysisOutput("not json")).toThrow("AI response JSON parse failed: object braces not found");
    expect(() => parseMatchAnalysisOutput("{bad json}")).toThrow(/AI response JSON parse failed:/);
  });

  it("rejects top-level non-object JSON", () => {
    expect(() => parseMatchAnalysisOutput("```json\n[1,2]\n```")).toThrow("AI response JSON must be an object");
  });

  it("rejects invalid match analysis fields", () => {
    const base = {
      predicted_result: "home",
      predicted_home_score: 2,
      predicted_away_score: 1,
      confidence: 0.66,
      short_reason: "主队更稳。",
      key_factors: ["状态"],
      risk_points: ["反击"],
      analysis_report: "主队更稳。",
      data_gaps: []
    };
    expect(() => parseMatchAnalysisOutput(JSON.stringify({ ...base, predicted_result: "bad" }))).toThrow("AI response field predicted_result is invalid");
    expect(() => parseMatchAnalysisOutput(JSON.stringify({ ...base, confidence: 2 }))).toThrow("AI response field confidence must be between 0 and 1");
    expect(() => parseMatchAnalysisOutput(JSON.stringify({ ...base, key_factors: "状态" }))).toThrow("AI response field key_factors must be a string array");
  });

  it("parses single combination output", () => {
    expect(
      parseSingleCombinationOutput(
        JSON.stringify({
          summary: "主队小胜路径更清晰，组合以主胜和小比分保护为主。",
          primary_plan: {
            plan_name: "稳健单场",
            risk_level: "medium",
            legs: [
              {
                pool_code: "HAD",
                selection_code: "h",
                selection_label: "主胜",
                reason: "Agent A 判断主队胜面更高。"
              }
            ],
            stake_units: 2,
            expected_scenario: "主队 2-1 或 1-0。",
            avoid_reason: null
          },
          backup_plans: [],
          pass_recommendation: "可低注参与。",
          risk_warnings: ["临场阵容缺失会提高不确定性"],
          data_gaps: ["未获取首发名单"]
        })
      )
    ).toMatchObject({
      summary: "主队小胜路径更清晰，组合以主胜和小比分保护为主。",
      primaryPlan: {
        planName: "稳健单场",
        riskLevel: "medium",
        stakeUnits: 2
      },
      backupPlans: [],
      passRecommendation: "可低注参与。",
      riskWarnings: ["临场阵容缺失会提高不确定性"],
      dataGaps: ["未获取首发名单"]
    });
  });

  it("parses non-empty backup plans", () => {
    const parsed = parseSingleCombinationOutput(JSON.stringify({
      summary: "主队小胜路径更清晰。",
      primary_plan: {
        plan_name: "主胜方案",
        risk_level: "medium",
        legs: [{ pool_code: "HAD", selection_code: "h", selection_label: "主胜", reason: "主队更稳。" }],
        stake_units: 2,
        expected_scenario: "2-1",
        avoid_reason: null
      },
      backup_plans: [
        {
          plan_name: "比分保护",
          risk_level: "high",
          legs: [{ pool_code: "CRS", selection_code: "2:1", selection_label: "2:1", reason: "贴合 Agent A 比分。" }],
          stake_units: 1,
          expected_scenario: "2-1",
          avoid_reason: "比分池缺失时放弃"
        }
      ],
      pass_recommendation: "可低注参与。",
      risk_warnings: [],
      data_gaps: []
    }));
    expect(parsed.backupPlans).toHaveLength(1);
    expect(parsed.backupPlans[0]).toMatchObject({ planName: "比分保护", riskLevel: "high" });
  });

  it("rejects invalid single-combination nested fields", () => {
    const base = {
      summary: "主队小胜路径更清晰。",
      primary_plan: {
        plan_name: "主胜方案",
        risk_level: "medium",
        legs: [{ pool_code: "HAD", selection_code: "h", selection_label: "主胜", reason: "主队更稳。" }],
        stake_units: 2,
        expected_scenario: "2-1",
        avoid_reason: null
      },
      backup_plans: [],
      pass_recommendation: "可低注参与。",
      risk_warnings: [],
      data_gaps: []
    };
    expect(() => parseSingleCombinationOutput(JSON.stringify({ ...base, primary_plan: { ...base.primary_plan, risk_level: "very_high" } }))).toThrow("AI response field primary_plan.risk_level is invalid");
    expect(() => parseSingleCombinationOutput(JSON.stringify({ ...base, primary_plan: { ...base.primary_plan, legs: [{ pool_code: "HAD" }] } }))).toThrow("AI response field primary_plan.legs[0].selection_code must be a string");
  });
});
