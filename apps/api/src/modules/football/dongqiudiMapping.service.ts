import type { Database } from "better-sqlite3";
import { DongqiudiClient, type DongqiudiImportantMatch } from "./dongqiudiClient";
import { listDongqiudiMappings, upsertDongqiudiMapping } from "./dongqiudiMapping.repository";
import { worldCupTeamNamesZh } from "../teams/worldCupTeamNames.zh";

interface MatchForMapping {
  id: string;
  api_football_fixture_id: number;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  kickoff_at: string;
}

export interface SyncDongqiudiMappingsInput {
  /** m 站「重要比赛」聚合页 tab ID，默认 70（含世界杯）。 */
  tabId?: number;
  client?: DongqiudiClient;
  now?: Date;
}

export interface SyncDongqiudiMappingsResult {
  matched: number;
  unmatched: number;
  totalDongqiudiMatches: number;
}

const defaultImportantMatchesTabId = 70;

function buildReverseTeamNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [teamId, chineseName] of Object.entries(worldCupTeamNamesZh)) {
    map.set(chineseName, teamId);
  }
  return map;
}

function normalizeChineseTeamName(name: string): string {
  return name.replace(/\s+/g, "").trim();
}

function resolveTeamId(chineseName: string, reverseMap: Map<string, string>): string | null {
  const normalized = normalizeChineseTeamName(chineseName);
  return reverseMap.get(normalized) ?? reverseMap.get(chineseName) ?? null;
}

function parseDongqiudiKickoffAt(value: string): Date | null {
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameKickoffWindow(localKickoffAt: string, dongqiudiKickoffAt: string, toleranceHours = 12): boolean {
  const local = new Date(localKickoffAt);
  const remote = parseDongqiudiKickoffAt(dongqiudiKickoffAt);
  if (!remote || Number.isNaN(local.getTime())) return false;
  const diffMs = Math.abs(local.getTime() - remote.getTime());
  return diffMs <= toleranceHours * 60 * 60 * 1000;
}

function listMatchesNeedingMapping(db: Database): MatchForMapping[] {
  const rows = db
    .prepare(
      `
        SELECT
          matches.id,
          matches.api_football_fixture_id,
          matches.home_team_id,
          matches.away_team_id,
          matches.home_team_name,
          matches.away_team_name,
          matches.kickoff_at
        FROM matches
        LEFT JOIN fixture_dongqiudi_mappings
          ON fixture_dongqiudi_mappings.api_football_fixture_id = matches.api_football_fixture_id
        WHERE fixture_dongqiudi_mappings.api_football_fixture_id IS NULL
          AND matches.status IN ('scheduled', 'live', 'finished')
        ORDER BY matches.kickoff_at ASC
      `
    )
    .all() as MatchForMapping[];
  return rows;
}

export async function syncDongqiudiMappingsForMatches(
  db: Database,
  input: SyncDongqiudiMappingsInput = {}
): Promise<SyncDongqiudiMappingsResult> {
  const client = input.client ?? new DongqiudiClient();
  const tabId = input.tabId ?? defaultImportantMatchesTabId;
  const now = input.now ?? new Date();

  const localMatches = listMatchesNeedingMapping(db);
  if (localMatches.length === 0) {
    return { matched: 0, unmatched: 0, totalDongqiudiMatches: 0 };
  }

  const dongqiudiMatches: DongqiudiImportantMatch[] = await client.getImportantMatches({ tabId });

  const reverseMap = buildReverseTeamNameMap();
  const existingMappings = new Set(listDongqiudiMappings(db).map((m) => m.apiFootballFixtureId));
  let matched = 0;

  for (const dqMatch of dongqiudiMatches) {
    const homeTeamId = resolveTeamId(dqMatch.homeTeamName, reverseMap);
    const awayTeamId = resolveTeamId(dqMatch.awayTeamName, reverseMap);
    if (!homeTeamId || !awayTeamId || !dqMatch.kickoffAt) continue;

    const localMatch = localMatches.find(
      (m) =>
        m.home_team_id === homeTeamId &&
        m.away_team_id === awayTeamId &&
        isSameKickoffWindow(m.kickoff_at, dqMatch.kickoffAt) &&
        !existingMappings.has(m.api_football_fixture_id)
    );

    if (!localMatch) continue;

    upsertDongqiudiMapping(db, localMatch.api_football_fixture_id, dqMatch.matchId, now);
    existingMappings.add(localMatch.api_football_fixture_id);
    matched += 1;
  }

  return {
    matched,
    unmatched: localMatches.length - matched,
    totalDongqiudiMatches: dongqiudiMatches.length
  };
}
