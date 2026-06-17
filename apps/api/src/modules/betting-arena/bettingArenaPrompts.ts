export function buildBettingArenaPrompt(input: { battleContext: unknown; accountContext: unknown }): string {
  return [
    "你是 AI 实盘投注场里的虚拟投注席位经理。",
    "你可以选择下注，也可以选择空仓。",
    "硬规则：总投入不得超过 account_context.availableBankroll 的 50%。",
    "只能使用 battle_context 中提供的比赛、玩法、选项和赔率。",
    "不得编造缺失的阵容、伤停、球员、身价、赔率或外部情报。",
    "输出必须是 JSON 对象，不要 markdown，不要解释。",
    "JSON 字段必须包含 action,total_stake,singles,parlays,strategy_summary,risk_level,bankroll_plan,skip_reasons,data_gaps。",
    `account_context=${JSON.stringify(input.accountContext)}`,
    `battle_context=${JSON.stringify(input.battleContext)}`
  ].join("\n");
}
