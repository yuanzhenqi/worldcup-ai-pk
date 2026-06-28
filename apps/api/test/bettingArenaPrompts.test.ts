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
    expect(prompt).toContain("推理步骤 1：先判断每场比赛的赛果方向，不得引用赔率作为判断权重");
    expect(prompt).toContain("推理步骤 2：筛选适合单场的比赛，说明命中路径、失败路径和资金占比");
    expect(prompt).toContain("推理步骤 3：筛选适合串关的组合，逐腿说明组合逻辑");
    expect(prompt).toContain("推理步骤 4：结合 account_history 的历史投入、命中、亏损回撤和可用资金决定本轮投入比例");
    expect(prompt).toContain("推理步骤 5：最后输出结构化投注单；有可投注玩法和基本情报时必须下注，仅在全部场次无可投注玩法时才整轮空仓");
    expect(prompt).toContain("external_intel：最新新闻、阵容、伤停、动机、风险信号和来源链接");
    expect(prompt).toContain("group_standings：主队所在小组的当前积分榜");
    expect(prompt).toContain("至少评估一组价值区机会");
    expect(prompt).toContain("至少评估一组防冷或回避理由");
    expect(prompt).toContain("只要 battle_context 提供了 sporttery_betting_options 赔率和基本情报");
    expect(prompt).toContain("不得仅因部分字段缺失就全额空仓");
  });
});
