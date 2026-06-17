import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { BettingArenaAccountDto, BettingArenaDto, BettingArenaRoundDto, BettingArenaSlipDto } from "@worldcup-ai-pk/shared";

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
  parsed_slip_json: string;
  validation_error: string | null;
  created_at: string;
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function calculateTotalAssetValue(row: AccountRow): number {
  return toNumber(row.available_bankroll) + toNumber(row.frozen_stake);
}

function toAccountDto(row: AccountRow, rank: number, totalRounds: number): BettingArenaAccountDto {
  const initialBankroll = toNumber(row.initial_bankroll);
  const totalAssetValue = calculateTotalAssetValue(row);
  const orderCount = toNumber(row.order_count);
  const settledOrderCount = toNumber(row.settled_order_count);
  const hitCount = toNumber(row.hit_count);
  const failedGenerationCount = toNumber(row.failed_generation_count);

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
    hitRate: settledOrderCount > 0 ? hitCount / settledOrderCount : 0,
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

function countAccounts(db: Database): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM betting_arena_accounts`).get() as { count: number };
  return toNumber(row.count);
}

function countRounds(db: Database): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM betting_arena_rounds`).get() as { count: number };
  return toNumber(row.count);
}

function toRoundDto(row: RoundRow, modelsCount: number): BettingArenaRoundDto {
  return {
    id: row.id,
    roundDate: row.round_date,
    status: row.status,
    lockTime: row.lock_time,
    eligibleMatchCount: parseEligibleMatchCount(row.battle_context_json),
    modelsCount,
    totalStaked: toNumber(row.total_staked),
    potentialReturn: toNumber(row.potential_return),
    settledReturn: toNumber(row.settled_return),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toSlipDto(row: SlipRow): BettingArenaSlipDto {
  const parsed = JSON.parse(row.parsed_slip_json || "{}") as Partial<BettingArenaSlipDto>;
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
    skipReasons: Array.isArray(parsed.skipReasons) ? parsed.skipReasons : [],
    dataGaps: Array.isArray(parsed.dataGaps) ? parsed.dataGaps : [],
    validationError: row.validation_error,
    settlementSummary: null,
    createdAt: row.created_at
  };
}

function listRoundSlips(db: Database, roundId: string): BettingArenaSlipDto[] {
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
          betting_arena_slips.parsed_slip_json,
          betting_arena_slips.validation_error,
          betting_arena_slips.created_at
        FROM betting_arena_slips
        INNER JOIN ai_models ON ai_models.id = betting_arena_slips.model_id
        WHERE betting_arena_slips.round_id = ?
        ORDER BY betting_arena_slips.created_at ASC, ai_models.display_name ASC
      `
    )
    .all(roundId) as SlipRow[];

  return rows.map(toSlipDto);
}

function getRoundById(db: Database, id: string): BettingArenaRoundDto {
  const row = db
    .prepare(
      `
        SELECT
          betting_arena_rounds.id,
          betting_arena_rounds.round_date,
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
            round_id,
            SUM(total_stake) AS total_staked,
            SUM(potential_return) AS potential_return
          FROM betting_arena_slips
          GROUP BY round_id
        ) AS slip_totals ON slip_totals.round_id = betting_arena_rounds.id
        LEFT JOIN (
          SELECT
            round_id,
            SUM(returned_amount) AS settled_return
          FROM betting_arena_settlements
          GROUP BY round_id
        ) AS settlement_totals ON settlement_totals.round_id = betting_arena_rounds.id
        WHERE betting_arena_rounds.id = ?
      `
    )
    .get(id) as RoundRow | undefined;

  if (!row) {
    throw new Error(`Betting arena round not found: ${id}`);
  }

  return toRoundDto(row, countAccounts(db));
}

function getRoundByDate(db: Database, roundDate: string): BettingArenaRoundDto | null {
  const row = db
    .prepare(
      `
        SELECT
          betting_arena_rounds.id,
          betting_arena_rounds.round_date,
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
            round_id,
            SUM(total_stake) AS total_staked,
            SUM(potential_return) AS potential_return
          FROM betting_arena_slips
          GROUP BY round_id
        ) AS slip_totals ON slip_totals.round_id = betting_arena_rounds.id
        LEFT JOIN (
          SELECT
            round_id,
            SUM(returned_amount) AS settled_return
          FROM betting_arena_settlements
          GROUP BY round_id
        ) AS settlement_totals ON settlement_totals.round_id = betting_arena_rounds.id
        WHERE betting_arena_rounds.round_date = ?
      `
    )
    .get(roundDate) as RoundRow | undefined;

  return row ? toRoundDto(row, countAccounts(db)) : null;
}

function getLatestRound(db: Database): BettingArenaRoundDto | null {
  const row = db
    .prepare(
      `
        SELECT
          betting_arena_rounds.id,
          betting_arena_rounds.round_date,
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
            round_id,
            SUM(total_stake) AS total_staked,
            SUM(potential_return) AS potential_return
          FROM betting_arena_slips
          GROUP BY round_id
        ) AS slip_totals ON slip_totals.round_id = betting_arena_rounds.id
        LEFT JOIN (
          SELECT
            round_id,
            SUM(returned_amount) AS settled_return
          FROM betting_arena_settlements
          GROUP BY round_id
        ) AS settlement_totals ON settlement_totals.round_id = betting_arena_rounds.id
        ORDER BY betting_arena_rounds.round_date DESC, betting_arena_rounds.created_at DESC
        LIMIT 1
      `
    )
    .get() as RoundRow | undefined;

  return row ? toRoundDto(row, countAccounts(db)) : null;
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
        AND ai_providers.enabled = 1
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

  return rows.map((row, index) => toAccountDto(row, index + 1, totalRounds));
}

export function createBettingArenaRound(db: Database, input: CreateBettingArenaRoundInput): BettingArenaRoundDto {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const id = randomUUID();

  ensureBettingArenaAccounts(db, now);

  const existingRound = getRoundByDate(db, input.roundDate);
  if (existingRound) {
    return existingRound;
  }

  db.prepare(
    `
      INSERT INTO betting_arena_rounds (
        id,
        round_date,
        status,
        lock_time,
        battle_context_json,
        external_intel_json,
        failure_reason,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    id,
    input.roundDate,
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

export function getBettingArenaSummary(db: Database): BettingArenaDto {
  ensureBettingArenaAccounts(db);

  const accounts = listBettingArenaAccounts(db);
  const currentRound = getLatestRound(db);

  return {
    accounts,
    currentRound,
    slips: currentRound ? listRoundSlips(db, currentRound.id) : [],
    history: currentRound
      ? [
          {
            roundId: currentRound.id,
            roundDate: currentRound.roundDate,
            status: currentRound.status,
            totalStaked: currentRound.totalStaked,
            totalReturned: currentRound.settledReturn,
            bestModelDisplayName: null,
            worstModelDisplayName: null
          }
        ]
      : []
  };
}
