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
  completeness: "full",
  createdAt: "2026-06-13T08:00:00.000Z",
  domains: [
    {
      domain: "sporttery",
      status: "cached",
      summary: "官方指数：让球胜平负 主1.68/平4.85/客3.05\n历史交锋：6场 胜50%/平20%/负30%\n伤停影响：主[穆西亚拉·中场] 客[无]",
      lastSyncedAt: "2026-06-13T08:00:00.000Z",
      error: null
    },
    { domain: "odds", status: "cached", summary: "旧来源", lastSyncedAt: "2026-06-13T08:00:00.000Z", error: null }
  ]
};

describe("MatchContextDrawer", () => {
  afterEach(cleanup);

  it("shows sporttery intelligence sections", () => {
    render(<MatchContextDrawer open match={match} context={context} loading={false} onClose={vi.fn()} />);

    expect(screen.getByText("主队 vs 客队")).toBeInTheDocument();
    expect(screen.getByText("赛前情报")).toBeInTheDocument();
    expect(screen.getByText("官方指数")).toBeInTheDocument();
    expect(screen.getByText("让球胜平负 主1.68/平4.85/客3.05")).toBeInTheDocument();
    expect(screen.getByText("伤停影响")).toBeInTheDocument();
    expect(screen.queryByText("旧来源")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "刷新数据" })).not.toBeInTheDocument();
  });
});
