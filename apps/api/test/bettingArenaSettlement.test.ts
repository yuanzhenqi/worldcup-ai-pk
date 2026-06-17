import { describe, expect, it } from "vitest";
import { settleParsedSlip } from "../src/modules/betting-arena/bettingArenaSettlement";

const finishedMatches = [
  { matchId: "match-1", homeScore: 2, awayScore: 1, status: "finished" },
  { matchId: "match-2", homeScore: 0, awayScore: 1, status: "finished" }
];

describe("betting arena settlement", () => {
  it("settles winning and losing single bets", () => {
    expect(
      settleParsedSlip(
        {
          totalStake: 300,
          singles: [
            {
              matchId: "match-1",
              poolCode: "HAD",
              selectionCode: "h",
              selectionLabel: "主胜",
              lockedOdds: 1.8,
              stake: 100,
              confidence: 0.6,
              rationale: ""
            },
            {
              matchId: "match-2",
              poolCode: "HAD",
              selectionCode: "h",
              selectionLabel: "主胜",
              lockedOdds: 1.7,
              stake: 200,
              confidence: 0.6,
              rationale: ""
            }
          ],
          parlays: []
        },
        finishedMatches
      )
    ).toMatchObject({ stake: 300, returnedAmount: 180, profit: -120, status: "settled", hit: false });
  });

  it("settles winning parlay", () => {
    expect(
      settleParsedSlip(
        {
          totalStake: 100,
          singles: [],
          parlays: [
            {
              parlayName: "双关",
              stake: 100,
              combinedOdds: 3.78,
              confidence: 0.5,
              rationale: "",
              legs: [
                { matchId: "match-1", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.8 },
                { matchId: "match-2", poolCode: "HAD", selectionCode: "a", selectionLabel: "客胜", lockedOdds: 2.1 }
              ]
            }
          ]
        },
        finishedMatches
      )
    ).toMatchObject({ stake: 100, returnedAmount: 378, profit: 278, status: "settled", hit: true });
  });

  it("voids slip when a selected match result is unavailable", () => {
    expect(
      settleParsedSlip(
        {
          totalStake: 100,
          singles: [
            {
              matchId: "missing",
              poolCode: "HAD",
              selectionCode: "h",
              selectionLabel: "主胜",
              lockedOdds: 1.8,
              stake: 100,
              confidence: 0.6,
              rationale: ""
            }
          ],
          parlays: []
        },
        finishedMatches
      )
    ).toMatchObject({ stake: 100, returnedAmount: 100, profit: 0, status: "void", hit: false });
  });
});
