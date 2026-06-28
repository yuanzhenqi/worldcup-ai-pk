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
        },
        {
          poolCode: "HHAD",
          options: [
            { code: "h", label: "让球主胜", value: "2.40", goalLine: "-2.00" },
            { code: "d", label: "让球平", value: "3.50", goalLine: "-2.00" },
            { code: "a", label: "让球客胜", value: "2.70", goalLine: "-2.00" }
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

  it("accepts code-fenced skip output as a hold slip", () => {
    expect(
      parseBettingArenaSlip(
        [
          "```json",
          JSON.stringify({
            action: "skip",
            total_stake: 0,
            singles: [],
            parlays: [],
            strategy_summary: "缺少可用玩法，空仓。",
            risk_level: "none",
            bankroll_plan: {
              reserved: 10000,
              reason: "等待完整玩法快照"
            },
            skip_reasons: ["sportteryPools 为空"],
            data_gaps: ["未注入完整体彩玩法快照"]
          }),
          "```"
        ].join("\n"),
        battleContext,
        accountContext
      )
    ).toMatchObject({
      action: "hold",
      totalStake: 0,
      riskLevel: "low",
      bankrollPlan: JSON.stringify({ reserved: 10000, reason: "等待完整玩法快照" })
    });
  });

  it("normalizes zero-risk hold output", () => {
    expect(
      parseBettingArenaSlip(
        JSON.stringify({
          action: "skip",
          total_stake: 0,
          singles: [],
          parlays: [],
          strategy_summary: "缺少可用玩法，空仓。",
          risk_level: "无风险",
          bankroll_plan: "保留全部资金。",
          skip_reasons: ["sportteryPools 为空"],
          data_gaps: ["未注入完整体彩玩法快照"]
        }),
        battleContext,
        accountContext
      )
    ).toMatchObject({ action: "hold", riskLevel: "low" });

    expect(
      parseBettingArenaSlip(
        JSON.stringify({
          action: "skip",
          total_stake: 0,
          singles: [],
          parlays: [],
          strategy_summary: "缺少可用玩法，空仓。",
          risk_level: "zero",
          bankroll_plan: "保留全部资金。",
          skip_reasons: ["sportteryPools 为空"],
          data_gaps: ["未注入完整体彩玩法快照"]
        }),
        battleContext,
        accountContext
      )
    ).toMatchObject({ action: "hold", riskLevel: "low" });
  });

  it("normalizes uppercase skip output", () => {
    expect(
      parseBettingArenaSlip(
        JSON.stringify({
          action: "SKIP",
          total_stake: 0,
          singles: [],
          parlays: [],
          strategy_summary: "缺少可用玩法，空仓。",
          risk_level: "NONE",
          bankroll_plan: "保留全部资金。",
          skip_reasons: ["sportteryPools 为空"],
          data_gaps: ["未注入完整体彩玩法快照"]
        }),
        battleContext,
        accountContext
      )
    ).toMatchObject({ action: "hold", riskLevel: "low" });
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

  it("rejects bet output missing required top-level fields", () => {
    expect(() =>
      parseBettingArenaSlip(
        JSON.stringify({
          action: "bet",
          risk_level: "medium"
        }),
        battleContext,
        accountContext
      )
    ).toThrow("total_stake must be a number");
  });

  it("rejects hold output with active bet selections", () => {
    expect(() =>
      parseBettingArenaSlip(
        JSON.stringify({
          action: "hold",
          total_stake: 100,
          singles: [
            {
              match_id: "match-1",
              pool_code: "HAD",
              selection_code: "h",
              locked_odds: 1.8,
              stake: 100
            }
          ],
          parlays: [],
          strategy_summary: "空仓但包含投注。",
          risk_level: "low",
          bankroll_plan: "不应投入。",
          skip_reasons: [],
          data_gaps: []
        }),
        battleContext,
        accountContext
      )
    ).toThrow("hold action requires total_stake 0");
  });

  it("accepts common model aliases for betting legs and structured reason arrays", () => {
    const parsed = parseBettingArenaSlip(
      JSON.stringify({
        action: "bet",
        total_stake: 1200,
        singles: [
          {
            matchId: "match-1",
            poolCode: "HAD",
            selection: "h",
            label: "Home 主胜",
            odds: 1.8,
            stake: 1000,
            reasoning: "主胜方向更清晰。"
          }
        ],
        parlays: [
          {
            matches: [
              {
                matchId: "match-1",
                poolCode: "HAD",
                selection: "h",
                label: "Home 主胜",
                odds: 1.8
              },
              {
                matchId: "match-2",
                poolCode: "HAD",
                optionCode: "a",
                optionLabel: "客胜",
                odds: 2.1
              }
            ],
            stake: 200,
            confidence: "low",
            rationale: "小额串关。"
          }
        ],
        strategy_summary: "单关为主，小额串关补充。",
        risk_level: "medium-low",
        bankroll_plan: {
          availableBankroll: 10000,
          totalStakeThisRound: 1200
        },
        skip_reasons: [{ matchId: "match-x", reason: "信息不足，跳过。" }],
        data_gaps: [{ domain: "lineup", note: "首发未确认。" }]
      }),
      battleContext,
      accountContext
    );

    expect(parsed).toMatchObject({
      action: "bet",
      totalStake: 1200,
      potentialReturn: 2556,
      riskLevel: "medium",
      bankrollPlan: JSON.stringify({ availableBankroll: 10000, totalStakeThisRound: 1200 }),
      singles: [
        {
          matchId: "match-1",
          poolCode: "HAD",
          selectionCode: "h",
          selectionLabel: "主胜",
          lockedOdds: 1.8,
          confidence: 0
        }
      ],
      parlays: [
        {
          parlayName: "串关 1",
          combinedOdds: 3.78,
          confidence: 0.4,
          legs: [
            { matchId: "match-1", selectionLabel: "主胜" },
            { matchId: "match-2", selectionLabel: "客胜" }
          ]
        }
      ],
      skipReasons: [JSON.stringify({ matchId: "match-x", reason: "信息不足，跳过。" })],
      dataGaps: [JSON.stringify({ domain: "lineup", note: "首发未确认。" })]
    });
  });

  it("normalizes total stake when a model omits parlay stake from total_stake", () => {
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
            confidence: "medium",
            rationale: "主胜。"
          }
        ],
        parlays: [
          {
            parlay_id: "P001",
            legs: [
              { match_id: "match-1", pool_code: "HAD", selection_code: "h", locked_odds: 1.8 },
              { match_id: "match-2", pool_code: "HAD", selection_code: "a", locked_odds: 2.1 }
            ],
            combined_odds: "3.78",
            stake: 200,
            confidence: "low",
            reason: "小额串关。"
          }
        ],
        strategy_summary: "单关加小串。",
        risk_level: "medium",
        bankroll_plan: "投入控制。",
        skip_reasons: [],
        data_gaps: []
      }),
      battleContext,
      accountContext
    );

    expect(parsed).toMatchObject({
      totalStake: 1200,
      potentialReturn: 2556,
      singles: [{ confidence: 0.6 }],
      parlays: [{ parlayName: "P001", confidence: 0.4 }]
    });
  });

  it("ignores zero-stake parlays and fills missing leg odds from locked options", () => {
    const parsed = parseBettingArenaSlip(
      JSON.stringify({
        action: "bet",
        total_stake: 1500,
        singles: [
          {
            matchId: "match-1",
            poolCode: "HAD",
            selection: "h",
            odds: 1.8,
            stake: 1000
          }
        ],
        parlays: [
          {
            parlayId: "backup",
            legs: [
              { matchId: "match-1", poolCode: "HAD", selection: "h" },
              { matchId: "match-2", poolCode: "HAD", selection: "a" }
            ],
            odds: 3.78,
            stake: 0
          },
          {
            matches: [
              { matchId: "match-1", poolCode: "HAD", selection: "h" },
              { matchId: "match-2", poolCode: "HAD", optionCode: "a" }
            ],
            odds: 3.78,
            stake: 500
          }
        ],
        strategy_summary: "忽略备用串关，保留实际串关。",
        risk_level: "medium",
        bankroll_plan: "投入控制。",
        skip_reasons: [],
        data_gaps: []
      }),
      battleContext,
      accountContext
    );

    expect(parsed).toMatchObject({
      totalStake: 1500,
      parlays: [
        {
          stake: 500,
          combinedOdds: 3.78,
          legs: [
            { matchId: "match-1", lockedOdds: 1.8 },
            { matchId: "match-2", lockedOdds: 2.1 }
          ]
        }
      ]
    });
  });

  it("preserves handicap goal line from locked Sporttery options", () => {
    const parsed = parseBettingArenaSlip(
      JSON.stringify({
        action: "bet",
        total_stake: 200,
        singles: [
          {
            match_id: "match-1",
            pool_code: "HHAD",
            selection_code: "h",
            locked_odds: 2.4,
            stake: 100
          }
        ],
        parlays: [
          {
            parlay_name: "让球串关",
            legs: [
              { match_id: "match-1", pool_code: "HHAD", selection_code: "a", locked_odds: 2.7 },
              { match_id: "match-2", pool_code: "HAD", selection_code: "a", locked_odds: 2.1 }
            ],
            stake: 100
          }
        ],
        strategy_summary: "保留让球线。",
        risk_level: "medium",
        bankroll_plan: "投入 200。",
        skip_reasons: [],
        data_gaps: []
      }),
      battleContext,
      accountContext
    );

    expect(parsed.singles[0]).toMatchObject({ poolCode: "HHAD", goalLine: -2 });
    expect(parsed.parlays[0]?.legs[0]).toMatchObject({ poolCode: "HHAD", goalLine: -2 });
  });

  it("parses portfolio buckets from model output", () => {
    const parsed = parseBettingArenaSlip(
      JSON.stringify({
        action: "bet",
        total_stake: 100,
        singles: [
          {
            matchId: "match-1",
            poolCode: "HAD",
            selectionCode: "h",
            lockedOdds: 1.8,
            stake: 100,
            confidence: 0.62,
            rationale: "命中路径清楚，失败路径是轮换。"
          }
        ],
        parlays: [],
        portfolio_buckets: [
          {
            bucket: "safe",
            label: "稳胆",
            stake: 100,
            rationale: "主队基本面更稳。",
            items: ["match-1 HAD h"]
          },
          {
            bucket: "avoid",
            label: "回避",
            stake: 0,
            rationale: "无外部情报。",
            items: []
          }
        ],
        strategy_summary: "分桶出单。",
        risk_level: "medium",
        bankroll_plan: "投入 1%。",
        skip_reasons: [],
        data_gaps: []
      }),
      battleContext,
      { availableBankroll: 10000 }
    );

    expect(parsed.portfolioBuckets).toEqual([
      { bucket: "safe", label: "稳胆", stake: 100, rationale: "主队基本面更稳。", items: ["match-1 HAD h"] },
      { bucket: "avoid", label: "回避", stake: 0, rationale: "无外部情报。", items: [] }
    ]);
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
