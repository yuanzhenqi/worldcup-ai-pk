import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LeaderboardPage } from "../src/pages/LeaderboardPage";

describe("LeaderboardPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders leaderboard summary cards and switches scoring views", async () => {
    const user = userEvent.setup();

    render(
      <LeaderboardPage
        leaderboard={{
          settledRows: [
            {
              modelId: "model-overall",
              modelDisplayName: "Overall-M1",
              totalScore: 18,
              finishedMatchesCounted: 4,
              resultHits: 3,
              resultAccuracy: 0.75,
              exactScoreHits: 0,
              recentScores: [3, 5, 5, 5]
            },
            {
              modelId: "model-score",
              modelDisplayName: "Score-M2",
              totalScore: 9,
              finishedMatchesCounted: 2,
              resultHits: 2,
              resultAccuracy: 1,
              exactScoreHits: 2,
              recentScores: [5, 4]
            },
            {
              modelId: "model-result",
              modelDisplayName: "Result-M3",
              totalScore: 12,
              finishedMatchesCounted: 3,
              resultHits: 2,
              resultAccuracy: 0.67,
              exactScoreHits: 1,
              recentScores: [5, 3, 4]
            }
          ],
          activeRows: [
            {
              modelId: "model-active",
              modelDisplayName: "Active-M4",
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
    expect(screen.getByText("综合榜第一名")).toBeInTheDocument();
    expect(screen.getByText("胜平负榜第一名")).toBeInTheDocument();
    expect(screen.getByText("比分榜第一名")).toBeInTheDocument();

    const settledSection = screen.getByTestId("settled-leaderboard");
    expect(within(settledSection).getByRole("button", { name: "综合榜" })).toHaveAttribute("aria-pressed", "true");
    expect(within(settledSection).getAllByText("Overall-M1").length).toBeGreaterThan(0);
    expect(within(settledSection).getByText("最近得分")).toBeInTheDocument();
    expect(within(settledSection).getByText("3 / 5 / 5 / 5")).toBeInTheDocument();

    await user.click(within(settledSection).getByRole("button", { name: "胜平负榜" }));
    expect(within(settledSection).getByRole("button", { name: "胜平负榜" })).toHaveAttribute("aria-pressed", "true");
    expect(within(settledSection).getAllByTestId("settled-rank-card")[0]).toHaveTextContent("Overall-M1");
    expect(within(settledSection).getAllByTestId("settled-rank-card")[1]).toHaveTextContent("Score-M2");
    expect(within(settledSection).getAllByTestId("settled-rank-card")[2]).toHaveTextContent("Result-M3");
    expect(within(settledSection).getByText("胜平负命中率")).toBeInTheDocument();

    await user.click(within(settledSection).getByRole("button", { name: "比分榜" }));
    expect(within(settledSection).getByRole("button", { name: "比分榜" })).toHaveAttribute("aria-pressed", "true");
    expect(within(settledSection).getAllByTestId("settled-rank-card")[0]).toHaveTextContent("Score-M2");
    expect(within(settledSection).getByText("比分全中")).toBeInTheDocument();

    const activeSection = screen.getByTestId("active-leaderboard");
    expect(within(activeSection).getByText("Active-M4")).toBeInTheDocument();
    expect(within(activeSection).getByText("1 / 1 / 1")).toBeInTheDocument();
    expect(within(activeSection).getByText("72%")).toBeInTheDocument();
  });

  it("renders empty states for both leaderboard sections", () => {
    render(<LeaderboardPage leaderboard={{ settledRows: [], activeRows: [] }} />);

    expect(screen.getByText("暂无已结算预测")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "综合榜" })).not.toBeInTheDocument();
    expect(screen.getByText("暂无预测活动")).toBeInTheDocument();
  });
});
