import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { BettingArenaDto } from "@worldcup-ai-pk/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BettingArenaPage } from "../src/pages/BettingArenaPage";

const arena: BettingArenaDto = {
  accounts: [
    {
      modelId: "model-1",
      modelDisplayName: "Model One",
      initialBankroll: 10000,
      availableBankroll: 9800,
      frozenStake: 200,
      totalAssetValue: 10000,
      totalStaked: 200,
      totalReturned: 0,
      returnRate: 0,
      orderCount: 1,
      settledOrderCount: 0,
      hitCount: 0,
      hitRate: 0,
      profitableSlipCount: 0,
      profitableSlipRate: 0,
      settledPickCount: 0,
      hitPickCount: 0,
      pickHitRate: 0,
      failedGenerationCount: 0,
      orderRate: 1,
      failureRate: 0,
      rank: 1,
      lastReview: ""
    }
  ],
  currentRound: {
    id: "round-1",
    roundDate: "2026-06-20",
    roundSequence: 1,
    status: "locked",
    lockTime: "2026-06-20T10:00:00.000Z",
    eligibleMatchCount: 1,
    modelsCount: 1,
    totalStaked: 200,
    potentialReturn: 370,
    settledReturn: 0,
    battleContext: {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: [] },
      matches: [
        {
          matchId: "match-1",
          stage: "Group Stage - 1",
          kickoffAt: "2026-06-21T12:00:00.000Z",
          status: "scheduled",
          homeScore: null,
          awayScore: null,
          venue: "Test Stadium",
          homeTeamName: "德国",
          awayTeamName: "科特迪瓦",
          homeTeamProfile: {
            wc26TeamId: "home",
            coach: "Home Coach",
            playingStyle: "High press",
            keyPlayers: [{ name: "Home Star", position: "FW", club: "Home Club" }],
            worldCupHistory: { appearances: 3, bestResult: "Quarter-finals", titles: 0 },
            qualifyingSummary: "Qualified strongly.",
            injuries: [{ player: "Home Defender", status: "Doubtful", injury: "Knock" }],
            marketValue: null
          },
          awayTeamProfile: {
            wc26TeamId: "away",
            coach: "Away Coach",
            playingStyle: "Compact block",
            keyPlayers: [{ name: "Away Star", position: "MF", club: "Away Club" }],
            worldCupHistory: { appearances: 1, bestResult: "Group stage", titles: 0 },
            qualifyingSummary: "Qualified through playoffs.",
            injuries: [],
            marketValue: null
          },
          historicalMatchup: {
            totalMatches: 2,
            homeWins: 1,
            draws: 1,
            awayWins: 0,
            homeGoals: 3,
            awayGoals: 1,
            summary: "Home have the edge.",
            meetings: []
          },
          contextDomains: [
            { domain: "dongqiudi_intel", status: "cached", summary: "懂球帝情报已缓存", error: null },
            { domain: "sporttery", status: "cached", summary: "体彩数据已缓存", error: null },
            { domain: "team_profile", status: "cached", summary: "球队资料已缓存", error: null }
          ],
          externalIntel: {
            status: "cached",
            summary: "德国主力前锋可出场。",
            injuryNews: ["主力前锋可出场"],
            lineupNews: ["中场可能轮换"],
            motivation: ["争取提前出线"],
            recentFormNews: [],
            riskSignals: ["轮换幅度不明"],
            sourceLinks: [{ title: "Team news", url: "https://example.com/news", sourceDomain: "example.com", publishedAt: null }],
            confidence: "medium",
            dataGaps: [],
            collectedAt: "2026-06-21T10:00:00.000Z"
          },
          sportteryPools: [{ poolCode: "HAD", options: [{ code: "h", label: "主胜", value: "1.85" }] }],
          dataGaps: ["暂无球队身价数据源", { source: "external_intel", code: "search_partial_failed", message: "部分外部情报搜索失败：timeout" }]
        }
      ]
    },
    createdAt: "2026-06-20T10:00:00.000Z",
    updatedAt: "2026-06-20T10:00:00.000Z"
  },
  slips: [
    {
      id: "slip-1",
      roundId: "round-1",
      modelId: "model-1",
      modelDisplayName: "Model One",
      action: "bet",
      status: "accepted",
      totalStake: 200,
      potentialReturn: 370,
      riskLevel: "medium",
      strategySummary: "小额单场。",
      bankrollPlan: "保留大部分资金。",
      singles: [
        {
          matchId: "match-1",
          poolCode: "HAD",
          selectionCode: "h",
          selectionLabel: "主胜",
          lockedOdds: 1.85,
          stake: 200,
          confidence: 0.62,
          rationale: "主队更稳定。"
        }
      ],
      parlays: [],
      skipReasons: [],
      dataGaps: [],
      validationError: null,
      accountContext: { modelId: "model-1", availableBankroll: 10000 },
      prompt: "account_context={}\nbattle_context={}",
      rawResponse: '{"choices":[]}',
      outputJson: '{"action":"bet"}',
      portfolioBuckets: [{ bucket: "safe", label: "稳胆", stake: 200, rationale: "基本面优势明确。", items: ["德国 主胜"] }],
      settlementSummary: null,
      settlement: {
        stake: 200,
        returnedAmount: 370,
        profit: 170,
        status: "settled",
        hit: true,
        settledAt: "2026-06-21T14:00:00.000Z",
        legs: [{ matchId: "match-1", won: true, voided: false }],
        items: [
          {
            type: "single",
            name: null,
            stake: 200,
            returnedAmount: 370,
            won: true,
            voided: false,
            legs: [{ matchId: "match-1", won: true, voided: false }]
          }
        ]
      },
      createdAt: "2026-06-20T10:00:00.000Z"
    }
  ],
  history: [
    {
      roundId: "round-1",
      roundDate: "2026-06-20",
      roundSequence: 1,
      status: "settled",
      totalStaked: 200,
      totalReturned: 370,
      bestModelDisplayName: null,
      worstModelDisplayName: null
    }
  ]
};

describe("BettingArenaPage", () => {
  afterEach(() => {
    cleanup();
  });

  function panelByHeading(name: string): HTMLElement {
    const heading = screen.getByRole("heading", { name });
    const panel = heading.closest("section");
    if (!panel) {
      throw new Error(`Panel section not found for heading: ${name}`);
    }
    return panel;
  }

  it("shows betting input audit data and per-model input output details", () => {
    render(
      <BettingArenaPage
        arena={arena}
        loading={false}
        error={null}
        onTriggerRound={vi.fn()}
        onTriggerModel={vi.fn()}
        onSettleRound={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "投注输入面板" }));
    expect(screen.getByRole("heading", { name: "投注输入面板" })).toBeInTheDocument();
    expect(screen.getAllByText("德国 对 科特迪瓦").length).toBeGreaterThan(0);
    expect(screen.getByText("玩法 1 · 选项 1 · 缺口 2")).toBeInTheDocument();
    fireEvent.click(screen.getByText("德国 对 科特迪瓦"));
    expect(screen.getByText("主队资料")).toBeInTheDocument();
    expect(screen.getByText("数据来源拆解")).toBeInTheDocument();
    expect(screen.getAllByText((_text, element) => element?.textContent?.includes("API-Football：仅赛程") ?? false).length).toBeGreaterThan(0);
    expect(screen.getAllByText((_text, element) => element?.textContent?.includes("体彩：投注玩法与赔率") ?? false).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/懂球帝/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/本地资料/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/外部联网情报/).length).toBeGreaterThan(0);
    expect(screen.getByText((_text, element) => element?.textContent === "外部联网情报：统一采集已缓存：德国主力前锋可出场。")).toBeInTheDocument();
    expect(screen.getByText("外部情报")).toBeInTheDocument();
    expect(screen.getByText("德国主力前锋可出场。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team news" })).toHaveAttribute("href", "https://example.com/news");
    expect(screen.getAllByText(/Home Star/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/暂无球队身价数据源/).length).toBeGreaterThan(0);
    expect(screen.getByText(/external_intel · search_partial_failed：部分外部情报搜索失败：timeout/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Model One 投注详情" }));
    expect(screen.getByRole("heading", { name: "Model One" })).toBeInTheDocument();
    expect(screen.getByText("组合分桶")).toBeInTheDocument();
    expect(screen.getByText("稳胆 · 投入 200")).toBeInTheDocument();
    expect(screen.getByText("输入 / 输出审计")).toBeInTheDocument();
    expect(screen.getByText("提示词拆解")).toBeInTheDocument();
    expect(screen.getByText("提示规则")).toBeInTheDocument();
    expect(screen.getByText("账户上下文")).toBeInTheDocument();
    expect(screen.getByText("比赛数据")).toBeInTheDocument();
    expect(screen.getByText("完整原文")).toBeInTheDocument();
    expect(screen.getByText("结算明细")).toBeInTheDocument();
    expect(screen.getByText("命中 · 返还 370 · 盈亏 170")).toBeInTheDocument();
  });

  it("shows separate bankroll standings metrics and historical settlement rows", () => {
    render(
      <BettingArenaPage
        arena={{
          ...arena,
          accounts: [
            {
              ...arena.accounts[0],
              availableBankroll: 10170,
              totalAssetValue: 10170,
              returnRate: 0.017,
              settledOrderCount: 1,
              hitCount: 1,
              hitRate: 1,
              profitableSlipCount: 1,
              profitableSlipRate: 1,
              settledPickCount: 1,
              hitPickCount: 1,
              pickHitRate: 1
            }
          ]
        }}
        loading={false}
        error={null}
        onTriggerRound={vi.fn()}
        onTriggerModel={vi.fn()}
        onSettleRound={vi.fn()}
      />
    );

    const standingsPanel = panelByHeading("AI 资金榜");
    const ordersPanel = panelByHeading("当前出单");

    expect(within(standingsPanel).getByText("Model One")).toBeInTheDocument();
    expect(within(ordersPanel).getByText("Model One")).toBeInTheDocument();
    expect(within(standingsPanel).getByText("投注项命中率 1/1")).toBeInTheDocument();
    expect(within(standingsPanel).getByText("盈利出单 1/1")).toBeInTheDocument();
    expect(screen.getByText("历史结算")).toBeInTheDocument();
    expect(screen.getAllByText("2026-06-20 第 1 轮").length).toBeGreaterThan(0);
    expect(screen.getAllByText("返还 370").length).toBeGreaterThan(0);
  });

  it("opens full model betting ledger and then opens a historical slip detail", async () => {
    const onLoadLedger = vi.fn().mockResolvedValue({
      items: [{ round: arena.currentRound, slip: arena.slips[0] }],
      total: 1,
      limit: 50,
      offset: 0,
      modelId: null
    });
    render(
      <BettingArenaPage
        arena={arena}
        loading={false}
        error={null}
        onTriggerRound={vi.fn()}
        onTriggerModel={vi.fn()}
        onSettleRound={vi.fn()}
        onLoadLedger={onLoadLedger}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "查看投注账本" }));

    expect(onLoadLedger).toHaveBeenCalledWith({ limit: 50, offset: 0 });
    const ledgerHeading = await screen.findByRole("heading", { name: "投注账本" });
    const ledgerDialog = ledgerHeading.closest('[role="dialog"]');
    if (!(ledgerDialog instanceof HTMLElement)) {
      throw new Error("Ledger dialog not found");
    }
    expect(within(ledgerDialog).getByText("Model One")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看 Model One 2026-06-20 第 1 轮投注明细" }));

    expect(screen.getByRole("heading", { name: "Model One" })).toBeInTheDocument();
    expect(screen.getByText("命中 · 返还 370 · 盈亏 170")).toBeInTheDocument();
  });

  it("loads historical round details and opens one historical model slip", async () => {
    const onLoadRound = vi.fn().mockResolvedValue({
      ...arena,
      currentRound: arena.currentRound
        ? {
            ...arena.currentRound,
            id: "round-history",
            roundDate: "2026-06-19",
            roundSequence: 2
          }
        : null,
      slips: [
        {
          ...arena.slips[0],
          id: "slip-history",
          roundId: "round-history",
          modelDisplayName: "History Model"
        }
      ]
    });
    render(
      <BettingArenaPage
        arena={arena}
        loading={false}
        error={null}
        onTriggerRound={vi.fn()}
        onTriggerModel={vi.fn()}
        onSettleRound={vi.fn()}
        onLoadRound={onLoadRound}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "查看 2026-06-20 第 1 轮历史结算" }));

    expect(onLoadRound).toHaveBeenCalledWith("round-1");
    expect(await screen.findByRole("heading", { name: "历史轮次详情" })).toBeInTheDocument();
    expect(screen.getByText("2026-06-19 第 2 轮")).toBeInTheDocument();
    expect(screen.getByText("History Model")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看 History Model 历史出单" }));

    expect(screen.getByRole("heading", { name: "History Model" })).toBeInTheDocument();
    expect(screen.getByText("结算明细")).toBeInTheDocument();
  });

  it("shows readable match names and locked odds in model slip details", () => {
    render(
      <BettingArenaPage
        arena={arena}
        loading={false}
        error={null}
        onTriggerRound={vi.fn()}
        onTriggerModel={vi.fn()}
        onSettleRound={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Model One 投注详情" }));

    expect(screen.getAllByText("德国 对 科特迪瓦").length).toBeGreaterThan(0);
    expect(screen.getByText("胜平负 · 主胜 · 赔率 1.85 · 投入 200 · 潜在 370")).toBeInTheDocument();
    expect(screen.queryByText("match-1 · HAD · 主胜 · 200")).not.toBeInTheDocument();
  });

  it("shows readable parlay structure in model slip details", () => {
    const parlayArena: BettingArenaDto = {
      ...arena,
      slips: [
        {
          ...arena.slips[0],
          singles: [],
          parlays: [
            {
              parlayName: "稳健双关",
              legs: [
                { matchId: "match-1", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.85 },
                { matchId: "match-1", poolCode: "HHAD", selectionCode: "a", selectionLabel: "让负", lockedOdds: 1.72 }
              ],
              combinedOdds: 3.18,
              stake: 100,
              confidence: 0.58,
              rationale: "两项方向互补。"
            }
          ]
        }
      ]
    };

    render(
      <BettingArenaPage
        arena={parlayArena}
        loading={false}
        error={null}
        onTriggerRound={vi.fn()}
        onTriggerModel={vi.fn()}
        onSettleRound={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Model One 投注详情" }));

    expect(screen.getByText("2 串 1 · 稳健双关 · 组合赔率 3.18 · 投入 100 · 潜在 318")).toBeInTheDocument();
    expect(screen.getByText("德国 对 科特迪瓦 · 胜平负 · 主胜 · 赔率 1.85")).toBeInTheDocument();
    expect(screen.getByText("德国 对 科特迪瓦 · 让球胜平负 · 让负 · 赔率 1.72")).toBeInTheDocument();
  });

  it("lets one model generate a slip and shows result progress", async () => {
    const battleContext = arena.currentRound?.battleContext as Record<string, unknown> & { matches: Array<Record<string, unknown>> };
    const match = battleContext.matches[0];
    const onTriggerModel = vi.fn().mockResolvedValue(arena);
    render(
      <BettingArenaPage
        arena={{
          ...arena,
          currentRound: arena.currentRound
            ? {
                ...arena.currentRound,
                battleContext: {
                  ...battleContext,
                  matches: [{ ...match, status: "finished", homeScore: 2, awayScore: 1 }]
                }
              }
            : null
        }}
        loading={false}
        error={null}
        onTriggerRound={vi.fn()}
        onTriggerModel={onTriggerModel}
        onSettleRound={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "单独生成 Model One" }));

    expect(onTriggerModel).toHaveBeenCalledWith("round-1", "model-1");
    fireEvent.click(screen.getByRole("button", { name: "Model One 投注详情" }));
    expect(screen.getByText("赛果进度 1/1 已出")).toBeInTheDocument();
    expect(screen.getByText("已完赛 2-1")).toBeInTheDocument();
  });

  it("allows multiple model generation buttons to be busy at the same time", async () => {
    let resolveFirst: (value: BettingArenaDto) => void = () => {};
    let resolveSecond: (value: BettingArenaDto) => void = () => {};
    const arenaWithTwoModels: BettingArenaDto = {
      ...arena,
      accounts: [
        arena.accounts[0],
        { ...arena.accounts[0], modelId: "model-2", modelDisplayName: "Model Two", rank: 2 }
      ],
      slips: []
    };
    const first = new Promise<BettingArenaDto>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<BettingArenaDto>((resolve) => {
      resolveSecond = resolve;
    });
    const onTriggerModel = vi.fn((roundId: string, modelId: string) => (modelId === "model-1" ? first : second));
    render(
      <BettingArenaPage
        arena={arenaWithTwoModels}
        loading={false}
        error={null}
        onTriggerRound={vi.fn()}
        onTriggerModel={onTriggerModel}
        onSettleRound={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "单独生成 Model One" }));
    fireEvent.click(screen.getByRole("button", { name: "单独生成 Model Two" }));

    expect(screen.getAllByText("生成中").length).toBe(2);
    expect(screen.getByText("正在生成 2 个模型")).toBeInTheDocument();

    resolveFirst(arenaWithTwoModels);
    resolveSecond(arenaWithTwoModels);
  });
});
