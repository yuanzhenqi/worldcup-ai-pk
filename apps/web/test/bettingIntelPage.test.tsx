import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { BettingArenaDto } from "@worldcup-ai-pk/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BettingIntelPage } from "../src/pages/BettingIntelPage";

const arena: BettingArenaDto = {
  accounts: [],
  slips: [],
  history: [],
  currentRound: {
    id: "round-1",
    roundDate: "2026-06-23",
    roundSequence: 1,
    status: "locked",
    lockTime: "2026-06-23T10:00:00.000Z",
    eligibleMatchCount: 1,
    modelsCount: 1,
    totalStaked: 0,
    potentialReturn: 0,
    settledReturn: 0,
    battleContext: {
      roundDate: "2026-06-23",
      lockTime: "2026-06-23T10:00:00.000Z",
      matches: [
        {
          matchId: "match-1",
          kickoffAt: "2026-06-24T12:00:00.000Z",
          status: "scheduled",
          homeScore: null,
          awayScore: null,
          homeTeamName: "德国",
          awayTeamName: "日本",
          contextDomains: [
            { domain: "dongqiudi_intel", status: "cached", summary: "懂球帝显示德国控球优势明显。", error: null },
            { domain: "sporttery", status: "cached", summary: "体彩玩法已缓存。", error: null },
            { domain: "team_profile", status: "cached", summary: "球队资料已缓存。", error: null }
          ],
          sportteryPools: [
            {
              poolCode: "HAD",
              options: [
                { code: "h", label: "主胜", value: "1.85" },
                { code: "d", label: "平", value: "3.20" }
              ]
            },
            {
              poolCode: "HHAD",
              options: [{ code: "a", label: "让负", value: "1.72", goalLine: "-1.00" }]
            }
          ],
          homeTeamProfile: {
            coach: "Home Coach",
            playingStyle: "High press",
            keyPlayers: [{ name: "Home Star", position: "FW", club: "Home Club" }],
            injuries: [{ player: "Home Defender", status: "Doubtful", injury: "Knock" }],
            worldCupHistory: { appearances: 3, bestResult: "Quarter-finals", titles: 0 },
            qualifyingSummary: "Qualified strongly.",
            marketValue: null
          },
          awayTeamProfile: {
            coach: "Away Coach",
            playingStyle: "Compact block",
            keyPlayers: [],
            injuries: [],
            worldCupHistory: { appearances: 1, bestResult: "Group stage", titles: 0 },
            qualifyingSummary: "Playoff route.",
            marketValue: null
          },
          historicalMatchup: {
            totalMatches: 2,
            homeWins: 1,
            draws: 1,
            awayWins: 0,
            summary: "德国历史交锋占优。"
          },
          externalIntel: {
            status: "cached",
            summary: "德国主力前锋可出场。",
            queries: ["Germany Japan predicted lineup", "Germany Japan key players availability"],
            searchResults: [
              {
                title: "Germany lineup report",
                url: "https://example.com/lineup",
                snippet: "Germany expected lineup notes.",
                sourceDomain: "example.com",
                publishedAt: null
              }
            ],
            injuryNews: ["后卫需要赛前评估"],
            lineupNews: ["中场可能轮换"],
            motivation: ["争取提前出线"],
            recentFormNews: ["近三场保持不败"],
            riskSignals: ["轮换幅度不明"],
            sourceLinks: [{ title: "Team news", url: "https://example.com/news", sourceDomain: "example.com", publishedAt: null }],
            confidence: "medium",
            dataGaps: [],
            collectedAt: "2026-06-23T09:00:00.000Z"
          },
          dataGaps: ["暂无球队身价数据源", { source: "external_intel", code: "search_partial_failed", message: "部分外部情报搜索失败：timeout" }]
        }
      ]
    },
    createdAt: "2026-06-23T10:00:00.000Z",
    updatedAt: "2026-06-23T10:00:00.000Z"
  }
};

describe("BettingIntelPage", () => {
  afterEach(() => cleanup());

  it("shows betting input sources, external intelligence groups, and data gaps", () => {
    render(<BettingIntelPage arena={arena} loading={false} error={null} />);

    expect(screen.queryByRole("button", { name: "重新采集情报" })).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "投注输入总览" })).toBeInTheDocument();
    expect(screen.getByText("德国 对 日本")).toBeInTheDocument();
    expect(screen.getByText("胜平负")).toBeInTheDocument();
    expect(screen.getByText("让球胜平负")).toBeInTheDocument();
    expect(screen.getByText("伤停")).toBeInTheDocument();
    expect(screen.getByText("后卫需要赛前评估")).toBeInTheDocument();
    expect(screen.getByText("阵容")).toBeInTheDocument();
    expect(screen.getByText("中场可能轮换")).toBeInTheDocument();
    expect(screen.getByText("动机")).toBeInTheDocument();
    expect(screen.getByText("争取提前出线")).toBeInTheDocument();
    expect(screen.getByText("风险")).toBeInTheDocument();
    expect(screen.getByText("轮换幅度不明")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team news" })).toHaveAttribute("href", "https://example.com/news");
    expect(screen.getAllByText("暂无球队身价数据源").length).toBeGreaterThan(0);
  });

  it("shows an empty state when no betting round exists", () => {
    render(<BettingIntelPage arena={{ accounts: [], currentRound: null, slips: [], history: [] }} loading={false} error={null} />);

    expect(screen.getByText("暂无投注轮次，先在 AI 实盘投注场生成今日出单。")).toBeInTheDocument();
  });

  it("keeps the raw battle context collapsed until requested", () => {
    render(<BettingIntelPage arena={arena} loading={false} error={null} />);

    const details = screen.getByText("完整输入快照").closest("details");
    if (!(details instanceof HTMLDetailsElement)) {
      throw new Error("Raw context details not found");
    }
    expect(details.open).toBe(false);

    fireEvent.click(within(details).getByText("完整输入快照"));
    expect(details.open).toBe(true);
    expect(within(details).getByText(/"matchId": "match-1"/)).toBeInTheDocument();
  });

  it("re-collects current round context through the refresh button", async () => {
    const onRefreshRoundContext = vi.fn().mockResolvedValue(undefined);
    const onReloadRound = vi.fn().mockResolvedValue(arena);
    render(
      <BettingIntelPage
        arena={arena}
        loading={false}
        error={null}
        onRefreshRoundContext={onRefreshRoundContext}
        onReloadRound={onReloadRound}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "重新采集情报" }));

    await screen.findByText("已重新采集当前轮比赛情报，数据已刷新。");
    const roundId = arena.currentRound?.id;
    expect(roundId).toBeTruthy();
    expect(onRefreshRoundContext).toHaveBeenCalledWith(roundId);
    expect(onReloadRound).toHaveBeenCalledWith(roundId);
  });
});
