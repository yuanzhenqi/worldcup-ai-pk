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
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("fixture_sporttery_mappings")
    ).toMatchObject({ name: "fixture_sporttery_mappings" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("prediction_run_logs")
    ).toMatchObject({ name: "prediction_run_logs" });

    const fixtureContextSnapshotColumns = db.prepare("PRAGMA table_info(fixture_context_snapshots)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    expect(
      fixtureContextSnapshotColumns.map((column) => ({
        name: column.name,
        type: column.type,
        notnull: column.notnull
      }))
    ).toEqual(
      expect.arrayContaining([{ name: "sporttery_summary_json", type: "TEXT", notnull: 1 }])
    );

    const sportteryMappingColumns = db.prepare("PRAGMA table_info(fixture_sporttery_mappings)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    expect(
      sportteryMappingColumns.map((column) => ({
        name: column.name,
        type: column.type,
        notnull: column.notnull,
        pk: column.pk
      }))
    ).toEqual([
      { name: "api_football_fixture_id", type: "INTEGER", notnull: 0, pk: 1 },
      { name: "sporttery_match_id", type: "INTEGER", notnull: 1, pk: 0 },
      { name: "created_at", type: "TEXT", notnull: 1, pk: 0 },
      { name: "updated_at", type: "TEXT", notnull: 1, pk: 0 }
    ]);

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

  it("creates prediction agent output and parlay run tables", () => {
    const { db } = createTestDatabase();

    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("prediction_agent_outputs")
    ).toMatchObject({ name: "prediction_agent_outputs" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("parlay_combination_runs")
    ).toMatchObject({ name: "parlay_combination_runs" });

    const agentOutputColumns = db.prepare("PRAGMA table_info(prediction_agent_outputs)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    expect(
      agentOutputColumns.map((column) => ({
        name: column.name,
        type: column.type,
        notnull: column.notnull
      }))
    ).toEqual([
      { name: "id", type: "TEXT", notnull: 0 },
      { name: "prediction_run_id", type: "TEXT", notnull: 1 },
      { name: "match_id", type: "TEXT", notnull: 1 },
      { name: "model_id", type: "TEXT", notnull: 1 },
      { name: "agent_role", type: "TEXT", notnull: 1 },
      { name: "output_json", type: "TEXT", notnull: 1 },
      { name: "raw_response", type: "TEXT", notnull: 1 },
      { name: "parse_status", type: "TEXT", notnull: 1 },
      { name: "error", type: "TEXT", notnull: 0 },
      { name: "created_at", type: "TEXT", notnull: 1 }
    ]);

    const agentOutputIndexes = db.prepare("PRAGMA index_list(prediction_agent_outputs)").all() as Array<{ name: string }>;
    expect(agentOutputIndexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "idx_prediction_agent_outputs_run",
        "idx_prediction_agent_outputs_match_role_status"
      ])
    );

    const parlayColumns = db.prepare("PRAGMA table_info(parlay_combination_runs)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    expect(
      parlayColumns.map((column) => ({
        name: column.name,
        type: column.type,
        notnull: column.notnull
      }))
    ).toEqual([
      { name: "id", type: "TEXT", notnull: 0 },
      { name: "match_ids_json", type: "TEXT", notnull: 1 },
      { name: "risk_level", type: "TEXT", notnull: 1 },
      { name: "stake_units", type: "INTEGER", notnull: 1 },
      { name: "output_json", type: "TEXT", notnull: 1 },
      { name: "created_at", type: "TEXT", notnull: 1 }
    ]);

    expect(() => applySchema(db)).not.toThrow();
    db.close();
  });

  it("creates betting arena tables", () => {
    const { db } = createTestDatabase();

    for (const tableName of [
      "betting_arena_accounts",
      "betting_arena_rounds",
      "betting_arena_slips",
      "betting_arena_settlements",
      "betting_arena_logs"
    ]) {
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)).toMatchObject({ name: tableName });
    }

    const accountColumns = db.prepare("PRAGMA table_info(betting_arena_accounts)").all() as Array<{ name: string; type: string; notnull: number; pk: number }>;
    expect(accountColumns.map((column) => ({ name: column.name, type: column.type, notnull: column.notnull, pk: column.pk }))).toEqual([
      { name: "model_id", type: "TEXT", notnull: 0, pk: 1 },
      { name: "initial_bankroll", type: "REAL", notnull: 1, pk: 0 },
      { name: "available_bankroll", type: "REAL", notnull: 1, pk: 0 },
      { name: "frozen_stake", type: "REAL", notnull: 1, pk: 0 },
      { name: "total_staked", type: "REAL", notnull: 1, pk: 0 },
      { name: "total_returned", type: "REAL", notnull: 1, pk: 0 },
      { name: "order_count", type: "INTEGER", notnull: 1, pk: 0 },
      { name: "settled_order_count", type: "INTEGER", notnull: 1, pk: 0 },
      { name: "hit_count", type: "INTEGER", notnull: 1, pk: 0 },
      { name: "failed_generation_count", type: "INTEGER", notnull: 1, pk: 0 },
      { name: "last_review", type: "TEXT", notnull: 1, pk: 0 },
      { name: "created_at", type: "TEXT", notnull: 1, pk: 0 },
      { name: "updated_at", type: "TEXT", notnull: 1, pk: 0 }
    ]);

    const roundColumns = db.prepare("PRAGMA table_info(betting_arena_rounds)").all() as Array<{ name: string }>;
    expect(roundColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["id", "round_date", "status", "lock_time", "battle_context_json", "external_intel_json", "created_at", "updated_at"])
    );

    const slipColumns = db.prepare("PRAGMA table_info(betting_arena_slips)").all() as Array<{ name: string }>;
    expect(slipColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "round_id",
        "model_id",
        "action",
        "status",
        "total_stake",
        "potential_return",
        "risk_level",
        "raw_response",
        "output_json",
        "parsed_slip_json",
        "account_context_json",
        "validation_error",
        "created_at",
        "updated_at"
      ])
    );

    expect(() => applySchema(db)).not.toThrow();
    db.close();
  });
});
