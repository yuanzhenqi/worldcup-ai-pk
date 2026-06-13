import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MatchDto } from "@worldcup-ai-pk/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { getPublicMatches, listAdminPromptTemplates, syncApiFootballFixtures } from "../src/api/client";

vi.mock("../src/pages/AdminPage", () => ({
  AdminPage: () => null
}));

vi.mock("../src/pages/LeaderboardPage", () => ({
  LeaderboardPage: () => null
}));

vi.mock("../src/api/client", () => ({
  getMatchContext: vi.fn(),
  getMatchPredictionHistory: vi.fn(),
  getPredictionRunStatus: vi.fn(),
  getPublicMatches: vi.fn(),
  listAdminPromptTemplates: vi.fn(),
  refreshMatchContext: vi.fn(),
  requestMatchPrediction: vi.fn(),
  syncApiFootballFixtures: vi.fn()
}));

function buildMatch(input: { status: MatchDto["status"]; homeScore: number | null; awayScore: number | null }): MatchDto {
  return {
    id: "match-1",
    apiFootballFixtureId: 1001,
    stage: "Group Stage - 1",
    kickoffAt: "2026-06-13T12:00:00.000Z",
    status: input.status,
    statusLabelZh: input.status === "finished" ? "已结束" : input.status === "live" ? "进行中" : "未开始",
    venue: "BMO Field",
    homeTeam: { id: "team-home", name: "USA", displayNameZh: "美国", logoUrl: null },
    awayTeam: { id: "team-away", name: "Paraguay", displayNameZh: "巴拉圭", logoUrl: null },
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    hasAiPrediction: false,
    canRequestPrediction: input.status === "scheduled"
  };
}

describe("App", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("syncs API-Football fixtures and reloads public matches on an interval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T08:00:00.000Z"));

    vi.mocked(getPublicMatches)
      .mockResolvedValueOnce([buildMatch({ status: "scheduled", homeScore: null, awayScore: null })])
      .mockResolvedValueOnce([buildMatch({ status: "live", homeScore: 1, awayScore: 1 })]);
    vi.mocked(listAdminPromptTemplates).mockResolvedValue([]);
    vi.mocked(syncApiFootballFixtures).mockResolvedValue({ synced: true, imported: 1 });

    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("美国")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncApiFootballFixtures).toHaveBeenCalledTimes(1);
    expect(getPublicMatches).toHaveBeenCalledTimes(2);
    expect(listAdminPromptTemplates).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "进行中" }));
    expect(screen.getByText("1 - 1")).toBeInTheDocument();
  });
});
