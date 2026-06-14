import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LeaderboardPage } from "../src/pages/LeaderboardPage";

describe("LeaderboardPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders settled scoring and prediction activity tables", () => {
    render(
      <LeaderboardPage
        leaderboard={{
          settledRows: [
            {
              modelId: "model-1",
              modelDisplayName: "GPT-4o mini",
              totalScore: 10,
              finishedMatchesCounted: 1,
              resultHits: 1,
              resultAccuracy: 1,
              exactScoreHits: 1,
              recentScores: [10]
            }
          ],
          activeRows: [
            {
              modelId: "model-2",
              modelDisplayName: "Claude Haiku",
              predictionsCount: 4,
              parsedPredictionsCount: 3,
              matchesCovered: 2,
              homeWinVotes: 1,
              drawVotes: 1,
              awayWinVotes: 1,
              averageConfidence: 0.72,
              latestPredictionAt: "2026-06-13T08:00:00.000Z"
            }
          ]
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "模型总榜" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "真实计分榜" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "预测活跃榜" })).toBeInTheDocument();

    const settledSection = screen.getByTestId("settled-leaderboard");
    expect(within(settledSection).getByText("GPT-4o mini")).toBeInTheDocument();
    expect(within(settledSection).getByText("100%")).toBeInTheDocument();
    expect(within(settledSection).getAllByText("10")).toHaveLength(2);

    const activeSection = screen.getByTestId("active-leaderboard");
    expect(within(activeSection).getByText("Claude Haiku")).toBeInTheDocument();
    expect(within(activeSection).getByText("1 / 1 / 1")).toBeInTheDocument();
    expect(within(activeSection).getByText("72%")).toBeInTheDocument();
  });

  it("renders empty states for both leaderboard sections", () => {
    render(<LeaderboardPage leaderboard={{ settledRows: [], activeRows: [] }} />);

    expect(screen.getByText("暂无已结算预测")).toBeInTheDocument();
    expect(screen.getByText("暂无预测活动")).toBeInTheDocument();
  });
});
