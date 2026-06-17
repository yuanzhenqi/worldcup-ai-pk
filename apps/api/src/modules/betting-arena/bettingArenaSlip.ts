import type {
  BettingArenaParlayDto,
  BettingArenaRiskLevel,
  BettingArenaSingleDto,
  BettingArenaSlipAction
} from "@worldcup-ai-pk/shared";

const NUMBER_TOLERANCE = 0.0001;

type JsonRecord = Record<string, unknown>;

interface SportteryOptionInput {
  code: string;
  label: string;
  value: string;
}

interface SportteryPoolInput {
  poolCode: string;
  options: SportteryOptionInput[];
}

interface BattleContextMatchInput {
  matchId: string;
  sportteryPools: SportteryPoolInput[];
}

interface BattleContextInput {
  matches: BattleContextMatchInput[];
}

interface AccountContextInput {
  availableBankroll: number;
}

export interface ParsedBettingArenaSlip {
  action: BettingArenaSlipAction;
  totalStake: number;
  potentialReturn: number;
  riskLevel: BettingArenaRiskLevel;
  strategySummary: string;
  bankrollPlan: string;
  singles: BettingArenaSingleDto[];
  parlays: BettingArenaParlayDto[];
  skipReasons: string[];
  dataGaps: string[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  return value;
}

function assertNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a number`);
  }

  return value;
}

function assertArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value;
}

function assertStringArray(value: unknown, fieldName: string): string[] {
  return assertArray(value, fieldName).map((entry, index) => assertString(entry, `${fieldName}[${index}]`));
}

function assertAction(value: unknown): BettingArenaSlipAction {
  if (value !== "bet" && value !== "hold") {
    throw new Error("action must be bet or hold");
  }

  return value;
}

function assertRiskLevel(value: unknown): BettingArenaRiskLevel {
  if (value !== "low" && value !== "medium" && value !== "high") {
    throw new Error("risk_level must be low, medium, or high");
  }

  return value;
}

function extractJsonObject(content: string): JsonRecord {
  const startIndex = content.search(/\S/);

  if (startIndex === -1) {
    throw new Error("Betting arena slip JSON parse failed: object braces not found");
  }

  if (content[startIndex] !== "{") {
    throw new Error("Betting arena slip JSON must start with an object");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIndex = -1;

  for (let index = startIndex; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        endIndex = index;
        break;
      }
    }
  }

  if (endIndex === -1) {
    throw new Error("Betting arena slip JSON parse failed: object braces not found");
  }

  const parsed: unknown = JSON.parse(content.slice(startIndex, endIndex + 1));

  if (!isRecord(parsed)) {
    throw new Error("Betting arena slip JSON must be an object");
  }

  return parsed;
}

function findLockedOption(
  battleContext: BattleContextInput,
  matchId: string,
  poolCode: string,
  selectionCode: string
): SportteryOptionInput {
  const match = battleContext.matches.find((entry) => entry.matchId === matchId);

  if (!match) {
    throw new Error(`unknown match_id ${matchId}`);
  }

  const pool = match.sportteryPools.find((entry) => entry.poolCode === poolCode);

  if (!pool) {
    throw new Error(`unknown pool_code ${poolCode}`);
  }

  const option = pool.options.find((entry) => entry.code === selectionCode);

  if (!option) {
    throw new Error(`unknown selection_code ${selectionCode}`);
  }

  return option;
}

function validateLeg(
  rawLeg: JsonRecord,
  battleContext: BattleContextInput,
  fieldName: string
): BettingArenaSingleDto {
  const matchId = assertString(rawLeg.match_id, `${fieldName}.match_id`);
  const poolCode = assertString(rawLeg.pool_code, `${fieldName}.pool_code`);
  const selectionCode = assertString(rawLeg.selection_code, `${fieldName}.selection_code`);
  const selectionLabel = assertString(rawLeg.selection_label, `${fieldName}.selection_label`);
  const lockedOdds = assertNumber(rawLeg.locked_odds, `${fieldName}.locked_odds`);
  const option = findLockedOption(battleContext, matchId, poolCode, selectionCode);
  const lockedOptionOdds = Number(option.value);

  if (!Number.isFinite(lockedOptionOdds) || Math.abs(lockedOptionOdds - lockedOdds) > NUMBER_TOLERANCE) {
    throw new Error(`locked_odds mismatch for ${matchId}/${poolCode}/${selectionCode}`);
  }

  if (option.label !== selectionLabel) {
    throw new Error(`selection_label mismatch for ${matchId}/${poolCode}/${selectionCode}`);
  }

  return {
    matchId,
    poolCode,
    selectionCode,
    selectionLabel,
    lockedOdds,
    stake: 0,
    confidence: 0,
    rationale: ""
  };
}

function parseSingle(rawSingle: unknown, battleContext: BattleContextInput, index: number): BettingArenaSingleDto {
  if (!isRecord(rawSingle)) {
    throw new Error(`singles[${index}] must be an object`);
  }

  const leg = validateLeg(rawSingle, battleContext, `singles[${index}]`);
  const stake = assertNumber(rawSingle.stake, `singles[${index}].stake`);

  if (stake <= 0) {
    throw new Error(`singles[${index}].stake must be positive`);
  }

  return {
    ...leg,
    stake,
    confidence: assertNumber(rawSingle.confidence, `singles[${index}].confidence`),
    rationale: assertString(rawSingle.rationale, `singles[${index}].rationale`)
  };
}

function parseParlay(rawParlay: unknown, battleContext: BattleContextInput, index: number): BettingArenaParlayDto {
  if (!isRecord(rawParlay)) {
    throw new Error(`parlays[${index}] must be an object`);
  }

  const stake = assertNumber(rawParlay.stake, `parlays[${index}].stake`);

  if (stake <= 0) {
    throw new Error(`parlays[${index}].stake must be positive`);
  }

  const legs = assertArray(rawParlay.legs, `parlays[${index}].legs`).map((rawLeg, legIndex) => {
    if (!isRecord(rawLeg)) {
      throw new Error(`parlays[${index}].legs[${legIndex}] must be an object`);
    }

    const leg = validateLeg(rawLeg, battleContext, `parlays[${index}].legs[${legIndex}]`);

    return {
      matchId: leg.matchId,
      poolCode: leg.poolCode,
      selectionCode: leg.selectionCode,
      selectionLabel: leg.selectionLabel,
      lockedOdds: leg.lockedOdds
    };
  });

  const combinedOdds = assertNumber(rawParlay.combined_odds, `parlays[${index}].combined_odds`);

  if (combinedOdds <= 0) {
    throw new Error(`parlays[${index}].combined_odds must be positive`);
  }

  return {
    parlayName: assertString(rawParlay.parlay_name, `parlays[${index}].parlay_name`),
    stake,
    legs,
    combinedOdds,
    confidence: assertNumber(rawParlay.confidence, `parlays[${index}].confidence`),
    rationale: assertString(rawParlay.rationale, `parlays[${index}].rationale`)
  };
}

function assertStakeEqualsTotal(totalStake: number, singles: BettingArenaSingleDto[], parlays: BettingArenaParlayDto[]): void {
  const computedStake = [...singles, ...parlays].reduce((sum, entry) => sum + entry.stake, 0);

  if (Math.abs(computedStake - totalStake) > NUMBER_TOLERANCE) {
    throw new Error("total_stake must equal singles and parlays stake sum");
  }
}

function calculatePotentialReturn(singles: BettingArenaSingleDto[], parlays: BettingArenaParlayDto[]): number {
  const singleReturn = singles.reduce((sum, single) => sum + single.stake * single.lockedOdds, 0);
  const parlayReturn = parlays.reduce((sum, parlay) => sum + parlay.stake * parlay.combinedOdds, 0);

  return Number((singleReturn + parlayReturn).toFixed(4));
}

export function parseBettingArenaSlip(
  content: string,
  battleContext: BattleContextInput,
  accountContext: AccountContextInput
): ParsedBettingArenaSlip {
  const slip = extractJsonObject(content);
  const action = assertAction(slip.action);
  const totalStake = assertNumber(slip.total_stake, "total_stake");
  const singlesInput = assertArray(slip.singles, "singles");
  const parlaysInput = assertArray(slip.parlays, "parlays");
  const strategySummary = assertString(slip.strategy_summary, "strategy_summary");
  const riskLevel = assertRiskLevel(slip.risk_level);
  const bankrollPlan = assertString(slip.bankroll_plan, "bankroll_plan");
  const skipReasons = assertStringArray(slip.skip_reasons, "skip_reasons");
  const dataGaps = assertStringArray(slip.data_gaps, "data_gaps");

  if (action === "hold") {
    if (totalStake !== 0) {
      throw new Error("hold action requires total_stake 0");
    }

    if (singlesInput.length > 0 || parlaysInput.length > 0) {
      throw new Error("hold action requires empty singles and parlays");
    }

    return {
      action,
      totalStake,
      potentialReturn: 0,
      riskLevel,
      strategySummary,
      bankrollPlan,
      singles: [],
      parlays: [],
      skipReasons,
      dataGaps
    };
  }

  if (totalStake < 0) {
    throw new Error("total_stake must be non-negative");
  }

  if (totalStake - accountContext.availableBankroll * 0.5 > NUMBER_TOLERANCE) {
    throw new Error("total_stake exceeds max daily stake");
  }

  const singles = singlesInput.map((rawSingle, index) => parseSingle(rawSingle, battleContext, index));
  const parlays = parlaysInput.map((rawParlay, index) => parseParlay(rawParlay, battleContext, index));

  assertStakeEqualsTotal(totalStake, singles, parlays);

  return {
    action,
    totalStake,
    potentialReturn: calculatePotentialReturn(singles, parlays),
    riskLevel,
    strategySummary,
    bankrollPlan,
    singles,
    parlays,
    skipReasons,
    dataGaps
  };
}
