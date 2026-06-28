import type {
  BettingArenaParlayDto,
  BettingArenaRiskLevel,
  BettingArenaPortfolioBucketDto,
  BettingArenaSingleDto,
  BettingArenaSlipAction
} from "@worldcup-ai-pk/shared";

const NUMBER_TOLERANCE = 0.0001;

type JsonRecord = Record<string, unknown>;

interface SportteryOptionInput {
  code: string;
  label: string;
  value: string;
  goalLine?: string | null;
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
  portfolioBuckets: BettingArenaPortfolioBucketDto[];
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

function coerceString(value: unknown, fieldName: string): string {
  if (typeof value === "string") return value;
  if (isRecord(value)) return JSON.stringify(value);
  throw new Error(`${fieldName} must be a string`);
}

function coerceStringListEntry(value: unknown, fieldName: string): string {
  if (typeof value === "string") return value;
  if (isRecord(value) || Array.isArray(value)) return JSON.stringify(value);
  throw new Error(`${fieldName} must be a string`);
}

function assertNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a number`);
  }

  return value;
}

function coerceNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`${fieldName} must be a number`);
}

function optionalNumber(value: unknown, fieldName: string, defaultValue: number): number {
  return value === undefined ? defaultValue : coerceNumber(value, fieldName);
}

function coerceConfidence(value: unknown, fieldName: string): number {
  if (typeof value === "string") {
    const normalizedValue = value.toLowerCase();
    if (normalizedValue === "low" || normalizedValue === "低") return 0.4;
    if (normalizedValue === "medium" || normalizedValue === "中") return 0.6;
    if (normalizedValue === "high" || normalizedValue === "高") return 0.8;
  }
  return coerceNumber(value, fieldName);
}

function optionalConfidence(value: unknown, fieldName: string, defaultValue: number): number {
  return value === undefined ? defaultValue : coerceConfidence(value, fieldName);
}

function assertArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value;
}

function assertStringArray(value: unknown, fieldName: string): string[] {
  return assertArray(value, fieldName).map((entry, index) => coerceStringListEntry(entry, `${fieldName}[${index}]`));
}

function readStringField(record: JsonRecord, fieldNames: string[], fieldName: string): string {
  for (const name of fieldNames) {
    if (typeof record[name] === "string") return record[name];
  }
  throw new Error(`${fieldName} must be a string`);
}

function readOptionalStringField(record: JsonRecord, fieldNames: string[]): string | null {
  for (const name of fieldNames) {
    if (typeof record[name] === "string") return record[name];
  }
  return null;
}

function readNumberField(record: JsonRecord, fieldNames: string[], fieldName: string): number {
  for (const name of fieldNames) {
    if (record[name] !== undefined) return coerceNumber(record[name], fieldName);
  }
  throw new Error(`${fieldName} must be a number`);
}

function readOptionalNumberField(record: JsonRecord, fieldNames: string[], fieldName: string, defaultValue: number): number {
  for (const name of fieldNames) {
    if (record[name] !== undefined) return coerceNumber(record[name], fieldName);
  }
  return defaultValue;
}

function readOptionalConfidenceField(record: JsonRecord, fieldNames: string[], fieldName: string, defaultValue: number): number {
  for (const name of fieldNames) {
    if (record[name] !== undefined) return coerceConfidence(record[name], fieldName);
  }
  return defaultValue;
}

function assertAction(value: unknown): BettingArenaSlipAction {
  const normalizedValue = typeof value === "string" ? value.toLowerCase() : value;

  if (normalizedValue === "skip") return "hold";

  if (normalizedValue !== "bet" && normalizedValue !== "hold") {
    throw new Error("action must be bet or hold");
  }

  return normalizedValue;
}

function assertRiskLevel(value: unknown): BettingArenaRiskLevel {
  const normalizedValue = typeof value === "string" ? value.toLowerCase() : value;

  if (
    normalizedValue === "none" ||
    normalizedValue === "n/a" ||
    normalizedValue === "无" ||
    normalizedValue === "无（空仓）" ||
    normalizedValue === "无风险" ||
    normalizedValue === "zero"
  ) {
    return "low";
  }

  if (normalizedValue === "medium-low" || normalizedValue === "low-medium" || normalizedValue === "中低" || normalizedValue === "稳健") {
    return "medium";
  }

  if (normalizedValue === "低") return "low";
  if (normalizedValue === "中") return "medium";
  if (normalizedValue === "高") return "high";

  if (normalizedValue !== "low" && normalizedValue !== "medium" && normalizedValue !== "high") {
    throw new Error("risk_level must be low, medium, or high");
  }

  return normalizedValue;
}

function extractJsonObject(content: string): JsonRecord {
  const firstNonWhitespaceIndex = content.search(/\S/);

  if (firstNonWhitespaceIndex === -1) {
    throw new Error("Betting arena slip JSON parse failed: object braces not found");
  }

  if (content[firstNonWhitespaceIndex] === "[") {
    throw new Error("Betting arena slip JSON must start with an object");
  }

  const startIndex = content.indexOf("{", firstNonWhitespaceIndex);

  if (startIndex === -1) {
    throw new Error("Betting arena slip JSON parse failed: object braces not found");
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

function parseGoalLine(value: string | null | undefined): number | null {
  if (value === null || value === undefined || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateLeg(
  rawLeg: JsonRecord,
  battleContext: BattleContextInput,
  fieldName: string
): BettingArenaSingleDto {
  const matchId = readStringField(rawLeg, ["match_id", "matchId"], `${fieldName}.match_id`);
  const poolCode = readStringField(rawLeg, ["pool_code", "poolCode"], `${fieldName}.pool_code`);
  const selectionCode = readStringField(rawLeg, ["selection_code", "selectionCode", "option_code", "optionCode", "option", "selection"], `${fieldName}.selection_code`);
  readOptionalStringField(rawLeg, ["selection_label", "selectionLabel", "option_label", "optionLabel", "label"]);
  const option = findLockedOption(battleContext, matchId, poolCode, selectionCode);
  const lockedOptionOdds = Number(option.value);
  const providedLockedOdds = readOptionalNumberField(rawLeg, ["locked_odds", "lockedOdds", "odds"], `${fieldName}.locked_odds`, lockedOptionOdds);

  if (!Number.isFinite(lockedOptionOdds) || Math.abs(lockedOptionOdds - providedLockedOdds) > NUMBER_TOLERANCE) {
    throw new Error(`locked_odds mismatch for ${matchId}/${poolCode}/${selectionCode}`);
  }

  return {
    matchId,
    poolCode,
    selectionCode,
    selectionLabel: option.label,
    lockedOdds: lockedOptionOdds,
    goalLine: parseGoalLine(option.goalLine),
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
  const stake = coerceNumber(rawSingle.stake, `singles[${index}].stake`);

  if (stake <= 0) {
    throw new Error(`singles[${index}].stake must be positive`);
  }

  return {
    ...leg,
    stake,
    confidence: optionalConfidence(rawSingle.confidence, `singles[${index}].confidence`, 0),
    rationale: readOptionalStringField(rawSingle, ["rationale", "reason", "reasoning"]) ?? ""
  };
}

function parseParlay(rawParlay: unknown, battleContext: BattleContextInput, index: number): BettingArenaParlayDto | null {
  if (!isRecord(rawParlay)) {
    throw new Error(`parlays[${index}] must be an object`);
  }

  const stake = coerceNumber(rawParlay.stake, `parlays[${index}].stake`);

  if (stake <= 0) {
    return null;
  }

  const rawLegs = rawParlay.legs ?? rawParlay.matches;
  const legs = assertArray(rawLegs, `parlays[${index}].legs`).map((rawLeg, legIndex) => {
    if (!isRecord(rawLeg)) {
      throw new Error(`parlays[${index}].legs[${legIndex}] must be an object`);
    }

    const leg = validateLeg(rawLeg, battleContext, `parlays[${index}].legs[${legIndex}]`);

    return {
      matchId: leg.matchId,
      poolCode: leg.poolCode,
      selectionCode: leg.selectionCode,
      selectionLabel: leg.selectionLabel,
      lockedOdds: leg.lockedOdds,
      goalLine: leg.goalLine
    };
  });

  const computedCombinedOdds = Number(legs.reduce((product, leg) => product * leg.lockedOdds, 1).toFixed(4));
  const combinedOdds = readOptionalNumberField(rawParlay, ["combined_odds", "combinedOdds", "odds"], `parlays[${index}].combined_odds`, computedCombinedOdds);

  if (combinedOdds <= 0) {
    throw new Error(`parlays[${index}].combined_odds must be positive`);
  }

  return {
    parlayName: readOptionalStringField(rawParlay, ["parlay_name", "parlayName", "parlay_id", "parlayId", "label"]) ?? `串关 ${index + 1}`,
    stake,
    legs,
    combinedOdds,
    confidence: readOptionalConfidenceField(rawParlay, ["confidence"], `parlays[${index}].confidence`, 0),
    rationale: readOptionalStringField(rawParlay, ["rationale", "reason", "reasoning"]) ?? ""
  };
}

function parsePortfolioBuckets(rawBuckets: unknown): BettingArenaPortfolioBucketDto[] {
  if (!Array.isArray(rawBuckets)) return [];

  return rawBuckets.flatMap((rawBucket): BettingArenaPortfolioBucketDto[] => {
    if (!isRecord(rawBucket)) return [];

    const bucket = readOptionalStringField(rawBucket, ["bucket"]);
    if (bucket !== "safe" && bucket !== "value" && bucket !== "hedge" && bucket !== "upset" && bucket !== "avoid") {
      return [];
    }

    const items = Array.isArray(rawBucket.items) ? rawBucket.items.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];

    return [
      {
        bucket,
        label: readOptionalStringField(rawBucket, ["label"]) ?? bucket,
        stake: readOptionalNumberField(rawBucket, ["stake"], "portfolio_buckets[].stake", 0),
        rationale: readOptionalStringField(rawBucket, ["rationale", "reason"]) ?? "",
        items
      }
    ];
  });
}

function calculateTotalStake(singles: BettingArenaSingleDto[], parlays: BettingArenaParlayDto[]): number {
  return [...singles, ...parlays].reduce((sum, entry) => sum + entry.stake, 0);
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
  const riskLevel = assertRiskLevel(slip.risk_level);
  const portfolioBuckets = parsePortfolioBuckets(slip.portfolio_buckets ?? slip.portfolioBuckets);

  if (action === "hold") {
    const declaredTotalStake = typeof slip.total_stake === "number" ? slip.total_stake : 0;
    const singlesInput = Array.isArray(slip.singles) ? slip.singles : [];
    const parlaysInput = Array.isArray(slip.parlays) ? slip.parlays : [];

    if (declaredTotalStake !== 0) {
      throw new Error("hold action requires total_stake 0");
    }

    if (singlesInput.length > 0 || parlaysInput.length > 0) {
      throw new Error("hold action requires empty singles and parlays");
    }

    return {
      action,
      totalStake: 0,
      potentialReturn: 0,
      riskLevel,
      strategySummary: typeof slip.strategy_summary === "string" ? slip.strategy_summary : isRecord(slip.strategy_summary) ? JSON.stringify(slip.strategy_summary) : "",
      bankrollPlan: typeof slip.bankroll_plan === "string" ? slip.bankroll_plan : isRecord(slip.bankroll_plan) ? JSON.stringify(slip.bankroll_plan) : Array.isArray(slip.bankroll_plan) ? JSON.stringify(slip.bankroll_plan) : "",
      singles: [],
      parlays: [],
      portfolioBuckets,
      skipReasons: Array.isArray(slip.skip_reasons) ? assertStringArray(slip.skip_reasons, "skip_reasons") : [],
      dataGaps: Array.isArray(slip.data_gaps) ? assertStringArray(slip.data_gaps, "data_gaps") : []
    };
  }

  const declaredTotalStake = assertNumber(slip.total_stake, "total_stake");
  const singlesInput = assertArray(slip.singles, "singles");
  const parlaysInput = assertArray(slip.parlays, "parlays");
  const strategySummary = assertString(slip.strategy_summary, "strategy_summary");
  const bankrollPlan = coerceString(slip.bankroll_plan, "bankroll_plan");
  const skipReasons = assertStringArray(slip.skip_reasons, "skip_reasons");
  const dataGaps = assertStringArray(slip.data_gaps, "data_gaps");

  if (declaredTotalStake < 0) {
    throw new Error("total_stake must be non-negative");
  }

  const singles = singlesInput.map((rawSingle, index) => parseSingle(rawSingle, battleContext, index));
  const parlays = parlaysInput.flatMap((rawParlay, index) => {
    const parsedParlay = parseParlay(rawParlay, battleContext, index);
    return parsedParlay ? [parsedParlay] : [];
  });
  const totalStake = calculateTotalStake(singles, parlays);
  const maxStakeExposure = Math.max(declaredTotalStake, totalStake);

  if (maxStakeExposure - accountContext.availableBankroll * 0.5 > NUMBER_TOLERANCE) {
    throw new Error("total_stake exceeds max daily stake");
  }

  return {
    action,
    totalStake,
    potentialReturn: calculatePotentialReturn(singles, parlays),
    riskLevel,
    strategySummary,
    bankrollPlan,
    singles,
    parlays,
    portfolioBuckets,
    skipReasons,
    dataGaps
  };
}
