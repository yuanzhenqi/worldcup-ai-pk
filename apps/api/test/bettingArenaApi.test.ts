import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { createTestDatabase } from "./support/testDatabase";

afterEach(() => {
  vi.restoreAllMocks();
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

  it("manually triggers a round and stores a hold slip", async () => {
    const { db, databasePath } = createTestDatabase();
    seedModelAndMatch(db);
    db.close();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
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
                  strategy_summary: "信息不足，今日空仓。",
                  risk_level: "low",
                  bankroll_plan: "保留全部资金。",
                  skip_reasons: ["缺少体彩可售选项"],
                  data_gaps: ["首版 battle_context 尚未注入完整体彩玩法快照"]
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
    expect(response.json()).toMatchObject({
      currentRound: { status: "locked" },
      slips: [{ modelId: "model-1", action: "hold", status: "accepted", totalStake: 0 }]
    });
    await app.close();
  });
});
