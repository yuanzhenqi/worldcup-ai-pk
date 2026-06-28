import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BettingArenaDto, MatchDto } from "@worldcup-ai-pk/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import {
  createParlayCombination,
  getBettingArena,
  getBettingArenaLedger,
  getBettingArenaRound,
  getPublicLeaderboard,
  getPublicMatches,
  listAdminPromptTemplates,
  settleBettingArenaRound,
  syncApiFootballFixtures,
  triggerBettingArenaModel,
  triggerBettingArenaRound
} from "../src/api/client";

vi.mock("../src/pages/AdminPage", () => ({
  AdminPage: () => <section aria-label="后台配置页面">后台配置页面</section>
}));

vi.mock("../src/pages/LeaderboardPage", () => ({
  LeaderboardPage: vi.fn(() => <section aria-label="排行榜页面">排行榜页面</section>)
}));

vi.mock("../src/pages/BettingIntelPage", () => ({
  BettingIntelPage: () => <section aria-label="投注输入与情报页面">投注输入与情报页面</section>
}));

vi.mock("../src/api/client", () => ({
  createParlayCombination: vi.fn(),
  getBettingArena: vi.fn(),
  getBettingArenaLedger: vi.fn(),
  getBettingArenaRound: vi.fn(),
  getMatchContext: vi.fn(),
  getMatchPredictionHistory: vi.fn(),
  getPredictionRunStatus: vi.fn(),
  getPublicLeaderboard: vi.fn(),
  getPublicMatches: vi.fn(),
  listAdminPromptTemplates: vi.fn(),
  refreshMatchContext: vi.fn(),
  requestMatchPrediction: vi.fn(),
  settleBettingArenaRound: vi.fn(),
  syncApiFootballFixtures: vi.fn(),
  triggerBettingArenaModel: vi.fn(),
  triggerBettingArenaRound: vi.fn()
}));

const emptyBettingArena: BettingArenaDto = {
  accounts: [],
  currentRound: null,
  slips: [],
  history: []
};

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

function setupDefaultMocks() {
  vi.mocked(getPublicMatches).mockResolvedValue([buildMatch({ status: "scheduled", homeScore: null, awayScore: null })]);
  vi.mocked(getPublicLeaderboard).mockResolvedValue({ settledRows: [], activeRows: [] });
  vi.mocked(listAdminPromptTemplates).mockResolvedValue([]);
  vi.mocked(syncApiFootballFixtures).mockResolvedValue({ synced: true, imported: 1 });
  vi.mocked(getBettingArena).mockResolvedValue(emptyBettingArena);
  vi.mocked(getBettingArenaLedger).mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0, modelId: null });
  vi.mocked(getBettingArenaRound).mockResolvedValue(emptyBettingArena);
  vi.mocked(createParlayCombination).mockRejectedValue(new Error("not used in this test"));
  vi.mocked(triggerBettingArenaModel).mockResolvedValue(emptyBettingArena);
  vi.mocked(triggerBettingArenaRound).mockResolvedValue(emptyBettingArena);
  vi.mocked(settleBettingArenaRound).mockResolvedValue(emptyBettingArena);
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
    vi.mocked(getPublicLeaderboard)
      .mockResolvedValueOnce({ settledRows: [], activeRows: [] })
      .mockResolvedValueOnce({
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
        activeRows: []
      });
    vi.mocked(listAdminPromptTemplates).mockResolvedValue([]);
    vi.mocked(syncApiFootballFixtures).mockResolvedValue({ synced: true, imported: 1 });
    vi.mocked(getBettingArena).mockResolvedValue(emptyBettingArena);
    vi.mocked(getBettingArenaLedger).mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0, modelId: null });
    vi.mocked(getBettingArenaRound).mockResolvedValue(emptyBettingArena);
    vi.mocked(createParlayCombination).mockRejectedValue(new Error("not used in this test"));
    vi.mocked(triggerBettingArenaModel).mockResolvedValue(emptyBettingArena);
    vi.mocked(triggerBettingArenaRound).mockResolvedValue(emptyBettingArena);
    vi.mocked(settleBettingArenaRound).mockResolvedValue(emptyBettingArena);

    render(<App />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "2026 世界杯 AI 预测竞技场" })).toBeInTheDocument();
    expect(screen.getByText("多模型同场预测，赛后真实结算，用排行榜看谁更懂比赛。")).toBeInTheDocument();
    expect(screen.getByText("美国")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(syncApiFootballFixtures).toHaveBeenCalledTimes(1);
    expect(getPublicMatches).toHaveBeenCalledTimes(2);
    expect(getPublicLeaderboard).toHaveBeenCalledTimes(2);
    expect(listAdminPromptTemplates).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "进行中" }));
    expect(screen.getByText("1 - 1")).toBeInTheDocument();
  });

  it("wires betting arena ledger loading through App", async () => {
    setupDefaultMocks();

    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: /AI 实盘投注场/ }));

    expect(await screen.findByRole("button", { name: "查看投注账本" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看投注账本" }));

    expect(getBettingArenaLedger).toHaveBeenCalledWith({ modelId: null, limit: 50, offset: 0 });
  });

  it("switches major modules through top-level tabs", async () => {
    setupDefaultMocks();

    render(<App />);

    expect(await screen.findByRole("tab", { name: /赛程预测/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByLabelText("排行榜页面")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /AI 实盘投注场/ }));
    expect(await screen.findByRole("button", { name: "生成今日出单" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /投注输入与情报/ }));
    expect(screen.getByLabelText("投注输入与情报页面")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /排行榜/ }));
    expect(screen.getByLabelText("排行榜页面")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /后台配置/ }));
    expect(screen.getByLabelText("后台配置页面")).toBeInTheDocument();
  });
});
