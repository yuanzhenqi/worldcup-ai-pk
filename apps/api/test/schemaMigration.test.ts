import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { applySchema } from "../src/db/schema";
import { createDatabase } from "../src/db/connection";
import { createTestDatabase } from "./support/testDatabase";

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

  it("creates config and team display migration columns", () => {
    const directory = mkdtempSync(join(tmpdir(), "worldcup-ai-pk-schema-"));
    const databasePath = join(directory, "test.sqlite");
    const db = createDatabase(databasePath);

    applySchema(db);

    const teamColumns = db.prepare("PRAGMA table_info(team_display_names)").all() as Array<{ name: string }>;
    expect(teamColumns.map((column) => column.name)).toEqual([
      "api_football_team_id",
      "original_name",
      "display_name_zh",
      "logo_url",
      "source",
      "created_at",
      "updated_at"
    ]);

    const providerColumns = db.prepare("PRAGMA table_info(ai_providers)").all() as Array<{ name: string }>;
    expect(providerColumns.map((column) => column.name)).toContain("display_name");
    expect(providerColumns.map((column) => column.name)).toContain("base_url");

    const promptColumns = db.prepare("PRAGMA table_info(prompt_templates)").all() as Array<{ name: string }>;
    expect(promptColumns.map((column) => column.name)).toContain("description");
    expect(promptColumns.map((column) => column.name)).toContain("is_default");

    db.close();
  });

  it("creates fixture context cache tables and prediction request option columns", () => {
    const { db } = createTestDatabase();

    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("fixture_context_snapshots")
    ).toMatchObject({ name: "fixture_context_snapshots" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("fixture_data_sync_logs")
    ).toMatchObject({ name: "fixture_data_sync_logs" });

    const predictionRequestColumns = db.prepare("PRAGMA table_info(prediction_requests)").all() as Array<{ name: string }>;
    expect(predictionRequestColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "context_snapshot_id",
        "task_types_json",
        "data_options_json",
        "prompt_template_id",
        "custom_prompt",
        "output_style"
      ])
    );

    expect(() => applySchema(db)).not.toThrow();

    db.close();
  });
});
