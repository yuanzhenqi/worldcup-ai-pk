import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../../src/db/connection";

export function createTestDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "worldcup-ai-pk-"));
  const databasePath = join(directory, "test.sqlite");
  const db = createDatabase(databasePath);
  const schema = readFileSync(new URL("../../src/db/schema.sql", import.meta.url), "utf8");
  db.exec(schema);
  return { db, databasePath };
}
