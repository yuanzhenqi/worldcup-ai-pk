import type { Database } from "better-sqlite3";

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
