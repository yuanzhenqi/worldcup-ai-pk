import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { createTestDatabase } from "./support/testDatabase";
import { buildBattleContext } from "../src/modules/betting-arena/bettingArena.context";
import { createBettingArenaRound } from "../src/modules/betting-arena/bettingArena.repository";
import { createDatabase } from "../src/db/connection";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function seedModelAndMatch(db: ReturnType<typeof createTestDatabase>["db"]) {
  db.prepare(
    `INSERT INTO ai_providers (id, name, display_name, base_url, api_key, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "provider-1",
    "newapi",
    "NewAPI",
    "https://newapi.example.com/v1",
    "secret",
    1,
    "2026-06-17T00:00:00.000Z",
    "2026-06-17T00:00:00.000Z"
  );
  db.prepare(
    `INSERT INTO ai_models (id, provider_id, model_name, display_name, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run("model-1", "provider-1", "model-1", "Model One", 1, "2026-06-17T00:00:00.000Z", "2026-06-17T00:00:00.000Z");
  db.prepare(
    `INSERT INTO matches (
      id, api_football_fixture_id, stage, kickoff_at, status, venue,
      home_team_id, home_team_name, home_team_logo_url,
      away_team_id, away_team_name, away_team_logo_url,
      home_score, away_score, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "match-1",
    9001,
    "Group Stage - 1",
    "2026-06-18T12:00:00.000Z",
    "scheduled",
    "Test Stadium",
    "home-1",
    "Home",
    null,
    "away-1",
    "Away",
    null,
    null,
    null,
    "2026-06-17T00:00:00.000Z"
  );
}

describe("betting arena public API", () => {
  it("returns an empty arena summary with initialized accounts", async () => {
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({ method: "GET", url: "/api/public/betting-arena" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accounts: [{ modelId: "model-1", modelDisplayName: "Model One", availableBankroll: 10000 }],
      currentRound: null,
      slips: [],
      history: []
    });
    await app.close();
  });

  it("returns betting arena ledger history through the public API", async () => {
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      battleContext: {
        roundDate: "2026-06-20",
        lockTime: "2026-06-20T10:00:00.000Z",
        matches: [],
        externalIntel: { summary: "统一外部情报未配置", dataGaps: [] }
      },
      externalIntel: { summary: "统一外部情报未配置", dataGaps: [] },
      now: new Date("2026-06-20T00:00:00.000Z")
    });
    db.prepare(
      `
        INSERT INTO betting_arena_slips (
          id, round_id, model_id, action, status, total_stake, potential_return, risk_level,
          raw_response, output_json, parsed_slip_json, account_context_json, validation_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "slip-ledger-api",
      round.id,
      "model-1",
      "hold",
      "accepted",
      0,
      0,
      "low",
      "{}",
      "{}",
      JSON.stringify({ action: "hold", strategySummary: "观望", singles: [], parlays: [], portfolioBuckets: [], skipReasons: ["没有优势"], dataGaps: [] }),
      "{}",
      null,
      "2026-06-20T10:00:00.000Z",
      "2026-06-20T10:00:00.000Z"
    );
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({ method: "GET", url: "/api/public/betting-arena/ledger?modelId=model-1&limit=10&offset=0" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({ total: 1, limit: 10, offset: 0, modelId: "model-1" });
    expect(body.items[0].slip.id).toBe("slip-ledger-api");
    await app.close();
  });

  it("manually triggers a round and stores a hold slip", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T10:00:00.000Z"));
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    db.close();
    const rawBody = JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: "hold",
              total_stake: 0,
              singles: [],
              parlays: [],
              strategy_summary: "信息不足，今日空仓。",
              risk_level: "low",
              bankroll_plan: "保留全部资金。",
              skip_reasons: ["缺少体彩可售选项"],
              data_gaps: ["首版 battle_context 尚未注入完整体彩玩法快照"]
            })
          }
        }
      ]
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(rawBody, { status: 200, headers: { "content-type": "application/json" } })
    );
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({ method: "POST", url: "/api/public/betting-arena/rounds" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      currentRound: {
        status: "locked",
        battleContext: {
          matches: [{ matchId: "match-1", homeTeamName: "Home", awayTeamName: "Away" }]
        }
      },
      slips: [
        {
          modelId: "model-1",
          action: "hold",
          status: "accepted",
          totalStake: 0,
          accountContext: { modelId: "model-1", availableBankroll: 10000 },
          rawResponse: rawBody
        }
      ]
    });
    expect(body.slips[0].prompt).toContain("account_context=");
    expect(body.slips[0].prompt).toContain("battle_context=");
    expect(JSON.parse(body.slips[0].outputJson)).toMatchObject({ action: "hold" });
    await app.close();
  });

  it("refreshes Sporttery odds before sending battle context to betting models", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T10:00:00.000Z"));
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    db.prepare(
      `
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, ?)
      `
    ).run("sporttery.enabled", "true", "2026-06-17T00:00:00.000Z");
    db.prepare(
      `
        INSERT INTO fixture_sporttery_mappings (api_football_fixture_id, sporttery_match_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `
    ).run(9001, 2040170, "2026-06-17T00:00:00.000Z", "2026-06-17T00:00:00.000Z");
    db.close();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const requestUrl = String(url);
      if (requestUrl.includes("getMatchListV1.qry")) {
        return new Response(
          JSON.stringify({
            value: {
              matchInfoList: [
                {
                  subMatchList: [
                    {
                      matchId: 2040170,
                      oddsList: [
                        {
                          poolCode: "HAD",
                          h: "1.85",
                          d: "3.20",
                          a: "4.10",
                          goalLine: "",
                          updateDate: "2026-06-17",
                          updateTime: "10:00:00"
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (requestUrl.includes("webapi.sporttery.cn")) {
        return new Response(JSON.stringify({ value: {} }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const requestBody = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      expect(requestBody.messages.at(-1)?.content).toContain('"sportteryPools":[{"poolCode":"HAD"');
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: "bet",
                  total_stake: 100,
                  singles: [
                    {
                      match_id: "match-1",
                      pool_code: "HAD",
                      selection_code: "h",
                      selection_label: "主胜",
                      locked_odds: 1.85,
                      stake: 100,
                      confidence: 0.62,
                      rationale: "体彩玩法已注入，选择小额单场。"
                    }
                  ],
                  parlays: [],
                  strategy_summary: "小额试探主胜。",
                  risk_level: "medium",
                  bankroll_plan: "投入 100，保留 9900。",
                  skip_reasons: [],
                  data_gaps: []
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({ method: "POST", url: "/api/public/betting-arena/rounds" });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("getMatchListV1.qry"), expect.anything());
    expect(response.json()).toMatchObject({
      currentRound: { status: "locked", eligibleMatchCount: 1 },
      slips: [{ modelId: "model-1", action: "bet", status: "accepted", totalStake: 100 }]
    });
    await app.close();
  });

  it("refreshes every configured data source before sending battle context to betting models", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T10:00:00.000Z"));
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    db.prepare(
      `
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)
      `
    ).run(
      "apiFootball.apiKey",
      "football-secret",
      "2026-06-17T00:00:00.000Z",
      "dongqiudi.enabled",
      "true",
      "2026-06-17T00:00:00.000Z",
      "sporttery.enabled",
      "true",
      "2026-06-17T00:00:00.000Z"
    );
    db.prepare(
      `
        INSERT INTO fixture_dongqiudi_mappings (api_football_fixture_id, dongqiudi_match_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `
    ).run(9001, 8080, "2026-06-17T00:00:00.000Z", "2026-06-17T00:00:00.000Z");
    db.prepare(
      `
        INSERT INTO fixture_sporttery_mappings (api_football_fixture_id, sporttery_match_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `
    ).run(9001, 2040170, "2026-06-17T00:00:00.000Z", "2026-06-17T00:00:00.000Z");
    db.close();
    const calledUrls: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const requestUrl = String(url);
      calledUrls.push(requestUrl);
      if (requestUrl.includes("v3.football.api-sports.io/odds?fixture=9001")) {
        return new Response(
          JSON.stringify({
            response: [
              {
                bookmakers: [
                  {
                    name: "TestBook",
                    bets: [{ name: "Match Winner", values: [{ value: "Home", odd: "1.90" }, { value: "Draw", odd: "3.10" }, { value: "Away", odd: "4.20" }] }]
                  }
                ]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (requestUrl.includes("v3.football.api-sports.io/predictions?fixture=9001")) {
        return new Response(
          JSON.stringify({ response: [{ predictions: { winner: { name: "Home" }, advice: "Home win", percent: { home: "55%", draw: "25%", away: "20%" } } }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (requestUrl.includes("v3.football.api-sports.io/fixtures/headtohead?h2h=home-1-away-1")) {
        return new Response(
          JSON.stringify({ response: [{ teams: { home: { name: "Home" }, away: { name: "Away" } }, goals: { home: 2, away: 1 } }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (requestUrl.includes("v3.football.api-sports.io/injuries?fixture=9001")) {
        return new Response(
          JSON.stringify({ response: [{ team: { name: "Home" }, player: { name: "Home Defender" }, reason: "Knock" }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (requestUrl.includes("v3.football.api-sports.io/fixtures/lineups?fixture=9001")) {
        return new Response(JSON.stringify({ response: [{ team: { name: "Home" }, formation: "4-3-3" }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (requestUrl.includes("v3.football.api-sports.io/players/squads?team=home-1")) {
        return new Response(JSON.stringify({ response: [{ players: [{ name: "Home Star" }, { name: "Home Keeper" }] }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (requestUrl.includes("v3.football.api-sports.io/players/squads?team=away-1")) {
        return new Response(JSON.stringify({ response: [{ players: [{ name: "Away Star" }] }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (requestUrl.includes("sport-data.dongqiudi.com/soccer/biz/dqd/match/pre_analyze_data_contrast/8080")) {
        return new Response(
          JSON.stringify({
            data: {
              comprehensive: {
                team_A_score: "72",
                team_B_score: "66",
                data: [{ title: "身价", team_A: { match_info: "€100m" }, team_B: { match_info: "€80m" } }]
              },
              statistics: { data: [{ title: "红黄牌", team_A: { match_info: "1.2" }, team_B: { match_info: "1.8" } }] }
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (requestUrl.includes("getMatchListV1.qry")) {
        return new Response(
          JSON.stringify({
            value: {
              matchInfoList: [
                {
                  subMatchList: [
                    {
                      matchId: 2040170,
                      oddsList: [{ poolCode: "HAD", h: "1.85", d: "3.20", a: "4.10", goalLine: "", updateDate: "2026-06-17", updateTime: "10:00:00" }]
                    }
                  ]
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (requestUrl.includes("webapi.sporttery.cn")) {
        return new Response(JSON.stringify({ value: {} }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const requestBody = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const prompt = requestBody.messages.at(-1)?.content ?? "";
      expect(prompt).not.toContain('"domain":"odds","status":"cached"');
      expect(prompt).not.toContain('"domain":"api_prediction","status":"cached"');
      expect(prompt).not.toContain('"domain":"head_to_head","status":"cached"');
      expect(prompt).not.toContain('"domain":"squad","status":"cached"');
      expect(prompt).toContain('"domain":"dongqiudi_intel","status":"cached"');
      expect(prompt).toContain('"domain":"sporttery","status":"cached"');
      expect(prompt).toContain("身价 主€100m / 客€80m");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: "hold",
                  total_stake: 0,
                  singles: [],
                  parlays: [],
                  strategy_summary: "数据齐全但不出手。",
                  risk_level: "low",
                  bankroll_plan: "保留资金。",
                  skip_reasons: [],
                  data_gaps: []
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({ method: "POST", url: "/api/public/betting-arena/rounds" });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    expect(calledUrls).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("v3.football.api-sports.io/odds?fixture=9001"),
        expect.stringContaining("v3.football.api-sports.io/predictions?fixture=9001"),
        expect.stringContaining("v3.football.api-sports.io/fixtures/headtohead?h2h=home-1-away-1"),
        expect.stringContaining("v3.football.api-sports.io/injuries?fixture=9001"),
        expect.stringContaining("v3.football.api-sports.io/fixtures/lineups?fixture=9001"),
        expect.stringContaining("v3.football.api-sports.io/players/squads?team=home-1"),
        expect.stringContaining("v3.football.api-sports.io/players/squads?team=away-1")
      ])
    );
    expect(calledUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("sport-data.dongqiudi.com/soccer/biz/dqd/match/pre_analyze_data_contrast/8080"),
        expect.stringContaining("getMatchListV1.qry"),
        expect.stringContaining("getResultHistoryV1.qry"),
        expect.stringContaining("getMatchTablesV2.qry"),
        expect.stringContaining("getMatchResultV1.qry"),
        expect.stringContaining("getMatchFeatureV1.qry"),
        expect.stringContaining("getInjurySuspensionV1.qry")
      ])
    );
    await app.close();
  });

  it("injects collected external intelligence into betting prompts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T10:00:00.000Z"));
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(
      "externalIntel.enabled",
      "true",
      "2026-06-21T10:00:00.000Z"
    );
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(
      "externalIntel.summarizerModelId",
      "model-1",
      "2026-06-21T10:00:00.000Z"
    );

    let sawOpenAiPrompt = false;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const requestUrl = String(url);
      if (requestUrl.includes("duckduckgo.com")) {
        return new Response(
          `<html><body><div class="result"><a class="result__a" href="https://example.com/team-news">Team news</a><a class="result__title">Team news</a><div class="result__snippet">Germany confirms striker fitness.</div></div></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } }
        );
      }
      if (requestUrl.includes("newapi.example.com")) {
        sawOpenAiPrompt = true;
        const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
        const prompt = body.messages.at(-1)?.content ?? "";
        expect(prompt).toContain('"externalIntel":{"status":"cached"');
        expect(prompt).toContain("Germany confirms striker fitness");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    action: "hold",
                    total_stake: 0,
                    singles: [],
                    parlays: [],
                    portfolio_buckets: [],
                    strategy_summary: "等待更多情报。",
                    risk_level: "low",
                    bankroll_plan: "保留资金。",
                    skip_reasons: [],
                    data_gaps: []
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ value: {} }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "POST", url: "/api/public/betting-arena/rounds" });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    expect(sawOpenAiPrompt).toBe(true);
    await app.close();
  });

  it("continues a generating round that already has partial model slips", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T10:00:00.000Z"));
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    db.prepare(
      `INSERT INTO ai_models (id, provider_id, model_name, display_name, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("model-2", "provider-1", "model-2", "Model Two", 1, "2026-06-17T00:00:00.000Z", "2026-06-17T00:00:00.000Z");
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-17T10:00:00.000Z")
    });
    db.prepare("UPDATE betting_arena_rounds SET status = ? WHERE id = ?").run("generating", round.id);
    db.prepare(
      `
        INSERT INTO betting_arena_slips (
          id,
          round_id,
          model_id,
          action,
          status,
          total_stake,
          potential_return,
          risk_level,
          raw_response,
          output_json,
          parsed_slip_json,
          account_context_json,
          validation_error,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "slip-1",
      round.id,
      "model-1",
      "hold",
      "accepted",
      0,
      0,
      "low",
      "{}",
      "{}",
      JSON.stringify({
        action: "hold",
        totalStake: 0,
        potentialReturn: 0,
        riskLevel: "low",
        strategySummary: "已生成。",
        bankrollPlan: "保留资金。",
        singles: [],
        parlays: [],
        skipReasons: [],
        dataGaps: []
      }),
      "{}",
      null,
      "2026-06-17T10:00:00.000Z",
      "2026-06-17T10:00:00.000Z"
    );
    db.close();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: "hold",
                  total_stake: 0,
                  singles: [],
                  parlays: [],
                  strategy_summary: "补齐第二个模型。",
                  risk_level: "low",
                  bankroll_plan: "保留全部资金。",
                  skip_reasons: ["缺少稳健机会"],
                  data_gaps: []
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({ method: "POST", url: "/api/public/betting-arena/rounds" });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    expect(response.json()).toMatchObject({
      currentRound: { id: round.id, status: "locked" },
      slips: [
        { modelId: "model-1", status: "accepted" },
        { modelId: "model-2", action: "hold", status: "accepted" }
      ]
    });
    await app.close();
  });

  it("generates a betting slip for one selected model", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T10:00:00.000Z"));
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    db.prepare(
      `INSERT INTO ai_models (id, provider_id, model_name, display_name, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("model-2", "provider-1", "model-2", "Model Two", 1, "2026-06-17T00:00:00.000Z", "2026-06-17T00:00:00.000Z");
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-17T10:00:00.000Z")
    });
    db.prepare("UPDATE betting_arena_rounds SET status = ? WHERE id = ?").run("locked", round.id);
    db.close();
    const rawBody = JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: "hold",
              total_stake: 0,
              singles: [],
              parlays: [],
              strategy_summary: "单模型手动空仓。",
              risk_level: "low",
              bankroll_plan: "保留资金。",
              skip_reasons: [],
              data_gaps: []
            })
          }
        }
      ]
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(rawBody, { status: 200, headers: { "content-type": "application/json" } })
    );
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({ method: "POST", url: `/api/public/betting-arena/rounds/${round.id}/models/model-1` });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      currentRound: { id: round.id, status: "locked" },
      slips: [{ modelId: "model-1", action: "hold", status: "accepted", strategySummary: "单模型手动空仓。" }]
    });
    expect(body.slips.map((slip: { modelId: string }) => slip.modelId)).toEqual(["model-1"]);
    await app.close();
  });

  it("does not regenerate an existing slip for the same round and model", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T10:00:00.000Z"));
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-21",
      lockTime: "2026-06-21T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报由比赛级 externalIntel 提供", dataGaps: [] }
    });
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-21",
      lockTime: "2026-06-21T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报由比赛级 externalIntel 提供", dataGaps: [] },
      now: new Date("2026-06-21T10:00:00.000Z")
    });
    db.prepare(
      `INSERT INTO betting_arena_slips (
        id, round_id, model_id, action, status, total_stake, potential_return, risk_level,
        raw_response, output_json, parsed_slip_json, account_context_json, validation_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "slip-1",
      round.id,
      "model-1",
      "hold",
      "accepted",
      0,
      0,
      "low",
      "{}",
      "{}",
      JSON.stringify({ action: "hold", singles: [], parlays: [], portfolioBuckets: [] }),
      "{}",
      null,
      "2026-06-21T10:00:00.000Z",
      "2026-06-21T10:00:00.000Z"
    );
    db.close();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch should not be called for an existing round/model slip");
    });
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({ method: "POST", url: `/api/public/betting-arena/rounds/${round.id}/models/model-1` });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      currentRound: { id: round.id, status: "locked" },
      slips: [
        {
          id: "slip-1",
          modelId: "model-1",
          action: "hold",
          status: "accepted",
          totalStake: 0
        }
      ]
    });
    await app.close();
  });

  it("returns existing state before model lookup when duplicate slip belongs to an archived model", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T10:00:00.000Z"));
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-21",
      lockTime: "2026-06-21T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报由比赛级 externalIntel 提供", dataGaps: [] }
    });
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-21",
      lockTime: "2026-06-21T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报由比赛级 externalIntel 提供", dataGaps: [] },
      now: new Date("2026-06-21T10:00:00.000Z")
    });
    db.prepare(
      `INSERT INTO betting_arena_slips (
        id, round_id, model_id, action, status, total_stake, potential_return, risk_level,
        raw_response, output_json, parsed_slip_json, account_context_json, validation_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "slip-archived",
      round.id,
      "model-1",
      "hold",
      "accepted",
      0,
      0,
      "low",
      "{}",
      "{}",
      JSON.stringify({ action: "hold", singles: [], parlays: [], portfolioBuckets: [] }),
      "{}",
      null,
      "2026-06-21T10:00:00.000Z",
      "2026-06-21T10:00:00.000Z"
    );
    db.prepare("UPDATE ai_models SET enabled = 0, deleted_at = ? WHERE id = ?").run("2026-06-21T10:05:00.000Z", "model-1");
    db.close();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch should not be called for an archived duplicate slip");
    });
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({ method: "POST", url: `/api/public/betting-arena/rounds/${round.id}/models/model-1` });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("retries a failed round slip and preserves invalid model output", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T10:00:00.000Z"));
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-17T10:00:00.000Z")
    });
    db.prepare("UPDATE betting_arena_rounds SET status = ? WHERE id = ?").run("locked", round.id);
    db.prepare(
      `
        INSERT INTO betting_arena_slips (
          id,
          round_id,
          model_id,
          action,
          status,
          total_stake,
          potential_return,
          risk_level,
          raw_response,
          output_json,
          parsed_slip_json,
          account_context_json,
          validation_error,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "slip-1",
      round.id,
      "model-1",
      "hold",
      "generation_failed",
      0,
      0,
      "low",
      "",
      "{}",
      "{}",
      "{}",
      "previous failure",
      "2026-06-17T10:00:00.000Z",
      "2026-06-17T10:00:00.000Z"
    );
    db.close();
    const rawBody = JSON.stringify({
      choices: [
        {
          message: {
            content: "我建议空仓。"
          }
        }
      ]
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(rawBody, {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({ method: "POST", url: "/api/public/betting-arena/rounds" });

    expect(response.statusCode).toBe(200);
    await app.close();
    const retryDb = createDatabase(databasePath);
    const slip = retryDb
      .prepare("SELECT status, raw_response, output_json, validation_error FROM betting_arena_slips WHERE round_id = ? AND model_id = ?")
      .get(round.id, "model-1") as { status: string; raw_response: string; output_json: string; validation_error: string };
    expect(slip.status).toBe("generation_failed");
    expect(slip.raw_response).toBe(rawBody);
    expect(slip.output_json).toBe("我建议空仓。");
    expect(slip.validation_error).toBe("Betting arena slip JSON parse failed: object braces not found");
    retryDb.close();
  });

  it("settles accepted slips through the settlement endpoint and updates bankroll", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T10:00:00.000Z"));
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-17T10:00:00.000Z")
    });
    db.prepare("UPDATE betting_arena_rounds SET status = ? WHERE id = ?").run("locked", round.id);
    db.prepare("UPDATE matches SET status = ?, home_score = ?, away_score = ? WHERE id = ?").run("finished", 2, 1, "match-1");
    db.prepare(
      `
        INSERT INTO betting_arena_slips (
          id,
          round_id,
          model_id,
          action,
          status,
          total_stake,
          potential_return,
          risk_level,
          raw_response,
          output_json,
          parsed_slip_json,
          account_context_json,
          validation_error,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "slip-1",
      round.id,
      "model-1",
      "bet",
      "accepted",
      100,
      185,
      "medium",
      "{}",
      "{}",
      JSON.stringify({
        action: "bet",
        totalStake: 100,
        potentialReturn: 185,
        riskLevel: "medium",
        strategySummary: "主胜小额单场。",
        bankrollPlan: "投入 100。",
        singles: [
          {
            matchId: "match-1",
            poolCode: "HAD",
            selectionCode: "h",
            selectionLabel: "主胜",
            lockedOdds: 1.85,
            stake: 100,
            confidence: 0.62,
            rationale: "主队更稳。"
          }
        ],
        parlays: [],
        skipReasons: [],
        dataGaps: []
      }),
      "{}",
      null,
      "2026-06-17T10:00:00.000Z",
      "2026-06-17T10:00:00.000Z"
    );
    db.prepare(
      `
        UPDATE betting_arena_accounts
        SET available_bankroll = 9900,
            frozen_stake = 100,
            total_staked = 100,
            order_count = 1
        WHERE model_id = ?
      `
    ).run("model-1");
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({ method: "POST", url: `/api/public/betting-arena/rounds/${round.id}/settle` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      currentRound: { id: round.id, status: "settled", settledReturn: 185 },
      accounts: [{ modelId: "model-1", availableBankroll: 10085, frozenStake: 0, totalReturned: 185, settledOrderCount: 1, hitCount: 1 }],
      slips: [{ id: "slip-1", status: "settled" }]
    });
    await app.close();
    const settledDb = createDatabase(databasePath);
    const settlement = settledDb
      .prepare("SELECT stake, returned_amount, profit, status FROM betting_arena_settlements WHERE slip_id = ?")
      .get("slip-1") as { stake: number; returned_amount: number; profit: number; status: string };
    expect(settlement).toEqual({ stake: 100, returned_amount: 185, profit: 85, status: "settled" });
    settledDb.close();
  });

  it("auto-settles a locked round when public summary is requested after selected matches finish", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T10:00:00.000Z"));
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-17T10:00:00.000Z")
    });
    db.prepare("UPDATE betting_arena_rounds SET status = ? WHERE id = ?").run("locked", round.id);
    db.prepare("UPDATE matches SET status = ?, home_score = ?, away_score = ? WHERE id = ?").run("finished", 0, 1, "match-1");
    db.prepare(
      `
        INSERT INTO betting_arena_slips (
          id,
          round_id,
          model_id,
          action,
          status,
          total_stake,
          potential_return,
          risk_level,
          raw_response,
          output_json,
          parsed_slip_json,
          account_context_json,
          validation_error,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "slip-auto",
      round.id,
      "model-1",
      "bet",
      "accepted",
      100,
      210,
      "medium",
      "{}",
      "{}",
      JSON.stringify({
        action: "bet",
        totalStake: 100,
        potentialReturn: 210,
        riskLevel: "medium",
        strategySummary: "客胜单场。",
        bankrollPlan: "投入 100。",
        singles: [
          {
            matchId: "match-1",
            poolCode: "HAD",
            selectionCode: "a",
            selectionLabel: "客胜",
            lockedOdds: 2.1,
            stake: 100,
            confidence: 0.62,
            rationale: "客队状态好。"
          }
        ],
        parlays: [],
        skipReasons: [],
        dataGaps: []
      }),
      "{}",
      null,
      "2026-06-17T10:00:00.000Z",
      "2026-06-17T10:00:00.000Z"
    );
    db.prepare(
      `
        UPDATE betting_arena_accounts
        SET available_bankroll = 9900,
            frozen_stake = 100,
            total_staked = 100,
            order_count = 1
        WHERE model_id = ?
      `
    ).run("model-1");
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({ method: "GET", url: "/api/public/betting-arena" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      currentRound: { id: round.id, status: "settled", settledReturn: 210 },
      accounts: [{ modelId: "model-1", availableBankroll: 10110, frozenStake: 0, totalReturned: 210, settledOrderCount: 1, hitCount: 1 }],
      slips: [{ id: "slip-auto", status: "settled" }]
    });
    await app.close();
  });
});
