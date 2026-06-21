import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { BettingArenaDto, BettingArenaParlayDto, BettingArenaSingleDto } from "@worldcup-ai-pk/shared";
import { runOpenAiCompatiblePrediction } from "../ai/openAiCompatibleClient";
import { refreshFixtureContext } from "../context/fixtureContext.service";
import { DongqiudiClient } from "../football/dongqiudiClient";
import { getDongqiudiMappingByFixtureId } from "../football/dongqiudiMapping.repository";
import { SportteryClient } from "../football/sportteryClient";
import { getSportteryMappingByFixtureId } from "../football/sportteryMapping.repository";
import { collectExternalIntelForMatch } from "../external-intel/externalIntelCollector";
import { DuckDuckGoHtmlWebSearchProvider } from "../external-intel/webSearchProvider";
import { isDongqiudiEnabled, isSportteryEnabled } from "../settings/settings.repository";
import { worldCupTeamNamesZh } from "../teams/worldCupTeamNames.zh";
import { buildAccountContext, buildBattleContext, enrichBattleContext, type BattleContext } from "./bettingArena.context";
import { buildBettingArenaPrompt } from "./bettingArenaPrompts";
import { createBettingArenaRound, ensureBettingArenaAccounts, getBettingArenaSummary } from "./bettingArena.repository";
import { settleParsedSlip, type BettingArenaSettlementResult } from "./bettingArenaSettlement";
import { parseBettingArenaSlip } from "./bettingArenaSlip";

const bettingArenaMatchWindowHours = 36;

interface EnabledModelRow {
  model_id: string;
  model_name: string;
  model_display_name: string;
  base_url: string;
  api_key: string;
  context_window_tokens: number;
  max_output_tokens: number;
  request_timeout_ms: number;
  request_retry_count: number;
}

interface SaveSlipInput {
  id: string;
  roundId: string;
  modelId: string;
  action: string;
  status: string;
  totalStake: number;
  potentialReturn: number;
  riskLevel: string;
  rawResponse: string;
  outputJson: string;
  parsedSlipJson: string;
  accountContextJson: string;
  validationError: string | null;
  timestamp: string;
}

interface BettingArenaMatchContextRow {
  id: string;
  api_football_fixture_id: number;
  kickoff_at: string;
  home_team_id: string;
  home_team_name: string;
  home_team_display_name_zh: string | null;
  home_team_display_name_source: string | null;
  away_team_id: string;
  away_team_name: string;
  away_team_display_name_zh: string | null;
  away_team_display_name_source: string | null;
}

interface SettlementSlipRow {
  id: string;
  round_id: string;
  model_id: string;
  total_stake: number;
  parsed_slip_json: string;
}

interface SettlementMatchRow {
  id: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
}

interface RoundBattleContextRow {
  id: string;
  status: string;
  battle_context_json: string;
}

interface ReplaceableSlipRow {
  action: string;
  status: string;
  total_stake: number;
}

interface ParsedSettlementSlip {
  totalStake: number;
  singles: BettingArenaSingleDto[];
  parlays: BettingArenaParlayDto[];
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function resolveDisplayNameZh(input: { teamId: string; originalName: string; displayNameZh: string | null; displayNameSource: string | null }): string {
  return input.displayNameSource === "admin" ? input.displayNameZh ?? input.originalName : worldCupTeamNamesZh[input.teamId] ?? input.displayNameZh ?? input.originalName;
}

function listEnabledModels(db: Database): EnabledModelRow[] {
  return db
    .prepare(
      `
        SELECT
          ai_models.id AS model_id,
          ai_models.model_name,
          ai_models.display_name AS model_display_name,
          ai_models.context_window_tokens,
          ai_models.max_output_tokens,
          ai_models.request_timeout_ms,
          ai_models.request_retry_count,
          ai_providers.base_url,
          ai_providers.api_key
        FROM ai_models
        INNER JOIN ai_providers ON ai_providers.id = ai_models.provider_id
        WHERE ai_models.enabled = 1
          AND ai_models.deleted_at IS NULL
          AND ai_providers.enabled = 1
          AND ai_providers.deleted_at IS NULL
        ORDER BY ai_models.display_name ASC
      `
    )
    .all() as EnabledModelRow[];
}

function getEnabledModel(db: Database, modelId: string): EnabledModelRow | null {
  const row = db
    .prepare(
      `
        SELECT
          ai_models.id AS model_id,
          ai_models.model_name,
          ai_models.display_name AS model_display_name,
          ai_models.context_window_tokens,
          ai_models.max_output_tokens,
          ai_models.request_timeout_ms,
          ai_models.request_retry_count,
          ai_providers.base_url,
          ai_providers.api_key
        FROM ai_models
        INNER JOIN ai_providers ON ai_providers.id = ai_models.provider_id
        WHERE ai_models.id = ?
          AND ai_models.enabled = 1
          AND ai_models.deleted_at IS NULL
          AND ai_providers.enabled = 1
          AND ai_providers.deleted_at IS NULL
      `
    )
    .get(modelId) as EnabledModelRow | undefined;
  return row ?? null;
}

function listMatchesForBattleContextRefresh(db: Database, matchWindowStart: string, matchWindowEnd: string): BettingArenaMatchContextRow[] {
  return db
    .prepare(
      `
        SELECT
          matches.id,
          matches.api_football_fixture_id,
          matches.home_team_id,
          matches.home_team_name,
          home_display.display_name_zh AS home_team_display_name_zh,
          home_display.source AS home_team_display_name_source,
          matches.away_team_id,
          matches.away_team_name,
          away_display.display_name_zh AS away_team_display_name_zh,
          away_display.source AS away_team_display_name_source
        FROM matches
        LEFT JOIN team_display_names AS home_display ON home_display.api_football_team_id = matches.home_team_id
        LEFT JOIN team_display_names AS away_display ON away_display.api_football_team_id = matches.away_team_id
        WHERE matches.status = 'scheduled'
          AND matches.kickoff_at >= ?
          AND matches.kickoff_at < ?
        ORDER BY matches.kickoff_at ASC
      `
    )
    .all(matchWindowStart, matchWindowEnd) as BettingArenaMatchContextRow[];
}

function listCompletedRoundSlipModelIds(db: Database, roundId: string): Set<string> {
  const rows = db.prepare("SELECT model_id FROM betting_arena_slips WHERE round_id = ? AND status != ?").all(roundId, "generation_failed") as Array<{
    model_id: string;
  }>;
  return new Set(rows.map((row) => row.model_id));
}

function battleContextHasSportteryPools(battleContext: unknown): boolean {
  if (!battleContext || typeof battleContext !== "object" || !("matches" in battleContext)) {
    return false;
  }
  const matches = (battleContext as { matches: unknown }).matches;
  if (!Array.isArray(matches)) {
    return false;
  }
  return matches.some((match) => {
    if (!match || typeof match !== "object" || !("sportteryPools" in match)) {
      return false;
    }
    const sportteryPools = (match as { sportteryPools: unknown }).sportteryPools;
    return Array.isArray(sportteryPools) && sportteryPools.length > 0;
  });
}

function deleteStaleEmptyDataRound(db: Database, roundDate: string, nextBattleContext: unknown): void {
  if (!battleContextHasSportteryPools(nextBattleContext)) {
    return;
  }

  const existingRound = db
    .prepare(
      `
        SELECT id, battle_context_json
        FROM betting_arena_rounds
        WHERE round_date = ?
        ORDER BY created_at DESC
        LIMIT 1
      `
    )
    .get(roundDate) as { id: string; battle_context_json: string } | undefined;
  if (!existingRound) {
    return;
  }

  const stakeRow = db.prepare("SELECT COALESCE(SUM(total_stake), 0) AS total_stake FROM betting_arena_slips WHERE round_id = ?").get(existingRound.id) as {
    total_stake: number;
  };
  const totalStake = Number(stakeRow.total_stake ?? 0);
  if (totalStake > 0) {
    return;
  }

  let existingContext: unknown = null;
  try {
    existingContext = JSON.parse(existingRound.battle_context_json);
  } catch {
    existingContext = null;
  }
  if (battleContextHasSportteryPools(existingContext)) {
    return;
  }

  db.prepare("DELETE FROM betting_arena_rounds WHERE id = ?").run(existingRound.id);
}

function saveRoundSlip(db: Database, input: SaveSlipInput): void {
  db.prepare(
    `
      INSERT INTO betting_arena_slips (
        id,
        round_id,
        model_id,
        action,
        status,
        total_stake,
        potential_return,
        risk_level,
        raw_response,
        output_json,
        parsed_slip_json,
        account_context_json,
        validation_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(round_id, model_id) DO UPDATE SET
        action = excluded.action,
        status = excluded.status,
        total_stake = excluded.total_stake,
        potential_return = excluded.potential_return,
        risk_level = excluded.risk_level,
        raw_response = excluded.raw_response,
        output_json = excluded.output_json,
        parsed_slip_json = excluded.parsed_slip_json,
        account_context_json = excluded.account_context_json,
        validation_error = excluded.validation_error,
        updated_at = excluded.updated_at
    `
  ).run(
    input.id,
    input.roundId,
    input.modelId,
    input.action,
    input.status,
    input.totalStake,
    input.potentialReturn,
    input.riskLevel,
    input.rawResponse,
    input.outputJson,
    input.parsedSlipJson,
    input.accountContextJson,
    input.validationError,
    input.timestamp,
    input.timestamp
  );
}

function getRoundBattleContext(db: Database, roundId: string): BattleContext {
  const row = db
    .prepare("SELECT id, status, battle_context_json FROM betting_arena_rounds WHERE id = ?")
    .get(roundId) as RoundBattleContextRow | undefined;
  if (!row) {
    throw new Error(`Betting arena round not found: ${roundId}`);
  }
  return enrichBattleContext(db, JSON.parse(row.battle_context_json)) as BattleContext;
}

function getReplaceableSlip(db: Database, input: { roundId: string; modelId: string }): ReplaceableSlipRow | null {
  const row = db
    .prepare(
      `
        SELECT action, status, total_stake
        FROM betting_arena_slips
        WHERE round_id = ?
          AND model_id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM betting_arena_settlements
            WHERE betting_arena_settlements.slip_id = betting_arena_slips.id
          )
      `
    )
    .get(input.roundId, input.modelId) as ReplaceableSlipRow | undefined;
  return row ?? null;
}

function hasRoundSlipForModel(db: Database, input: { roundId: string; modelId: string }): boolean {
  const row = db
    .prepare(
      `
        SELECT id
        FROM betting_arena_slips
        WHERE round_id = ?
          AND model_id = ?
        LIMIT 1
      `
    )
    .get(input.roundId, input.modelId) as { id: string } | undefined;
  return Boolean(row);
}

function claimRoundSlipForModel(db: Database, input: { roundId: string; modelId: string; timestamp: string }): boolean {
  const result = db
    .prepare(
      `
        INSERT OR IGNORE INTO betting_arena_slips (
          id,
          round_id,
          model_id,
          action,
          status,
          total_stake,
          potential_return,
          risk_level,
          raw_response,
          output_json,
          parsed_slip_json,
          account_context_json,
          validation_error,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      randomUUID(),
      input.roundId,
      input.modelId,
      "hold",
      "pending",
      0,
      0,
      "low",
      "",
      "{}",
      "{}",
      "{}",
      null,
      input.timestamp,
      input.timestamp
    );
  return result.changes > 0;
}

function rollbackReplaceableSlipStake(db: Database, input: { roundId: string; modelId: string; timestamp: string }): boolean {
  const existing = getReplaceableSlip(db, input);
  if (!existing) {
    return false;
  }
  const stake = Number(existing.total_stake ?? 0);
  if (existing.action === "bet" && existing.status === "accepted" && stake > 0) {
    db.prepare(
      `
        UPDATE betting_arena_accounts
        SET available_bankroll = available_bankroll + ?,
            frozen_stake = CASE
              WHEN frozen_stake >= ? THEN frozen_stake - ?
              ELSE 0
            END,
            total_staked = CASE
              WHEN total_staked >= ? THEN total_staked - ?
              ELSE 0
            END,
            order_count = CASE
              WHEN order_count > 0 THEN order_count - 1
              ELSE 0
            END,
            updated_at = ?
        WHERE model_id = ?
      `
    ).run(stake, stake, stake, stake, stake, input.timestamp, input.modelId);
  }
  return true;
}

function updateRoundStatusFromSlips(db: Database, roundId: string, timestamp: string): void {
  const pending = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM betting_arena_slips
        WHERE round_id = ?
          AND status = ?
      `
    )
    .get(roundId, "pending") as { count: number };
  db.prepare("UPDATE betting_arena_rounds SET status = ?, updated_at = ? WHERE id = ?").run(
    Number(pending.count ?? 0) > 0 ? "generating" : "locked",
    timestamp,
    roundId
  );
}

function applyAcceptedStake(db: Database, input: { modelId: string; totalStake: number; timestamp: string }): void {
  if (input.totalStake <= 0) {
    return;
  }
  db.prepare(
    `
      UPDATE betting_arena_accounts
      SET available_bankroll = available_bankroll - ?,
          frozen_stake = frozen_stake + ?,
          total_staked = total_staked + ?,
          order_count = order_count + 1,
          updated_at = ?
      WHERE model_id = ?
    `
  ).run(input.totalStake, input.totalStake, input.totalStake, input.timestamp, input.modelId);
}

async function generateRoundSlipForModel(db: Database, input: { roundId: string; model: EnabledModelRow; battleContext: BattleContext; timestamp: string }): Promise<void> {
  rollbackReplaceableSlipStake(db, { roundId: input.roundId, modelId: input.model.model_id, timestamp: input.timestamp });
  const accountContext = buildAccountContext(db, input.model.model_id);
  let rawResponse = "";
  let outputJson = "{}";
  try {
    const result = await runOpenAiCompatiblePrediction(
      {
        baseUrl: input.model.base_url,
        apiKey: input.model.api_key,
        modelName: input.model.model_name,
        contextWindowTokens: input.model.context_window_tokens,
        maxOutputTokens: input.model.max_output_tokens,
        requestTimeoutMs: input.model.request_timeout_ms,
        requestRetryCount: input.model.request_retry_count
      },
      buildBettingArenaPrompt({ battleContext: input.battleContext, accountContext })
    );
    rawResponse = result.rawResponse;
    outputJson = result.content;
    const parsed = parseBettingArenaSlip(result.content, input.battleContext, accountContext);
    saveRoundSlip(db, {
      id: randomUUID(),
      roundId: input.roundId,
      modelId: input.model.model_id,
      action: parsed.action,
      status: "accepted",
      totalStake: parsed.totalStake,
      potentialReturn: parsed.potentialReturn,
      riskLevel: parsed.riskLevel,
      rawResponse,
      outputJson,
      parsedSlipJson: JSON.stringify(parsed),
      accountContextJson: JSON.stringify(accountContext),
      validationError: null,
      timestamp: input.timestamp
    });
    applyAcceptedStake(db, { modelId: input.model.model_id, totalStake: parsed.totalStake, timestamp: input.timestamp });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Betting arena generation failed";
    saveRoundSlip(db, {
      id: randomUUID(),
      roundId: input.roundId,
      modelId: input.model.model_id,
      action: "hold",
      status: "generation_failed",
      totalStake: 0,
      potentialReturn: 0,
      riskLevel: "low",
      rawResponse,
      outputJson,
      parsedSlipJson: "{}",
      accountContextJson: JSON.stringify(accountContext),
      validationError: message,
      timestamp: input.timestamp
    });
    db.prepare("UPDATE betting_arena_accounts SET failed_generation_count = failed_generation_count + 1, updated_at = ? WHERE model_id = ?").run(input.timestamp, input.model.model_id);
  }
}

function parseSettlementSlip(value: string): ParsedSettlementSlip {
  const parsed = JSON.parse(value) as Partial<ParsedSettlementSlip>;
  return {
    totalStake: Number(parsed.totalStake ?? 0),
    singles: Array.isArray(parsed.singles) ? parsed.singles : [],
    parlays: Array.isArray(parsed.parlays) ? parsed.parlays : []
  };
}

function getSlipMatchIds(parsed: ParsedSettlementSlip): string[] {
  const ids = new Set<string>();
  for (const single of parsed.singles) {
    if (typeof single.matchId === "string" && single.matchId.length > 0) {
      ids.add(single.matchId);
    }
  }
  for (const parlay of parsed.parlays) {
    if (!Array.isArray(parlay.legs)) continue;
    for (const leg of parlay.legs) {
      if (typeof leg.matchId === "string" && leg.matchId.length > 0) {
        ids.add(leg.matchId);
      }
    }
  }
  return [...ids];
}

function listUnsettledAcceptedBetSlips(db: Database, roundId: string): SettlementSlipRow[] {
  return db
    .prepare(
      `
        SELECT
          betting_arena_slips.id,
          betting_arena_slips.round_id,
          betting_arena_slips.model_id,
          betting_arena_slips.total_stake,
          betting_arena_slips.parsed_slip_json
        FROM betting_arena_slips
        WHERE betting_arena_slips.round_id = ?
          AND betting_arena_slips.action = ?
          AND betting_arena_slips.status = ?
          AND NOT EXISTS (
            SELECT 1
            FROM betting_arena_settlements
            WHERE betting_arena_settlements.slip_id = betting_arena_slips.id
          )
        ORDER BY betting_arena_slips.created_at ASC
      `
    )
    .all(roundId, "bet", "accepted") as SettlementSlipRow[];
}

function listSettlementMatches(db: Database, matchIds: string[]): Map<string, SettlementMatchRow> {
  if (matchIds.length === 0) {
    return new Map();
  }
  const placeholders = matchIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT id, status, home_score, away_score
        FROM matches
        WHERE id IN (${placeholders})
      `
    )
    .all(...matchIds) as SettlementMatchRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

function areAllSelectedMatchesFinished(matchIds: string[], matchesById: Map<string, SettlementMatchRow>): boolean {
  if (matchIds.length === 0) {
    return true;
  }
  return matchIds.every((matchId) => {
    const match = matchesById.get(matchId);
    return Boolean(match && match.status === "finished" && match.home_score !== null && match.away_score !== null);
  });
}

function insertSettlement(db: Database, input: { slip: SettlementSlipRow; result: BettingArenaSettlementResult; timestamp: string }): void {
  db.prepare(
    `
      INSERT INTO betting_arena_settlements (
        id,
        slip_id,
        round_id,
        model_id,
        stake,
        returned_amount,
        profit,
        status,
        settlement_json,
        settled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    randomUUID(),
    input.slip.id,
    input.slip.round_id,
    input.slip.model_id,
    input.result.stake,
    input.result.returnedAmount,
    input.result.profit,
    input.result.status,
    JSON.stringify(input.result),
    input.timestamp
  );
}

function updateAccountAfterSettlement(db: Database, input: { modelId: string; result: BettingArenaSettlementResult; timestamp: string }): void {
  db.prepare(
    `
      UPDATE betting_arena_accounts
      SET available_bankroll = available_bankroll + ?,
          frozen_stake = CASE
            WHEN frozen_stake >= ? THEN frozen_stake - ?
            ELSE 0
          END,
          total_returned = total_returned + ?,
          settled_order_count = settled_order_count + 1,
          hit_count = hit_count + ?,
          updated_at = ?
      WHERE model_id = ?
    `
  ).run(
    input.result.returnedAmount,
    input.result.stake,
    input.result.stake,
    input.result.returnedAmount,
    input.result.hit ? 1 : 0,
    input.timestamp,
    input.modelId
  );
}

function updateSlipAfterSettlement(db: Database, input: { slipId: string; status: BettingArenaSettlementResult["status"]; timestamp: string }): void {
  db.prepare("UPDATE betting_arena_slips SET status = ?, updated_at = ? WHERE id = ?").run(input.status, input.timestamp, input.slipId);
}

function markRoundSettledWhenComplete(db: Database, input: { roundId: string; timestamp: string }): void {
  const pending = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM betting_arena_slips
        WHERE round_id = ?
          AND action = ?
          AND status = ?
      `
    )
    .get(input.roundId, "bet", "accepted") as { count: number };
  if (Number(pending.count ?? 0) > 0) {
    return;
  }
  db.prepare("UPDATE betting_arena_rounds SET status = ?, updated_at = ? WHERE id = ?").run("settled", input.timestamp, input.roundId);
}

function settleRoundIfReady(db: Database, roundId: string, now = new Date()): boolean {
  const timestamp = now.toISOString();
  const slips = listUnsettledAcceptedBetSlips(db, roundId);
  if (slips.length === 0) {
    return false;
  }

  const parsedSlips = slips.map((slip) => ({ slip, parsed: parseSettlementSlip(slip.parsed_slip_json) }));
  const matchIds = [...new Set(parsedSlips.flatMap(({ parsed }) => getSlipMatchIds(parsed)))];
  const matchesById = listSettlementMatches(db, matchIds);
  if (!areAllSelectedMatchesFinished(matchIds, matchesById)) {
    return false;
  }

  const matches = [...matchesById.values()].map((match) => ({
    matchId: match.id,
    status: match.status,
    homeScore: match.home_score,
    awayScore: match.away_score
  }));

  const transaction = db.transaction(() => {
    for (const { slip, parsed } of parsedSlips) {
      const result = settleParsedSlip(parsed, matches);
      insertSettlement(db, { slip, result, timestamp });
      updateSlipAfterSettlement(db, { slipId: slip.id, status: result.status, timestamp });
      updateAccountAfterSettlement(db, { modelId: slip.model_id, result, timestamp });
    }
    markRoundSettledWhenComplete(db, { roundId, timestamp });
  });
  transaction();
  return true;
}

function settleAutoReadyRounds(db: Database, now = new Date()): void {
  const rows = db
    .prepare(
      `
        SELECT id
        FROM betting_arena_rounds
        WHERE status IN (?, ?)
        ORDER BY round_date ASC, created_at ASC
      `
    )
    .all("locked", "settling") as Array<{ id: string }>;
  for (const row of rows) {
    settleRoundIfReady(db, row.id, now);
  }
}

async function refreshBettingArenaMatchContext(db: Database, input: { matchWindowStart: string; matchWindowEnd: string; now: Date }): Promise<void> {
  const dongqiudiClient = isDongqiudiEnabled(db) ? new DongqiudiClient() : null;
  const sportteryClient = isSportteryEnabled(db) ? new SportteryClient() : null;
  const matches = listMatchesForBattleContextRefresh(db, input.matchWindowStart, input.matchWindowEnd);
  for (const match of matches) {
    await refreshFixtureContext({
      db,
      matchId: match.id,
      apiFootballFixtureId: match.api_football_fixture_id,
      homeTeamId: match.home_team_id,
      homeTeamName: resolveDisplayNameZh({
        teamId: match.home_team_id,
        originalName: match.home_team_name,
        displayNameZh: match.home_team_display_name_zh,
        displayNameSource: match.home_team_display_name_source
      }),
      awayTeamId: match.away_team_id,
      awayTeamName: resolveDisplayNameZh({
        teamId: match.away_team_id,
        originalName: match.away_team_name,
        displayNameZh: match.away_team_display_name_zh,
        displayNameSource: match.away_team_display_name_source
      }),
      footballService: null,
      dongqiudiClient,
      dongqiudiMatchId: getDongqiudiMappingByFixtureId(db, match.api_football_fixture_id)?.dongqiudiMatchId ?? null,
      sportteryClient,
      sportteryMatchId: getSportteryMappingByFixtureId(db, match.api_football_fixture_id)?.sportteryMatchId ?? null,
      dataOptions: {
        useOdds: false,
        useApiFootballPrediction: false,
        useHeadToHead: false,
        usePlayerLineupInjuries: false,
        useDongqiudiIntel: Boolean(dongqiudiClient),
        useSporttery: Boolean(sportteryClient),
        useTeamProfile: true
      },
      now: input.now
    });

    const webSearchProvider = new DuckDuckGoHtmlWebSearchProvider();
    await collectExternalIntelForMatch(db, {
      matchId: match.id,
      homeTeamName: resolveDisplayNameZh({
        teamId: match.home_team_id,
        originalName: match.home_team_name,
        displayNameZh: match.home_team_display_name_zh,
        displayNameSource: match.home_team_display_name_source
      }),
      awayTeamName: resolveDisplayNameZh({
        teamId: match.away_team_id,
        originalName: match.away_team_name,
        displayNameZh: match.away_team_display_name_zh,
        displayNameSource: match.away_team_display_name_source
      }),
      kickoffAt: match.kickoff_at,
      webSearchProvider,
      now: input.now,
      forceRefresh: false
    });
  }
}

export function getBettingArena(db: Database): BettingArenaDto {
  settleAutoReadyRounds(db);
  return getBettingArenaSummary(db);
}

export async function triggerBettingArenaRound(db: Database, now = new Date()): Promise<BettingArenaDto> {
  ensureBettingArenaAccounts(db, now);
  const roundDate = now.toISOString().slice(0, 10);
  const lockTime = now.toISOString();
  const matchWindowStart = lockTime;
  const matchWindowEnd = addHours(now, bettingArenaMatchWindowHours).toISOString();
  const externalIntel = { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] };
  await refreshBettingArenaMatchContext(db, { matchWindowStart, matchWindowEnd, now });
  const battleContext = buildBattleContext(db, { roundDate, lockTime, matchWindowStart, matchWindowEnd, externalIntel });
  deleteStaleEmptyDataRound(db, roundDate, battleContext);
  const round = createBettingArenaRound(db, { roundDate, lockTime, battleContext, externalIntel, now });
  const timestamp = now.toISOString();
  const models = listEnabledModels(db);
  const completedModelIds = listCompletedRoundSlipModelIds(db, round.id);

  if (models.length > 0 && completedModelIds.size >= models.length) {
    if (round.status === "generating") {
      db.prepare("UPDATE betting_arena_rounds SET status = ?, updated_at = ? WHERE id = ?").run("locked", timestamp, round.id);
    }
    return getBettingArenaSummary(db);
  }

  db.prepare("UPDATE betting_arena_rounds SET status = ?, updated_at = ? WHERE id = ?").run("generating", timestamp, round.id);

  for (const model of models) {
    if (completedModelIds.has(model.model_id)) continue;
    await generateRoundSlipForModel(db, { roundId: round.id, model, battleContext, timestamp });
  }

  db.prepare("UPDATE betting_arena_rounds SET status = ?, updated_at = ? WHERE id = ?").run("locked", timestamp, round.id);
  return getBettingArenaSummary(db);
}

export async function triggerBettingArenaModel(db: Database, input: { roundId: string; modelId: string }, now = new Date()): Promise<BettingArenaDto> {
  ensureBettingArenaAccounts(db, now);
  const timestamp = now.toISOString();
  if (hasRoundSlipForModel(db, { roundId: input.roundId, modelId: input.modelId })) {
    updateRoundStatusFromSlips(db, input.roundId, timestamp);
    return getBettingArenaSummary(db);
  }
  const model = getEnabledModel(db, input.modelId);
  if (!model) {
    throw new Error(`Betting arena model not found: ${input.modelId}`);
  }
  if (!claimRoundSlipForModel(db, { roundId: input.roundId, modelId: input.modelId, timestamp })) {
    updateRoundStatusFromSlips(db, input.roundId, timestamp);
    return getBettingArenaSummary(db);
  }
  updateRoundStatusFromSlips(db, input.roundId, timestamp);
  const battleContext = getRoundBattleContext(db, input.roundId);
  await generateRoundSlipForModel(db, { roundId: input.roundId, model, battleContext, timestamp });
  updateRoundStatusFromSlips(db, input.roundId, timestamp);
  return getBettingArenaSummary(db);
}

export function getBettingArenaRound(db: Database, roundId: string): BettingArenaDto {
  settleRoundIfReady(db, roundId);
  const summary = getBettingArenaSummary(db);
  if (!summary.currentRound || summary.currentRound.id !== roundId) return summary;
  return summary;
}

export function settleBettingArenaRound(db: Database, roundId: string): BettingArenaDto {
  settleRoundIfReady(db, roundId);
  return getBettingArenaSummary(db);
}
