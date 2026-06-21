import { describe, expect, it } from "vitest";
import { buildBettingArenaPrompt } from "../src/modules/betting-arena/bettingArenaPrompts";

describe("betting arena prompt", () => {
  it("requires separate match judgment and betting portfolio reasoning", () => {
    const prompt = buildBettingArenaPrompt({
      accountContext: { availableBankroll: 10000, lastFiveBetSlips: [], lastFiveSettlementResults: [] },
      battleContext: { matches: [] }
    });

    expect(prompt).toContain("先完成赛果判断，再生成投注组合");
    expect(prompt).toContain("每个 singles/parlays 选择都必须引用 battle_context 中的 matchId、poolCode、selectionCode 和锁定赔率");
    expect(prompt).toContain("结合 account_context.lastFiveBetSlips 和 account_context.lastFiveSettlementResults");
    expect(prompt).toContain("schedule：仅来自 API-Football 赛程");
    expect(prompt).toContain("sporttery_betting_options：体彩可购买玩法、选项和锁定赔率");
    expect(prompt).toContain("sporttery_intel：体彩赛前摘要、历史交锋、近期状态、伤停影响");
    expect(prompt).toContain("team_profiles：本地球队资料、核心球员、阵容伤停、身价状态");
    expect(prompt).toContain("赔率不得作为赛果判断权重");
    expect(prompt).toContain("稳胆区");
    expect(prompt).toContain("价值区");
    expect(prompt).toContain("防冷区");
    expect(prompt).toContain("回避区");
    expect(prompt).toContain("禁止把全部资金押到低赔率热门");
    expect(prompt).toContain("portfolio_buckets");
    expect(prompt).toContain("命中路径");
    expect(prompt).toContain("失败路径");
  });
});
