import type { Database } from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(currentDir, "schema.sql");

export function applySchema(db: Database): void {
  const schema = readFileSync(schemaPath, "utf8");
  db.exec(schema);
}
