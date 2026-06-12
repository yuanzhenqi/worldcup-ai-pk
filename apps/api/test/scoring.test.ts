import { describe, expect, it } from "vitest";
import { scorePrediction } from "../src/modules/predictions/scoring";

describe("scorePrediction", () => {
  it("awards 10 points for exact score", () => {
    expect(scorePrediction({ homeScore: 1, awayScore: 1 }, { homeScore: 1, awayScore: 1 })).toEqual({
      resultPoints: 3,
      exactScorePoints: 5,
      homeGoalsPoints: 1,
      awayGoalsPoints: 1,
      totalPoints: 10
    });
  });

  it("awards result and one goal point", () => {
    expect(scorePrediction({ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 0 })).toEqual({
      resultPoints: 3,
      exactScorePoints: 0,
      homeGoalsPoints: 1,
      awayGoalsPoints: 0,
      totalPoints: 4
    });
  });

  it("awards no result points when outcome is wrong", () => {
    expect(scorePrediction({ homeScore: 0, awayScore: 1 }, { homeScore: 1, awayScore: 0 })).toEqual({
      resultPoints: 0,
      exactScorePoints: 0,
      homeGoalsPoints: 0,
      awayGoalsPoints: 0,
      totalPoints: 0
    });
  });
});
