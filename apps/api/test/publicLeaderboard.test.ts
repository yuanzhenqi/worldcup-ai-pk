import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createDatabase } from "../src/db/connection";
import { createTestDatabase } from "./support/testDatabase";

type TestDatabase = ReturnType<typeof createTestDatabase>["db"];

function insertMatch(db: TestDatabase, input: { id: string; status: string; homeScore: number | null; awayScore: number | null }) {
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
    1001,
    "Group Stage",
    "2026-06-13T19:00:00.000Z",
    input.status,
    "Estadio Azteca",
    "team-home",
    "Mexico",
    null,
    "team-away",
    "Canada",
    null,
    input.homeScore,
    input.awayScore,
    "2026-06-13T08:00:00.000Z"
  );
}

function insertAiConfig(db: TestDatabase) {
  db.prepare(
    `
      INSERT INTO ai_providers (id, name, display_name, base_url, api_key, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run("provider-1", "openrouter", "OpenRouter", "https://openrouter.ai/api/v1", "secret-provider-key", 1, "2026-06-13T08:00:00.000Z", "2026-06-13T08:00:00.000Z");

  db.prepare(
    `
      INSERT INTO ai_models (id, provider_id, model_name, display_name, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  ).run("model-1", "provider-1", "openai/gpt-4o-mini", "GPT-4o mini", 1, "2026-06-13T08:00:00.000Z", "2026-06-13T08:00:00.000Z");

  db.prepare(
    `
      INSERT INTO ai_models (id, provider_id, model_name, display_name, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  ).run("model-2", "provider-1", "anthropic/claude-3-5-haiku", "Claude Haiku", 1, "2026-06-13T08:00:00.000Z", "2026-06-13T08:00:00.000Z");

  db.prepare(
    `
      INSERT INTO prompt_templates (id, name, full_prompt, prompt_summary, description, scope, enabled, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    "prompt-1",
    "综合赛前报告",
    "请基于 prediction_context 输出 JSON。{{homeTeam}} vs {{awayTeam}}",
    "综合分析",
    "综合分析",
    "match_prediction",
    1,
    1,
    "2026-06-13T08:00:00.000Z",
    "2026-06-13T08:00:00.000Z"
  );
}

function insertPredictionRun(db: TestDatabase) {
  db.prepare(
    `
      INSERT INTO prediction_runs (id, match_id, scheduled_at, started_at, finished_at, status, failure_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  ).run("run-1", "match-1", "2026-06-13T08:00:00.000Z", "2026-06-13T08:00:00.000Z", "2026-06-13T08:00:05.000Z", "completed", null);
}

function insertAiPrediction(db: TestDatabase, input: { id: string; modelId: string; result: string; confidence: number; createdAt: string; eligibleForScoring?: boolean }) {
  db.prepare(
    `
      INSERT INTO ai_predictions (
        id,
        prediction_run_id,
        match_id,
        model_id,
        prompt_template_id,
        predicted_result,
        predicted_home_score,
        predicted_away_score,
        confidence,
        short_reason,
        analysis_report,
        key_factors_json,
        odds_interpretation,
        risk_points_json,
        raw_response,
        parse_status,
        eligible_for_scoring,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    input.id,
    "run-1",
    "match-1",
    input.modelId,
    "prompt-1",
    input.result,
    input.result === "away" ? 1 : 2,
    input.result === "away" ? 2 : 1,
    input.confidence,
    "模型给出清晰判断。",
    "详细分析报告。",
    JSON.stringify(["近期状态"]),
    "市场背景仅作说明。",
    JSON.stringify(["转换进攻风险"]),
    "{}",
    "parsed",
    input.eligibleForScoring === false ? 0 : 1,
    input.createdAt
  );
}

describe("public leaderboard API", () => {
  it("returns empty leaderboard sections when no predictions exist", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "GET", url: "/api/public/leaderboard" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      settledRows: [],
      activeRows: []
    });

    await app.close();
  });

  it("returns settled scoring rows and prediction activity rows", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, { id: "match-1", status: "finished", homeScore: 2, awayScore: 1 });
    insertAiConfig(db);
    insertPredictionRun(db);
    insertAiPrediction(db, {
      id: "prediction-1",
      modelId: "model-1",
      result: "home",
      confidence: 0.8,
      createdAt: "2026-06-13T08:00:02.000Z"
    });
    insertAiPrediction(db, {
      id: "prediction-2",
      modelId: "model-2",
      result: "away",
      confidence: 0.6,
      createdAt: "2026-06-13T08:00:04.000Z"
    });
    db.prepare(
      `
        INSERT INTO prediction_scores (
          id,
          ai_prediction_id,
          match_id,
          model_id,
          result_points,
          exact_score_points,
          home_goals_points,
          away_goals_points,
          total_points,
          scored_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run("score-1", "prediction-1", "match-1", "model-1", 3, 5, 1, 1, 10, "2026-06-13T22:00:00.000Z");
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "GET", url: "/api/public/leaderboard" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      settledRows: [
        {
          modelId: "model-1",
          modelDisplayName: "GPT-4o mini",
          totalScore: 10,
          finishedMatchesCounted: 1,
          resultHits: 1,
          resultAccuracy: 1,
          exactScoreHits: 1,
          recentScores: [10]
        },
        {
          modelId: "model-2",
          modelDisplayName: "Claude Haiku",
          totalScore: 0,
          finishedMatchesCounted: 1,
          resultHits: 0,
          resultAccuracy: 0,
          exactScoreHits: 0,
          recentScores: [0]
        }
      ],
      activeRows: [
        {
          modelId: "model-2",
          modelDisplayName: "Claude Haiku",
          predictionsCount: 1,
          parsedPredictionsCount: 1,
          matchesCovered: 1,
          homeWinVotes: 0,
          drawVotes: 0,
          awayWinVotes: 1,
          averageConfidence: 0.6,
          latestPredictionAt: "2026-06-13T08:00:04.000Z"
        },
        {
          modelId: "model-1",
          modelDisplayName: "GPT-4o mini",
          predictionsCount: 1,
          parsedPredictionsCount: 1,
          matchesCovered: 1,
          homeWinVotes: 1,
          drawVotes: 0,
          awayWinVotes: 0,
          averageConfidence: 0.8,
          latestPredictionAt: "2026-06-13T08:00:02.000Z"
        }
      ]
    });

    await app.close();
  });

  it("settles eligible finished-match predictions before returning the public leaderboard", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, { id: "match-1", status: "finished", homeScore: 2, awayScore: 1 });
    insertAiConfig(db);
    insertPredictionRun(db);
    insertAiPrediction(db, {
      id: "prediction-1",
      modelId: "model-1",
      result: "home",
      confidence: 0.8,
      createdAt: "2026-06-13T08:00:02.000Z"
    });
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "GET", url: "/api/public/leaderboard" });

    expect(response.statusCode).toBe(200);
    expect(response.json().settledRows).toEqual([
      {
        modelId: "model-1",
        modelDisplayName: "GPT-4o mini",
        totalScore: 10,
        finishedMatchesCounted: 1,
        resultHits: 1,
        resultAccuracy: 1,
        exactScoreHits: 1,
        recentScores: [10]
      }
    ]);

    await app.close();
  });

  it("does not duplicate scores when the leaderboard is requested repeatedly", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, { id: "match-1", status: "finished", homeScore: 2, awayScore: 1 });
    insertAiConfig(db);
    insertPredictionRun(db);
    insertAiPrediction(db, {
      id: "prediction-1",
      modelId: "model-1",
      result: "home",
      confidence: 0.8,
      createdAt: "2026-06-13T08:00:02.000Z"
    });
    db.close();

    const app = buildApp({ databasePath, logger: false });
    await app.inject({ method: "GET", url: "/api/public/leaderboard" });
    await app.inject({ method: "GET", url: "/api/public/leaderboard" });
    await app.close();

    const checkDb = createDatabase(databasePath);
    const row = checkDb
      .prepare("SELECT COUNT(*) AS count FROM prediction_scores WHERE ai_prediction_id = ?")
      .get("prediction-1") as { count: number };
    checkDb.close();
    expect(row.count).toBe(1);
  });

  it("does not settle live or scheduled matches", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, { id: "match-1", status: "live", homeScore: 1, awayScore: 0 });
    insertAiConfig(db);
    insertPredictionRun(db);
    insertAiPrediction(db, {
      id: "prediction-1",
      modelId: "model-1",
      result: "home",
      confidence: 0.8,
      createdAt: "2026-06-13T08:00:02.000Z"
    });
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "GET", url: "/api/public/leaderboard" });

    expect(response.statusCode).toBe(200);
    expect(response.json().settledRows).toEqual([]);

    await app.close();
  });

  it("does not settle predictions that are not eligible for scoring", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, { id: "match-1", status: "finished", homeScore: 2, awayScore: 1 });
    insertAiConfig(db);
    insertPredictionRun(db);
    insertAiPrediction(db, {
      id: "prediction-1",
      modelId: "model-1",
      result: "home",
      confidence: 0.8,
      createdAt: "2026-06-13T08:00:02.000Z",
      eligibleForScoring: false
    });
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "GET", url: "/api/public/leaderboard" });

    expect(response.statusCode).toBe(200);
    expect(response.json().settledRows).toEqual([]);

    await app.close();
  });
});
