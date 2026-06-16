import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ParlayCombinationRunDto,
  MatchDto,
  PredictionRunHistoryDto,
  PredictionRunPredictionDto,
  PredictionRunStatusDto,
  PromptTemplateConfigDto
} from "@worldcup-ai-pk/shared";
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

function visibleScheduledKickoff(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).toISOString();
}

function buildPredictionWithSingleCombination(input: { id: string; modelDisplayName: string; planName: string }): PredictionRunPredictionDto {
  return {
    id: input.id,
    modelDisplayName: input.modelDisplayName,
    predictedResult: "home",
    predictedHomeScore: 2,
    predictedAwayScore: 1,
    confidence: 0.72,
    shortReason: "主队更稳定。",
    keyFactors: ["主场"],
    oddsInterpretation: "体彩选项仅作为投注组合背景。",
    riskPoints: ["客队反击"],
    analysisReport: "详细分析报告正文。",
    singleCombination: {
      summary: "主队小胜路径更清晰。",
      primaryPlan: {
        planName: input.planName,
        riskLevel: "medium",
        legs: [{ poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", reason: "主队更稳。" }],
        stakeUnits: 2,
        expectedScenario: "2-1",
        avoidReason: null
      },
      backupPlans: [],
      passRecommendation: "可低注参与。",
      riskWarnings: ["临场阵容缺失会提高不确定性"],
      dataGaps: []
    }
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function buildPredictionHistory(input: {
  matchId: string;
  runId: string;
  predictionId: string;
  modelDisplayName: string;
  planName: string;
}): PredictionRunHistoryDto {
  return {
    matchId: input.matchId,
    runs: [
      {
        runId: input.runId,
        matchId: input.matchId,
        status: "completed",
        message: "已完成 1 个模型预测",
        predictionsCount: 1,
        logs: [],
        predictions: [
          buildPredictionWithSingleCombination({
            id: input.predictionId,
            modelDisplayName: input.modelDisplayName,
            planName: input.planName
          })
        ]
      }
    ]
  };
}

function buildParlayResult(summary: string): ParlayCombinationRunDto {
  return {
    id: "parlay-1",
    matchIds: ["scheduled-1", "scheduled-2"],
    riskLevel: "medium",
    stakeUnits: 2,
    summary,
    plans: [],
    riskWarnings: [],
    createdAt: "2026-06-15T08:00:00.000Z"
  };
}

describe("FixturesPage", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("defaults to scheduled fixtures and can switch to finished fixtures", async () => {
    const { container } = render(
      <FixturesPage
        matches={[
          {
            id: "scheduled-1",
            apiFootballFixtureId: 1,
            stage: "Group Stage - 1",
            kickoffAt: visibleScheduledKickoff(),
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

    expect(screen.getByText("串关工作台")).toBeInTheDocument();
    expect(screen.getByText("从已生成单场组合的比赛中选择 2 场以上")).toBeInTheDocument();
    expect(screen.getByText("加拿大")).toBeInTheDocument();
    expect(screen.getAllByText("小组赛第 1 轮").length).toBeGreaterThan(0);
    expect(screen.queryByText("墨西哥")).not.toBeInTheDocument();
    expect(container.querySelector(".match-card-shell")).toBeInTheDocument();
    expect(container.querySelector(".match-status-block")).toBeInTheDocument();
    expect(container.querySelector(".match-action-stack")).toBeInTheDocument();

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
            kickoffAt: "2026-06-14T12:00:00.000Z",
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

  it("requests a prediction from a scheduled match card", async () => {
    const promptTemplates: PromptTemplateConfigDto[] = [
      {
        id: "prompt-1",
        name: "综合赛前报告",
        description: "综合分析",
        fullPrompt: "prediction_context",
        promptSummary: "综合分析",
        scope: "match_prediction",
        enabled: true,
        isDefault: true
      }
    ];
    const onRequestPrediction = vi.fn().mockResolvedValue({
      matchId: "scheduled-1",
      status: "completed",
      message: "已完成 1 个模型预测",
      scheduledFor: null,
      context: null,
      runId: "run-1",
      predictionsCount: 1,
      logs: [
        {
          level: "info",
          message: "预测请求已创建",
          modelDisplayName: null,
          createdAt: "2026-06-13T08:00:00.000Z"
        },
        {
          level: "info",
          message: "模型预测完成：GPT-4o mini",
          modelDisplayName: "GPT-4o mini",
          createdAt: "2026-06-13T08:00:01.000Z"
        }
      ],
      predictions: [
        {
          id: "prediction-1",
          modelDisplayName: "GPT-4o mini",
          predictedResult: "home",
          predictedHomeScore: 2,
          predictedAwayScore: 1,
          confidence: 0.72,
          shortReason: "主队更稳定。",
          keyFactors: ["赔率", "主场"],
          oddsInterpretation: "主胜赔率更低。",
          riskPoints: ["客队反击"],
          analysisReport: "详细分析报告正文。",
          matchAnalysis: {
            predictedResult: "home",
            predictedHomeScore: 2,
            predictedAwayScore: 1,
            confidence: 0.72,
            shortReason: "主队更稳定。",
            keyFactors: ["主场"],
            riskPoints: ["客队反击"],
            analysisReport: "详细分析报告正文。",
            dataGaps: ["未获取首发名单"]
          },
          singleCombination: {
            summary: "主队小胜路径更清晰，单场组合以主胜保护为主。",
            primaryPlan: {
              planName: "主胜小比分",
              riskLevel: "medium",
              legs: [
                {
                  poolCode: "HAD",
                  selectionCode: "h",
                  selectionLabel: "主胜",
                  reason: "Agent A 判断主队胜面更高。"
                }
              ],
              stakeUnits: 2,
              expectedScenario: "美国 2-1。",
              avoidReason: null
            },
            backupPlans: [],
            passRecommendation: "可低注参与。",
            riskWarnings: ["临场阵容缺失会提高不确定性"],
            dataGaps: ["未获取首发名单"]
          }
        }
      ]
    });
    const match = buildMatch({
      id: "scheduled-1",
      kickoffAt: visibleScheduledKickoff(),
      status: "scheduled",
      homeDisplayNameZh: "美国",
      homeName: "USA",
      awayDisplayNameZh: "巴拉圭",
      awayName: "Paraguay"
    });

    render(<FixturesPage matches={[match]} promptTemplates={promptTemplates} onRequestPrediction={onRequestPrediction} />);

    await userEvent.click(screen.getByRole("button", { name: "预测" }));
    await userEvent.click(screen.getByRole("button", { name: "开始预测" }));

    expect(onRequestPrediction).toHaveBeenCalledWith(match, {
      taskTypes: ["match_analysis", "scoreline", "single_bet_combo"],
      dataOptions: {
        useOdds: false,
        useApiFootballPrediction: false,
        useHeadToHead: false,
        usePlayerLineupInjuries: false,
        useDongqiudiIntel: false,
        useSporttery: true
      },
      promptTemplateId: "prompt-1",
      customPrompt: "",
      outputStyle: "concise",
      refreshContext: true
    });
    expect(await screen.findByText("已完成 1 个模型预测")).toBeInTheDocument();
    expect(screen.getByText("最新组合方案")).toBeInTheDocument();
    const bettingSummary = screen.getByText("最新组合方案").closest(".match-betting-summary");
    expect(bettingSummary).not.toBeNull();
    const bettingSummaryScreen = within(bettingSummary as HTMLElement);
    expect(screen.getByText("主胜小比分")).toBeInTheDocument();
    expect(screen.getByText("中风险 · 2 注")).toBeInTheDocument();
    expect(screen.getByText("主方案")).toBeInTheDocument();
    expect(bettingSummaryScreen.getByText("玩法")).toBeInTheDocument();
    expect(bettingSummaryScreen.getByText("HAD")).toBeInTheDocument();
    expect(bettingSummaryScreen.getByText("选择")).toBeInTheDocument();
    expect(bettingSummaryScreen.getByText("主胜")).toBeInTheDocument();
    expect(bettingSummaryScreen.getByText("触发条件")).toBeInTheDocument();
    expect(bettingSummaryScreen.getByText("美国 2-1。")).toBeInTheDocument();
    expect(screen.getByText("综合观点：主胜")).toBeInTheDocument();
    expect(screen.getByText("参考比分：2-1")).toBeInTheDocument();
    expect(screen.getByText("主胜 1 / 平 0 / 客胜 0")).toBeInTheDocument();
    expect(screen.getByText("成功 1 / 失败 0")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "AI 模型" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "主方案" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "状态" })).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText("HAD · 主胜")).toBeInTheDocument();
    expect(screen.getByText("已生成组合")).toBeInTheDocument();
    expect(screen.queryByText("预测请求已创建")).not.toBeInTheDocument();
    expect(screen.queryByText("GPT-4o mini：模型预测完成：GPT-4o mini")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "查看报告" }));
    expect(screen.getAllByText("GPT-4o mini")).toHaveLength(2);
    expect(screen.getByText("2 - 1")).toBeInTheDocument();
    expect(screen.getByText("详细分析报告正文。")).toBeInTheDocument();
  });

  it("does not treat empty-leg single combinations as generated parlay plans", async () => {
    const prediction = buildPredictionWithSingleCombination({
      id: "prediction-empty-leg",
      modelDisplayName: "GPT-4o mini",
      planName: "空玩法方案"
    });
    prediction.singleCombination!.primaryPlan.legs = [];

    const onRequestPrediction = vi.fn().mockResolvedValue({
      matchId: "scheduled-1",
      status: "completed",
      message: "已完成 1 个模型预测",
      scheduledFor: null,
      context: null,
      runId: "run-empty-leg",
      predictionsCount: 1,
      logs: [],
      predictions: [prediction]
    });
    const match = buildMatch({
      id: "scheduled-1",
      kickoffAt: visibleScheduledKickoff(),
      status: "scheduled",
      homeDisplayNameZh: "美国",
      homeName: "USA",
      awayDisplayNameZh: "巴拉圭",
      awayName: "Paraguay"
    });

    render(<FixturesPage matches={[match]} onRequestPrediction={onRequestPrediction} />);

    await userEvent.click(screen.getByRole("button", { name: "预测" }));
    await userEvent.click(screen.getByRole("button", { name: "开始预测" }));

    expect(await screen.findByText("已完成 1 个模型预测")).toBeInTheDocument();
    expect(screen.getAllByText("未生成").length).toBeGreaterThan(0);
    expect(screen.getByText("仅赛果")).toBeInTheDocument();
    expect(screen.queryByText("最新组合方案")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加入串关" })).not.toBeInTheDocument();
  });

  it("opens historical prediction runs from a match card", async () => {
    const match = {
      ...buildMatch({
        id: "scheduled-1",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "美国",
        homeName: "USA",
        awayDisplayNameZh: "巴拉圭",
        awayName: "Paraguay"
      }),
      hasAiPrediction: true
    };
    const history: PredictionRunHistoryDto = {
      matchId: "scheduled-1",
      runs: [
        {
          runId: "run-1",
          matchId: "scheduled-1",
          status: "completed",
          message: "已完成 2 个模型预测",
          predictionsCount: 2,
          logs: [
            {
              level: "info",
              message: "模型预测完成：GPT-4o mini",
              modelDisplayName: "GPT-4o mini",
              createdAt: "2026-06-13T08:00:01.000Z"
            }
          ],
          predictions: [
            {
              id: "prediction-1",
              modelDisplayName: "GPT-4o mini",
              predictedResult: "home",
              predictedHomeScore: 2,
              predictedAwayScore: 1,
              confidence: 0.72,
              shortReason: "主队更稳定。",
              keyFactors: ["赔率", "主场"],
              oddsInterpretation: "主胜赔率更低。",
              riskPoints: ["客队反击"],
              analysisReport: "历史详细分析报告正文。"
            },
            {
              id: "prediction-2",
              modelDisplayName: "Claude Sonnet",
              predictedResult: "draw",
              predictedHomeScore: 1,
              predictedAwayScore: 1,
              confidence: 0.64,
              shortReason: "双方中场消耗接近。",
              keyFactors: ["控球", "体能"],
              oddsInterpretation: "市场背景仅作记录。",
              riskPoints: ["定位球"],
              analysisReport: "第二个模型的详细报告正文。"
            }
          ]
        }
      ]
    };
    const onLoadPredictionHistory = vi.fn().mockResolvedValue(history);

    render(<FixturesPage matches={[match]} onLoadPredictionHistory={onLoadPredictionHistory} />);

    await userEvent.click(screen.getByRole("button", { name: "历史" }));

    expect(onLoadPredictionHistory).toHaveBeenCalledWith("scheduled-1");
    expect(await screen.findByText("历史预测记录")).toBeInTheDocument();
    const historyDialog = screen.getByRole("dialog", { name: "历史预测记录" });
    const historyDialogScreen = within(historyDialog);
    expect(historyDialog).toHaveClass("bottom-drawer-wide");
    expect(historyDialogScreen.getByText("已完成 2 个模型预测")).toBeInTheDocument();
    expect(historyDialogScreen.getByText("综合观点：主胜")).toBeInTheDocument();
    expect(historyDialogScreen.getByText("参考比分：2-1")).toBeInTheDocument();
    expect(historyDialogScreen.getByText("主胜 1 / 平 1 / 客胜 0")).toBeInTheDocument();
    expect(historyDialogScreen.getByText("成功 2 / 失败 0")).toBeInTheDocument();
    expect(historyDialogScreen.getByRole("columnheader", { name: "AI 模型" })).toBeInTheDocument();
    expect(historyDialogScreen.getByRole("columnheader", { name: "胜负手" })).toBeInTheDocument();
    expect(historyDialogScreen.getByText("GPT-4o mini")).toBeInTheDocument();
    expect(historyDialogScreen.getByText("Claude Sonnet")).toBeInTheDocument();
    expect(historyDialogScreen.getByText("主队更稳定。")).toBeInTheDocument();
    expect(historyDialogScreen.getByText("双方中场消耗接近。")).toBeInTheDocument();
    expect(screen.queryByText("GPT-4o mini：模型预测完成：GPT-4o mini")).not.toBeInTheDocument();

    const modelReportButtons = historyDialogScreen.getAllByRole("button", { name: "查看" });
    await userEvent.click(modelReportButtons[0]);
    expect(screen.getByText("历史详细分析报告正文。")).toBeInTheDocument();
    expect(screen.queryByText("第二个模型的详细报告正文。")).not.toBeInTheDocument();
  });

  it("shows latest historical prediction summary on the match card", async () => {
    const match = {
      ...buildMatch({
        id: "scheduled-1",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "美国",
        homeName: "USA",
        awayDisplayNameZh: "巴拉圭",
        awayName: "Paraguay"
      }),
      hasAiPrediction: true
    };
    const onLoadPredictionHistory = vi.fn().mockResolvedValue({
      matchId: "scheduled-1",
      runs: [
        {
          runId: "run-1",
          matchId: "scheduled-1",
          status: "completed",
          message: "已完成 2 个模型预测",
          predictionsCount: 2,
          logs: [],
          predictions: [
            {
              id: "prediction-1",
              modelDisplayName: "GPT-4o mini",
              predictedResult: "home",
              predictedHomeScore: 2,
              predictedAwayScore: 1,
              confidence: 0.72,
              shortReason: "主队更稳定。",
              keyFactors: [],
              oddsInterpretation: "官方指数仅作背景。",
              riskPoints: [],
              analysisReport: "报告一"
            },
            {
              id: "prediction-2",
              modelDisplayName: "Claude Sonnet",
              predictedResult: "home",
              predictedHomeScore: 2,
              predictedAwayScore: 0,
              confidence: 0.64,
              shortReason: "边路优势明显。",
              keyFactors: [],
              oddsInterpretation: "官方指数仅作背景。",
              riskPoints: [],
              analysisReport: "报告二"
            }
          ]
        }
      ]
    });

    render(<FixturesPage matches={[match]} onLoadPredictionHistory={onLoadPredictionHistory} />);

    expect(await screen.findByText("综合观点：主胜")).toBeInTheDocument();
    expect(screen.getByText("参考比分：2-1")).toBeInTheDocument();
    expect(screen.getByText("主胜 2 / 平 0 / 客胜 0")).toBeInTheDocument();
  });

  it("enables parlay generation after selecting two matches with single plans", async () => {
    const matchOne = {
      ...buildMatch({
        id: "scheduled-1",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "美国",
        homeName: "USA",
        awayDisplayNameZh: "巴拉圭",
        awayName: "Paraguay"
      }),
      hasAiPrediction: true
    };
    const matchTwo = {
      ...buildMatch({
        id: "scheduled-2",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "德国",
        homeName: "Germany",
        awayDisplayNameZh: "库拉索",
        awayName: "Curaçao"
      }),
      hasAiPrediction: true
    };
    const onLoadPredictionHistory = vi
      .fn()
      .mockResolvedValueOnce({
        matchId: "scheduled-1",
        runs: [
          {
            runId: "run-1",
            matchId: "scheduled-1",
            status: "completed",
            message: "已完成 1 个模型预测",
            predictionsCount: 1,
            logs: [],
            predictions: [
              buildPredictionWithSingleCombination({ id: "prediction-1", modelDisplayName: "Doubao", planName: "主胜小比分" })
            ]
          }
        ]
      })
      .mockResolvedValueOnce({
        matchId: "scheduled-2",
        runs: [
          {
            runId: "run-2",
            matchId: "scheduled-2",
            status: "completed",
            message: "已完成 1 个模型预测",
            predictionsCount: 1,
            logs: [],
            predictions: [
              buildPredictionWithSingleCombination({ id: "prediction-2", modelDisplayName: "Qwen", planName: "让球平保护" })
            ]
          }
        ]
      });
    const onCreateParlayCombination = vi.fn().mockResolvedValue({
      id: "parlay-1",
      matchIds: ["scheduled-1", "scheduled-2"],
      riskLevel: "medium",
      stakeUnits: 2,
      summary: "2 场组合：主胜小比分 + 让球平保护",
      plans: [],
      riskWarnings: ["串关会放大单场不确定性，请降低单注预算。"],
      createdAt: "2026-06-15T08:00:00.000Z"
    });

    render(
      <FixturesPage
        matches={[matchOne, matchTwo]}
        onLoadPredictionHistory={onLoadPredictionHistory}
        onCreateParlayCombination={onCreateParlayCombination}
      />
    );

    expect(await screen.findByText("主胜小比分")).toBeInTheDocument();
    expect(await screen.findByText("让球平保护")).toBeInTheDocument();

    const matchOneCard = screen.getByText("美国").closest("article");
    expect(matchOneCard).not.toBeNull();
    await userEvent.click(within(matchOneCard as HTMLElement).getByRole("button", { name: "加入串关" }));
    expect(screen.getByText("已选 1 场")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成串关组合" })).toBeDisabled();

    const matchTwoCard = screen.getByText("德国").closest("article");
    expect(matchTwoCard).not.toBeNull();
    await userEvent.click(within(matchTwoCard as HTMLElement).getByRole("button", { name: "加入串关" }));
    expect(screen.getByText("已选 2 场")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "生成串关组合" }));
    expect(onCreateParlayCombination).toHaveBeenCalledWith({
      matchIds: ["scheduled-1", "scheduled-2"],
      riskLevel: "medium",
      stakeUnits: 2
    });
    expect(await screen.findByText("2 场组合：主胜小比分 + 让球平保护")).toBeInTheDocument();
  });

  it("submits selected parlay match IDs in visible match order when histories resolve out of order", async () => {
    const matchOne = {
      ...buildMatch({
        id: "scheduled-1",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "美国",
        homeName: "USA",
        awayDisplayNameZh: "巴拉圭",
        awayName: "Paraguay"
      }),
      hasAiPrediction: true
    };
    const matchTwo = {
      ...buildMatch({
        id: "scheduled-2",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "德国",
        homeName: "Germany",
        awayDisplayNameZh: "库拉索",
        awayName: "Curaçao"
      }),
      hasAiPrediction: true
    };
    const matchOneHistory = createDeferred<PredictionRunHistoryDto>();
    const matchTwoHistory = createDeferred<PredictionRunHistoryDto>();
    const onLoadPredictionHistory = vi.fn((matchId: string) => {
      if (matchId === "scheduled-1") {
        return matchOneHistory.promise;
      }
      if (matchId === "scheduled-2") {
        return matchTwoHistory.promise;
      }
      return Promise.reject(new Error(`Unexpected match id ${matchId}`));
    });
    const onCreateParlayCombination = vi.fn().mockResolvedValue({
      id: "parlay-1",
      matchIds: ["scheduled-1", "scheduled-2"],
      riskLevel: "medium",
      stakeUnits: 2,
      summary: "2 场组合：主胜小比分 + 让球平保护",
      plans: [],
      riskWarnings: [],
      createdAt: "2026-06-15T08:00:00.000Z"
    });

    render(
      <FixturesPage
        matches={[matchOne, matchTwo]}
        onLoadPredictionHistory={onLoadPredictionHistory}
        onCreateParlayCombination={onCreateParlayCombination}
      />
    );

    await act(async () => {
      matchTwoHistory.resolve(
        buildPredictionHistory({
          matchId: "scheduled-2",
          runId: "run-2",
          predictionId: "prediction-2",
          modelDisplayName: "Qwen",
          planName: "让球平保护"
        })
      );
    });
    expect(await screen.findByText("让球平保护")).toBeInTheDocument();

    await act(async () => {
      matchOneHistory.resolve(
        buildPredictionHistory({
          matchId: "scheduled-1",
          runId: "run-1",
          predictionId: "prediction-1",
          modelDisplayName: "Doubao",
          planName: "主胜小比分"
        })
      );
    });
    expect(await screen.findByText("主胜小比分")).toBeInTheDocument();

    const matchOneCard = screen.getByText("美国").closest("article");
    const matchTwoCard = screen.getByText("德国").closest("article");
    expect(matchOneCard).not.toBeNull();
    expect(matchTwoCard).not.toBeNull();
    await userEvent.click(within(matchOneCard as HTMLElement).getByRole("button", { name: "加入串关" }));
    await userEvent.click(within(matchTwoCard as HTMLElement).getByRole("button", { name: "加入串关" }));
    await userEvent.click(screen.getByRole("button", { name: "生成串关组合" }));

    expect(onCreateParlayCombination).toHaveBeenCalledWith({
      matchIds: ["scheduled-1", "scheduled-2"],
      riskLevel: "medium",
      stakeUnits: 2
    });
  });

  it("normalizes decimal parlay stake units before submit", async () => {
    const matchOne = {
      ...buildMatch({
        id: "scheduled-1",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "美国",
        homeName: "USA",
        awayDisplayNameZh: "巴拉圭",
        awayName: "Paraguay"
      }),
      hasAiPrediction: true
    };
    const matchTwo = {
      ...buildMatch({
        id: "scheduled-2",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "德国",
        homeName: "Germany",
        awayDisplayNameZh: "库拉索",
        awayName: "Curaçao"
      }),
      hasAiPrediction: true
    };
    const onLoadPredictionHistory = vi
      .fn()
      .mockResolvedValueOnce(
        buildPredictionHistory({
          matchId: "scheduled-1",
          runId: "run-1",
          predictionId: "prediction-1",
          modelDisplayName: "Doubao",
          planName: "主胜小比分"
        })
      )
      .mockResolvedValueOnce(
        buildPredictionHistory({
          matchId: "scheduled-2",
          runId: "run-2",
          predictionId: "prediction-2",
          modelDisplayName: "Qwen",
          planName: "让球平保护"
        })
      );
    const onCreateParlayCombination = vi.fn().mockResolvedValue({
      id: "parlay-1",
      matchIds: ["scheduled-1", "scheduled-2"],
      riskLevel: "medium",
      stakeUnits: 1,
      summary: "2 场组合",
      plans: [],
      riskWarnings: [],
      createdAt: "2026-06-15T08:00:00.000Z"
    });

    render(
      <FixturesPage
        matches={[matchOne, matchTwo]}
        onLoadPredictionHistory={onLoadPredictionHistory}
        onCreateParlayCombination={onCreateParlayCombination}
      />
    );

    expect(await screen.findByText("主胜小比分")).toBeInTheDocument();
    expect(await screen.findByText("让球平保护")).toBeInTheDocument();

    const matchOneCard = screen.getByText("美国").closest("article");
    const matchTwoCard = screen.getByText("德国").closest("article");
    expect(matchOneCard).not.toBeNull();
    expect(matchTwoCard).not.toBeNull();
    await userEvent.click(within(matchOneCard as HTMLElement).getByRole("button", { name: "加入串关" }));
    await userEvent.click(within(matchTwoCard as HTMLElement).getByRole("button", { name: "加入串关" }));
    fireEvent.change(screen.getByLabelText("注数"), { target: { value: "1.5" } });
    await userEvent.click(screen.getByRole("button", { name: "生成串关组合" }));

    expect(onCreateParlayCombination).toHaveBeenCalledWith({
      matchIds: ["scheduled-1", "scheduled-2"],
      riskLevel: "medium",
      stakeUnits: 1
    });
  });

  it("clears rendered parlay result when risk or stake changes", async () => {
    const matchOne = {
      ...buildMatch({
        id: "scheduled-1",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "美国",
        homeName: "USA",
        awayDisplayNameZh: "巴拉圭",
        awayName: "Paraguay"
      }),
      hasAiPrediction: true
    };
    const matchTwo = {
      ...buildMatch({
        id: "scheduled-2",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "德国",
        homeName: "Germany",
        awayDisplayNameZh: "库拉索",
        awayName: "Curaçao"
      }),
      hasAiPrediction: true
    };
    const onLoadPredictionHistory = vi
      .fn()
      .mockResolvedValueOnce(
        buildPredictionHistory({
          matchId: "scheduled-1",
          runId: "run-1",
          predictionId: "prediction-1",
          modelDisplayName: "Doubao",
          planName: "主胜小比分"
        })
      )
      .mockResolvedValueOnce(
        buildPredictionHistory({
          matchId: "scheduled-2",
          runId: "run-2",
          predictionId: "prediction-2",
          modelDisplayName: "Qwen",
          planName: "让球平保护"
        })
      );
    const onCreateParlayCombination = vi.fn().mockResolvedValue({
      id: "parlay-1",
      matchIds: ["scheduled-1", "scheduled-2"],
      riskLevel: "medium",
      stakeUnits: 2,
      summary: "旧串关结果",
      plans: [],
      riskWarnings: [],
      createdAt: "2026-06-15T08:00:00.000Z"
    });

    render(
      <FixturesPage
        matches={[matchOne, matchTwo]}
        onLoadPredictionHistory={onLoadPredictionHistory}
        onCreateParlayCombination={onCreateParlayCombination}
      />
    );

    expect(await screen.findByText("主胜小比分")).toBeInTheDocument();
    expect(await screen.findByText("让球平保护")).toBeInTheDocument();

    const matchOneCard = screen.getByText("美国").closest("article");
    const matchTwoCard = screen.getByText("德国").closest("article");
    expect(matchOneCard).not.toBeNull();
    expect(matchTwoCard).not.toBeNull();
    await userEvent.click(within(matchOneCard as HTMLElement).getByRole("button", { name: "加入串关" }));
    await userEvent.click(within(matchTwoCard as HTMLElement).getByRole("button", { name: "加入串关" }));

    await userEvent.click(screen.getByRole("button", { name: "生成串关组合" }));
    expect(await screen.findByText("旧串关结果")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("风险"), { target: { value: "high" } });
    expect(screen.queryByText("旧串关结果")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "生成串关组合" }));
    expect(await screen.findByText("旧串关结果")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("注数"), { target: { value: "3" } });
    expect(screen.queryByText("旧串关结果")).not.toBeInTheDocument();
  });

  it.each([
    {
      name: "risk changes",
      invalidate: async () => {
        fireEvent.change(screen.getByLabelText("风险"), { target: { value: "high" } });
      }
    },
    {
      name: "stake changes",
      invalidate: async () => {
        fireEvent.change(screen.getByLabelText("注数"), { target: { value: "3" } });
      }
    },
    {
      name: "selection changes",
      invalidate: async () => {
        const matchOneCard = screen.getByText("美国").closest("article");
        expect(matchOneCard).not.toBeNull();
        await userEvent.click(within(matchOneCard as HTMLElement).getByRole("button", { name: "已加入" }));
      }
    }
  ])("does not render stale parlay result when $name before generation resolves", async ({ invalidate }) => {
    const matchOne = {
      ...buildMatch({
        id: "scheduled-1",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "美国",
        homeName: "USA",
        awayDisplayNameZh: "巴拉圭",
        awayName: "Paraguay"
      }),
      hasAiPrediction: true
    };
    const matchTwo = {
      ...buildMatch({
        id: "scheduled-2",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "德国",
        homeName: "Germany",
        awayDisplayNameZh: "库拉索",
        awayName: "Curaçao"
      }),
      hasAiPrediction: true
    };
    const onLoadPredictionHistory = vi
      .fn()
      .mockResolvedValueOnce(
        buildPredictionHistory({
          matchId: "scheduled-1",
          runId: "run-1",
          predictionId: "prediction-1",
          modelDisplayName: "Doubao",
          planName: "主胜小比分"
        })
      )
      .mockResolvedValueOnce(
        buildPredictionHistory({
          matchId: "scheduled-2",
          runId: "run-2",
          predictionId: "prediction-2",
          modelDisplayName: "Qwen",
          planName: "让球平保护"
        })
      );
    const parlayRequest = createDeferred<ParlayCombinationRunDto>();
    const onCreateParlayCombination = vi.fn(() => parlayRequest.promise);

    render(
      <FixturesPage
        matches={[matchOne, matchTwo]}
        onLoadPredictionHistory={onLoadPredictionHistory}
        onCreateParlayCombination={onCreateParlayCombination}
      />
    );

    expect(await screen.findByText("主胜小比分")).toBeInTheDocument();
    expect(await screen.findByText("让球平保护")).toBeInTheDocument();

    const matchOneCard = screen.getByText("美国").closest("article");
    const matchTwoCard = screen.getByText("德国").closest("article");
    expect(matchOneCard).not.toBeNull();
    expect(matchTwoCard).not.toBeNull();
    await userEvent.click(within(matchOneCard as HTMLElement).getByRole("button", { name: "加入串关" }));
    await userEvent.click(within(matchTwoCard as HTMLElement).getByRole("button", { name: "加入串关" }));
    await userEvent.click(screen.getByRole("button", { name: "生成串关组合" }));

    await invalidate();

    await act(async () => {
      parlayRequest.resolve(buildParlayResult("过期串关结果"));
    });

    expect(screen.queryByText("过期串关结果")).not.toBeInTheDocument();
  });

  it("prunes selected parlay match IDs when refreshed matches remove a match", async () => {
    const matchOne = {
      ...buildMatch({
        id: "scheduled-1",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "美国",
        homeName: "USA",
        awayDisplayNameZh: "巴拉圭",
        awayName: "Paraguay"
      }),
      hasAiPrediction: true
    };
    const matchTwo = {
      ...buildMatch({
        id: "scheduled-2",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "德国",
        homeName: "Germany",
        awayDisplayNameZh: "库拉索",
        awayName: "Curaçao"
      }),
      hasAiPrediction: true
    };
    const onLoadPredictionHistory = vi
      .fn()
      .mockResolvedValueOnce(
        buildPredictionHistory({
          matchId: "scheduled-1",
          runId: "run-1",
          predictionId: "prediction-1",
          modelDisplayName: "Doubao",
          planName: "主胜小比分"
        })
      )
      .mockResolvedValueOnce(
        buildPredictionHistory({
          matchId: "scheduled-2",
          runId: "run-2",
          predictionId: "prediction-2",
          modelDisplayName: "Qwen",
          planName: "让球平保护"
        })
      );
    const onCreateParlayCombination = vi.fn().mockResolvedValue({
      id: "parlay-1",
      matchIds: ["scheduled-1", "scheduled-2"],
      riskLevel: "medium",
      stakeUnits: 2,
      summary: "2 场组合",
      plans: [],
      riskWarnings: [],
      createdAt: "2026-06-15T08:00:00.000Z"
    });

    const { rerender } = render(
      <FixturesPage
        matches={[matchOne, matchTwo]}
        onLoadPredictionHistory={onLoadPredictionHistory}
        onCreateParlayCombination={onCreateParlayCombination}
      />
    );

    expect(await screen.findByText("主胜小比分")).toBeInTheDocument();
    expect(await screen.findByText("让球平保护")).toBeInTheDocument();

    const matchOneCard = screen.getByText("美国").closest("article");
    const matchTwoCard = screen.getByText("德国").closest("article");
    expect(matchOneCard).not.toBeNull();
    expect(matchTwoCard).not.toBeNull();
    await userEvent.click(within(matchOneCard as HTMLElement).getByRole("button", { name: "加入串关" }));
    await userEvent.click(within(matchTwoCard as HTMLElement).getByRole("button", { name: "加入串关" }));
    expect(screen.getByText("已选 2 场")).toBeInTheDocument();

    rerender(
      <FixturesPage
        matches={[matchOne]}
        onLoadPredictionHistory={onLoadPredictionHistory}
        onCreateParlayCombination={onCreateParlayCombination}
      />
    );

    expect(screen.getByText("已选 1 场")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成串关组合" })).toBeDisabled();
  });

  it("refreshes match context automatically when opening the data card", async () => {
    const match = buildMatch({
      id: "scheduled-1",
      kickoffAt: visibleScheduledKickoff(),
      status: "scheduled",
      homeDisplayNameZh: "美国",
      homeName: "USA",
      awayDisplayNameZh: "巴拉圭",
      awayName: "Paraguay"
    });
    const onRefreshMatchContext = vi.fn().mockResolvedValue({
      matchId: "scheduled-1",
      completeness: "partial",
      createdAt: "2026-06-13T08:00:00.000Z",
      domains: [
        {
          domain: "sporttery",
          status: "cached",
          summary: "官方指数：主1.68/平4.85/客3.05\n历史交锋：6场\n伤停影响：主[无] 客[无]",
          lastSyncedAt: "2026-06-13T08:00:00.000Z",
          error: null
        }
      ]
    });

    render(<FixturesPage matches={[match]} onRefreshMatchContext={onRefreshMatchContext} />);

    await userEvent.click(screen.getByRole("button", { name: "数据" }));

    expect(onRefreshMatchContext).toHaveBeenCalledWith("scheduled-1", {
      useOdds: false,
      useApiFootballPrediction: false,
      useHeadToHead: false,
      usePlayerLineupInjuries: false,
      useDongqiudiIntel: false,
      useSporttery: true
    });
    expect(await screen.findByText("历史交锋")).toBeInTheDocument();
    expect(screen.getByText("6场")).toBeInTheDocument();
  });

  it("polls prediction run status while models are still running", async () => {
    const match = buildMatch({
      id: "scheduled-1",
      kickoffAt: visibleScheduledKickoff(),
      status: "scheduled",
      homeDisplayNameZh: "美国",
      homeName: "USA",
      awayDisplayNameZh: "巴拉圭",
      awayName: "Paraguay"
    });
    const onRequestPrediction = vi.fn().mockResolvedValue({
      matchId: "scheduled-1",
      status: "running",
      message: "模型预测进行中",
      scheduledFor: null,
      context: null,
      runId: "run-1",
      predictionsCount: 0,
      logs: [
        {
          level: "info",
          message: "开始调用模型：GPT-4o mini",
          modelDisplayName: "GPT-4o mini",
          createdAt: "2026-06-13T08:00:00.000Z"
        }
      ],
      predictions: []
    });
    let resolveRunStatus: (value: PredictionRunStatusDto) => void;
    const runStatusPromise = new Promise<PredictionRunStatusDto>((resolve) => {
      resolveRunStatus = resolve;
    });
    const onLoadPredictionRunStatus = vi.fn().mockReturnValue(runStatusPromise);
    const completedStatus: PredictionRunStatusDto = {
      runId: "run-1",
      matchId: "scheduled-1",
      status: "completed",
      message: "已完成 1 个模型预测",
      predictionsCount: 1,
      logs: [
        {
          level: "info",
          message: "开始调用模型：GPT-4o mini",
          modelDisplayName: "GPT-4o mini",
          createdAt: "2026-06-13T08:00:00.000Z"
        },
        {
          level: "info",
          message: "模型预测完成：GPT-4o mini",
          modelDisplayName: "GPT-4o mini",
          createdAt: "2026-06-13T08:00:01.000Z"
        }
      ],
      predictions: []
    };

    render(
      <FixturesPage
        matches={[match]}
        onRequestPrediction={onRequestPrediction}
        onLoadPredictionRunStatus={onLoadPredictionRunStatus}
        predictionPollIntervalMs={1}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "预测" }));
    await userEvent.click(screen.getByRole("button", { name: "开始预测" }));

    expect(await screen.findByText("预测执行中")).toBeInTheDocument();
    expect(screen.getByText("AI 正在生成预测，完成后这里会汇总各模型观点。")).toBeInTheDocument();
    expect(screen.queryByText("GPT-4o mini：开始调用模型：GPT-4o mini")).not.toBeInTheDocument();
    resolveRunStatus!(completedStatus);
    expect(await screen.findByText("已完成 1 个模型预测")).toBeInTheDocument();
    expect(onLoadPredictionRunStatus).toHaveBeenCalledWith("run-1");
  });
});
