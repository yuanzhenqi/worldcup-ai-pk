import { describe, expect, it } from "vitest";
import { parseBettingArenaSlip } from "../src/modules/betting-arena/bettingArenaSlip";

const battleContext = {
  matches: [
    {
      matchId: "match-1",
      sportteryPools: [
        {
          poolCode: "HAD",
          options: [
            { code: "h", label: "主胜", value: "1.80" },
            { code: "d", label: "平", value: "3.20" }
          ]
        }
      ]
    },
    {
      matchId: "match-2",
      sportteryPools: [
        {
          poolCode: "HAD",
          options: [{ code: "a", label: "客胜", value: "2.10" }]
        }
      ]
    }
  ]
};

const accountContext = {
  availableBankroll: 10000
};

const holdSlipJson = JSON.stringify({
  action: "hold",
  total_stake: 0,
  singles: [],
  parlays: [],
  strategy_summary: "今日信息不足，保留资金。",
  risk_level: "low",
  bankroll_plan: "不投入。",
  skip_reasons: ["缺少阵容"],
  data_gaps: ["首发未确认"]
});

describe("betting arena slip parser", () => {
  it("accepts hold output", () => {
    expect(
      parseBettingArenaSlip(
        holdSlipJson,
        battleContext,
        accountContext
      )
    ).toMatchObject({ action: "hold", totalStake: 0, singles: [], parlays: [] });
  });

  it("rejects array-wrapped output instead of extracting an inner object", () => {
    expect(() => parseBettingArenaSlip(`[${holdSlipJson}]`, battleContext, accountContext)).toThrow(
      "Betting arena slip JSON must start with an object"
    );
  });

  it("extracts only the first complete JSON object", () => {
    expect(parseBettingArenaSlip(`${holdSlipJson}\nextra { "ignored": true }`, battleContext, accountContext)).toMatchObject({
      action: "hold",
      totalStake: 0
    });
  });

  it("accepts a valid single bet within the 50 percent daily limit", () => {
    const parsed = parseBettingArenaSlip(
      JSON.stringify({
        action: "bet",
        total_stake: 1000,
        singles: [
          {
            match_id: "match-1",
            pool_code: "HAD",
            selection_code: "h",
            selection_label: "主胜",
            locked_odds: 1.8,
            stake: 1000,
            confidence: 0.62,
            rationale: "主队状态更稳定。"
          }
        ],
        parlays: [],
        strategy_summary: "小仓位参与主胜。",
        risk_level: "medium",
        bankroll_plan: "投入余额 10%。",
        skip_reasons: [],
        data_gaps: []
      }),
      battleContext,
      accountContext
    );

    expect(parsed).toMatchObject({ action: "bet", totalStake: 1000, potentialReturn: 1800 });
  });

  it("rejects stake above 50 percent of available bankroll", () => {
    expect(() =>
      parseBettingArenaSlip(
        JSON.stringify({
          action: "bet",
          total_stake: 6000,
          singles: [],
          parlays: [],
          strategy_summary: "过度投入。",
          risk_level: "high",
          bankroll_plan: "投入 60%。",
          skip_reasons: [],
          data_gaps: []
        }),
        battleContext,
        accountContext
      )
    ).toThrow("total_stake exceeds max daily stake");
  });

  it("rejects unknown match and selection", () => {
    expect(() =>
      parseBettingArenaSlip(
        JSON.stringify({
          action: "bet",
          total_stake: 100,
          singles: [
            {
              match_id: "missing-match",
              pool_code: "HAD",
              selection_code: "h",
              selection_label: "主胜",
              locked_odds: 1.8,
              stake: 100,
              confidence: 0.6,
              rationale: "无效比赛。"
            }
          ],
          parlays: [],
          strategy_summary: "无效。",
          risk_level: "medium",
          bankroll_plan: "小额。",
          skip_reasons: [],
          data_gaps: []
        }),
        battleContext,
        accountContext
      )
    ).toThrow("unknown match_id missing-match");
  });
});
