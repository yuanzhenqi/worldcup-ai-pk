import type { Database } from "better-sqlite3";

export interface DongqiudiMappingDto {
  apiFootballFixtureId: number;
  dongqiudiMatchId: number;
  updatedAt: string;
}

interface DongqiudiMappingRow {
  api_football_fixture_id: number;
  dongqiudi_match_id: number;
  created_at: string;
  updated_at: string;
}

function toDto(row: DongqiudiMappingRow): DongqiudiMappingDto {
  return {
    apiFootballFixtureId: row.api_football_fixture_id,
    dongqiudiMatchId: row.dongqiudi_match_id,
    updatedAt: row.updated_at
  };
}

export function upsertDongqiudiMapping(db: Database, apiFootballFixtureId: number, dongqiudiMatchId: number, now = new Date()): DongqiudiMappingDto {
  const iso = now.toISOString();
  db.prepare(
    `
      INSERT INTO fixture_dongqiudi_mappings (api_football_fixture_id, dongqiudi_match_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(api_football_fixture_id) DO UPDATE SET
        dongqiudi_match_id = excluded.dongqiudi_match_id,
        updated_at = excluded.updated_at
    `
  ).run(apiFootballFixtureId, dongqiudiMatchId, iso, iso);

  return getDongqiudiMappingByFixtureId(db, apiFootballFixtureId)!;
}

export function listDongqiudiMappings(db: Database): DongqiudiMappingDto[] {
  const rows = db
    .prepare(
      `SELECT api_football_fixture_id, dongqiudi_match_id, created_at, updated_at FROM fixture_dongqiudi_mappings ORDER BY api_football_fixture_id ASC`
    )
    .all() as DongqiudiMappingRow[];
  return rows.map(toDto);
}

export function getDongqiudiMappingByFixtureId(db: Database, apiFootballFixtureId: number): DongqiudiMappingDto | null {
  const row = db
    .prepare(
      `SELECT api_football_fixture_id, dongqiudi_match_id, created_at, updated_at FROM fixture_dongqiudi_mappings WHERE api_football_fixture_id = ?`
    )
    .get(apiFootballFixtureId) as DongqiudiMappingRow | undefined;
  return row ? toDto(row) : null;
}

export function deleteDongqiudiMapping(db: Database, apiFootballFixtureId: number): void {
  db.prepare(`DELETE FROM fixture_dongqiudi_mappings WHERE api_football_fixture_id = ?`).run(apiFootballFixtureId);
}
