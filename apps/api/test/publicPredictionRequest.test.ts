import { afterEach, describe, expect, it, vi } from "vitest";
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

function insertAiConfig(db: ReturnType<typeof createTestDatabase>["db"]) {
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

describe("public prediction request API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function waitForRunStatus(app: ReturnType<typeof buildApp>, runId: string, expectedStatus: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await app.inject({ method: "GET", url: `/api/public/prediction-runs/${runId}` });
      const body = response.json();
      if (body.status === expectedStatus) {
        return body;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const response = await app.inject({ method: "GET", url: `/api/public/prediction-runs/${runId}` });
    return response.json();
  }

  it("runs a manual prediction request immediately and reports missing models", async () => {
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
      status: "completed",
      scheduledFor: null,
      predictionsCount: 0,
      logs: [
        expect.objectContaining({ level: "info", message: "预测请求已创建" }),
        expect.objectContaining({ level: "error", message: "没有可用的大模型配置" })
      ]
    });

    await app.close();

    const verifyDb = createDatabase(databasePath);
    expect(verifyDb.prepare("SELECT match_id, status, next_executable_at FROM prediction_requests").all()).toMatchObject([
      {
        match_id: "match-1",
        status: "completed",
        next_executable_at: null
      }
    ]);
    const requestInputRow = verifyDb.prepare("SELECT task_types_json, data_options_json FROM prediction_requests WHERE match_id = ?").get("match-1") as {
      task_types_json: string;
      data_options_json: string;
    };
    expect(JSON.parse(requestInputRow.task_types_json)).toEqual(["result_1x2", "scoreline"]);
    expect(JSON.parse(requestInputRow.data_options_json)).toEqual({
      useOdds: false,
      useApiFootballPrediction: false,
      useHeadToHead: true,
      usePlayerLineupInjuries: true,
      useDongqiudiIntel: true
    });
    expect(verifyDb.prepare("SELECT match_id, status FROM prediction_runs").all()).toEqual([
      {
        match_id: "match-1",
        status: "completed"
      }
    ]);
    verifyDb.close();
  });

  it("calls enabled models and stores parsed AI predictions", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, {
      id: "match-1",
      kickoffAt: "2099-06-12T19:00:00.000Z",
      status: "scheduled"
    });
    insertAiConfig(db);
    db.close();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  predicted_result: "home",
                  predicted_home_score: 2,
                  predicted_away_score: 1,
                  confidence: 0.64,
                  short_reason: "墨西哥主场和赔率更有利。",
                  analysis_report: "墨西哥在主场和赔率层面更有优势，但需要防守加拿大反击。",
                  key_factors: ["主场", "赔率"],
                  odds_interpretation: "主胜赔率更低。",
                  risk_points: ["加拿大反击"]
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

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
          usePlayerLineupInjuries: false,
          useDongqiudiIntel: false
        },
        promptTemplateId: "prompt-1",
        customPrompt: "偏重上半场节奏。",
        outputStyle: "detailed",
        refreshContext: false
      }
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      matchId: "match-1",
      status: "running",
      runId: expect.any(String),
      predictionsCount: 0,
      logs: [
        expect.objectContaining({ level: "info", message: "预测请求已创建" }),
        expect.objectContaining({ level: "info", message: "开始调用模型：GPT-4o mini", modelDisplayName: "GPT-4o mini" })
      ]
    });

    const completedRun = await waitForRunStatus(app, body.runId, "completed");
    const statusResponse = await app.inject({ method: "GET", url: `/api/public/prediction-runs/${body.runId}` });
    expect(statusResponse.headers["cache-control"]).toBe("no-store");
    expect(completedRun).toMatchObject({
      matchId: "match-1",
      status: "completed",
      predictionsCount: 1,
      logs: [
        expect.objectContaining({ level: "info", message: "预测请求已创建" }),
        expect.objectContaining({ level: "info", message: "开始调用模型：GPT-4o mini", modelDisplayName: "GPT-4o mini" }),
        expect.objectContaining({ level: "info", message: "模型预测完成：GPT-4o mini", modelDisplayName: "GPT-4o mini" })
      ]
    });
    expect(completedRun.predictions).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith("https://openrouter.ai/api/v1/chat/completions", expect.objectContaining({ method: "POST" }));

    await app.close();

    const verifyDb = createDatabase(databasePath);
    expect(
      verifyDb
        .prepare("SELECT model_id, predicted_result, predicted_home_score, predicted_away_score, parse_status FROM ai_predictions WHERE match_id = ?")
        .all("match-1")
    ).toEqual([
      {
        model_id: "model-1",
        predicted_result: "home",
        predicted_home_score: 2,
        predicted_away_score: 1,
        parse_status: "parsed"
      }
    ]);
    expect(verifyDb.prepare("SELECT level, message, model_id FROM prediction_run_logs WHERE match_id = ? ORDER BY created_at ASC").all("match-1")).toEqual([
      { level: "info", message: "预测请求已创建", model_id: null },
      { level: "info", message: "开始调用模型：GPT-4o mini", model_id: "model-1" },
      { level: "info", message: "模型预测完成：GPT-4o mini", model_id: "model-1" }
    ]);
    verifyDb.close();
  });

  it("lists historical prediction runs for a public match", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, {
      id: "match-1",
      kickoffAt: "2099-06-12T19:00:00.000Z",
      status: "scheduled"
    });
    insertAiConfig(db);
    db.prepare(
      `
        INSERT INTO prediction_runs (id, match_id, scheduled_at, started_at, finished_at, status, failure_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "run-1",
      "match-1",
      "2026-06-13T08:00:00.000Z",
      "2026-06-13T08:00:00.000Z",
      "2026-06-13T08:00:03.000Z",
      "completed",
      null
    );
    db.prepare(
      `
        INSERT INTO prediction_run_logs (id, prediction_run_id, match_id, model_id, level, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    ).run("log-1", "run-1", "match-1", "model-1", "info", "模型预测完成：GPT-4o mini", "2026-06-13T08:00:03.000Z");
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
      "prediction-1",
      "run-1",
      "match-1",
      "model-1",
      "prompt-1",
      "home",
      2,
      1,
      0.72,
      "主队更稳定。",
      "详细分析报告正文。",
      JSON.stringify(["赔率", "主场"]),
      "主胜赔率更低。",
      JSON.stringify(["客队反击"]),
      "{}",
      "parsed",
      1,
      "2026-06-13T08:00:03.000Z"
    );
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "GET", url: "/api/public/matches/match-1/prediction-runs" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(body).toMatchObject({
      matchId: "match-1",
      runs: [
        {
          runId: "run-1",
          matchId: "match-1",
          status: "completed",
          message: "已完成 1 个模型预测",
          predictionsCount: 1,
          logs: [
            {
              level: "info",
              message: "模型预测完成：GPT-4o mini",
              modelDisplayName: "GPT-4o mini",
              createdAt: "2026-06-13T08:00:03.000Z"
            }
          ],
          predictions: [
            {
              id: "prediction-1",
              modelDisplayName: "GPT-4o mini",
              predictedResult: "home",
              predictedHomeScore: 2,
              predictedAwayScore: 1,
              confidence: 0.72,
              shortReason: "主队更稳定。",
              keyFactors: ["赔率", "主场"],
              oddsInterpretation: "主胜赔率更低。",
              riskPoints: ["客队反击"],
              analysisReport: "详细分析报告正文。"
            }
          ]
        }
      ]
    });

    await app.close();
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
          usePlayerLineupInjuries: false,
          useDongqiudiIntel: false
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
      status: "completed",
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
      usePlayerLineupInjuries: false,
      useDongqiudiIntel: false
    });
    expect(row.prompt_template_id).toBe("builtin-prompt-scoreline");
    expect(row.custom_prompt).toBe("偏重上半场节奏。");
    expect(row.output_style).toBe("detailed");
    verifyDb.close();
  });
});
