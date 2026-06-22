import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type {
  BettingArenaAccountDto,
  BettingArenaDto,
  BettingArenaLedgerDto,
  BettingArenaRoundDto,
  BettingArenaSettlementDto,
  BettingArenaSlipDto
} from "@worldcup-ai-pk/shared";
import { enrichBattleContext } from "./bettingArena.context";
import { buildBettingArenaPrompt } from "./bettingArenaPrompts";

export const INITIAL_BANKROLL = 10000;

interface AccountRow {
  model_id: string;
  model_display_name: string;
  initial_bankroll: number;
  available_bankroll: number;
  frozen_stake: number;
  total_staked: number;
  total_returned: number;
  order_count: number;
  settled_order_count: number;
  hit_count: number;
  failed_generation_count: number;
  last_review: string;
}

interface RoundRow {
  id: string;
  round_date: string;
  round_sequence: number;
  status: BettingArenaRoundDto["status"];
  lock_time: string;
  battle_context_json: string;
  created_at: string;
  updated_at: string;
  total_staked: number | null;
  potential_return: number | null;
  settled_return: number | null;
}

interface CreateBettingArenaRoundInput {
  roundDate: string;
  lockTime: string;
  battleContext: unknown;
  externalIntel: unknown;
  now?: Date;
}

interface SlipRow {
  id: string;
  round_id: string;
  model_id: string;
  model_display_name: string;
  action: BettingArenaSlipDto["action"];
  status: BettingArenaSlipDto["status"];
  total_stake: number;
  potential_return: number;
  risk_level: BettingArenaSlipDto["riskLevel"];
  raw_response: string;
  output_json: string;
  parsed_slip_json: string;
  account_context_json: string;
  validation_error: string | null;
  created_at: string;
  settlement_stake: number | null;
  settlement_returned_amount: number | null;
  settlement_profit: number | null;
  settlement_status: BettingArenaSettlementDto["status"] | null;
  settlement_json: string | null;
  settled_at: string | null;
}

interface AccountSettlementMetrics {
  settledPickCount: number;
  hitPickCount: number;
}

interface RoundModelProfit {
  roundId: string;
  modelDisplayName: string;
  profit: number;
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function normalizeLedgerLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 50;
  }
  return Math.max(1, Math.min(100, Math.trunc(value)));
}

function normalizeLedgerOffset(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function calculateTotalAssetValue(row: AccountRow): number {
  return toNumber(row.available_bankroll) + toNumber(row.frozen_stake);
}

function toAccountDto(row: AccountRow, rank: number, totalRounds: number, metrics: AccountSettlementMetrics): BettingArenaAccountDto {
  const initialBankroll = toNumber(row.initial_bankroll);
  const totalAssetValue = calculateTotalAssetValue(row);
  const orderCount = toNumber(row.order_count);
  const settledOrderCount = toNumber(row.settled_order_count);
  const hitCount = toNumber(row.hit_count);
  const failedGenerationCount = toNumber(row.failed_generation_count);
  const profitableSlipRate = settledOrderCount > 0 ? hitCount / settledOrderCount : 0;
  const pickHitRate = metrics.settledPickCount > 0 ? metrics.hitPickCount / metrics.settledPickCount : 0;

  return {
    modelId: row.model_id,
    modelDisplayName: row.model_display_name,
    initialBankroll,
    availableBankroll: toNumber(row.available_bankroll),
    frozenStake: toNumber(row.frozen_stake),
    totalAssetValue,
    totalStaked: toNumber(row.total_staked),
    totalReturned: toNumber(row.total_returned),
    returnRate: initialBankroll > 0 ? (totalAssetValue - initialBankroll) / initialBankroll : 0,
    orderCount,
    settledOrderCount,
    hitCount,
    hitRate: pickHitRate,
    profitableSlipCount: hitCount,
    profitableSlipRate,
    settledPickCount: metrics.settledPickCount,
    hitPickCount: metrics.hitPickCount,
    pickHitRate,
    failedGenerationCount,
    orderRate: totalRounds > 0 ? orderCount / totalRounds : 0,
    failureRate: totalRounds > 0 ? failedGenerationCount / totalRounds : 0,
    rank,
    lastReview: row.last_review
  };
}

function parseEligibleMatchCount(battleContextJson: string): number {
  const battleContext = JSON.parse(battleContextJson) as { matches?: unknown };
  return Array.isArray(battleContext.matches) ? battleContext.matches.length : 0;
}

function parseJsonOrNull(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ParsedSettlementLeg {
  matchId: string;
  won: boolean;
  voided: boolean;
}

interface ParsedSlipForSettlement {
  singles: Array<{
    matchId: string;
    stake: number;
    lockedOdds: number;
  }>;
  parlays: Array<{
    parlayName: string;
    stake: number;
    combinedOdds: number;
    legs: Array<{ matchId: string }>;
  }>;
}

function parseSettlementLegs(rawLegs: unknown[]): ParsedSettlementLeg[] {
  return rawLegs.flatMap((leg) => {
    if (!isRecord(leg)) return [];
    return [
      {
        matchId: typeof leg.matchId === "string" ? leg.matchId : "",
        won: leg.won === true,
        voided: leg.voided === true
      }
    ];
  });
}

function parseSlipForSettlement(value: string): ParsedSlipForSettlement {
  const parsedSlip = parseJsonOrNull(value);
  if (!isRecord(parsedSlip)) return { singles: [], parlays: [] };
  const singles = Array.isArray(parsedSlip.singles)
    ? parsedSlip.singles.flatMap((single) => {
        if (!isRecord(single)) return [];
        const matchId = typeof single.matchId === "string" ? single.matchId : "";
        if (!matchId) return [];
        return [{ matchId, stake: toNumber(single.stake), lockedOdds: toNumber(single.lockedOdds) }];
      })
    : [];
  const parlays = Array.isArray(parsedSlip.parlays)
    ? parsedSlip.parlays.flatMap((parlay) => {
        if (!isRecord(parlay)) return [];
        const parlayName = typeof parlay.parlayName === "string" ? parlay.parlayName : "串关";
        const legs = Array.isArray(parlay.legs)
          ? parlay.legs.flatMap((leg) => {
              if (!isRecord(leg)) return [];
              const matchId = typeof leg.matchId === "string" ? leg.matchId : "";
              return matchId ? [{ matchId }] : [];
            })
          : [];
        return [{ parlayName, stake: toNumber(parlay.stake), combinedOdds: toNumber(parlay.combinedOdds), legs }];
      })
    : [];
  return { singles, parlays };
}

function takeLegacyLeg(legs: ParsedSettlementLeg[], usedIndexes: Set<number>, matchId: string): ParsedSettlementLeg {
  const foundIndex = legs.findIndex((leg, index) => !usedIndexes.has(index) && leg.matchId === matchId);
  if (foundIndex >= 0) {
    usedIndexes.add(foundIndex);
    return legs[foundIndex];
  }
  return { matchId, won: false, voided: true };
}

function reconstructSettlementItems(parsedSlipJson: string, legs: ParsedSettlementLeg[]): BettingArenaSettlementDto["items"] {
  const parsedSlip = parseSlipForSettlement(parsedSlipJson);
  const usedIndexes = new Set<number>();
  const singleItems = parsedSlip.singles.map((single) => {
    const leg = takeLegacyLeg(legs, usedIndexes, single.matchId);
    const returnedAmount = leg.voided ? single.stake : leg.won ? single.stake * single.lockedOdds : 0;
    return {
      type: "single" as const,
      name: null,
      stake: single.stake,
      returnedAmount,
      won: leg.won,
      voided: leg.voided,
      legs: [leg]
    };
  });
  const parlayItems = parsedSlip.parlays.map((parlay) => {
    const parlayLegs = parlay.legs.map((leg) => takeLegacyLeg(legs, usedIndexes, leg.matchId));
    const voided = parlayLegs.length > 0 && parlayLegs.every((leg) => leg.voided);
    const won = parlayLegs.length > 0 && parlayLegs.every((leg) => leg.won || leg.voided) && parlayLegs.some((leg) => leg.won);
    const returnedAmount = voided ? parlay.stake : won ? parlay.stake * parlay.combinedOdds : 0;
    return {
      type: "parlay" as const,
      name: parlay.parlayName,
      stake: parlay.stake,
      returnedAmount,
      won,
      voided,
      legs: parlayLegs
    };
  });
  return [...singleItems, ...parlayItems];
}

function parseSettlement(value: string | null, row: SlipRow): BettingArenaSettlementDto | null {
  if (!value) return null;
  const parsed = parseJsonOrNull(value);
  if (!isRecord(parsed)) return null;
  const legs = parseSettlementLegs(Array.isArray(parsed.legs) ? parsed.legs : []);
  const rawItems = Array.isArray(parsed.items) ? parsed.items : reconstructSettlementItems(row.parsed_slip_json, legs);
  return {
    stake: toNumber(row.settlement_stake ?? parsed.stake),
    returnedAmount: toNumber(row.settlement_returned_amount ?? parsed.returnedAmount),
    profit: toNumber(row.settlement_profit ?? parsed.profit),
    status: row.settlement_status ?? (parsed.status === "void" ? "void" : "settled"),
    hit: parsed.hit === true,
    legs,
    items: rawItems.flatMap((item) => {
      if (!isRecord(item)) return [];
      const itemLegs = Array.isArray(item.legs) ? parseSettlementLegs(item.legs) : [];
      return [
        {
          type: item.type === "parlay" ? "parlay" : "single",
          name: typeof item.name === "string" ? item.name : null,
          stake: toNumber(item.stake),
          returnedAmount: toNumber(item.returnedAmount),
          won: item.won === true,
          voided: item.voided === true,
          legs: itemLegs
        }
      ];
    }),
    settledAt: row.settled_at ?? ""
  };
}

function countSettlementItems(settlementJson: string, parsedSlipJson: string): AccountSettlementMetrics {
  const parsed = parseJsonOrNull(settlementJson);
  if (!isRecord(parsed)) return { settledPickCount: 0, hitPickCount: 0 };
  const legs = parseSettlementLegs(Array.isArray(parsed.legs) ? parsed.legs : []);
  const rawItems = Array.isArray(parsed.items) ? parsed.items : reconstructSettlementItems(parsedSlipJson, legs);
  let settledPickCount = 0;
  let hitPickCount = 0;
  for (const item of rawItems) {
    if (!isRecord(item) || item.voided === true) continue;
    settledPickCount += 1;
    if (item.won === true) hitPickCount += 1;
  }
  return { settledPickCount, hitPickCount };
}

function getAccountSettlementMetrics(db: Database): Map<string, AccountSettlementMetrics> {
  const rows = db
    .prepare(
      `
        SELECT betting_arena_settlements.model_id, betting_arena_settlements.settlement_json, betting_arena_slips.parsed_slip_json
        FROM betting_arena_settlements
        INNER JOIN betting_arena_slips ON betting_arena_slips.id = betting_arena_settlements.slip_id
        INNER JOIN ai_models ON ai_models.id = betting_arena_settlements.model_id
        WHERE ai_models.deleted_at IS NULL
      `
    )
    .all() as Array<{ model_id: string; settlement_json: string; parsed_slip_json: string }>;
  const metrics = new Map<string, AccountSettlementMetrics>();
  for (const row of rows) {
    const current = metrics.get(row.model_id) ?? { settledPickCount: 0, hitPickCount: 0 };
    const next = countSettlementItems(row.settlement_json, row.parsed_slip_json);
    metrics.set(row.model_id, {
      settledPickCount: current.settledPickCount + next.settledPickCount,
      hitPickCount: current.hitPickCount + next.hitPickCount
    });
  }
  return metrics;
}

function getRoundModelProfitExtremes(db: Database): Map<string, { bestModelDisplayName: string | null; worstModelDisplayName: string | null }> {
  const rows = db
    .prepare(
      `
        SELECT
          betting_arena_settlements.round_id AS roundId,
          ai_models.display_name AS modelDisplayName,
          SUM(betting_arena_settlements.profit) AS profit
        FROM betting_arena_settlements
        INNER JOIN ai_models ON ai_models.id = betting_arena_settlements.model_id
        WHERE ai_models.deleted_at IS NULL
        GROUP BY betting_arena_settlements.round_id, betting_arena_settlements.model_id, ai_models.display_name
      `
    )
    .all() as RoundModelProfit[];
  const grouped = new Map<string, RoundModelProfit[]>();
  for (const row of rows) {
    const current = grouped.get(row.roundId) ?? [];
    current.push({ ...row, profit: toNumber(row.profit) });
    grouped.set(row.roundId, current);
  }
  const result = new Map<string, { bestModelDisplayName: string | null; worstModelDisplayName: string | null }>();
  for (const [roundId, profits] of grouped.entries()) {
    const sorted = [...profits].sort((a, b) => b.profit - a.profit || a.modelDisplayName.localeCompare(b.modelDisplayName));
    result.set(roundId, {
      bestModelDisplayName: sorted[0]?.modelDisplayName ?? null,
      worstModelDisplayName: sorted[sorted.length - 1]?.modelDisplayName ?? null
    });
  }
  return result;
}

function countAccounts(db: Database): number {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM betting_arena_accounts
        INNER JOIN ai_models ON ai_models.id = betting_arena_accounts.model_id
        WHERE ai_models.deleted_at IS NULL
      `
    )
    .get() as { count: number };
  return toNumber(row.count);
}

function countRounds(db: Database): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM betting_arena_rounds`).get() as { count: number };
  return toNumber(row.count);
}

function toRoundDto(db: Database, row: RoundRow, modelsCount: number): BettingArenaRoundDto {
  const battleContext = enrichBattleContext(db, parseJsonOrNull(row.battle_context_json));
  return {
    id: row.id,
    roundDate: row.round_date,
    roundSequence: toNumber(row.round_sequence) || 1,
    status: row.status,
    lockTime: row.lock_time,
    eligibleMatchCount: parseEligibleMatchCount(row.battle_context_json),
    modelsCount,
    totalStaked: toNumber(row.total_staked),
    potentialReturn: toNumber(row.potential_return),
    settledReturn: toNumber(row.settled_return),
    battleContext,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toSlipDto(row: SlipRow, battleContext: unknown | null): BettingArenaSlipDto {
  const parsed = JSON.parse(row.parsed_slip_json || "{}") as Partial<BettingArenaSlipDto>;
  const accountContext = parseJsonOrNull(row.account_context_json || "{}");
  const prompt =
    battleContext && accountContext
      ? buildBettingArenaPrompt({
          battleContext,
          accountContext
        })
      : "";
  return {
    id: row.id,
    roundId: row.round_id,
    modelId: row.model_id,
    modelDisplayName: row.model_display_name,
    action: row.action,
    status: row.status,
    totalStake: toNumber(row.total_stake),
    potentialReturn: toNumber(row.potential_return),
    riskLevel: row.risk_level,
    strategySummary: typeof parsed.strategySummary === "string" ? parsed.strategySummary : "",
    bankrollPlan: typeof parsed.bankrollPlan === "string" ? parsed.bankrollPlan : "",
    singles: Array.isArray(parsed.singles) ? parsed.singles : [],
    parlays: Array.isArray(parsed.parlays) ? parsed.parlays : [],
    portfolioBuckets: Array.isArray(parsed.portfolioBuckets) ? parsed.portfolioBuckets : [],
    skipReasons: Array.isArray(parsed.skipReasons) ? parsed.skipReasons : [],
    dataGaps: Array.isArray(parsed.dataGaps) ? parsed.dataGaps : [],
    validationError: row.validation_error,
    accountContext,
    prompt,
    rawResponse: row.raw_response,
    outputJson: row.output_json,
    settlementSummary: null,
    settlement: parseSettlement(row.settlement_json, row),
    createdAt: row.created_at
  };
}

function listRoundSlips(db: Database, roundId: string, battleContext: unknown | null): BettingArenaSlipDto[] {
  const rows = db
    .prepare(
      `
        SELECT
          betting_arena_slips.id,
          betting_arena_slips.round_id,
          betting_arena_slips.model_id,
          ai_models.display_name AS model_display_name,
          betting_arena_slips.action,
          betting_arena_slips.status,
          betting_arena_slips.total_stake,
          betting_arena_slips.potential_return,
          betting_arena_slips.risk_level,
          betting_arena_slips.raw_response,
          betting_arena_slips.output_json,
          betting_arena_slips.parsed_slip_json,
          betting_arena_slips.account_context_json,
          betting_arena_slips.validation_error,
          betting_arena_slips.created_at,
          betting_arena_settlements.stake AS settlement_stake,
          betting_arena_settlements.returned_amount AS settlement_returned_amount,
          betting_arena_settlements.profit AS settlement_profit,
          betting_arena_settlements.status AS settlement_status,
          betting_arena_settlements.settlement_json,
          betting_arena_settlements.settled_at
        FROM betting_arena_slips
        INNER JOIN ai_models ON ai_models.id = betting_arena_slips.model_id
        LEFT JOIN betting_arena_settlements ON betting_arena_settlements.slip_id = betting_arena_slips.id
        WHERE betting_arena_slips.round_id = ?
          AND ai_models.deleted_at IS NULL
        ORDER BY betting_arena_slips.created_at ASC, ai_models.display_name ASC
      `
    )
    .all(roundId) as SlipRow[];

  return rows.map((row) => toSlipDto(row, battleContext));
}

function getRoundById(db: Database, id: string): BettingArenaRoundDto {
  const row = db
    .prepare(
      `
        SELECT
          betting_arena_rounds.id,
          betting_arena_rounds.round_date,
          betting_arena_rounds.round_sequence,
          betting_arena_rounds.status,
          betting_arena_rounds.lock_time,
          betting_arena_rounds.battle_context_json,
          betting_arena_rounds.created_at,
          betting_arena_rounds.updated_at,
          COALESCE(slip_totals.total_staked, 0) AS total_staked,
          COALESCE(slip_totals.potential_return, 0) AS potential_return,
          COALESCE(settlement_totals.settled_return, 0) AS settled_return
        FROM betting_arena_rounds
        LEFT JOIN (
          SELECT
            betting_arena_slips.round_id,
            SUM(total_stake) AS total_staked,
            SUM(potential_return) AS potential_return
          FROM betting_arena_slips
          INNER JOIN ai_models ON ai_models.id = betting_arena_slips.model_id
          WHERE ai_models.deleted_at IS NULL
          GROUP BY betting_arena_slips.round_id
        ) AS slip_totals ON slip_totals.round_id = betting_arena_rounds.id
        LEFT JOIN (
          SELECT
            betting_arena_settlements.round_id,
            SUM(returned_amount) AS settled_return
          FROM betting_arena_settlements
          INNER JOIN ai_models ON ai_models.id = betting_arena_settlements.model_id
          WHERE ai_models.deleted_at IS NULL
          GROUP BY betting_arena_settlements.round_id
        ) AS settlement_totals ON settlement_totals.round_id = betting_arena_rounds.id
        WHERE betting_arena_rounds.id = ?
      `
    )
    .get(id) as RoundRow | undefined;

  if (!row) {
    throw new Error(`Betting arena round not found: ${id}`);
  }

  return toRoundDto(db, row, countAccounts(db));
}

function getRoundByDate(db: Database, roundDate: string): BettingArenaRoundDto | null {
  const row = db
    .prepare(
      `
        SELECT
          betting_arena_rounds.id,
          betting_arena_rounds.round_date,
          betting_arena_rounds.round_sequence,
          betting_arena_rounds.status,
          betting_arena_rounds.lock_time,
          betting_arena_rounds.battle_context_json,
          betting_arena_rounds.created_at,
          betting_arena_rounds.updated_at,
          COALESCE(slip_totals.total_staked, 0) AS total_staked,
          COALESCE(slip_totals.potential_return, 0) AS potential_return,
          COALESCE(settlement_totals.settled_return, 0) AS settled_return
        FROM betting_arena_rounds
        LEFT JOIN (
          SELECT
            betting_arena_slips.round_id,
            SUM(total_stake) AS total_staked,
            SUM(potential_return) AS potential_return
          FROM betting_arena_slips
          INNER JOIN ai_models ON ai_models.id = betting_arena_slips.model_id
          WHERE ai_models.deleted_at IS NULL
          GROUP BY betting_arena_slips.round_id
        ) AS slip_totals ON slip_totals.round_id = betting_arena_rounds.id
        LEFT JOIN (
          SELECT
            betting_arena_settlements.round_id,
            SUM(returned_amount) AS settled_return
          FROM betting_arena_settlements
          INNER JOIN ai_models ON ai_models.id = betting_arena_settlements.model_id
          WHERE ai_models.deleted_at IS NULL
          GROUP BY betting_arena_settlements.round_id
        ) AS settlement_totals ON settlement_totals.round_id = betting_arena_rounds.id
        WHERE betting_arena_rounds.round_date = ?
        ORDER BY betting_arena_rounds.round_sequence DESC, betting_arena_rounds.created_at DESC
        LIMIT 1
      `
    )
    .get(roundDate) as RoundRow | undefined;

  return row ? toRoundDto(db, row, countAccounts(db)) : null;
}

function getLatestRound(db: Database): BettingArenaRoundDto | null {
  const row = db
    .prepare(
      `
        SELECT
          betting_arena_rounds.id,
          betting_arena_rounds.round_date,
          betting_arena_rounds.round_sequence,
          betting_arena_rounds.status,
          betting_arena_rounds.lock_time,
          betting_arena_rounds.battle_context_json,
          betting_arena_rounds.created_at,
          betting_arena_rounds.updated_at,
          COALESCE(slip_totals.total_staked, 0) AS total_staked,
          COALESCE(slip_totals.potential_return, 0) AS potential_return,
          COALESCE(settlement_totals.settled_return, 0) AS settled_return
        FROM betting_arena_rounds
        LEFT JOIN (
          SELECT
            betting_arena_slips.round_id,
            SUM(total_stake) AS total_staked,
            SUM(potential_return) AS potential_return
          FROM betting_arena_slips
          INNER JOIN ai_models ON ai_models.id = betting_arena_slips.model_id
          WHERE ai_models.deleted_at IS NULL
          GROUP BY betting_arena_slips.round_id
        ) AS slip_totals ON slip_totals.round_id = betting_arena_rounds.id
        LEFT JOIN (
          SELECT
            betting_arena_settlements.round_id,
            SUM(returned_amount) AS settled_return
          FROM betting_arena_settlements
          INNER JOIN ai_models ON ai_models.id = betting_arena_settlements.model_id
          WHERE ai_models.deleted_at IS NULL
          GROUP BY betting_arena_settlements.round_id
        ) AS settlement_totals ON settlement_totals.round_id = betting_arena_rounds.id
        ORDER BY betting_arena_rounds.round_date DESC, betting_arena_rounds.round_sequence DESC, betting_arena_rounds.created_at DESC
        LIMIT 1
      `
    )
    .get() as RoundRow | undefined;

  return row ? toRoundDto(db, row, countAccounts(db)) : null;
}

function listRoundHistory(db: Database, limit = 12): BettingArenaDto["history"] {
  const extremes = getRoundModelProfitExtremes(db);
  const rows = db
    .prepare(
      `
        SELECT
          betting_arena_rounds.id,
          betting_arena_rounds.round_date,
          betting_arena_rounds.round_sequence,
          betting_arena_rounds.status,
          betting_arena_rounds.lock_time,
          betting_arena_rounds.battle_context_json,
          betting_arena_rounds.created_at,
          betting_arena_rounds.updated_at,
          COALESCE(slip_totals.total_staked, 0) AS total_staked,
          COALESCE(slip_totals.potential_return, 0) AS potential_return,
          COALESCE(settlement_totals.settled_return, 0) AS settled_return
        FROM betting_arena_rounds
        LEFT JOIN (
          SELECT
            betting_arena_slips.round_id,
            SUM(total_stake) AS total_staked,
            SUM(potential_return) AS potential_return
          FROM betting_arena_slips
          INNER JOIN ai_models ON ai_models.id = betting_arena_slips.model_id
          WHERE ai_models.deleted_at IS NULL
          GROUP BY betting_arena_slips.round_id
        ) AS slip_totals ON slip_totals.round_id = betting_arena_rounds.id
        LEFT JOIN (
          SELECT
            betting_arena_settlements.round_id,
            SUM(returned_amount) AS settled_return
          FROM betting_arena_settlements
          INNER JOIN ai_models ON ai_models.id = betting_arena_settlements.model_id
          WHERE ai_models.deleted_at IS NULL
          GROUP BY betting_arena_settlements.round_id
        ) AS settlement_totals ON settlement_totals.round_id = betting_arena_rounds.id
        ORDER BY betting_arena_rounds.round_date DESC, betting_arena_rounds.round_sequence DESC, betting_arena_rounds.created_at DESC
        LIMIT ?
      `
    )
    .all(limit) as RoundRow[];

  return rows.map((row) => {
    const roundExtremes = extremes.get(row.id);
    return {
      roundId: row.id,
      roundDate: row.round_date,
      roundSequence: toNumber(row.round_sequence) || 1,
      status: row.status,
      totalStaked: toNumber(row.total_staked),
      totalReturned: toNumber(row.settled_return),
      bestModelDisplayName: roundExtremes?.bestModelDisplayName ?? null,
      worstModelDisplayName: roundExtremes?.worstModelDisplayName ?? null
    };
  });
}

export function ensureBettingArenaAccounts(db: Database, now = new Date()): void {
  const timestamp = now.toISOString();

  db.prepare(
    `
      INSERT INTO betting_arena_accounts (
        model_id,
        initial_bankroll,
        available_bankroll,
        frozen_stake,
        total_staked,
        total_returned,
        order_count,
        settled_order_count,
        hit_count,
        failed_generation_count,
        last_review,
        created_at,
        updated_at
      )
      SELECT
        ai_models.id,
        ?,
        ?,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        '',
        ?,
        ?
      FROM ai_models
      INNER JOIN ai_providers ON ai_providers.id = ai_models.provider_id
      WHERE ai_models.enabled = 1
        AND ai_models.deleted_at IS NULL
        AND ai_providers.enabled = 1
        AND ai_providers.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM betting_arena_accounts
          WHERE betting_arena_accounts.model_id = ai_models.id
        )
      ORDER BY ai_models.display_name ASC
    `
  ).run(INITIAL_BANKROLL, INITIAL_BANKROLL, timestamp, timestamp);
}

export function listBettingArenaAccounts(db: Database): BettingArenaAccountDto[] {
  const totalRounds = countRounds(db);
  const settlementMetrics = getAccountSettlementMetrics(db);
  const rows = db
    .prepare(
      `
        SELECT
          betting_arena_accounts.model_id,
          ai_models.display_name AS model_display_name,
          betting_arena_accounts.initial_bankroll,
          betting_arena_accounts.available_bankroll,
          betting_arena_accounts.frozen_stake,
          betting_arena_accounts.total_staked,
          betting_arena_accounts.total_returned,
          betting_arena_accounts.order_count,
          betting_arena_accounts.settled_order_count,
          betting_arena_accounts.hit_count,
          betting_arena_accounts.failed_generation_count,
          betting_arena_accounts.last_review
        FROM betting_arena_accounts
        INNER JOIN ai_models ON ai_models.id = betting_arena_accounts.model_id
        WHERE ai_models.deleted_at IS NULL
        ORDER BY
          CASE
            WHEN betting_arena_accounts.initial_bankroll > 0 THEN
              (
                betting_arena_accounts.available_bankroll +
                betting_arena_accounts.frozen_stake -
                betting_arena_accounts.initial_bankroll
              ) / betting_arena_accounts.initial_bankroll
            ELSE 0
          END DESC,
          ai_models.display_name ASC
      `
    )
    .all() as AccountRow[];

  return rows.map((row, index) =>
    toAccountDto(row, index + 1, totalRounds, settlementMetrics.get(row.model_id) ?? { settledPickCount: 0, hitPickCount: 0 })
  );
}

export function createBettingArenaRound(db: Database, input: CreateBettingArenaRoundInput): BettingArenaRoundDto {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const id = randomUUID();

  ensureBettingArenaAccounts(db, now);

  const existingRound = getRoundByDate(db, input.roundDate);
  if (existingRound && existingRound.status !== "settled") {
    return existingRound;
  }
  const roundSequence = existingRound ? existingRound.roundSequence + 1 : 1;

  db.prepare(
    `
      INSERT INTO betting_arena_rounds (
        id,
        round_date,
        round_sequence,
        status,
        lock_time,
        battle_context_json,
        external_intel_json,
        failure_reason,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    id,
    input.roundDate,
    roundSequence,
    "draft",
    input.lockTime,
    JSON.stringify(input.battleContext),
    JSON.stringify(input.externalIntel),
    null,
    timestamp,
    timestamp
  );

  return getRoundById(db, id);
}

export function getBettingArenaSummary(db: Database, roundId?: string): BettingArenaDto {
  ensureBettingArenaAccounts(db);

  const accounts = listBettingArenaAccounts(db);
  const currentRound = roundId ? getRoundById(db, roundId) : getLatestRound(db);

  return {
    accounts,
    currentRound,
    slips: currentRound ? listRoundSlips(db, currentRound.id, currentRound.battleContext) : [],
    history: listRoundHistory(db)
  };
}

export function listBettingArenaLedger(
  db: Database,
  input: { modelId?: string | null; limit?: number; offset?: number } = {}
): BettingArenaLedgerDto {
  ensureBettingArenaAccounts(db);
  const modelId = input.modelId ?? null;
  const limit = normalizeLedgerLimit(input.limit);
  const offset = normalizeLedgerOffset(input.offset);
  const whereSql = modelId ? "WHERE betting_arena_slips.model_id = ? AND ai_models.deleted_at IS NULL" : "WHERE ai_models.deleted_at IS NULL";
  const countParams = modelId ? [modelId] : [];
  const totalRow = db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM betting_arena_slips
        INNER JOIN ai_models ON ai_models.id = betting_arena_slips.model_id
        ${whereSql}
      `
    )
    .get(...countParams) as { total: number };
  const rows = db
    .prepare(
      `
        SELECT
          betting_arena_rounds.id,
          betting_arena_rounds.round_date,
          betting_arena_rounds.round_sequence,
          betting_arena_rounds.status,
          betting_arena_rounds.lock_time,
          betting_arena_rounds.battle_context_json,
          betting_arena_rounds.created_at,
          betting_arena_rounds.updated_at,
          COALESCE(betting_arena_slips.total_stake, 0) AS total_staked,
          COALESCE(betting_arena_slips.potential_return, 0) AS potential_return,
          COALESCE(betting_arena_settlements.returned_amount, 0) AS settled_return,
          betting_arena_slips.id AS slip_id
        FROM betting_arena_slips
        INNER JOIN betting_arena_rounds ON betting_arena_rounds.id = betting_arena_slips.round_id
        INNER JOIN ai_models ON ai_models.id = betting_arena_slips.model_id
        LEFT JOIN betting_arena_settlements ON betting_arena_settlements.slip_id = betting_arena_slips.id
        ${whereSql}
        ORDER BY
          betting_arena_rounds.round_date DESC,
          betting_arena_rounds.round_sequence DESC,
          betting_arena_slips.created_at DESC,
          betting_arena_slips.id DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(...countParams, limit, offset) as Array<RoundRow & { slip_id: string }>;
  const items = rows.flatMap((row) => {
    const round = toRoundDto(db, row, countAccounts(db));
    const slip = listRoundSlips(db, round.id, round.battleContext).find((entry) => entry.id === row.slip_id);
    return slip ? [{ round, slip }] : [];
  });
  return {
    items,
    total: toNumber(totalRow.total),
    limit,
    offset,
    modelId
  };
}
