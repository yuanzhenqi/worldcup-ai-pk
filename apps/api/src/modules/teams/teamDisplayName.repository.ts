import type { Database } from "better-sqlite3";
import type { TeamDisplayNameDto } from "@worldcup-ai-pk/shared";
import { worldCupTeamNamesZh } from "./worldCupTeamNames.zh";

interface TeamDisplayNameRow {
  api_football_team_id: string;
  original_name: string;
  display_name_zh: string;
  logo_url: string | null;
  source: "seed" | "admin" | "api-football";
}

export interface UpsertTeamDisplayNameInput {
  apiFootballTeamId: string;
  originalName: string;
  logoUrl: string | null;
  now: Date;
}

function toDto(row: TeamDisplayNameRow): TeamDisplayNameDto {
  return {
    apiFootballTeamId: row.api_football_team_id,
    originalName: row.original_name,
    displayNameZh: row.display_name_zh,
    logoUrl: row.logo_url,
    source: row.source
  };
}

export function upsertTeamDisplayName(db: Database, input: UpsertTeamDisplayNameInput): void {
  const existing = db.prepare("SELECT source, display_name_zh FROM team_display_names WHERE api_football_team_id = ?").get(input.apiFootballTeamId) as
    | { source: string; display_name_zh: string }
    | undefined;
  const seedName = worldCupTeamNamesZh[input.apiFootballTeamId];
  const displayNameZh = existing?.source === "admin" ? existing.display_name_zh : seedName ?? existing?.display_name_zh ?? input.originalName;
  const source = existing?.source === "admin" ? "admin" : seedName ? "seed" : "api-football";

  db.prepare(
    `
      INSERT INTO team_display_names (
        api_football_team_id,
        original_name,
        display_name_zh,
        logo_url,
        source,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(api_football_team_id) DO UPDATE SET
        original_name = excluded.original_name,
        display_name_zh = excluded.display_name_zh,
        logo_url = excluded.logo_url,
        source = excluded.source,
        updated_at = excluded.updated_at
    `
  ).run(input.apiFootballTeamId, input.originalName, displayNameZh, input.logoUrl, source, input.now.toISOString(), input.now.toISOString());
}

export function listTeamDisplayNames(db: Database, query: string): TeamDisplayNameDto[] {
  const normalizedQuery = `%${query.trim()}%`;
  const rows = db.prepare(
    `
      SELECT api_football_team_id, original_name, display_name_zh, logo_url, source
      FROM team_display_names
      WHERE ? = '%%' OR original_name LIKE ? OR display_name_zh LIKE ?
      ORDER BY CAST(api_football_team_id AS INTEGER) ASC
    `
  ).all(normalizedQuery, normalizedQuery, normalizedQuery) as TeamDisplayNameRow[];

  return rows.map(toDto);
}

export function updateTeamDisplayName(db: Database, apiFootballTeamId: string, displayNameZh: string, now = new Date()): TeamDisplayNameDto {
  db.prepare(
    `
      UPDATE team_display_names
      SET display_name_zh = ?, source = 'admin', updated_at = ?
      WHERE api_football_team_id = ?
    `
  ).run(displayNameZh, now.toISOString(), apiFootballTeamId);

  const row = db.prepare(
    `
      SELECT api_football_team_id, original_name, display_name_zh, logo_url, source
      FROM team_display_names
      WHERE api_football_team_id = ?
    `
  ).get(apiFootballTeamId) as TeamDisplayNameRow | undefined;

  if (!row) {
    throw new Error(`Team display name not found: ${apiFootballTeamId}`);
  }

  return toDto(row);
}
