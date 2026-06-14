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

function toDto(row: SportteryMappingRow): SportteryMappingDto {
  return {
    apiFootballFixtureId: row.api_football_fixture_id,
    sportteryMatchId: row.sporttery_match_id,
    updatedAt: row.updated_at
  };
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
