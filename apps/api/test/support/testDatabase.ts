import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase } from "../../src/db/connection";
import { applySchema } from "../../src/db/schema";

export function createTestDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "worldcup-ai-pk-"));
  const databasePath = join(directory, "test.sqlite");
  const db = createDatabase(databasePath);
  applySchema(db);
  return { db, databasePath };
}
