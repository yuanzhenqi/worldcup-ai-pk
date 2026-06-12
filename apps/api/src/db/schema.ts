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
}
