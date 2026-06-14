import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MatchDto, PromptTemplateConfigDto } from "@worldcup-ai-pk/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PredictionRequestDrawer } from "../src/components/PredictionRequestDrawer";

const match: MatchDto = {
  id: "match-1",
  apiFootballFixtureId: 1001,
  stage: "Group Stage - 1",
  kickoffAt: "2026-06-13T19:00:00.000Z",
  status: "scheduled",
  statusLabelZh: "未开始",
  venue: "BMO Field",
  homeTeam: { id: "home", name: "Home", displayNameZh: "主队", logoUrl: null },
  awayTeam: { id: "away", name: "Away", displayNameZh: "客队", logoUrl: null },
  homeScore: null,
  awayScore: null,
  hasAiPrediction: false,
  canRequestPrediction: true
};

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

describe("PredictionRequestDrawer", () => {
  afterEach(cleanup);

  it("submits default task package and data options", () => {
    const onSubmit = vi.fn();
    render(<PredictionRequestDrawer open match={match} promptTemplates={promptTemplates} onClose={vi.fn()} onSubmit={onSubmit} submitting={false} />);

    fireEvent.click(screen.getByRole("button", { name: "开始预测" }));

    expect(onSubmit).toHaveBeenCalledWith({
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
    expect(screen.queryByText("赔率解读")).not.toBeInTheDocument();
    expect(screen.queryByText("使用赔率")).not.toBeInTheDocument();
    expect(screen.queryByText("使用官方预测")).not.toBeInTheDocument();
  });
});
