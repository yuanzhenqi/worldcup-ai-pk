import type { Database } from "better-sqlite3";
import type { ExternalIntelSettingsDto } from "@worldcup-ai-pk/shared";

const apiFootballKey = "apiFootball.apiKey";

export function saveApiFootballKey(db: Database, apiKey: string, now = new Date()): void {
  db.prepare(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `
  ).run(apiFootballKey, apiKey, now.toISOString());
}

export function hasApiFootballKey(db: Database): boolean {
  return Boolean(getApiFootballKey(db));
}

export function getApiFootballKey(db: Database): string | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(apiFootballKey) as
    | { value: string }
    | undefined;

  return row?.value ?? null;
}

const dongqiudiEnabledKey = "dongqiudi.enabled";

export function saveDongqiudiEnabled(db: Database, enabled: boolean, now = new Date()): void {
  db.prepare(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `
  ).run(dongqiudiEnabledKey, enabled ? "true" : "false", now.toISOString());
}

export function isDongqiudiEnabled(db: Database): boolean {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(dongqiudiEnabledKey) as
    | { value: string }
    | undefined;
  return row?.value === "true";
}

const sportteryEnabledKey = "sporttery.enabled";

export function saveSportteryEnabled(db: Database, enabled: boolean, now = new Date()): void {
  db.prepare(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `
  ).run(sportteryEnabledKey, enabled ? "true" : "false", now.toISOString());
}

export function isSportteryEnabled(db: Database): boolean {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(sportteryEnabledKey) as
    | { value: string }
    | undefined;
  return row?.value === "true";
}

const externalIntelEnabledKey = "externalIntel.enabled";
const externalIntelProviderKey = "externalIntel.provider";
const externalIntelSummarizerModelIdKey = "externalIntel.summarizerModelId";
const externalIntelCacheMinutesKey = "externalIntel.cacheMinutes";
const externalIntelMaxResultsPerQueryKey = "externalIntel.maxResultsPerQuery";
const externalIntelMaxQueriesPerMatchKey = "externalIntel.maxQueriesPerMatch";

function readSetting(db: Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function writeSetting(db: Database, key: string, value: string, now: Date): void {
  db.prepare(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `
  ).run(key, value, now.toISOString());
}

function readPositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getExternalIntelSettings(db: Database): ExternalIntelSettingsDto {
  const provider = readSetting(db, externalIntelProviderKey);
  return {
    enabled: readSetting(db, externalIntelEnabledKey) === "true",
    provider: provider === "duckduckgo_html" ? "duckduckgo_html" : "duckduckgo_html",
    summarizerModelId: readSetting(db, externalIntelSummarizerModelIdKey) ?? "",
    cacheMinutes: readPositiveInt(readSetting(db, externalIntelCacheMinutesKey), 60),
    maxResultsPerQuery: readPositiveInt(readSetting(db, externalIntelMaxResultsPerQueryKey), 5),
    maxQueriesPerMatch: readPositiveInt(readSetting(db, externalIntelMaxQueriesPerMatchKey), 8)
  };
}

export function saveExternalIntelSettings(db: Database, input: ExternalIntelSettingsDto, now = new Date()): ExternalIntelSettingsDto {
  writeSetting(db, externalIntelEnabledKey, input.enabled ? "true" : "false", now);
  writeSetting(db, externalIntelProviderKey, input.provider, now);
  writeSetting(db, externalIntelSummarizerModelIdKey, input.summarizerModelId, now);
  writeSetting(db, externalIntelCacheMinutesKey, String(input.cacheMinutes), now);
  writeSetting(db, externalIntelMaxResultsPerQueryKey, String(input.maxResultsPerQuery), now);
  writeSetting(db, externalIntelMaxQueriesPerMatchKey, String(input.maxQueriesPerMatch), now);
  return getExternalIntelSettings(db);
}
