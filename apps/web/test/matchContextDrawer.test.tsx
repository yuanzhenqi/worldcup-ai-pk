import { cleanup, render, screen } from "@testing-library/react";
import type { FixtureContextSummaryDto, MatchDto } from "@worldcup-ai-pk/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchContextDrawer } from "../src/components/MatchContextDrawer";

const match = {
  id: "match-1",
  homeTeam: { displayNameZh: "主队" },
  awayTeam: { displayNameZh: "客队" }
} as MatchDto;

const context: FixtureContextSummaryDto = {
  matchId: "match-1",
  completeness: "partial",
  createdAt: "2026-06-13T08:00:00.000Z",
  domains: [
    { domain: "odds", status: "cached", summary: "主胜 2.10", lastSyncedAt: "2026-06-13T08:00:00.000Z", error: null },
    { domain: "api_prediction", status: "cached", summary: "官方预测不再展示", lastSyncedAt: "2026-06-13T08:00:00.000Z", error: null },
    { domain: "squad", status: "refresh_failed", summary: "未获取", lastSyncedAt: "2026-06-13T08:01:00.000Z", error: "API-Football returned errors" }
  ]
};

describe("MatchContextDrawer", () => {
  afterEach(cleanup);

  it("shows cached and failed context domains", () => {
    render(<MatchContextDrawer open match={match} context={context} loading={false} onClose={vi.fn()} />);

    expect(screen.getByText("主队 vs 客队")).toBeInTheDocument();
    expect(screen.getByText("主胜 2.10")).toBeInTheDocument();
    expect(screen.getByText("刷新失败")).toBeInTheDocument();
    expect(screen.getByText("API-Football returned errors")).toBeInTheDocument();
    expect(screen.queryByText("官方预测")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刷新数据" })).not.toBeInTheDocument();
  });
});
