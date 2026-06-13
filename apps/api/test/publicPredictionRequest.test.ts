import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createDatabase } from "../src/db/connection";
import { createTestDatabase } from "./support/testDatabase";

function insertMatch(db: ReturnType<typeof createTestDatabase>["db"], input: { id: string; kickoffAt: string; status: string }) {
  db.prepare(
    `
      INSERT INTO matches (
        id,
        api_football_fixture_id,
        stage,
        kickoff_at,
        status,
        venue,
        home_team_id,
        home_team_name,
        home_team_logo_url,
        away_team_id,
        away_team_name,
        away_team_logo_url,
        home_score,
        away_score,
        last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    input.id,
    input.id === "match-1" ? 1001 : 1002,
    "Group Stage",
    input.kickoffAt,
    input.status,
    "Estadio Azteca",
    "team-home",
    "Mexico",
    null,
    "team-away",
    "Canada",
    null,
    null,
    null,
    "2026-06-12T10:00:00.000Z"
  );
}

describe("public prediction request API", () => {
  it("schedules a prediction request for a future match", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, {
      id: "match-1",
      kickoffAt: "2099-06-12T19:00:00.000Z",
      status: "scheduled"
    });
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "POST", url: "/api/public/matches/match-1/prediction-request" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      matchId: "match-1",
      status: "scheduled",
      scheduledFor: "2099-06-12T17:00:00.000Z"
    });

    await app.close();

    const verifyDb = createDatabase(databasePath);
    expect(verifyDb.prepare("SELECT match_id, status, next_executable_at FROM prediction_requests").all()).toEqual([
      {
        match_id: "match-1",
        status: "scheduled",
        next_executable_at: "2099-06-12T17:00:00.000Z"
      }
    ]);
    expect(verifyDb.prepare("SELECT match_id, scheduled_at, status FROM prediction_runs").all()).toEqual([
      {
        match_id: "match-1",
        scheduled_at: "2099-06-12T17:00:00.000Z",
        status: "scheduled"
      }
    ]);
    verifyDb.close();
  });

  it("rejects a prediction request after kickoff", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, {
      id: "match-2",
      kickoffAt: "2020-06-12T19:00:00.000Z",
      status: "finished"
    });
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "POST", url: "/api/public/matches/match-2/prediction-request" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      matchId: "match-2",
      status: "rejected",
      scheduledFor: null
    });

    await app.close();

    const verifyDb = createDatabase(databasePath);
    expect(verifyDb.prepare("SELECT match_id, status, next_executable_at FROM prediction_requests").all()).toEqual([
      {
        match_id: "match-2",
        status: "rejected",
        next_executable_at: null
      }
    ]);
    expect(verifyDb.prepare("SELECT match_id FROM prediction_runs").all()).toEqual([]);
    verifyDb.close();
  });

  it("stores selected prediction task options and returns context completeness", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, {
      id: "match-1",
      kickoffAt: "2099-06-12T19:00:00.000Z",
      status: "scheduled"
    });
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/public/matches/match-1/prediction-request",
      payload: {
        taskTypes: ["result_1x2", "scoreline", "odds_interpretation"],
        dataOptions: {
          useOdds: true,
          useApiFootballPrediction: false,
          useHeadToHead: true,
          usePlayerLineupInjuries: false
        },
        promptTemplateId: "builtin-prompt-scoreline",
        customPrompt: "偏重上半场节奏。",
        outputStyle: "detailed",
        refreshContext: false
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchId: "match-1",
      status: "scheduled",
      context: {
        matchId: "match-1",
        completeness: "base_only"
      }
    });

    await app.close();

    const verifyDb = createDatabase(databasePath);
    const row = verifyDb
      .prepare("SELECT task_types_json, data_options_json, prompt_template_id, custom_prompt, output_style FROM prediction_requests WHERE match_id = ?")
      .get("match-1") as {
      task_types_json: string;
      data_options_json: string;
      prompt_template_id: string;
      custom_prompt: string;
      output_style: string;
    };

    expect(JSON.parse(row.task_types_json)).toEqual(["result_1x2", "scoreline", "odds_interpretation"]);
    expect(JSON.parse(row.data_options_json)).toEqual({
      useOdds: true,
      useApiFootballPrediction: false,
      useHeadToHead: true,
      usePlayerLineupInjuries: false
    });
    expect(row.prompt_template_id).toBe("builtin-prompt-scoreline");
    expect(row.custom_prompt).toBe("偏重上半场节奏。");
    expect(row.output_style).toBe("detailed");
    verifyDb.close();
  });
});
