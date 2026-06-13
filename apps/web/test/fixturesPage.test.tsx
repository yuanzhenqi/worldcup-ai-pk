import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MatchDto } from "@worldcup-ai-pk/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FixturesPage } from "../src/pages/FixturesPage";

function buildMatch(input: {
  id: string;
  kickoffAt: string;
  status: MatchDto["status"];
  homeDisplayNameZh: string;
  homeName: string;
  awayDisplayNameZh: string;
  awayName: string;
  homeScore?: number | null;
  awayScore?: number | null;
}): MatchDto {
  return {
    id: input.id,
    apiFootballFixtureId: Number(input.id.replace(/\D/g, "")),
    stage: "Group Stage - 1",
    kickoffAt: input.kickoffAt,
    status: input.status,
    statusLabelZh: input.status === "finished" ? "已结束" : input.status === "live" ? "进行中" : "未开始",
    venue: "BMO Field",
    homeTeam: { id: `${input.id}-home`, name: input.homeName, displayNameZh: input.homeDisplayNameZh, logoUrl: null },
    awayTeam: { id: `${input.id}-away`, name: input.awayName, displayNameZh: input.awayDisplayNameZh, logoUrl: null },
    homeScore: input.homeScore ?? null,
    awayScore: input.awayScore ?? null,
    hasAiPrediction: false,
    canRequestPrediction: input.status === "scheduled"
  };
}

describe("FixturesPage", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

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

  it("shows only the next three natural dates for scheduled fixtures before expanding the folded section", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T08:00:00.000Z"));

    render(
      <FixturesPage
        matches={[
          buildMatch({
            id: "scheduled-1",
            kickoffAt: "2026-06-13T12:00:00.000Z",
            status: "scheduled",
            homeDisplayNameZh: "美国",
            homeName: "USA",
            awayDisplayNameZh: "巴拉圭",
            awayName: "Paraguay"
          }),
          buildMatch({
            id: "scheduled-2",
            kickoffAt: "2026-06-14T12:00:00.000Z",
            status: "scheduled",
            homeDisplayNameZh: "澳大利亚",
            homeName: "Australia",
            awayDisplayNameZh: "土耳其",
            awayName: "Türkiye"
          }),
          buildMatch({
            id: "scheduled-3",
            kickoffAt: "2026-06-15T12:00:00.000Z",
            status: "scheduled",
            homeDisplayNameZh: "西班牙",
            homeName: "Spain",
            awayDisplayNameZh: "佛得角",
            awayName: "Cape Verde Islands"
          }),
          buildMatch({
            id: "scheduled-4",
            kickoffAt: "2026-06-16T12:00:00.000Z",
            status: "scheduled",
            homeDisplayNameZh: "法国",
            homeName: "France",
            awayDisplayNameZh: "塞内加尔",
            awayName: "Senegal"
          }),
          buildMatch({
            id: "finished-1",
            kickoffAt: "2026-06-12T12:00:00.000Z",
            status: "finished",
            homeDisplayNameZh: "墨西哥",
            homeName: "Mexico",
            awayDisplayNameZh: "南非",
            awayName: "South Africa",
            homeScore: 2,
            awayScore: 0
          })
        ]}
      />
    );

    expect(screen.getByText("美国")).toBeInTheDocument();
    expect(screen.getByText("澳大利亚")).toBeInTheDocument();
    expect(screen.getByText("西班牙")).toBeInTheDocument();
    expect(screen.queryByText("法国")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "其余 1 场未开始比赛" }));
    expect(screen.getByText("法国")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "已结束" }));
    expect(screen.getByText("墨西哥")).toBeInTheDocument();
    expect(screen.getByText("2 - 0")).toBeInTheDocument();
  });
});
