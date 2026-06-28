import type { Database } from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(currentDir, "schema.sql");

function splitSqlStatements(schema: string): string[] {
  return schema
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function isDuplicateColumnError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("duplicate column name");
}

function getTableSql(db: Database, tableName: string): string {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as { sql: string } | undefined;
  return row?.sql ?? "";
}

function bettingArenaRoundsHasLegacyRoundDateUnique(db: Database): boolean {
  const tableSql = getTableSql(db, "betting_arena_rounds");
  return tableSql.includes("round_date TEXT NOT NULL UNIQUE");
}

function migrateBettingArenaRoundSequence(db: Database): void {
  if (!bettingArenaRoundsHasLegacyRoundDateUnique(db)) {
    db.exec(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_betting_arena_rounds_date_sequence
          ON betting_arena_rounds(round_date, round_sequence);
      `
    );
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    db.exec(
      `
        CREATE TABLE IF NOT EXISTS betting_arena_rounds_next (
          id TEXT PRIMARY KEY,
          round_date TEXT NOT NULL,
          round_sequence INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL,
          lock_time TEXT NOT NULL,
          battle_context_json TEXT NOT NULL,
          external_intel_json TEXT NOT NULL,
          failure_reason TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO betting_arena_rounds_next (
          id,
          round_date,
          round_sequence,
          status,
          lock_time,
          battle_context_json,
          external_intel_json,
          failure_reason,
          created_at,
          updated_at
        )
        SELECT
          id,
          round_date,
          COALESCE(round_sequence, 1),
          status,
          lock_time,
          battle_context_json,
          external_intel_json,
          failure_reason,
          created_at,
          updated_at
        FROM betting_arena_rounds;

        DROP TABLE betting_arena_rounds;
        ALTER TABLE betting_arena_rounds_next RENAME TO betting_arena_rounds;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_betting_arena_rounds_date_sequence
          ON betting_arena_rounds(round_date, round_sequence);
      `
    );
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

export function applySchema(db: Database): void {
  const schema = readFileSync(schemaPath, "utf8");

  for (const statement of splitSqlStatements(schema)) {
    try {
      db.exec(`${statement};`);
    } catch (error) {
      if (!statement.startsWith("ALTER TABLE") || !isDuplicateColumnError(error)) {
        throw error;
      }
    }
  }

  migrateBettingArenaRoundSequence(db);
}
