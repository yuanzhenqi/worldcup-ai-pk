import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./support/testDatabase";
import {
  createBettingArenaRound,
  ensureBettingArenaAccounts,
  getBettingArenaSummary,
  listBettingArenaAccounts
} from "../src/modules/betting-arena/bettingArena.repository";
import { buildBattleContext, buildAccountContext } from "../src/modules/betting-arena/bettingArena.context";

function insertModel(db: ReturnType<typeof createTestDatabase>["db"], id: string, displayName: string) {
  db.prepare(
    `INSERT INTO ai_providers (id, name, display_name, base_url, api_key, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `provider-${id}`,
    `provider-${id}`,
    `Provider ${id}`,
    "https://newapi.example.com/v1",
    "secret",
    1,
    "2026-06-17T00:00:00.000Z",
    "2026-06-17T00:00:00.000Z"
  );
  db.prepare(
    `INSERT INTO ai_models (id, provider_id, model_name, display_name, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, `provider-${id}`, id, displayName, 1, "2026-06-17T00:00:00.000Z", "2026-06-17T00:00:00.000Z");
}

function insertMatch(db: ReturnType<typeof createTestDatabase>["db"], id: string) {
  db.prepare(
    `INSERT INTO matches (
      id, api_football_fixture_id, stage, kickoff_at, status, venue,
      home_team_id, home_team_name, home_team_logo_url,
      away_team_id, away_team_name, away_team_logo_url,
      home_score, away_score, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
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

describe("betting arena repository and context", () => {
  it("creates one account per enabled model with 10000 initial bankroll", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertModel(db, "model-2", "Model Two");

    ensureBettingArenaAccounts(db, new Date("2026-06-17T00:00:00.000Z"));

    expect(listBettingArenaAccounts(db)).toMatchObject([
      { modelId: "model-1", modelDisplayName: "Model One", availableBankroll: 10000, rank: 1 },
      { modelId: "model-2", modelDisplayName: "Model Two", availableBankroll: 10000, rank: 2 }
    ]);
    db.close();
  });

  it("creates a daily round and summary", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertMatch(db, "match-1");
    ensureBettingArenaAccounts(db, new Date("2026-06-17T00:00:00.000Z"));
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
      now: new Date("2026-06-17T00:00:00.000Z")
    });

    expect(round).toMatchObject({ roundDate: "2026-06-17", status: "draft", eligibleMatchCount: 1, modelsCount: 1 });
    expect(getBettingArenaSummary(db).currentRound).toMatchObject({ roundDate: "2026-06-17" });
    db.close();
  });

  it("builds distinct account context per model while sharing battle context", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertModel(db, "model-2", "Model Two");
    insertMatch(db, "match-1");
    ensureBettingArenaAccounts(db, new Date("2026-06-17T00:00:00.000Z"));

    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });
    const first = buildAccountContext(db, "model-1");
    const second = buildAccountContext(db, "model-2");

    expect(battleContext.matches).toHaveLength(1);
    expect(first.modelId).toBe("model-1");
    expect(second.modelId).toBe("model-2");
    expect(first.availableBankroll).toBe(10000);
    expect(second.availableBankroll).toBe(10000);
    db.close();
  });
});
