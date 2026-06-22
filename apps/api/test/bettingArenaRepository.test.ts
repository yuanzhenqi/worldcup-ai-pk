import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./support/testDatabase";
import {
  createBettingArenaRound,
  ensureBettingArenaAccounts,
  getBettingArenaSummary,
  listBettingArenaLedger,
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

function insertBetSlip(
  db: ReturnType<typeof createTestDatabase>["db"],
  input: {
    id: string;
    roundId: string;
    modelId: string;
    totalStake: number;
    potentialReturn: number;
    parsedSlip: unknown;
    status?: string;
  }
) {
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
    input.id,
    input.roundId,
    input.modelId,
    "bet",
    input.status ?? "settled",
    input.totalStake,
    input.potentialReturn,
    "medium",
    "{}",
    "{}",
    JSON.stringify(input.parsedSlip),
    "{}",
    null,
    "2026-06-17T10:00:00.000Z",
    "2026-06-17T10:00:00.000Z"
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

  it("lists betting ledger items across historical rounds with model filtering", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertModel(db, "model-2", "Model Two");
    insertMatch(db, "match-1");
    ensureBettingArenaAccounts(db, new Date("2026-06-20T00:00:00.000Z"));
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });
    const firstRound = createBettingArenaRound(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-20T00:00:00.000Z")
    });
    db.prepare("UPDATE betting_arena_rounds SET status = ? WHERE id = ?").run("settled", firstRound.id);
    const secondRound = createBettingArenaRound(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T18:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-20T12:00:00.000Z")
    });
    insertBetSlip(db, {
      id: "slip-ledger-1",
      roundId: firstRound.id,
      modelId: "model-1",
      totalStake: 100,
      potentialReturn: 185,
      parsedSlip: { action: "bet", singles: [], parlays: [], portfolioBuckets: [], skipReasons: [], dataGaps: [] }
    });
    insertBetSlip(db, {
      id: "slip-ledger-2",
      roundId: secondRound.id,
      modelId: "model-2",
      totalStake: 0,
      potentialReturn: 0,
      parsedSlip: { action: "hold", singles: [], parlays: [], portfolioBuckets: [], skipReasons: ["没有优势"], dataGaps: [] }
    });

    const allLedger = listBettingArenaLedger(db, { limit: 10, offset: 0 });
    const modelLedger = listBettingArenaLedger(db, { modelId: "model-1", limit: 10, offset: 0 });

    expect(allLedger.total).toBe(2);
    expect(allLedger.items.map((item) => item.slip.id)).toEqual(["slip-ledger-2", "slip-ledger-1"]);
    expect(modelLedger).toMatchObject({ total: 1, modelId: "model-1", limit: 10, offset: 0 });
    expect("roundId" in (modelLedger.items[0]?.round ?? {})).toBe(false);
    expect(modelLedger.items[0]?.round.id).toBe(firstRound.id);
    expect(modelLedger.items[0]?.slip.modelDisplayName).toBe("Model One");
    db.close();
  });

  it("orders betting ledger slips deterministically when created_at values match", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertModel(db, "model-2", "Model Two");
    insertMatch(db, "match-1");
    ensureBettingArenaAccounts(db, new Date("2026-06-20T00:00:00.000Z"));
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-20T00:00:00.000Z")
    });
    insertBetSlip(db, {
      id: "slip-ledger-a",
      roundId: round.id,
      modelId: "model-1",
      totalStake: 50,
      potentialReturn: 92.5,
      parsedSlip: { action: "bet", singles: [], parlays: [], portfolioBuckets: [], skipReasons: [], dataGaps: [] }
    });
    insertBetSlip(db, {
      id: "slip-ledger-b",
      roundId: round.id,
      modelId: "model-2",
      totalStake: 75,
      potentialReturn: 138.75,
      parsedSlip: { action: "bet", singles: [], parlays: [], portfolioBuckets: [], skipReasons: [], dataGaps: [] }
    });

    const ledger = listBettingArenaLedger(db, { limit: 10, offset: 0 });

    expect(ledger.items.map((item) => item.slip.id)).toEqual(["slip-ledger-b", "slip-ledger-a"]);
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

  it("hydrates portfolio buckets into betting arena slip dto", () => {
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
      "slip-portfolio",
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
        strategySummary: "分桶出单。",
        bankrollPlan: "投入 1%。",
        singles: [],
        parlays: [],
        portfolioBuckets: [
          { bucket: "safe", label: "稳胆", stake: 100, rationale: "主队基本面更稳。", items: ["match-1 HAD h"] }
        ],
        skipReasons: [],
        dataGaps: []
      }),
      "{}",
      null,
      "2026-06-17T10:00:00.000Z",
      "2026-06-17T10:00:00.000Z"
    );

    const summary = getBettingArenaSummary(db);

    expect(summary.slips[0]).toMatchObject({
      portfolioBuckets: [
        { bucket: "safe", label: "稳胆", stake: 100, rationale: "主队基本面更稳。", items: ["match-1 HAD h"] }
      ]
    });
    db.close();
  });

  it("creates the next same-day sequence after the existing round is settled", () => {
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
    expect(second.id).toBe(first.id);

    db.prepare("UPDATE betting_arena_rounds SET status = ? WHERE id = ?").run("settled", first.id);
    const third = createBettingArenaRound(db, {
      roundDate: "2026-06-17",
      lockTime: "2026-06-17T14:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-17T14:00:00.000Z")
    });
    const rowCount = db.prepare("SELECT COUNT(*) AS count FROM betting_arena_rounds").get() as { count: number };

    expect(third.id).not.toBe(first.id);
    expect(first.roundSequence).toBe(1);
    expect(third.roundSequence).toBe(2);
    expect(rowCount.count).toBe(2);
    db.close();
  });

  it("hydrates settlement details and account-level hit metrics into betting arena summary", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertMatch(db, "match-1");
    insertMatch(db, "match-2", { apiFootballFixtureId: 9002, homeTeamId: "home-2", awayTeamId: "away-2" });
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
    insertBetSlip(db, {
      id: "slip-1",
      roundId: round.id,
      modelId: "model-1",
      totalStake: 300,
      potentialReturn: 936,
      parsedSlip: {
        strategySummary: "单场加双关。",
        singles: [{ matchId: "match-1", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.8, stake: 100 }],
        parlays: [
          {
            parlayName: "双关",
            stake: 200,
            combinedOdds: 3.78,
            legs: [
              { matchId: "match-1", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.8 },
              { matchId: "match-2", poolCode: "HAD", selectionCode: "a", selectionLabel: "客胜", lockedOdds: 2.1 }
            ]
          }
        ]
      }
    });
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
      300,
      180,
      -120,
      "settled",
      JSON.stringify({
        stake: 300,
        returnedAmount: 180,
        profit: -120,
        status: "settled",
        hit: false,
        legs: [
          { matchId: "match-1", won: true, voided: false },
          { matchId: "match-1", won: true, voided: false },
          { matchId: "match-2", won: false, voided: false }
        ],
        items: [
          { type: "single", stake: 100, returnedAmount: 180, won: true, voided: false, legs: [{ matchId: "match-1", won: true, voided: false }] },
          {
            type: "parlay",
            name: "双关",
            stake: 200,
            returnedAmount: 0,
            won: false,
            voided: false,
            legs: [
              { matchId: "match-1", won: true, voided: false },
              { matchId: "match-2", won: false, voided: false }
            ]
          }
        ]
      }),
      "2026-06-17T18:00:00.000Z"
    );
    db.prepare(
      `
        UPDATE betting_arena_accounts
        SET settled_order_count = 1,
            hit_count = 0,
            total_returned = 180
        WHERE model_id = ?
      `
    ).run("model-1");

    const summary = getBettingArenaSummary(db);

    expect(summary.accounts[0]).toMatchObject({
      modelId: "model-1",
      profitableSlipCount: 0,
      profitableSlipRate: 0,
      settledPickCount: 2,
      hitPickCount: 1,
      pickHitRate: 0.5
    });
    expect(summary.slips[0].settlement).toMatchObject({
      stake: 300,
      returnedAmount: 180,
      profit: -120,
      items: [
        { type: "single", won: true, voided: false },
        { type: "parlay", won: false, voided: false }
      ]
    });
    expect(summary.history[0]).toMatchObject({
      roundId: round.id,
      roundDate: "2026-06-17",
      roundSequence: 1,
      totalStaked: 300,
      totalReturned: 180
    });
    db.close();
  });

  it("reconstructs legacy settlement items and counts one single plus one parlay as two settled picks", () => {
    const { db } = createTestDatabase();
    insertModel(db, "model-1", "Model One");
    insertMatch(db, "match-1", { status: "finished", homeTeamName: "德国", awayTeamName: "日本" });
    insertMatch(db, "match-2", {
      apiFootballFixtureId: 9002,
      status: "finished",
      homeTeamId: "home-2",
      homeTeamName: "荷兰",
      awayTeamId: "away-2",
      awayTeamName: "瑞典"
    });
    ensureBettingArenaAccounts(db, new Date("2026-06-20T00:00:00.000Z"));
    const battleContext = buildBattleContext(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] }
    });
    const round = createBettingArenaRound(db, {
      roundDate: "2026-06-20",
      lockTime: "2026-06-20T10:00:00.000Z",
      battleContext,
      externalIntel: { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] },
      now: new Date("2026-06-20T00:00:00.000Z")
    });
    insertBetSlip(db, {
      id: "slip-legacy",
      roundId: round.id,
      modelId: "model-1",
      totalStake: 300,
      potentialReturn: 520,
      parsedSlip: {
        action: "bet",
        singles: [
          {
            matchId: "match-1",
            poolCode: "HAD",
            selectionCode: "h",
            selectionLabel: "主胜",
            lockedOdds: 1.85,
            stake: 200,
            confidence: 0.63,
            rationale: "德国压制力更强。"
          }
        ],
        parlays: [
          {
            parlayName: "稳健双关",
            stake: 100,
            legs: [
              { matchId: "match-1", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.85 },
              { matchId: "match-2", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.42 }
            ],
            combinedOdds: 2.63,
            confidence: 0.58,
            rationale: "两场主队方向一致。"
          }
        ],
        portfolioBuckets: [],
        skipReasons: [],
        dataGaps: []
      }
    });
    db.prepare(
      `
        INSERT INTO betting_arena_settlements (
          id, slip_id, round_id, model_id, stake, returned_amount, profit, status, settlement_json, settled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "settlement-legacy",
      "slip-legacy",
      round.id,
      "model-1",
      300,
      633,
      333,
      "settled",
      JSON.stringify({
        stake: 300,
        returnedAmount: 633,
        profit: 333,
        status: "settled",
        hit: true,
        legs: [
          { matchId: "match-1", won: true, voided: false },
          { matchId: "match-1", won: true, voided: false },
          { matchId: "match-2", won: true, voided: false }
        ]
      }),
      "2026-06-21T14:00:00.000Z"
    );

    const summary = getBettingArenaSummary(db, round.id);

    expect(summary.accounts[0]).toMatchObject({
      settledPickCount: 2,
      hitPickCount: 2,
      pickHitRate: 1
    });
    expect(summary.slips[0]?.settlement?.items).toEqual([
      {
        type: "single",
        name: null,
        stake: 200,
        returnedAmount: 370,
        won: true,
        voided: false,
        legs: [{ matchId: "match-1", won: true, voided: false }]
      },
      {
        type: "parlay",
        name: "稳健双关",
        stake: 100,
        returnedAmount: 263,
        won: true,
        voided: false,
        legs: [
          { matchId: "match-1", won: true, voided: false },
          { matchId: "match-2", won: true, voided: false }
        ]
      }
    ]);
    db.close();
  });

  it("summarizes historical round best and worst models and can focus a historical round", () => {
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
      now: new Date("2026-06-17T10:00:00.000Z")
    });
    insertBetSlip(db, {
      id: "slip-profit",
      roundId: round.id,
      modelId: "model-1",
      totalStake: 100,
      potentialReturn: 185,
      parsedSlip: {
        strategySummary: "主胜小额单场。",
        singles: [{ matchId: "match-1", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.85, stake: 100 }],
        parlays: []
      }
    });
    insertBetSlip(db, {
      id: "slip-loss",
      roundId: round.id,
      modelId: "model-2",
      totalStake: 100,
      potentialReturn: 185,
      parsedSlip: {
        strategySummary: "客胜小额单场。",
        singles: [{ matchId: "match-1", poolCode: "HAD", selectionCode: "a", selectionLabel: "客胜", lockedOdds: 1.85, stake: 100 }],
        parlays: []
      }
    });
    const insertSettlement = db.prepare(
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
    );
    insertSettlement.run(
      "settlement-profit",
      "slip-profit",
      round.id,
      "model-1",
      100,
      185,
      85,
      "settled",
      JSON.stringify({
        stake: 100,
        returnedAmount: 185,
        profit: 85,
        status: "settled",
        hit: true,
        legs: [{ matchId: "match-1", won: true, voided: false }],
        items: [{ type: "single", name: null, stake: 100, returnedAmount: 185, won: true, voided: false, legs: [{ matchId: "match-1", won: true, voided: false }] }]
      }),
      "2026-06-17T18:00:00.000Z"
    );
    insertSettlement.run(
      "settlement-loss",
      "slip-loss",
      round.id,
      "model-2",
      100,
      0,
      -100,
      "settled",
      JSON.stringify({
        stake: 100,
        returnedAmount: 0,
        profit: -100,
        status: "settled",
        hit: false,
        legs: [{ matchId: "match-1", won: false, voided: false }],
        items: [{ type: "single", name: null, stake: 100, returnedAmount: 0, won: false, voided: false, legs: [{ matchId: "match-1", won: false, voided: false }] }]
      }),
      "2026-06-17T18:00:00.000Z"
    );

    const summary = getBettingArenaSummary(db);
    const focused = getBettingArenaSummary(db, round.id);

    expect(summary.history[0]).toMatchObject({
      roundId: round.id,
      bestModelDisplayName: "Model One",
      worstModelDisplayName: "Model Two"
    });
    expect(focused.currentRound).toMatchObject({ id: round.id, roundDate: "2026-06-17" });
    expect(focused.slips.map((slip) => slip.modelDisplayName)).toEqual(["Model One", "Model Two"]);
    expect(focused.slips[0].settlement).toMatchObject({ profit: 85 });
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
