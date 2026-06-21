import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./support/testDatabase";
import {
  createBettingArenaRound,
  ensureBettingArenaAccounts,
  getBettingArenaSummary,
  listBettingArenaAccounts
} from "../src/modules/betting-arena/bettingArena.repository";
import { buildBattleContext, buildAccountContext } from "../src/modules/betting-arena/bettingArena.context";
import { saveFixtureContextSnapshot } from "../src/modules/context/fixtureContext.repository";

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

function insertMatch(
  db: ReturnType<typeof createTestDatabase>["db"],
  id: string,
  input: {
    apiFootballFixtureId?: number;
    kickoffAt?: string;
    status?: string;
    homeTeamId?: string;
    homeTeamName?: string;
    awayTeamId?: string;
    awayTeamName?: string;
  } = {}
) {
  db.prepare(
    `INSERT INTO matches (
      id, api_football_fixture_id, stage, kickoff_at, status, venue,
      home_team_id, home_team_name, home_team_logo_url,
      away_team_id, away_team_name, away_team_logo_url,
      home_score, away_score, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.apiFootballFixtureId ?? 9001,
    "Group Stage - 1",
    input.kickoffAt ?? "2026-06-18T12:00:00.000Z",
    input.status ?? "scheduled",
    "Test Stadium",
    input.homeTeamId ?? "home-1",
    input.homeTeamName ?? "Home",
    null,
    input.awayTeamId ?? "away-1",
    input.awayTeamName ?? "Away",
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

  it("hides archived model accounts and slips from betting arena summary", () => {
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
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-17T00:00:00.000Z")
    });
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
      "slip-2",
      round.id,
      "model-2",
      "hold",
      "accepted",
      0,
      0,
      "low",
      "{}",
      "{}",
      JSON.stringify({ action: "hold", strategySummary: "归档模型出单" }),
      "{}",
      null,
      "2026-06-17T10:00:00.000Z",
      "2026-06-17T10:00:00.000Z"
    );
    db.prepare("UPDATE ai_models SET deleted_at = ?, enabled = 0 WHERE id = ?").run("2026-06-18T00:00:00.000Z", "model-2");

    const summary = getBettingArenaSummary(db);

    expect(summary.accounts.map((account) => account.modelId)).toEqual(["model-1"]);
    expect(summary.slips).toEqual([]);
    expect(summary.currentRound).toMatchObject({ modelsCount: 1 });
    db.close();
  });

  it("returns an existing daily round when the same round date is created again", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertMatch(db, "match-1");
    ensureBettingArenaAccounts(db, new Date("2026-06-17T00:00:00.000Z"));
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });

    const first = createBettingArenaRound(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-17T00:00:00.000Z")
    });
    const second = createBettingArenaRound(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-17T01:00:00.000Z")
    });
    const rowCount = db.prepare("SELECT COUNT(*) AS count FROM betting_arena_rounds").get() as { count: number };

    expect(second.id).toBe(first.id);
    expect(rowCount.count).toBe(1);
    db.close();
  });

  it("orders zero initial bankroll accounts with the guarded return rate", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertModel(db, "model-2", "Model Two");
    ensureBettingArenaAccounts(db, new Date("2026-06-17T00:00:00.000Z"));
    db.prepare("UPDATE betting_arena_accounts SET initial_bankroll = 0 WHERE model_id = ?").run("model-1");
    db.prepare("UPDATE betting_arena_accounts SET available_bankroll = 9000 WHERE model_id = ?").run("model-2");

    expect(listBettingArenaAccounts(db)).toMatchObject([
      { modelId: "model-1", returnRate: 0, rank: 1 },
      { modelId: "model-2", returnRate: -0.1, rank: 2 }
    ]);
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

  it("injects recent bet slips and settlement results into account context", () => {
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
      now: new Date("2026-06-17T10:00:00.000Z")
    });
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
      "settled",
      100,
      185,
      "medium",
      "{}",
      "{}",
      JSON.stringify({
        strategySummary: "主胜小额单场。",
        bankrollPlan: "投入 100。",
        singles: [{ matchId: "match-1", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.85, stake: 100 }],
        parlays: []
      }),
      "{}",
      null,
      "2026-06-17T10:00:00.000Z",
      "2026-06-17T10:00:00.000Z"
    );
    db.prepare(
      `
        INSERT INTO betting_arena_settlements (
          id,
          slip_id,
          round_id,
          model_id,
          stake,
          returned_amount,
          profit,
          status,
          settlement_json,
          settled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "settlement-1",
      "slip-1",
      round.id,
      "model-1",
      100,
      185,
      85,
      "settled",
      JSON.stringify({ hit: true, legs: [{ matchId: "match-1", won: true, voided: false }] }),
      "2026-06-19T10:00:00.000Z"
    );

    const accountContext = buildAccountContext(db, "model-1");
    const lastFiveBetSlips = accountContext.lastFiveBetSlips as Array<Record<string, unknown>>;
    const lastFiveSettlementResults = accountContext.lastFiveSettlementResults as Array<Record<string, unknown>>;

    expect(lastFiveBetSlips).toHaveLength(1);
    expect(lastFiveBetSlips[0]).toMatchObject({
      roundDate: "2026-06-17",
      action: "bet",
      status: "settled",
      totalStake: 100,
      potentialReturn: 185,
      strategySummary: "主胜小额单场。"
    });
    expect(lastFiveSettlementResults).toHaveLength(1);
    expect(lastFiveSettlementResults[0]).toMatchObject({
      roundDate: "2026-06-17",
      stake: 100,
      returnedAmount: 185,
      profit: 85,
      status: "settled"
    });
    db.close();
  });

  it("reads legacy sporttery odds into battle context", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertMatch(db, "match-1");
    saveFixtureContextSnapshot(db, {
      matchId: "match-1",
      completeness: "partial",
      domains: [
        {
          domain: "sporttery",
          status: "cached",
          summary: "官方指数：胜平负 主2.04/平3.03/客3.23",
          lastSyncedAt: "2026-06-17T08:00:00.000Z",
          error: null
        }
      ],
      raw: {
        sporttery: {
          odds: [
            {
              poolCode: "HAD",
              h: "2.04",
              d: "3.03",
              a: "3.23",
              goalLine: "",
              updateDate: "2026-06-17",
              updateTime: "16:00:00"
            }
          ]
        }
      },
      now: new Date("2026-06-17T08:00:00.000Z")
    });

    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });

    expect(battleContext.matches[0]).toMatchObject({
      matchId: "match-1",
      sportteryPools: [
        {
          poolCode: "HAD",
          options: [
            { code: "h", label: "主胜", value: "2.04" },
            { code: "d", label: "平", value: "3.03" },
            { code: "a", label: "客胜", value: "3.23" }
          ]
        }
      ],
      dataGaps: expect.not.arrayContaining(["首版 battle_context 尚未注入完整体彩玩法快照"])
    });
    db.close();
  });

  it("injects team profile injuries and historical matchup into battle context", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertMatch(db, "match-1", { homeTeamName: "Germany", awayTeamName: "USA" });

    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });

    expect(battleContext.matches[0]).toMatchObject({
      matchId: "match-1",
      homeTeamProfile: {
        wc26TeamId: "ger",
        coach: expect.any(String),
        playingStyle: expect.any(String),
        keyPlayers: expect.any(Array),
        marketValue: null
      },
      awayTeamProfile: {
        wc26TeamId: "usa",
        coach: expect.any(String),
        playingStyle: expect.any(String),
        keyPlayers: expect.any(Array),
        marketValue: null
      },
      historicalMatchup: {
        totalMatches: 2,
        homeWins: expect.any(Number),
        draws: expect.any(Number),
        awayWins: expect.any(Number),
        meetings: expect.any(Array)
      }
    });
    expect(battleContext.matches[0].homeTeamProfile.keyPlayers.length).toBeGreaterThan(0);
    expect(battleContext.matches[0].dataGaps).toContain("暂无球队身价数据源");
    db.close();
  });

  it("uses Chinese display names in betting battle context when mappings exist", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertMatch(db, "match-1", { homeTeamId: "25", homeTeamName: "Germany", awayTeamId: "1501", awayTeamName: "Ivory Coast" });

    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });

    expect(battleContext.matches[0]).toMatchObject({
      homeTeamName: "德国",
      awayTeamName: "科特迪瓦"
    });
    db.close();
  });

  it("limits battle context to the provided kickoff window", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertMatch(db, "match-before", { apiFootballFixtureId: 9001, kickoffAt: "2026-06-17T09:59:59.000Z" });
    insertMatch(db, "match-inside-1", { apiFootballFixtureId: 9002, kickoffAt: "2026-06-17T10:00:00.000Z" });
    insertMatch(db, "match-inside-2", { apiFootballFixtureId: 9003, kickoffAt: "2026-06-18T21:59:59.000Z" });
    insertMatch(db, "match-after", { apiFootballFixtureId: 9004, kickoffAt: "2026-06-18T22:00:00.000Z" });
    insertMatch(db, "match-finished", { apiFootballFixtureId: 9005, kickoffAt: "2026-06-17T12:00:00.000Z", status: "finished" });

    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      matchWindowStart: "2026-06-17T10:00:00.000Z",
      matchWindowEnd: "2026-06-18T22:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });

    expect(battleContext.matches.map((match) => match.matchId)).toEqual(["match-inside-1", "match-inside-2"]);
    db.close();
  });

  it("injects latest available sporttery pools into battle context", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertMatch(db, "match-1");
    saveFixtureContextSnapshot(db, {
      matchId: "match-1",
      completeness: "partial",
      domains: [
        {
          domain: "sporttery",
          status: "cached",
          summary: "官方指数：胜平负 主2.04/平3.03/客3.23",
          lastSyncedAt: "2026-06-17T08:00:00.000Z",
          error: null
        }
      ],
      raw: {
        sporttery: {
          oddsPools: [
            {
              poolCode: "HAD",
              status: "available",
              options: [
                { code: "h", label: "主胜", value: "2.04" },
                { code: "d", label: "平", value: "3.03" },
                { code: "a", label: "客胜", value: "3.23" }
              ]
            },
            {
              poolCode: "CRS",
              status: "unavailable",
              options: []
            }
          ]
        }
      },
      now: new Date("2026-06-17T08:00:00.000Z")
    });

    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });

    expect(battleContext.matches[0]).toMatchObject({
      matchId: "match-1",
      sportteryPools: [
        {
          poolCode: "HAD",
          options: [
            { code: "h", label: "主胜", value: "2.04" },
            { code: "d", label: "平", value: "3.03" },
            { code: "a", label: "客胜", value: "3.23" }
          ]
        }
      ],
      dataGaps: expect.not.arrayContaining(["首版 battle_context 尚未注入完整体彩玩法快照"])
    });
    db.close();
  });

  it("injects external intelligence snapshots into battle context", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertMatch(db, "match-1");
    db.prepare(
      `INSERT INTO fixture_external_intel_snapshots (
        id, match_id, provider, query_json, search_results_json, summary_json, status, error, collected_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "intel-1",
      "match-1",
      "duckduckgo_html",
      "[]",
      "[]",
      JSON.stringify({
        status: "cached",
        summary: "德国赛前发布会确认主力前锋可出场。",
        injuryNews: ["主力前锋可出场"],
        lineupNews: ["中场可能轮换"],
        motivation: ["小组第二轮争取提前出线"],
        recentFormNews: [],
        riskSignals: ["轮换幅度不明"],
        sourceLinks: [{ title: "Team news", url: "https://example.com/news", sourceDomain: "example.com", publishedAt: null }],
        confidence: "medium",
        dataGaps: ["阵容消息仍需二次确认", { source: "external_intel", code: "lineup_unclear", message: "首发名单尚未公布" }],
        collectedAt: "2026-06-21T10:00:00.000Z"
      }),
      "cached",
      null,
      "2026-06-21T10:00:00.000Z",
      "2026-06-21T11:00:00.000Z",
      "2026-06-21T10:00:00.000Z"
    );

    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-21",
      lockTime: "2026-06-21T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报由比赛级 externalIntel 提供", dataGaps: [] }
    });

    expect(battleContext.matches[0]).toMatchObject({
      externalIntel: {
        status: "cached",
        summary: "德国赛前发布会确认主力前锋可出场。",
        sourceLinks: [{ url: "https://example.com/news" }],
        dataGaps: ["阵容消息仍需二次确认", { source: "external_intel", code: "lineup_unclear", message: "首发名单尚未公布" }]
      }
    });
    expect(battleContext.matches[0].dataGaps).toEqual(
      expect.arrayContaining(["阵容消息仍需二次确认", expect.objectContaining({ source: "external_intel", code: "lineup_unclear" })])
    );
    db.close();
  });
});
