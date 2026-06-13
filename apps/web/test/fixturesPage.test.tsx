import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FixturesPage } from "../src/pages/FixturesPage";

describe("FixturesPage", () => {
  it("defaults to scheduled fixtures and can switch to finished fixtures", async () => {
    render(
      <FixturesPage
        matches={[
          {
            id: "scheduled-1",
            apiFootballFixtureId: 1,
            stage: "Group Stage - 1",
            kickoffAt: "2026-06-12T19:00:00.000Z",
            status: "scheduled",
            statusLabelZh: "未开始",
            venue: "BMO Field",
            homeTeam: { id: "5529", name: "Canada", displayNameZh: "加拿大", logoUrl: null },
            awayTeam: { id: "1113", name: "Bosnia & Herzegovina", displayNameZh: "波黑", logoUrl: null },
            homeScore: null,
            awayScore: null,
            hasAiPrediction: false,
            canRequestPrediction: true
          },
          {
            id: "finished-1",
            apiFootballFixtureId: 2,
            stage: "Group Stage - 1",
            kickoffAt: "2026-06-11T19:00:00.000Z",
            status: "finished",
            statusLabelZh: "已结束",
            venue: "Estadio Azteca",
            homeTeam: { id: "16", name: "Mexico", displayNameZh: "墨西哥", logoUrl: null },
            awayTeam: { id: "1531", name: "South Africa", displayNameZh: "南非", logoUrl: null },
            homeScore: 2,
            awayScore: 0,
            hasAiPrediction: false,
            canRequestPrediction: false
          }
        ]}
      />
    );

    expect(screen.getByText("加拿大")).toBeInTheDocument();
    expect(screen.getAllByText("小组赛第 1 轮").length).toBeGreaterThan(0);
    expect(screen.queryByText("墨西哥")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "已结束" }));
    expect(screen.getByText("墨西哥")).toBeInTheDocument();
    expect(screen.getByText("2 - 0")).toBeInTheDocument();
  });
});
