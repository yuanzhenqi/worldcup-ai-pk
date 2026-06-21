import type { Database } from "better-sqlite3";
import {
  getExternalIntelSettings as getExternalIntelSettingsFromSettings,
  saveExternalIntelSettings as saveExternalIntelSettingsFromSettings
} from "../settings/settings.repository";
import type {
  ExternalIntelSettings,
  ExternalIntelSnapshotRow,
  InsertExternalIntelSnapshotInput,
  SaveExternalIntelSettingsInput
} from "./externalIntel.types";

export function getExternalIntelSettings(db: Database): ExternalIntelSettings {
  return getExternalIntelSettingsFromSettings(db);
}

export function saveExternalIntelSettings(
  db: Database,
  input: SaveExternalIntelSettingsInput,
  now = new Date()
): ExternalIntelSettings {
  return saveExternalIntelSettingsFromSettings(db, input, now);
}

export type { ExternalIntelSettings, SaveExternalIntelSettingsInput };

export function insertExternalIntelSnapshot(db: Database, input: InsertExternalIntelSnapshotInput): ExternalIntelSnapshotRow {
  db.prepare(
    `
      INSERT INTO fixture_external_intel_snapshots (
        id, match_id, provider, query_json, search_results_json, summary_json,
        status, error, collected_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    input.id,
    input.matchId,
    input.provider,
    input.queryJson,
    input.searchResultsJson,
    input.summaryJson,
    input.status,
    input.error,
    input.collectedAt,
    input.expiresAt,
    input.createdAt
  );

  return db.prepare("SELECT * FROM fixture_external_intel_snapshots WHERE id = ?").get(input.id) as ExternalIntelSnapshotRow;
}

export function getFreshExternalIntelSnapshot(db: Database, input: { matchId: string; now: Date }): ExternalIntelSnapshotRow | null {
  const row = db
    .prepare(
      `
        SELECT *
        FROM fixture_external_intel_snapshots
        WHERE match_id = ?
          AND expires_at > ?
        ORDER BY collected_at DESC, created_at DESC
        LIMIT 1
      `
    )
    .get(input.matchId, input.now.toISOString()) as ExternalIntelSnapshotRow | undefined;

  return row ?? null;
}

export function getLatestExternalIntelSnapshotByMatch(db: Database, matchId: string): ExternalIntelSnapshotRow | null {
  const row = db
    .prepare(
      `
        SELECT *
        FROM fixture_external_intel_snapshots
        WHERE match_id = ?
        ORDER BY collected_at DESC, created_at DESC
        LIMIT 1
      `
    )
    .get(matchId) as ExternalIntelSnapshotRow | undefined;

  return row ?? null;
}
