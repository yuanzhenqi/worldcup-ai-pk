import type { Database } from "better-sqlite3";
import { getWc26Injuries, getWc26Matchup, getWc26TeamProfile, resolveWc26TeamId, type Wc26Injury } from "../../data/wc26";
import type { ExternalIntelSummaryDto, FixtureContextSummaryDto, StructuredDataGapDto } from "@worldcup-ai-pk/shared";
import { getLatestExternalIntelSnapshotByMatch } from "../external-intel/externalIntel.repository";
import { parseSportteryOddsPools } from "../context/sportteryContextParsers";
import { parseDongqiudiIntelSummary, type DongqiudiComparison } from "../context/dongqiudiContextParsers";
import { loadWorldCupStandings, type GroupStandingRow } from "../context/worldCupStandings";
import { worldCupTeamNamesZh } from "../teams/worldCupTeamNames.zh";

export interface ExternalIntelInput {
  summary: string;
  dataGaps: string[];
}

export interface BattleContextSportteryOption {
  code: string;
  label: string;
  value: string;
  goalLine: string | null;
}

export interface BattleContextSportteryPool {
  poolCode: string;
  options: BattleContextSportteryOption[];
}

export interface BattleContextTeamProfile {
  wc26TeamId: string | null;
  coach: string | null;
  playingStyle: string | null;
  keyPlayers: Array<{ name: string; position: string; club: string }>;
  worldCupHistory: { appearances: number; bestResult: string; titles: number } | null;
  qualifyingSummary: string | null;
  injuries: Array<Pick<Wc26Injury, "player" | "position" | "injury" | "status" | "expected_return" | "last_updated" | "source">>;
  marketValue: null;
}

export interface BattleContextHistoricalMatchup {
  totalMatches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  homeGoals: number;
  awayGoals: number;
  summary: string;
  meetings: Array<{ year: number; hostCountry: string; round: string; score: string; result: string; venueCity: string }>;
}

export interface BattleContextGroupStanding {
  group: string;
  rank: number;
  teamId: string;
  teamName: string;
  points: number;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  description: string | null;
}

export interface BattleContextMatch {
  matchId: string;
  stage: string;
  kickoffAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamProfile: BattleContextTeamProfile;
  awayTeamProfile: BattleContextTeamProfile;
  historicalMatchup: BattleContextHistoricalMatchup | null;
  contextDomains: FixtureContextSummaryDto["domains"];
  sportteryPools: BattleContextSportteryPool[];
  externalIntel: ExternalIntelSummaryDto;
  groupStandings: BattleContextGroupStanding[] | null;
  dongqiudiComparison: DongqiudiComparison | null;
  dataGaps: Array<string | StructuredDataGapDto>;
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
  matchWindowStart?: string;
  matchWindowEnd?: string;
  externalIntel: ExternalIntelInput;
}

interface MatchRow {
  id: string;
  stage: string;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
  home_team_id: string;
  home_team_name: string;
  home_team_display_name_zh: string | null;
  home_team_display_name_source: string | null;
  away_team_id: string;
  away_team_name: string;
  away_team_display_name_zh: string | null;
  away_team_display_name_source: string | null;
}

interface FixtureContextSnapshotRow {
  match_id: string;
  raw_json: string;
  odds_summary_json: string;
  api_prediction_summary_json: string;
  head_to_head_summary_json: string;
  squad_summary_json: string;
  dongqiudi_intel_summary_json: string;
  sporttery_summary_json: string;
  team_profile_summary_json: string;
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

interface RecentSlipRow {
  round_date: string;
  action: string;
  status: string;
  total_stake: number;
  potential_return: number;
  risk_level: string;
  parsed_slip_json: string;
  created_at: string;
}

interface RecentSettlementRow {
  round_date: string;
  stake: number;
  returned_amount: number;
  profit: number;
  status: string;
  settlement_json: string;
  settled_at: string;
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseJsonOrNull(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];
}

function readStructuredDataGaps(value: unknown): Array<string | StructuredDataGapDto> {
  if (!Array.isArray(value)) {
    return [];
  }

  const gaps: Array<string | StructuredDataGapDto> = [];
  for (const item of value) {
    if (typeof item === "string") {
      gaps.push(item);
      continue;
    }
    if (!isRecord(item)) {
      continue;
    }
    if (typeof item.source !== "string" || typeof item.code !== "string" || typeof item.message !== "string") {
      continue;
    }
    gaps.push({ source: item.source, code: item.code, message: item.message });
  }
  return gaps;
}

function parseExternalIntelSummary(value: string): ExternalIntelSummaryDto | null {
  const parsed = parseJsonOrNull(value);
  if (!isRecord(parsed) || typeof parsed.status !== "string") {
    return null;
  }

  const status: ExternalIntelSummaryDto["status"] =
    parsed.status === "cached" || parsed.status === "not_configured" || parsed.status === "failed" || parsed.status === "summary_failed"
      ? parsed.status
      : "failed";

  return {
    status,
    summary: readStringValue(parsed.summary),
    injuryNews: readStringArray(parsed.injuryNews),
    lineupNews: readStringArray(parsed.lineupNews),
    motivation: readStringArray(parsed.motivation),
    recentFormNews: readStringArray(parsed.recentFormNews),
    riskSignals: readStringArray(parsed.riskSignals),
    sourceLinks: Array.isArray(parsed.sourceLinks)
      ? parsed.sourceLinks.flatMap((item) => {
          if (!isRecord(item)) {
            return [];
          }
          if (
            typeof item.title !== "string" ||
            typeof item.url !== "string" ||
            typeof item.sourceDomain !== "string" ||
            !("publishedAt" in item)
          ) {
            return [];
          }
          return [
            {
              title: item.title,
              url: item.url,
              sourceDomain: item.sourceDomain,
              publishedAt: typeof item.publishedAt === "string" || item.publishedAt === null ? item.publishedAt : null
            }
          ];
        })
      : [],
    confidence: parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low" ? parsed.confidence : "low",
    dataGaps: readStructuredDataGaps(parsed.dataGaps),
    collectedAt: typeof parsed.collectedAt === "string" ? parsed.collectedAt : null
  };
}

function getExternalIntelForMatch(db: Database, matchId: string): ExternalIntelSummaryDto {
  const snapshot = getLatestExternalIntelSnapshotByMatch(db, matchId);
  const summary = snapshot ? parseExternalIntelSummary(snapshot.summary_json) : null;
  return (
    summary ?? {
      status: "not_configured",
      summary: "",
      injuryNews: [],
      lineupNews: [],
      motivation: [],
      recentFormNews: [],
      riskSignals: [],
      sourceLinks: [],
      confidence: "low",
      dataGaps: [{ source: "external_intel", code: "not_configured", message: "统一外部情报尚未采集" }],
      collectedAt: null
    }
  );
}

function listRecentBetSlipSummaries(db: Database, modelId: string): unknown[] {
  const rows = db
    .prepare(
      `
        SELECT
          betting_arena_rounds.round_date,
          betting_arena_slips.action,
          betting_arena_slips.status,
          betting_arena_slips.total_stake,
          betting_arena_slips.potential_return,
          betting_arena_slips.risk_level,
          betting_arena_slips.parsed_slip_json,
          betting_arena_slips.created_at
        FROM betting_arena_slips
        INNER JOIN betting_arena_rounds ON betting_arena_rounds.id = betting_arena_slips.round_id
        WHERE betting_arena_slips.model_id = ?
        ORDER BY betting_arena_slips.created_at DESC
        LIMIT 5
      `
    )
    .all(modelId) as RecentSlipRow[];

  return rows.map((row) => {
    const parsed = parseJsonOrNull(row.parsed_slip_json);
    const parsedRecord = isRecord(parsed) ? parsed : {};
    return {
      roundDate: row.round_date,
      action: row.action,
      status: row.status,
      totalStake: toNumber(row.total_stake),
      potentialReturn: toNumber(row.potential_return),
      riskLevel: row.risk_level,
      strategySummary: readStringValue(parsedRecord.strategySummary),
      bankrollPlan: readStringValue(parsedRecord.bankrollPlan),
      singles: Array.isArray(parsedRecord.singles) ? parsedRecord.singles : [],
      parlays: Array.isArray(parsedRecord.parlays) ? parsedRecord.parlays : [],
      createdAt: row.created_at
    };
  });
}

function listRecentSettlementSummaries(db: Database, modelId: string): unknown[] {
  const rows = db
    .prepare(
      `
        SELECT
          betting_arena_rounds.round_date,
          betting_arena_settlements.stake,
          betting_arena_settlements.returned_amount,
          betting_arena_settlements.profit,
          betting_arena_settlements.status,
          betting_arena_settlements.settlement_json,
          betting_arena_settlements.settled_at
        FROM betting_arena_settlements
        INNER JOIN betting_arena_rounds ON betting_arena_rounds.id = betting_arena_settlements.round_id
        WHERE betting_arena_settlements.model_id = ?
        ORDER BY betting_arena_settlements.settled_at DESC
        LIMIT 5
      `
    )
    .all(modelId) as RecentSettlementRow[];

  return rows.map((row) => {
    const settlement = parseJsonOrNull(row.settlement_json);
    const settlementRecord = isRecord(settlement) ? settlement : {};
    return {
      roundDate: row.round_date,
      stake: toNumber(row.stake),
      returnedAmount: toNumber(row.returned_amount),
      profit: toNumber(row.profit),
      status: row.status,
      hit: typeof settlementRecord.hit === "boolean" ? settlementRecord.hit : null,
      legs: Array.isArray(settlementRecord.legs) ? settlementRecord.legs : [],
      settledAt: row.settled_at
    };
  });
}

function parseDomainSummary(value: string): FixtureContextSummaryDto["domains"][number] | null {
  const parsed = parseJsonOrNull(value);
  if (!isRecord(parsed)) return null;
  if (typeof parsed.domain !== "string" || typeof parsed.status !== "string" || typeof parsed.summary !== "string") return null;
  const domains = ["odds", "api_prediction", "head_to_head", "squad", "dongqiudi_intel", "sporttery", "team_profile"];
  const statuses = ["cached", "unavailable", "refresh_failed", "not_requested"];
  if (!domains.includes(parsed.domain) || !statuses.includes(parsed.status)) return null;
  return {
    domain: parsed.domain as FixtureContextSummaryDto["domains"][number]["domain"],
    status: parsed.status as FixtureContextSummaryDto["domains"][number]["status"],
    summary: parsed.summary,
    lastSyncedAt: typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null,
    error: typeof parsed.error === "string" ? parsed.error : null
  };
}

function readSportteryPools(rawJson: string): BattleContextSportteryPool[] {
  let raw: unknown;
  try {
    raw = JSON.parse(rawJson);
  } catch {
    return [];
  }

  const sporttery = isRecord(raw) ? raw.sporttery : null;
  const oddsPools = isRecord(sporttery) ? sporttery.oddsPools ?? parseSportteryOddsPools(sporttery.odds) : null;
  if (!Array.isArray(oddsPools)) return [];

  return oddsPools.flatMap((pool): BattleContextSportteryPool[] => {
    if (!isRecord(pool) || pool.status !== "available" || typeof pool.poolCode !== "string") return [];
    if (!Array.isArray(pool.options)) return [];

    const options = pool.options.flatMap((option): BattleContextSportteryOption[] => {
      if (!isRecord(option)) return [];
      if (typeof option.code !== "string" || typeof option.label !== "string" || typeof option.value !== "string") return [];
      if (!option.code || !option.label || !option.value) return [];
      return [{ code: option.code, label: option.label, value: option.value, goalLine: typeof pool.goalLine === "string" ? pool.goalLine : null }];
    });

    return options.length > 0 ? [{ poolCode: pool.poolCode, options }] : [];
  });
}

interface LatestFixtureContext {
  sportteryPools: BattleContextSportteryPool[];
  sportteryHistory: unknown;
  dongqiudiComparison: DongqiudiComparison | null;
  domains: FixtureContextSummaryDto["domains"];
}

const bettingArenaContextDomains = new Set(["dongqiudi_intel", "sporttery", "team_profile"]);

function readSportteryHistory(rawJson: string): unknown {
  let raw: unknown;
  try {
    raw = JSON.parse(rawJson);
  } catch {
    return null;
  }
  const sporttery = isRecord(raw) ? raw.sporttery : null;
  return isRecord(sporttery) ? sporttery.history : null;
}

function readDongqiudiComparison(rawJson: string): DongqiudiComparison | null {
  let raw: unknown;
  try {
    raw = JSON.parse(rawJson);
  } catch {
    return null;
  }
  const dongqiudiIntel = isRecord(raw) ? raw.dongqiudiIntel : null;
  if (!dongqiudiIntel) return null;
  return parseDongqiudiIntelSummary(dongqiudiIntel).structured;
}
function readContextDomains(row: FixtureContextSnapshotRow): FixtureContextSummaryDto["domains"] {
  return [
    parseDomainSummary(row.odds_summary_json),
    parseDomainSummary(row.api_prediction_summary_json),
    parseDomainSummary(row.head_to_head_summary_json),
    parseDomainSummary(row.squad_summary_json),
    parseDomainSummary(row.dongqiudi_intel_summary_json),
    parseDomainSummary(row.sporttery_summary_json),
    parseDomainSummary(row.team_profile_summary_json)
  ].filter((summary): summary is FixtureContextSummaryDto["domains"][number] => {
    if (!summary) return false;
    return bettingArenaContextDomains.has(summary.domain);
  });
}

function listLatestFixtureContextByMatch(db: Database): Map<string, LatestFixtureContext> {
  const rows = db
    .prepare(
      `
        SELECT
          snapshots.match_id,
          snapshots.raw_json,
          snapshots.odds_summary_json,
          snapshots.api_prediction_summary_json,
          snapshots.head_to_head_summary_json,
          snapshots.squad_summary_json,
          snapshots.dongqiudi_intel_summary_json,
          snapshots.sporttery_summary_json,
          snapshots.team_profile_summary_json
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

  return new Map(
    rows.map((row) => [
      row.match_id,
      {
        sportteryPools: readSportteryPools(row.raw_json),
        sportteryHistory: readSportteryHistory(row.raw_json),
        dongqiudiComparison: readDongqiudiComparison(row.raw_json),
        domains: readContextDomains(row)
      }
    ])
  );
}

function buildTeamProfile(teamName: string): BattleContextTeamProfile {
  const teamId = resolveWc26TeamId(teamName);
  const profile = teamId ? getWc26TeamProfile(teamId) : null;
  const injuries = teamId ? getWc26Injuries(teamId) : [];

  return {
    wc26TeamId: teamId,
    coach: profile?.coach ?? null,
    playingStyle: profile?.playing_style ?? null,
    keyPlayers: profile?.key_players ?? [],
    worldCupHistory: profile
      ? {
          appearances: profile.world_cup_history.appearances,
          bestResult: profile.world_cup_history.best_result,
          titles: profile.world_cup_history.titles
        }
      : null,
    qualifyingSummary: profile?.qualifying_summary ?? null,
    injuries: injuries.slice(0, 8).map((injury) => ({
      player: injury.player,
      position: injury.position,
      injury: injury.injury,
      status: injury.status,
      expected_return: injury.expected_return,
      last_updated: injury.last_updated,
      source: injury.source
    })),
    marketValue: null
  };
}

function parsePercentage(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 && value <= 1 ? value : value / 100;
  }
  if (typeof value !== "string") return 0;
  const normalized = value.replace("%", "").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return normalized === value ? parsed / 100 : parsed / 100;
}

function buildWc26HistoricalMatchup(homeTeamName: string, awayTeamName: string): BattleContextHistoricalMatchup | null {
  const homeTeamId = resolveWc26TeamId(homeTeamName);
  const awayTeamId = resolveWc26TeamId(awayTeamName);
  if (!homeTeamId || !awayTeamId) return null;

  const matchup = getWc26Matchup(homeTeamId, awayTeamId);
  if (!matchup) return null;

  const homeIsA = matchup.team_a === homeTeamId;
  return {
    totalMatches: matchup.total_matches,
    homeWins: homeIsA ? matchup.team_a_wins : matchup.team_b_wins,
    draws: matchup.draws,
    awayWins: homeIsA ? matchup.team_b_wins : matchup.team_a_wins,
    homeGoals: homeIsA ? matchup.total_goals_team_a : matchup.total_goals_team_b,
    awayGoals: homeIsA ? matchup.total_goals_team_b : matchup.total_goals_team_a,
    summary: matchup.summary,
    meetings: matchup.meetings.map((meeting) => ({
      year: meeting.year,
      hostCountry: meeting.host_country,
      round: meeting.round,
      score: meeting.score,
      result: meeting.result,
      venueCity: meeting.venue_city
    }))
  };
}

function buildSportteryHistoricalMatchup(sportteryHistory: unknown): BattleContextHistoricalMatchup | null {
  if (!isRecord(sportteryHistory)) return null;
  const value = isRecord(sportteryHistory.value) ? sportteryHistory.value : null;
  const stats = isRecord(value?.statistics) ? value.statistics : null;
  if (!stats) return null;

  const totalMatches = Number(stats.totalLegCnt);
  if (!Number.isFinite(totalMatches) || totalMatches <= 0) return null;

  const homeWinRate = parsePercentage(stats.winProbability);
  const drawRate = parsePercentage(stats.drawProbability);
  const awayWinRate = parsePercentage(stats.lossProbability);

  const homeWins = Math.max(0, Math.round(totalMatches * homeWinRate));
  const draws = Math.max(0, Math.round(totalMatches * drawRate));
  const awayWins = Math.max(0, totalMatches - homeWins - draws);

  return {
    totalMatches,
    homeWins,
    draws,
    awayWins,
    homeGoals: 0,
    awayGoals: 0,
    summary: `来自体彩历史交锋：${totalMatches}场，主胜${Math.round(homeWinRate * 100)}%、平${Math.round(drawRate * 100)}%、客胜${Math.round(awayWinRate * 100)}%`,
    meetings: []
  };
}

function buildHistoricalMatchup(homeTeamName: string, awayTeamName: string, sportteryHistory?: unknown): BattleContextHistoricalMatchup | null {
  const wc26Matchup = buildWc26HistoricalMatchup(homeTeamName, awayTeamName);
  if (wc26Matchup) return wc26Matchup;
  return buildSportteryHistoricalMatchup(sportteryHistory);
}

function toBattleContextGroupStanding(row: GroupStandingRow): BattleContextGroupStanding {
  return {
    group: row.group,
    rank: row.rank,
    teamId: row.teamId,
    teamName: row.teamName,
    points: row.points,
    played: row.played,
    win: row.win,
    draw: row.draw,
    lose: row.lose,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalsDiff: row.goalsDiff,
    description: row.description
  };
}

/** 按 home 队的 teamId 反查其所在小组的完整积分榜（出线形势）。无数据返回 null。 */
function resolveGroupStandingsForTeam(teamId: string | undefined, standings: { byTeamId: Map<string, GroupStandingRow[]> }): BattleContextGroupStanding[] | null {
  if (!teamId) return null;
  const rows = standings.byTeamId.get(String(teamId));
  if (!rows || rows.length === 0) return null;
  return rows.map(toBattleContextGroupStanding);
}

function buildDataGaps(input: {
  homeTeamProfile: BattleContextTeamProfile;
  awayTeamProfile: BattleContextTeamProfile;
  historicalMatchup: BattleContextHistoricalMatchup | null;
  sportteryPools: BattleContextSportteryPool[];
  dongqiudiComparison?: DongqiudiComparison | null;
  externalIntelDataGaps?: Array<string | StructuredDataGapDto>;
}): Array<string | StructuredDataGapDto> {
  const gaps: Array<string | StructuredDataGapDto> = [];
  if (input.sportteryPools.length === 0) gaps.push("首版 battle_context 尚未注入完整体彩玩法快照");
  if (!input.homeTeamProfile.coach) gaps.push("主队缺少球队资料映射");
  if (!input.awayTeamProfile.coach) gaps.push("客队缺少球队资料映射");
  if (!input.historicalMatchup) gaps.push("暂无两队世界杯历史交锋数据");
  // 身价：懂球帝对比里有 marketValue 就不再报"暂无身价数据源"，避免误导模型空仓
  const hasMarketValue = Boolean(input.dongqiudiComparison?.marketValue && (input.dongqiudiComparison.marketValue.home || input.dongqiudiComparison.marketValue.away));
  if (!hasMarketValue) gaps.push("暂无球队身价数据源");
  if (input.externalIntelDataGaps) gaps.push(...input.externalIntelDataGaps);
  return gaps;
}

function listMatchesByIds(db: Database, matchIds: string[]): Map<string, MatchRow> {
  if (matchIds.length === 0) return new Map();
  const placeholders = matchIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT
          id,
          stage,
          kickoff_at,
          status,
          home_score,
          away_score,
          venue,
          home_team_id,
          home_team_name,
          home_display.display_name_zh AS home_team_display_name_zh,
          home_display.source AS home_team_display_name_source,
          away_team_id,
          away_team_name,
          away_display.display_name_zh AS away_team_display_name_zh,
          away_display.source AS away_team_display_name_source
        FROM matches
        LEFT JOIN team_display_names AS home_display ON home_display.api_football_team_id = matches.home_team_id
        LEFT JOIN team_display_names AS away_display ON away_display.api_football_team_id = matches.away_team_id
        WHERE id IN (${placeholders})
      `
    )
    .all(...matchIds) as MatchRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

export function enrichBattleContext(db: Database, battleContext: unknown): unknown {
  if (!isRecord(battleContext) || !Array.isArray(battleContext.matches)) return battleContext;

  const matchIds = battleContext.matches.flatMap((match) => {
    if (!isRecord(match)) return [];
    const matchId = typeof match.matchId === "string" ? match.matchId : "";
    return matchId ? [matchId] : [];
  });
  const matchesById = listMatchesByIds(db, matchIds);
  const fixtureContextByMatch = listLatestFixtureContextByMatch(db);
  const standings = loadWorldCupStandings(db);

  return {
    ...battleContext,
    matches: battleContext.matches.map((match) => {
      if (!isRecord(match)) return match;
      const matchId = typeof match.matchId === "string" ? match.matchId : "";
      const row = matchesById.get(matchId);
      const homeOriginalName = row?.home_team_name || readStringFromRecord(match, "homeTeamName");
      const awayOriginalName = row?.away_team_name || readStringFromRecord(match, "awayTeamName");
      const homeTeamName = row
        ? resolveDisplayNameZh({
            teamId: row.home_team_id,
            originalName: row.home_team_name,
            displayNameZh: row.home_team_display_name_zh,
            displayNameSource: row.home_team_display_name_source
          })
        : readStringFromRecord(match, "homeTeamName");
      const awayTeamName = row
        ? resolveDisplayNameZh({
            teamId: row.away_team_id,
            originalName: row.away_team_name,
            displayNameZh: row.away_team_display_name_zh,
            displayNameSource: row.away_team_display_name_source
          })
        : readStringFromRecord(match, "awayTeamName");
      const fixtureContext = fixtureContextByMatch.get(matchId);
      const sportteryPools = Array.isArray(match.sportteryPools) && match.sportteryPools.length > 0 ? match.sportteryPools : fixtureContext?.sportteryPools ?? [];
      const homeTeamProfile = buildTeamProfile(homeOriginalName);
      const awayTeamProfile = buildTeamProfile(awayOriginalName);
      const historicalMatchup = buildHistoricalMatchup(homeOriginalName, awayOriginalName, fixtureContext?.sportteryHistory);
      const externalIntel = getExternalIntelForMatch(db, matchId);
      return {
        ...match,
        status: row?.status ?? match.status,
        homeScore: row?.home_score ?? null,
        awayScore: row?.away_score ?? null,
        homeTeamName,
        awayTeamName,
        homeTeamProfile,
        awayTeamProfile,
        historicalMatchup,
        contextDomains: fixtureContext?.domains ?? [],
        sportteryPools,
        externalIntel,
        groupStandings: Array.isArray(match.groupStandings)
          ? match.groupStandings
          : resolveGroupStandingsForTeam(row?.home_team_id, standings),
        dongqiudiComparison: fixtureContext?.dongqiudiComparison ?? null,
        dataGaps: buildDataGaps({ homeTeamProfile, awayTeamProfile, historicalMatchup, sportteryPools, dongqiudiComparison: fixtureContext?.dongqiudiComparison ?? null, externalIntelDataGaps: externalIntel.dataGaps })
      };
    })
  };
}

function readStringFromRecord(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function resolveDisplayNameZh(input: { teamId: string; originalName: string; displayNameZh: string | null; displayNameSource: string | null }): string {
  return input.displayNameSource === "admin" ? input.displayNameZh ?? input.originalName : worldCupTeamNamesZh[input.teamId] ?? input.displayNameZh ?? input.originalName;
}

export function buildBattleContext(db: Database, input: BattleContextInput): BattleContext {
  const whereClauses = ["status = 'scheduled'"];
  const params: string[] = [];
  if (input.matchWindowStart) {
    whereClauses.push("kickoff_at >= ?");
    params.push(input.matchWindowStart);
  }
  if (input.matchWindowEnd) {
    whereClauses.push("kickoff_at < ?");
    params.push(input.matchWindowEnd);
  }

  const rows = db
    .prepare(
      `
        SELECT
          id,
          stage,
          kickoff_at,
          status,
          home_score,
          away_score,
          venue,
          home_team_id,
          home_team_name,
          home_display.display_name_zh AS home_team_display_name_zh,
          home_display.source AS home_team_display_name_source,
          away_team_id,
          away_team_name,
          away_display.display_name_zh AS away_team_display_name_zh,
          away_display.source AS away_team_display_name_source
        FROM matches
        LEFT JOIN team_display_names AS home_display ON home_display.api_football_team_id = matches.home_team_id
        LEFT JOIN team_display_names AS away_display ON away_display.api_football_team_id = matches.away_team_id
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY kickoff_at ASC
      `
    )
    .all(...params) as MatchRow[];
  const fixtureContextByMatch = listLatestFixtureContextByMatch(db);
  const standings = loadWorldCupStandings(db);

  return {
    roundDate: input.roundDate,
    lockTime: input.lockTime,
    externalIntel: input.externalIntel,
    matches: rows.map((row) => {
      const fixtureContext = fixtureContextByMatch.get(row.id);
      const sportteryPools = fixtureContext?.sportteryPools ?? [];
      const homeTeamProfile = buildTeamProfile(row.home_team_name);
      const awayTeamProfile = buildTeamProfile(row.away_team_name);
      const historicalMatchup = buildHistoricalMatchup(row.home_team_name, row.away_team_name, fixtureContext?.sportteryHistory);
      const externalIntel = getExternalIntelForMatch(db, row.id);
      const groupStandings = resolveGroupStandingsForTeam(row.home_team_id, standings);
      const homeTeamName = resolveDisplayNameZh({
        teamId: row.home_team_id,
        originalName: row.home_team_name,
        displayNameZh: row.home_team_display_name_zh,
        displayNameSource: row.home_team_display_name_source
      });
      const awayTeamName = resolveDisplayNameZh({
        teamId: row.away_team_id,
        originalName: row.away_team_name,
        displayNameZh: row.away_team_display_name_zh,
        displayNameSource: row.away_team_display_name_source
      });
      return {
        matchId: row.id,
        stage: row.stage,
        kickoffAt: row.kickoff_at,
        status: row.status,
        homeScore: row.home_score,
        awayScore: row.away_score,
        venue: row.venue,
        homeTeamName,
        awayTeamName,
        homeTeamProfile,
        awayTeamProfile,
        historicalMatchup,
        contextDomains: fixtureContext?.domains ?? [],
        sportteryPools,
        externalIntel,
        groupStandings,
        dongqiudiComparison: fixtureContext?.dongqiudiComparison ?? null,
        dataGaps: buildDataGaps({ homeTeamProfile, awayTeamProfile, historicalMatchup, sportteryPools, dongqiudiComparison: fixtureContext?.dongqiudiComparison ?? null, externalIntelDataGaps: externalIntel.dataGaps })
      };
    })
  };
}

export interface SingleMatchEnrichment {
  homeTeamProfile: BattleContextTeamProfile;
  awayTeamProfile: BattleContextTeamProfile;
  historicalMatchup: BattleContextHistoricalMatchup | null;
  sportteryPools: BattleContextSportteryPool[];
  externalIntel: ExternalIntelSummaryDto;
  groupStandings: BattleContextGroupStanding[] | null;
  dongqiudiComparison: DongqiudiComparison | null;
  contextDomains: FixtureContextSummaryDto["domains"];
  dataGaps: Array<string | StructuredDataGapDto>;
}

export function buildSingleMatchEnrichment(
  db: Database,
  input: { matchId: string; homeTeamName: string; awayTeamName: string; homeTeamId: string }
): SingleMatchEnrichment {
  const fixtureContextByMatch = listLatestFixtureContextByMatch(db);
  const fixtureContext = fixtureContextByMatch.get(input.matchId);
  const standings = loadWorldCupStandings(db);
  const homeTeamProfile = buildTeamProfile(input.homeTeamName);
  const awayTeamProfile = buildTeamProfile(input.awayTeamName);
  const historicalMatchup = buildHistoricalMatchup(input.homeTeamName, input.awayTeamName, fixtureContext?.sportteryHistory);
  const sportteryPools = fixtureContext?.sportteryPools ?? [];
  const dongqiudiComparison = fixtureContext?.dongqiudiComparison ?? null;
  const externalIntel = getExternalIntelForMatch(db, input.matchId);
  const groupStandings = resolveGroupStandingsForTeam(input.homeTeamId, standings);

  return {
    homeTeamProfile,
    awayTeamProfile,
    historicalMatchup,
    sportteryPools,
    externalIntel,
    groupStandings,
    dongqiudiComparison,
    contextDomains: fixtureContext?.domains ?? [],
    dataGaps: buildDataGaps({
      homeTeamProfile,
      awayTeamProfile,
      historicalMatchup,
      sportteryPools,
      dongqiudiComparison,
      externalIntelDataGaps: externalIntel.dataGaps
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
    lastFiveBetSlips: listRecentBetSlipSummaries(db, row.model_id),
    lastFiveSettlementResults: listRecentSettlementSummaries(db, row.model_id),
    lastReview: row.last_review
  };
}
