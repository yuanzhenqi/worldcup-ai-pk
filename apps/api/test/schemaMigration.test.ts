import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createDatabase } from "../src/db/connection";

describe("schema migration on app startup", () => {
  it("adds settings table to an existing SQLite database", async () => {
    const directory = mkdtempSync(join(tmpdir(), "worldcup-ai-pk-old-db-"));
    const databasePath = join(directory, "test.sqlite");
    const db = createDatabase(databasePath);
    db.exec(
      `
        CREATE TABLE matches (
          id TEXT PRIMARY KEY,
          api_football_fixture_id INTEGER NOT NULL UNIQUE,
          stage TEXT NOT NULL,
          kickoff_at TEXT NOT NULL,
          status TEXT NOT NULL,
          venue TEXT,
          home_team_id TEXT NOT NULL,
          home_team_name TEXT NOT NULL,
          home_team_logo_url TEXT,
          away_team_id TEXT NOT NULL,
          away_team_name TEXT NOT NULL,
          away_team_logo_url TEXT,
          home_score INTEGER,
          away_score INTEGER,
          last_synced_at TEXT NOT NULL
        );
      `
    );
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "PUT",
      url: "/api/admin/settings/api-football",
      remoteAddress: "127.0.0.1",
      payload: { apiKey: "runtime-test-key" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ configured: true });

    await app.close();
  });
});
