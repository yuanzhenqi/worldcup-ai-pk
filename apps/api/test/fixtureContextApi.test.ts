import { describe, expect, it } from "vitest";
import { parseApiFootballFixturePrediction, parseFixtureOddsSummary } from "../src/modules/context/apiFootballContextParsers";

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
