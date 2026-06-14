import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MatchDto, PredictionRunHistoryDto, PredictionRunStatusDto, PromptTemplateConfigDto } from "@worldcup-ai-pk/shared";
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
            kickoffAt: "2026-06-14T19:00:00.000Z",
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
          analysisReport: "详细分析报告正文。"
        }
      ]
    });
    const match = buildMatch({
      id: "scheduled-1",
      kickoffAt: "2026-06-14T12:00:00.000Z",
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
      taskTypes: ["result_1x2", "scoreline"],
      dataOptions: {
        useOdds: false,
        useApiFootballPrediction: false,
        useHeadToHead: true,
        usePlayerLineupInjuries: true,
        useDongqiudiIntel: true
      },
      promptTemplateId: "prompt-1",
      customPrompt: "",
      outputStyle: "concise",
      refreshContext: true
    });
    expect(await screen.findByText("已完成 1 个模型预测")).toBeInTheDocument();
    expect(screen.getByText("综合观点：主胜")).toBeInTheDocument();
    expect(screen.getByText("参考比分：2-1")).toBeInTheDocument();
    expect(screen.getByText("主胜 1 / 平 0 / 客胜 0")).toBeInTheDocument();
    expect(screen.getByText("成功 1 / 失败 0")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "AI 模型" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "胜负手" })).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
    expect(screen.getByText("主队更稳定。")).toBeInTheDocument();
    expect(screen.queryByText("预测请求已创建")).not.toBeInTheDocument();
    expect(screen.queryByText("GPT-4o mini：模型预测完成：GPT-4o mini")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "查看报告" }));
    expect(screen.getAllByText("GPT-4o mini")).toHaveLength(2);
    expect(screen.getByText("2 - 1")).toBeInTheDocument();
    expect(screen.getByText("详细分析报告正文。")).toBeInTheDocument();
  });

  it("opens historical prediction runs from a match card", async () => {
    const match = {
      ...buildMatch({
        id: "scheduled-1",
        kickoffAt: "2026-06-14T12:00:00.000Z",
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
          message: "已完成 1 个模型预测",
          predictionsCount: 1,
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
    expect(screen.getByText("已完成 1 个模型预测")).toBeInTheDocument();
    expect(screen.getByText("GPT-4o mini：模型预测完成：GPT-4o mini")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "查看报告" }));
    expect(screen.getByText("历史详细分析报告正文。")).toBeInTheDocument();
  });

  it("refreshes match context automatically when opening the data card", async () => {
    const match = buildMatch({
      id: "scheduled-1",
      kickoffAt: "2026-06-14T12:00:00.000Z",
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
        { domain: "odds", status: "cached", summary: "主胜 2.10", lastSyncedAt: "2026-06-13T08:00:00.000Z", error: null },
        { domain: "head_to_head", status: "cached", summary: "历史交锋 2 场", lastSyncedAt: "2026-06-13T08:00:00.000Z", error: null },
        { domain: "squad", status: "cached", summary: "伤停 1 人", lastSyncedAt: "2026-06-13T08:00:00.000Z", error: null }
      ]
    });

    render(<FixturesPage matches={[match]} onRefreshMatchContext={onRefreshMatchContext} />);

    await userEvent.click(screen.getByRole("button", { name: "数据" }));

    expect(onRefreshMatchContext).toHaveBeenCalledWith("scheduled-1", {
      useOdds: true,
      useApiFootballPrediction: false,
      useHeadToHead: true,
      usePlayerLineupInjuries: true,
      useDongqiudiIntel: true
    });
    expect(await screen.findByText("历史交锋 2 场")).toBeInTheDocument();
  });

  it("polls prediction run status while models are still running", async () => {
    const match = buildMatch({
      id: "scheduled-1",
      kickoffAt: "2026-06-14T12:00:00.000Z",
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
