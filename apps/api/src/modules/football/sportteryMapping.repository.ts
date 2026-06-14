import type { Database } from "better-sqlite3";

export interface SportteryMappingDto {
  apiFootballFixtureId: number;
  sportteryMatchId: number;
  updatedAt: string;
}

interface SportteryMappingRow {
  api_football_fixture_id: number;
  sporttery_match_id: number;
  created_at: string;
  updated_at: string;
}

interface SportteryMatchListInput {
  value?: {
    matchInfoList?: unknown[];
  };
}

interface MatchMappingInput {
  apiFootballFixtureId: number;
  homeTeamName: string;
  awayTeamName: string;
}

interface SyncSportteryMappingsInput {
  matches: MatchMappingInput[];
  sportteryMatchList: unknown;
  now?: Date;
}

export interface SportteryMappingSyncResult {
  matched: number;
  unmatched: number;
  totalSportteryMatches: number;
}

function toDto(row: SportteryMappingRow): SportteryMappingDto {
  return {
    apiFootballFixtureId: row.api_football_fixture_id,
    sportteryMatchId: row.sporttery_match_id,
    updatedAt: row.updated_at
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function listWorldCupSportteryMatches(sportteryMatchList: unknown): Array<{ homeTeamName: string; awayTeamName: string; sportteryMatchId: number }> {
  const days = (sportteryMatchList as SportteryMatchListInput)?.value?.matchInfoList;
  if (!Array.isArray(days)) {
    return [];
  }

  const matches: Array<{ homeTeamName: string; awayTeamName: string; sportteryMatchId: number }> = [];
  for (const day of days) {
    const subMatchList = (day as { subMatchList?: unknown[] })?.subMatchList;
    if (!Array.isArray(subMatchList)) {
      continue;
    }

    for (const item of subMatchList) {
      const record = item as Record<string, unknown>;
      const leagueAbbName = text(record.leagueAbbName);
      const leagueAllName = text(record.leagueAllName);
      const homeTeamName = text(record.homeTeamAbbName);
      const awayTeamName = text(record.awayTeamAbbName);
      const sportteryMatchId = record.matchId;
      if ((leagueAbbName !== "世界杯" && leagueAllName !== "世界杯") || !homeTeamName || !awayTeamName || typeof sportteryMatchId !== "number") {
        continue;
      }
      matches.push({ homeTeamName, awayTeamName, sportteryMatchId });
    }
  }
  return matches;
}

export function upsertSportteryMapping(db: Database, apiFootballFixtureId: number, sportteryMatchId: number, now = new Date()): SportteryMappingDto {
  const iso = now.toISOString();
  db.prepare(
    `
      INSERT INTO fixture_sporttery_mappings (api_football_fixture_id, sporttery_match_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(api_football_fixture_id) DO UPDATE SET
        sporttery_match_id = excluded.sporttery_match_id,
        updated_at = excluded.updated_at
    `
  ).run(apiFootballFixtureId, sportteryMatchId, iso, iso);

  return getSportteryMappingByFixtureId(db, apiFootballFixtureId)!;
}

export function listSportteryMappings(db: Database): SportteryMappingDto[] {
  const rows = db
    .prepare(
      `SELECT api_football_fixture_id, sporttery_match_id, created_at, updated_at FROM fixture_sporttery_mappings ORDER BY api_football_fixture_id ASC`
    )
    .all() as SportteryMappingRow[];
  return rows.map(toDto);
}

export function getSportteryMappingByFixtureId(db: Database, apiFootballFixtureId: number): SportteryMappingDto | null {
  const row = db
    .prepare(
      `SELECT api_football_fixture_id, sporttery_match_id, created_at, updated_at FROM fixture_sporttery_mappings WHERE api_football_fixture_id = ?`
    )
    .get(apiFootballFixtureId) as SportteryMappingRow | undefined;
  return row ? toDto(row) : null;
}

export function deleteSportteryMapping(db: Database, apiFootballFixtureId: number): void {
  db.prepare(`DELETE FROM fixture_sporttery_mappings WHERE api_football_fixture_id = ?`).run(apiFootballFixtureId);
}

export function ensureSportteryMappingForFixture(db: Database, input: MatchMappingInput & { sportteryMatchList: unknown; now?: Date }): SportteryMappingDto | null {
  const existing = getSportteryMappingByFixtureId(db, input.apiFootballFixtureId);
  if (existing) {
    return existing;
  }

  const sportteryMatch = listWorldCupSportteryMatches(input.sportteryMatchList).find(
    (match) => match.homeTeamName === input.homeTeamName && match.awayTeamName === input.awayTeamName
  );
  if (!sportteryMatch) {
    return null;
  }

  return upsertSportteryMapping(db, input.apiFootballFixtureId, sportteryMatch.sportteryMatchId, input.now);
}

export function syncSportteryMappingsForMatches(db: Database, input: SyncSportteryMappingsInput): SportteryMappingSyncResult {
  const sportteryMatches = listWorldCupSportteryMatches(input.sportteryMatchList);
  let matched = 0;

  for (const match of input.matches) {
    const sportteryMatch = sportteryMatches.find((item) => item.homeTeamName === match.homeTeamName && item.awayTeamName === match.awayTeamName);
    if (!sportteryMatch) {
      continue;
    }
    upsertSportteryMapping(db, match.apiFootballFixtureId, sportteryMatch.sportteryMatchId, input.now);
    matched += 1;
  }

  return {
    matched,
    unmatched: sportteryMatches.length - matched,
    totalSportteryMatches: sportteryMatches.length
  };
}
