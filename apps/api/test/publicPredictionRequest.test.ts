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
      useHeadToHead: false,
      usePlayerLineupInjuries: false,
      useDongqiudiIntel: false,
      useSporttery: true
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

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
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
                    short_reason: "墨西哥主场推进更稳定。",
                    analysis_report: "墨西哥控球和前场压迫更稳定，但需要防守加拿大反击。",
                    key_factors: ["主场", "前场压迫"],
                    risk_points: ["加拿大反击"],
                    data_gaps: ["未获取首发名单"]
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "主队小胜路径更清晰，单场组合以主胜保护为主。",
                    primary_plan: {
                      plan_name: "主胜小比分",
                      risk_level: "medium",
                      legs: [
                        {
                          pool_code: "HAD",
                          selection_code: "h",
                          selection_label: "主胜",
                          reason: "Agent A 判断主队胜面更高。"
                        }
                      ],
                      stake_units: 2,
                      expected_scenario: "墨西哥 2-1。",
                      avoid_reason: null
                    },
                    backup_plans: [],
                    pass_recommendation: "可低注参与。",
                    risk_warnings: ["临场阵容缺失会提高不确定性"],
                    data_gaps: ["未获取首发名单"]
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
        taskTypes: ["match_analysis", "scoreline", "single_bet_combo"],
        dataOptions: {
          useOdds: true,
          useApiFootballPrediction: false,
          useHeadToHead: true,
          usePlayerLineupInjuries: false,
          useDongqiudiIntel: false,
          useSporttery: false
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
        expect.objectContaining({ level: "info", message: "开始生成投注组合：GPT-4o mini", modelDisplayName: "GPT-4o mini" }),
        expect.objectContaining({ level: "info", message: "投注组合生成完成：GPT-4o mini", modelDisplayName: "GPT-4o mini" }),
        expect.objectContaining({ level: "info", message: "模型预测完成：GPT-4o mini", modelDisplayName: "GPT-4o mini" })
      ]
    });
    expect(completedRun.predictions).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(completedRun.predictions[0]).toMatchObject({
      matchAnalysis: {
        predictedResult: "home",
        predictedHomeScore: 2,
        predictedAwayScore: 1,
        dataGaps: ["未获取首发名单"]
      },
      singleCombination: {
        summary: "主队小胜路径更清晰，单场组合以主胜保护为主。",
        primaryPlan: {
          planName: "主胜小比分",
          riskLevel: "medium",
          stakeUnits: 2
        }
      }
    });
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
      { level: "info", message: "开始生成投注组合：GPT-4o mini", model_id: "model-1" },
      { level: "info", message: "投注组合生成完成：GPT-4o mini", model_id: "model-1" },
      { level: "info", message: "模型预测完成：GPT-4o mini", model_id: "model-1" }
    ]);
    expect(
      verifyDb
        .prepare("SELECT agent_role, parse_status FROM prediction_agent_outputs WHERE match_id = ? ORDER BY created_at ASC")
        .all("match-1")
    ).toEqual([
      { agent_role: "match_analysis", parse_status: "parsed" },
      { agent_role: "single_combo", parse_status: "parsed" }
    ]);
    verifyDb.close();
  });

  it("keeps match analysis prediction when single combination generation fails", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, {
      id: "match-1",
      kickoffAt: "2099-06-12T19:00:00.000Z",
      status: "scheduled"
    });
    insertAiConfig(db);
    db.close();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
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
                    short_reason: "墨西哥主场推进更稳定。",
                    analysis_report: "墨西哥控球和前场压迫更稳定。",
                    key_factors: ["主场", "前场压迫"],
                    risk_points: ["加拿大反击"],
                    data_gaps: ["未获取首发名单"]
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockRejectedValueOnce(new Error("Agent B timeout"));

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/public/matches/match-1/prediction-request",
      payload: {
        taskTypes: ["match_analysis", "scoreline", "single_bet_combo"],
        dataOptions: {
          useOdds: false,
          useApiFootballPrediction: false,
          useHeadToHead: false,
          usePlayerLineupInjuries: false,
          useDongqiudiIntel: false,
          useSporttery: true
        },
        promptTemplateId: "prompt-1",
        customPrompt: "",
        outputStyle: "concise",
        refreshContext: false
      }
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    const completedRun = await waitForRunStatus(app, body.runId, "completed");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(completedRun).toMatchObject({
      matchId: "match-1",
      status: "completed",
      predictionsCount: 1,
      logs: [
        expect.objectContaining({ level: "info", message: "预测请求已创建" }),
        expect.objectContaining({ level: "info", message: "开始调用模型：GPT-4o mini", modelDisplayName: "GPT-4o mini" }),
        expect.objectContaining({ level: "info", message: "开始生成投注组合：GPT-4o mini", modelDisplayName: "GPT-4o mini" }),
        expect.objectContaining({ level: "error", message: "投注组合生成失败：GPT-4o mini：Agent B timeout", modelDisplayName: "GPT-4o mini" }),
        expect.objectContaining({ level: "info", message: "赛果预测完成，投注组合失败：GPT-4o mini", modelDisplayName: "GPT-4o mini" })
      ]
    });
    expect(completedRun.predictions).toHaveLength(1);
    expect(completedRun.predictions[0]).toMatchObject({
      matchAnalysis: {
        predictedResult: "home",
        predictedHomeScore: 2,
        predictedAwayScore: 1,
        dataGaps: ["未获取首发名单"]
      },
      singleCombination: null
    });

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
    expect(
      verifyDb
        .prepare("SELECT model_id, agent_role, parse_status FROM prediction_agent_outputs WHERE match_id = ? ORDER BY created_at ASC")
        .all("match-1")
    ).toEqual([{ model_id: "model-1", agent_role: "match_analysis", parse_status: "parsed" }]);
    verifyDb.close();
  });

  it("fails a public prediction run when the model returns event-stream", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, {
      id: "match-1",
      kickoffAt: "2099-06-12T19:00:00.000Z",
      status: "scheduled"
    });
    insertAiConfig(db);
    db.close();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("data: {\"choices\":[]}\n\ndata: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "POST", url: "/api/public/matches/match-1/prediction-request" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      matchId: "match-1",
      runId: expect.any(String)
    });

    const failedRun = await waitForRunStatus(app, body.runId, "failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(failedRun).toMatchObject({
      matchId: "match-1",
      status: "failed",
      predictionsCount: 0,
      logs: [
        expect.objectContaining({ level: "info", message: "预测请求已创建" }),
        expect.objectContaining({ level: "info", message: "开始调用模型：GPT-4o mini", modelDisplayName: "GPT-4o mini" }),
        expect.objectContaining({
          level: "error",
          message: "模型预测失败：GPT-4o mini：AI prediction response was event-stream; expected JSON",
          modelDisplayName: "GPT-4o mini"
        })
      ]
    });
    expect(failedRun.predictions).toHaveLength(0);

    await app.close();

    const verifyDb = createDatabase(databasePath);
    expect(verifyDb.prepare("SELECT status, failure_reason FROM prediction_runs WHERE id = ?").get(body.runId)).toEqual({
      status: "failed",
      failure_reason: "所有模型预测失败"
    });
    expect(verifyDb.prepare("SELECT COUNT(*) AS count FROM ai_predictions WHERE match_id = ?").get("match-1")).toEqual({ count: 0 });
    verifyDb.close();
  });

  it("fails a public prediction run when the model returns empty assistant content", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, {
      id: "match-1",
      kickoffAt: "2099-06-12T19:00:00.000Z",
      status: "scheduled"
    });
    insertAiConfig(db);
    db.close();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "" } }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "POST", url: "/api/public/matches/match-1/prediction-request" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      matchId: "match-1",
      runId: expect.any(String)
    });

    const failedRun = await waitForRunStatus(app, body.runId, "failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(failedRun).toMatchObject({
      matchId: "match-1",
      status: "failed",
      predictionsCount: 0,
      logs: [
        expect.objectContaining({ level: "info", message: "预测请求已创建" }),
        expect.objectContaining({ level: "info", message: "开始调用模型：GPT-4o mini", modelDisplayName: "GPT-4o mini" }),
        expect.objectContaining({
          level: "error",
          message: "模型预测失败：GPT-4o mini：AI prediction content was empty",
          modelDisplayName: "GPT-4o mini"
        })
      ]
    });
    expect(failedRun.predictions).toHaveLength(0);

    await app.close();

    const verifyDb = createDatabase(databasePath);
    expect(verifyDb.prepare("SELECT status, failure_reason FROM prediction_runs WHERE id = ?").get(body.runId)).toEqual({
      status: "failed",
      failure_reason: "所有模型预测失败"
    });
    expect(verifyDb.prepare("SELECT COUNT(*) AS count FROM ai_predictions WHERE match_id = ?").get("match-1")).toEqual({ count: 0 });
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
          useDongqiudiIntel: false,
          useSporttery: false
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
      useDongqiudiIntel: false,
      useSporttery: false
    });
    expect(row.prompt_template_id).toBe("builtin-prompt-scoreline");
    expect(row.custom_prompt).toBe("偏重上半场节奏。");
    expect(row.output_style).toBe("detailed");
    verifyDb.close();
  });

  it("creates a parlay combination from latest single-match plans", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, {
      id: "match-1",
      kickoffAt: "2099-06-12T19:00:00.000Z",
      status: "scheduled"
    });
    insertMatch(db, {
      id: "match-2",
      kickoffAt: "2099-06-13T19:00:00.000Z",
      status: "scheduled"
    });
    insertAiConfig(db);
    db.prepare(
      `
        INSERT INTO prediction_runs (id, match_id, scheduled_at, started_at, finished_at, status, failure_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "run-1",
      "match-1",
      "2026-06-13T08:00:00.000Z",
      "2026-06-13T08:00:00.000Z",
      "2026-06-13T08:00:01.000Z",
      "completed",
      null,
      "run-2",
      "match-2",
      "2026-06-13T08:10:00.000Z",
      "2026-06-13T08:10:00.000Z",
      "2026-06-13T08:10:01.000Z",
      "completed",
      null
    );
    db.prepare(
      `
        INSERT INTO prediction_agent_outputs (
          id,
          prediction_run_id,
          match_id,
          model_id,
          agent_role,
          output_json,
          raw_response,
          parse_status,
          error,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "agent-output-1",
      "run-1",
      "match-1",
      "model-1",
      "single_combo",
      JSON.stringify({
        summary: "第一场主胜保护。",
        primaryPlan: {
          planName: "第一场主胜",
          riskLevel: "medium",
          legs: [{ poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", reason: "主队更稳。" }],
          stakeUnits: 2,
          expectedScenario: "2-1",
          avoidReason: null
        },
        backupPlans: [],
        passRecommendation: "可低注参与。",
        riskWarnings: [],
        dataGaps: []
      }),
      "{}",
      "parsed",
      null,
      "2026-06-13T08:00:01.000Z",
      "agent-output-2",
      "run-2",
      "match-2",
      "model-1",
      "single_combo",
      JSON.stringify({
        summary: "第二场总进球保护。",
        primaryPlan: {
          planName: "第二场小球",
          riskLevel: "medium",
          legs: [{ poolCode: "TTG", selectionCode: "2", selectionLabel: "总进球 2", reason: "节奏偏慢。" }],
          stakeUnits: 1,
          expectedScenario: "1-1",
          avoidReason: null
        },
        backupPlans: [],
        passRecommendation: "可低注参与。",
        riskWarnings: [],
        dataGaps: []
      }),
      "{}",
      "parsed",
      null,
      "2026-06-13T08:10:01.000Z"
    );
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/public/parlay-combinations",
      payload: {
        matchIds: ["match-1", "match-2"],
        riskLevel: "medium",
        stakeUnits: 3
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchIds: ["match-1", "match-2"],
      riskLevel: "medium",
      stakeUnits: 3,
      summary: "2 场组合：第一场主胜 + 第二场小球",
      plans: [
        expect.objectContaining({ planName: "第一场主胜" }),
        expect.objectContaining({ planName: "第二场小球" })
      ]
    });

    await app.close();
  });
});
