import type { Database } from "better-sqlite3";

export interface ExternalIntelInput {
  summary: string;
  dataGaps: string[];
}

export interface BattleContextSportteryOption {
  code: string;
  label: string;
  value: string;
}

export interface BattleContextSportteryPool {
  poolCode: string;
  options: BattleContextSportteryOption[];
}

export interface BattleContextMatch {
  matchId: string;
  stage: string;
  kickoffAt: string;
  status: string;
  venue: string | null;
  homeTeamName: string;
  awayTeamName: string;
  sportteryPools: BattleContextSportteryPool[];
  dataGaps: string[];
}

export interface BattleContext {
  roundDate: string;
  lockTime: string;
  externalIntel: ExternalIntelInput;
  matches: BattleContextMatch[];
}

export interface AccountContext {
  modelId: string;
  availableBankroll: number;
  frozenStake: number;
  totalAssetValue: number;
  cumulativeReturnRate: number;
  lifetimeOrderCount: number;
  lifetimeSettledOrderCount: number;
  lifetimeHitRate: number;
  lastFiveBetSlips: unknown[];
  lastFiveSettlementResults: unknown[];
  lastReview: string;
}

interface BattleContextInput {
  roundDate: string;
  lockTime: string;
  externalIntel: ExternalIntelInput;
}

interface MatchRow {
  id: string;
  stage: string;
  kickoff_at: string;
  status: string;
  venue: string | null;
  home_team_name: string;
  away_team_name: string;
}

interface FixtureContextSnapshotRow {
  match_id: string;
  raw_json: string;
}

interface AccountRow {
  model_id: string;
  initial_bankroll: number;
  available_bankroll: number;
  frozen_stake: number;
  order_count: number;
  settled_order_count: number;
  hit_count: number;
  last_review: string;
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSportteryPools(rawJson: string): BattleContextSportteryPool[] {
  let raw: unknown;
  try {
    raw = JSON.parse(rawJson);
  } catch {
    return [];
  }

  const sporttery = isRecord(raw) ? raw.sporttery : null;
  const oddsPools = isRecord(sporttery) ? sporttery.oddsPools : null;
  if (!Array.isArray(oddsPools)) return [];

  return oddsPools.flatMap((pool): BattleContextSportteryPool[] => {
    if (!isRecord(pool) || pool.status !== "available" || typeof pool.poolCode !== "string") return [];
    if (!Array.isArray(pool.options)) return [];

    const options = pool.options.flatMap((option): BattleContextSportteryOption[] => {
      if (!isRecord(option)) return [];
      if (typeof option.code !== "string" || typeof option.label !== "string" || typeof option.value !== "string") return [];
      if (!option.code || !option.label || !option.value) return [];
      return [{ code: option.code, label: option.label, value: option.value }];
    });

    return options.length > 0 ? [{ poolCode: pool.poolCode, options }] : [];
  });
}

function listLatestSportteryPoolsByMatch(db: Database): Map<string, BattleContextSportteryPool[]> {
  const rows = db
    .prepare(
      `
        SELECT snapshots.match_id, snapshots.raw_json
        FROM fixture_context_snapshots AS snapshots
        INNER JOIN (
          SELECT match_id, MAX(created_at) AS latest_created_at
          FROM fixture_context_snapshots
          GROUP BY match_id
        ) AS latest
          ON latest.match_id = snapshots.match_id
         AND latest.latest_created_at = snapshots.created_at
      `
    )
    .all() as FixtureContextSnapshotRow[];

  return new Map(rows.map((row) => [row.match_id, readSportteryPools(row.raw_json)]));
}

export function buildBattleContext(db: Database, input: BattleContextInput): BattleContext {
  const rows = db
    .prepare(
      `
        SELECT
          id,
          stage,
          kickoff_at,
          status,
          venue,
          home_team_name,
          away_team_name
        FROM matches
        WHERE status = 'scheduled'
        ORDER BY kickoff_at ASC
      `
    )
    .all() as MatchRow[];
  const sportteryPoolsByMatch = listLatestSportteryPoolsByMatch(db);

  return {
    roundDate: input.roundDate,
    lockTime: input.lockTime,
    externalIntel: input.externalIntel,
    matches: rows.map((row) => {
      const sportteryPools = sportteryPoolsByMatch.get(row.id) ?? [];
      return {
        matchId: row.id,
        stage: row.stage,
        kickoffAt: row.kickoff_at,
        status: row.status,
        venue: row.venue,
        homeTeamName: row.home_team_name,
        awayTeamName: row.away_team_name,
        sportteryPools,
        dataGaps: sportteryPools.length > 0 ? [] : ["首版 battle_context 尚未注入完整体彩玩法快照"]
      };
    })
  };
}

export function buildAccountContext(db: Database, modelId: string): AccountContext {
  const row = db
    .prepare(
      `
        SELECT
          model_id,
          initial_bankroll,
          available_bankroll,
          frozen_stake,
          order_count,
          settled_order_count,
          hit_count,
          last_review
        FROM betting_arena_accounts
        WHERE model_id = ?
      `
    )
    .get(modelId) as AccountRow | undefined;

  if (!row) {
    throw new Error(`Betting arena account not found for model ${modelId}`);
  }

  const initialBankroll = toNumber(row.initial_bankroll);
  const availableBankroll = toNumber(row.available_bankroll);
  const frozenStake = toNumber(row.frozen_stake);
  const totalAssetValue = availableBankroll + frozenStake;
  const lifetimeSettledOrderCount = toNumber(row.settled_order_count);
  const hitCount = toNumber(row.hit_count);

  return {
    modelId: row.model_id,
    availableBankroll,
    frozenStake,
    totalAssetValue,
    cumulativeReturnRate: initialBankroll > 0 ? (totalAssetValue - initialBankroll) / initialBankroll : 0,
    lifetimeOrderCount: toNumber(row.order_count),
    lifetimeSettledOrderCount,
    lifetimeHitRate: lifetimeSettledOrderCount > 0 ? hitCount / lifetimeSettledOrderCount : 0,
    lastFiveBetSlips: [],
    lastFiveSettlementResults: [],
    lastReview: row.last_review
  };
}
