# AI Live Betting Arena Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable AI live betting arena: virtual bankroll accounts, daily rounds, shared battle context, model bet slips, validation, settlement, leaderboard API, and a concise frontend arena page.

**Architecture:** Add a new `betting-arena` backend module beside the existing prediction module instead of mixing bankroll data into prediction scoring. Store locked shared context and per-model account context with each round/slip so later settlement and review are reproducible. Expose a small public API consumed by a new `BettingArenaPage`.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, Vitest, React, existing shared DTO package, existing OpenAI-compatible model client.

---

## File Structure

- Modify `packages/shared/src/types.ts`
  - Add DTOs for accounts, rounds, bet slips, bet legs, settlements, and arena summary.
- Modify `apps/api/src/db/schema.sql`
  - Add arena tables and indexes.
- Modify `apps/api/test/schemaMigration.test.ts`
  - Verify arena tables and key columns exist.
- Create `apps/api/src/modules/betting-arena/bettingArena.repository.ts`
  - Owns account, round, slip, settlement, and summary queries.
- Create `apps/api/src/modules/betting-arena/bettingArena.context.ts`
  - Builds shared `battle_context` and per-model `account_context`.
- Create `apps/api/src/modules/betting-arena/bettingArenaSlip.ts`
  - Parses and validates model output JSON.
- Create `apps/api/src/modules/betting-arena/bettingArenaSettlement.ts`
  - Settles valid slips against finished match scores.
- Create `apps/api/src/modules/betting-arena/bettingArenaPrompts.ts`
  - Builds the model prompt with hard bankroll and data rules.
- Create `apps/api/src/modules/betting-arena/bettingArena.service.ts`
  - Orchestrates round creation, model generation, validation, stake freezing, and settlement.
- Create `apps/api/test/bettingArenaRepository.test.ts`
  - Covers account creation, round creation, and summary sorting.
- Create `apps/api/test/bettingArenaSlip.test.ts`
  - Covers hold, valid bets, and validation failures.
- Create `apps/api/test/bettingArenaSettlement.test.ts`
  - Covers win/loss/void settlement.
- Create `apps/api/test/bettingArenaApi.test.ts`
  - Covers public API summary, manual round trigger, detail, and settlement endpoint.
- Modify `apps/api/src/modules/public/public.routes.ts`
  - Register arena routes.
- Modify `apps/web/src/api/client.ts`
  - Add arena API client functions.
- Create `apps/web/src/pages/BettingArenaPage.tsx`
  - Arena overview, bankroll leaderboard, bet matrix, and detail drawer.
- Modify `apps/web/src/App.tsx`
  - Add navigation and render the arena page.
- Modify `apps/web/src/styles.css`
  - Add responsive arena styles using existing visual language.

---

## Task 1: Shared DTOs And Database Schema

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/test/schemaMigration.test.ts`

- [ ] **Step 1: Add failing schema migration test**

Append this test to `apps/api/test/schemaMigration.test.ts`:

```ts
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
```

- [ ] **Step 2: Run schema test to verify RED**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- schemaMigration.test.ts
```

Expected: the new test fails because the five arena tables do not exist.

- [ ] **Step 3: Add shared DTOs**

Add these exports to `packages/shared/src/types.ts` after `ParlayCombinationRunDto`:

```ts
export type BettingArenaRoundStatus = "draft" | "generating" | "locked" | "settling" | "settled" | "failed";
export type BettingArenaSlipAction = "bet" | "hold";
export type BettingArenaSlipStatus = "pending" | "accepted" | "invalid" | "generation_failed" | "settled" | "void";
export type BettingArenaRiskLevel = "low" | "medium" | "high";

export interface BettingArenaAccountDto {
  modelId: string;
  modelDisplayName: string;
  initialBankroll: number;
  availableBankroll: number;
  frozenStake: number;
  totalAssetValue: number;
  totalStaked: number;
  totalReturned: number;
  returnRate: number;
  orderCount: number;
  settledOrderCount: number;
  hitCount: number;
  hitRate: number;
  failedGenerationCount: number;
  orderRate: number;
  failureRate: number;
  rank: number;
  lastReview: string;
}

export interface BettingArenaLegDto {
  matchId: string;
  poolCode: string;
  selectionCode: string;
  selectionLabel: string;
  lockedOdds: number;
}

export interface BettingArenaSingleDto extends BettingArenaLegDto {
  stake: number;
  confidence: number;
  rationale: string;
}

export interface BettingArenaParlayDto {
  parlayName: string;
  stake: number;
  legs: BettingArenaLegDto[];
  combinedOdds: number;
  confidence: number;
  rationale: string;
}

export interface BettingArenaSlipDto {
  id: string;
  roundId: string;
  modelId: string;
  modelDisplayName: string;
  action: BettingArenaSlipAction;
  status: BettingArenaSlipStatus;
  totalStake: number;
  potentialReturn: number;
  riskLevel: BettingArenaRiskLevel;
  strategySummary: string;
  bankrollPlan: string;
  singles: BettingArenaSingleDto[];
  parlays: BettingArenaParlayDto[];
  skipReasons: string[];
  dataGaps: string[];
  validationError: string | null;
  settlementSummary: string | null;
  createdAt: string;
}

export interface BettingArenaRoundDto {
  id: string;
  roundDate: string;
  status: BettingArenaRoundStatus;
  lockTime: string;
  eligibleMatchCount: number;
  modelsCount: number;
  totalStaked: number;
  potentialReturn: number;
  settledReturn: number;
  createdAt: string;
  updatedAt: string;
}

export interface BettingArenaDailySummaryDto {
  roundId: string;
  roundDate: string;
  status: BettingArenaRoundStatus;
  totalStaked: number;
  totalReturned: number;
  bestModelDisplayName: string | null;
  worstModelDisplayName: string | null;
}

export interface BettingArenaDto {
  accounts: BettingArenaAccountDto[];
  currentRound: BettingArenaRoundDto | null;
  slips: BettingArenaSlipDto[];
  history: BettingArenaDailySummaryDto[];
}
```

- [ ] **Step 4: Add schema tables**

Append this SQL to `apps/api/src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS betting_arena_accounts (
  model_id TEXT PRIMARY KEY REFERENCES ai_models(id) ON DELETE CASCADE,
  initial_bankroll REAL NOT NULL,
  available_bankroll REAL NOT NULL,
  frozen_stake REAL NOT NULL,
  total_staked REAL NOT NULL,
  total_returned REAL NOT NULL,
  order_count INTEGER NOT NULL,
  settled_order_count INTEGER NOT NULL,
  hit_count INTEGER NOT NULL,
  failed_generation_count INTEGER NOT NULL,
  last_review TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS betting_arena_rounds (
  id TEXT PRIMARY KEY,
  round_date TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  lock_time TEXT NOT NULL,
  battle_context_json TEXT NOT NULL,
  external_intel_json TEXT NOT NULL,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS betting_arena_slips (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES betting_arena_rounds(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  total_stake REAL NOT NULL,
  potential_return REAL NOT NULL,
  risk_level TEXT NOT NULL,
  raw_response TEXT NOT NULL,
  output_json TEXT NOT NULL,
  parsed_slip_json TEXT NOT NULL,
  account_context_json TEXT NOT NULL,
  validation_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(round_id, model_id)
);

CREATE TABLE IF NOT EXISTS betting_arena_settlements (
  id TEXT PRIMARY KEY,
  slip_id TEXT NOT NULL REFERENCES betting_arena_slips(id) ON DELETE CASCADE,
  round_id TEXT NOT NULL REFERENCES betting_arena_rounds(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
  stake REAL NOT NULL,
  returned_amount REAL NOT NULL,
  profit REAL NOT NULL,
  status TEXT NOT NULL,
  settlement_json TEXT NOT NULL,
  settled_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS betting_arena_logs (
  id TEXT PRIMARY KEY,
  round_id TEXT REFERENCES betting_arena_rounds(id) ON DELETE CASCADE,
  model_id TEXT REFERENCES ai_models(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_betting_arena_slips_round_status
  ON betting_arena_slips(round_id, status);

CREATE INDEX IF NOT EXISTS idx_betting_arena_settlements_round
  ON betting_arena_settlements(round_id, model_id);
```

- [ ] **Step 5: Run schema and type tests to verify GREEN**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- schemaMigration.test.ts
corepack pnpm --filter @worldcup-ai-pk/api typecheck
```

Expected: schema migration tests pass and TypeScript exits with code 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/shared/src/types.ts apps/api/src/db/schema.sql apps/api/test/schemaMigration.test.ts
git commit -m "feat: add betting arena schema"
```

---

## Task 2: Repository, Context Builder, And Summary DTO

**Files:**
- Create: `apps/api/src/modules/betting-arena/bettingArena.repository.ts`
- Create: `apps/api/src/modules/betting-arena/bettingArena.context.ts`
- Create: `apps/api/test/bettingArenaRepository.test.ts`

- [ ] **Step 1: Write failing repository/context tests**

Create `apps/api/test/bettingArenaRepository.test.ts`:

```ts
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
  ).run(`provider-${id}`, `provider-${id}`, `Provider ${id}`, "https://newapi.example.com/v1", "secret", 1, "2026-06-17T00:00:00.000Z", "2026-06-17T00:00:00.000Z");
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
  ).run(id, 9001, "Group Stage - 1", "2026-06-18T12:00:00.000Z", "scheduled", "Test Stadium", "home-1", "Home", null, "away-1", "Away", null, null, null, "2026-06-17T00:00:00.000Z");
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
```

- [ ] **Step 2: Run repository tests to verify RED**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts
```

Expected: test fails because the new module files do not exist.

- [ ] **Step 3: Implement repository functions**

Create `apps/api/src/modules/betting-arena/bettingArena.repository.ts` with exports:

```ts
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { BettingArenaAccountDto, BettingArenaDto, BettingArenaRoundDto } from "@worldcup-ai-pk/shared";

export const INITIAL_BANKROLL = 10000;

interface AccountRow {
  model_id: string;
  model_display_name: string;
  initial_bankroll: number;
  available_bankroll: number;
  frozen_stake: number;
  total_staked: number;
  total_returned: number;
  order_count: number;
  settled_order_count: number;
  hit_count: number;
  failed_generation_count: number;
  last_review: string;
}

interface RoundRow {
  id: string;
  round_date: string;
  status: BettingArenaRoundDto["status"];
  lock_time: string;
  battle_context_json: string;
  created_at: string;
  updated_at: string;
}

export function ensureBettingArenaAccounts(db: Database, now = new Date()): void {
  const iso = now.toISOString();
  db.prepare(
    `
      INSERT INTO betting_arena_accounts (
        model_id, initial_bankroll, available_bankroll, frozen_stake,
        total_staked, total_returned, order_count, settled_order_count,
        hit_count, failed_generation_count, last_review, created_at, updated_at
      )
      SELECT ai_models.id, ?, ?, 0, 0, 0, 0, 0, 0, 0, '', ?, ?
      FROM ai_models
      INNER JOIN ai_providers ON ai_providers.id = ai_models.provider_id
      WHERE ai_models.enabled = 1
        AND ai_providers.enabled = 1
        AND NOT EXISTS (
          SELECT 1 FROM betting_arena_accounts WHERE betting_arena_accounts.model_id = ai_models.id
        )
    `
  ).run(INITIAL_BANKROLL, INITIAL_BANKROLL, iso, iso);
}

function toAccountDto(row: AccountRow, rank: number, totalRounds: number): BettingArenaAccountDto {
  const totalAssetValue = row.available_bankroll + row.frozen_stake;
  const returnRate = row.initial_bankroll > 0 ? (totalAssetValue - row.initial_bankroll) / row.initial_bankroll : 0;
  const hitRate = row.settled_order_count > 0 ? row.hit_count / row.settled_order_count : 0;
  const orderRate = totalRounds > 0 ? row.order_count / totalRounds : 0;
  const failureRate = totalRounds > 0 ? row.failed_generation_count / totalRounds : 0;
  return {
    modelId: row.model_id,
    modelDisplayName: row.model_display_name,
    initialBankroll: row.initial_bankroll,
    availableBankroll: row.available_bankroll,
    frozenStake: row.frozen_stake,
    totalAssetValue,
    totalStaked: row.total_staked,
    totalReturned: row.total_returned,
    returnRate,
    orderCount: row.order_count,
    settledOrderCount: row.settled_order_count,
    hitCount: row.hit_count,
    hitRate,
    failedGenerationCount: row.failed_generation_count,
    orderRate,
    failureRate,
    rank,
    lastReview: row.last_review
  };
}

export function listBettingArenaAccounts(db: Database): BettingArenaAccountDto[] {
  const totalRounds = (db.prepare("SELECT COUNT(*) AS count FROM betting_arena_rounds").get() as { count: number }).count;
  const rows = db.prepare(
    `
      SELECT
        betting_arena_accounts.*,
        ai_models.display_name AS model_display_name
      FROM betting_arena_accounts
      INNER JOIN ai_models ON ai_models.id = betting_arena_accounts.model_id
      ORDER BY
        ((available_bankroll + frozen_stake) - initial_bankroll) / initial_bankroll DESC,
        ai_models.display_name ASC
    `
  ).all() as AccountRow[];
  return rows.map((row, index) => toAccountDto(row, index + 1, totalRounds));
}

function toRoundDto(row: RoundRow, modelsCount: number, totalStaked: number, potentialReturn: number, settledReturn: number): BettingArenaRoundDto {
  const parsed = JSON.parse(row.battle_context_json) as { matches?: unknown[] };
  return {
    id: row.id,
    roundDate: row.round_date,
    status: row.status,
    lockTime: row.lock_time,
    eligibleMatchCount: Array.isArray(parsed.matches) ? parsed.matches.length : 0,
    modelsCount,
    totalStaked,
    potentialReturn,
    settledReturn,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createBettingArenaRound(db: Database, input: {
  roundDate: string;
  lockTime: string;
  battleContext: unknown;
  externalIntel: unknown;
  now?: Date;
}): BettingArenaRoundDto {
  const now = input.now ?? new Date();
  const iso = now.toISOString();
  const id = randomUUID();
  db.prepare(
    `
      INSERT INTO betting_arena_rounds (
        id, round_date, status, lock_time, battle_context_json, external_intel_json, failure_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(id, input.roundDate, "draft", input.lockTime, JSON.stringify(input.battleContext), JSON.stringify(input.externalIntel), null, iso, iso);
  const row = db.prepare("SELECT * FROM betting_arena_rounds WHERE id = ?").get(id) as RoundRow;
  return toRoundDto(row, 0, 0, 0, 0);
}

export function getBettingArenaSummary(db: Database): BettingArenaDto {
  ensureBettingArenaAccounts(db);
  const accounts = listBettingArenaAccounts(db);
  const round = db.prepare("SELECT * FROM betting_arena_rounds ORDER BY round_date DESC LIMIT 1").get() as RoundRow | undefined;
  const currentRound = round ? toRoundDto(round, accounts.length, 0, 0, 0) : null;
  return {
    accounts,
    currentRound,
    slips: [],
    history: currentRound
      ? [{ roundId: currentRound.id, roundDate: currentRound.roundDate, status: currentRound.status, totalStaked: 0, totalReturned: 0, bestModelDisplayName: null, worstModelDisplayName: null }]
      : []
  };
}
```

- [ ] **Step 4: Implement context builders**

Create `apps/api/src/modules/betting-arena/bettingArena.context.ts`:

```ts
import type { Database } from "better-sqlite3";

interface ExternalIntelInput {
  summary: string;
  dataGaps: string[];
}

interface MatchRow {
  id: string;
  stage: string;
  kickoff_at: string;
  status: string;
  venue: string | null;
  home_team_name: string;
  away_team_name: string;
}

export interface BattleContext {
  roundDate: string;
  lockTime: string;
  externalIntel: ExternalIntelInput;
  matches: Array<{
    matchId: string;
    stage: string;
    kickoffAt: string;
    status: string;
    venue: string | null;
    homeTeamName: string;
    awayTeamName: string;
    sportteryPools: unknown[];
    dataGaps: string[];
  }>;
}

export interface AccountContext {
  modelId: string;
  availableBankroll: number;
  frozenStake: number;
  totalAssetValue: number;
  cumulativeReturnRate: number;
  lifetimeOrderCount: number;
  lifetimeSettledOrderCount: number;
  lifetimeHitRate: number;
  lastFiveBetSlips: unknown[];
  lastFiveSettlementResults: unknown[];
  lastReview: string;
}

export function buildBattleContext(db: Database, input: { roundDate: string; lockTime: string; externalIntel: ExternalIntelInput }): BattleContext {
  const rows = db.prepare(
    `
      SELECT id, stage, kickoff_at, status, venue, home_team_name, away_team_name
      FROM matches
      WHERE status = 'scheduled'
      ORDER BY kickoff_at ASC
    `
  ).all() as MatchRow[];

  return {
    roundDate: input.roundDate,
    lockTime: input.lockTime,
    externalIntel: input.externalIntel,
    matches: rows.map((row) => ({
      matchId: row.id,
      stage: row.stage,
      kickoffAt: row.kickoff_at,
      status: row.status,
      venue: row.venue,
      homeTeamName: row.home_team_name,
      awayTeamName: row.away_team_name,
      sportteryPools: [],
      dataGaps: ["首版 battle_context 尚未注入完整体彩玩法快照"]
    }))
  };
}

export function buildAccountContext(db: Database, modelId: string): AccountContext {
  const row = db.prepare(
    `
      SELECT available_bankroll, frozen_stake, initial_bankroll, order_count, settled_order_count, hit_count, last_review
      FROM betting_arena_accounts
      WHERE model_id = ?
    `
  ).get(modelId) as
    | {
        available_bankroll: number;
        frozen_stake: number;
        initial_bankroll: number;
        order_count: number;
        settled_order_count: number;
        hit_count: number;
        last_review: string;
      }
    | undefined;
  if (!row) {
    throw new Error(`Betting arena account not found for model ${modelId}`);
  }

  const totalAssetValue = row.available_bankroll + row.frozen_stake;
  return {
    modelId,
    availableBankroll: row.available_bankroll,
    frozenStake: row.frozen_stake,
    totalAssetValue,
    cumulativeReturnRate: row.initial_bankroll > 0 ? (totalAssetValue - row.initial_bankroll) / row.initial_bankroll : 0,
    lifetimeOrderCount: row.order_count,
    lifetimeSettledOrderCount: row.settled_order_count,
    lifetimeHitRate: row.settled_order_count > 0 ? row.hit_count / row.settled_order_count : 0,
    lastFiveBetSlips: [],
    lastFiveSettlementResults: [],
    lastReview: row.last_review
  };
}
```

- [ ] **Step 5: Run repository tests to verify GREEN**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts
corepack pnpm --filter @worldcup-ai-pk/api typecheck
```

Expected: repository tests pass and typecheck exits with code 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/api/src/modules/betting-arena/bettingArena.repository.ts apps/api/src/modules/betting-arena/bettingArena.context.ts apps/api/test/bettingArenaRepository.test.ts
git commit -m "feat: add betting arena repository"
```

---

## Task 3: Bet Slip Parser And Validator

**Files:**
- Create: `apps/api/src/modules/betting-arena/bettingArenaSlip.ts`
- Create: `apps/api/test/bettingArenaSlip.test.ts`

- [ ] **Step 1: Write failing parser and validation tests**

Create `apps/api/test/bettingArenaSlip.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseBettingArenaSlip } from "../src/modules/betting-arena/bettingArenaSlip";

const battleContext = {
  matches: [
    {
      matchId: "match-1",
      sportteryPools: [
        {
          poolCode: "HAD",
          options: [
            { code: "h", label: "主胜", value: "1.80" },
            { code: "d", label: "平", value: "3.20" }
          ]
        }
      ]
    },
    {
      matchId: "match-2",
      sportteryPools: [
        {
          poolCode: "HAD",
          options: [{ code: "a", label: "客胜", value: "2.10" }]
        }
      ]
    }
  ]
};

const accountContext = {
  availableBankroll: 10000
};

describe("betting arena slip parser", () => {
  it("accepts hold output", () => {
    expect(
      parseBettingArenaSlip(
        JSON.stringify({
          action: "hold",
          total_stake: 0,
          singles: [],
          parlays: [],
          strategy_summary: "今日信息不足，保留资金。",
          risk_level: "low",
          bankroll_plan: "不投入。",
          skip_reasons: ["缺少阵容"],
          data_gaps: ["首发未确认"]
        }),
        battleContext,
        accountContext
      )
    ).toMatchObject({ action: "hold", totalStake: 0, singles: [], parlays: [] });
  });

  it("accepts a valid single bet within the 50 percent daily limit", () => {
    const parsed = parseBettingArenaSlip(
      JSON.stringify({
        action: "bet",
        total_stake: 1000,
        singles: [
          {
            match_id: "match-1",
            pool_code: "HAD",
            selection_code: "h",
            selection_label: "主胜",
            locked_odds: 1.8,
            stake: 1000,
            confidence: 0.62,
            rationale: "主队状态更稳定。"
          }
        ],
        parlays: [],
        strategy_summary: "小仓位参与主胜。",
        risk_level: "medium",
        bankroll_plan: "投入余额 10%。",
        skip_reasons: [],
        data_gaps: []
      }),
      battleContext,
      accountContext
    );

    expect(parsed).toMatchObject({ action: "bet", totalStake: 1000, potentialReturn: 1800 });
  });

  it("rejects stake above 50 percent of available bankroll", () => {
    expect(() =>
      parseBettingArenaSlip(
        JSON.stringify({
          action: "bet",
          total_stake: 6000,
          singles: [],
          parlays: [],
          strategy_summary: "过度投入。",
          risk_level: "high",
          bankroll_plan: "投入 60%。",
          skip_reasons: [],
          data_gaps: []
        }),
        battleContext,
        accountContext
      )
    ).toThrow("total_stake exceeds max daily stake");
  });

  it("rejects unknown match and selection", () => {
    expect(() =>
      parseBettingArenaSlip(
        JSON.stringify({
          action: "bet",
          total_stake: 100,
          singles: [
            {
              match_id: "missing-match",
              pool_code: "HAD",
              selection_code: "h",
              selection_label: "主胜",
              locked_odds: 1.8,
              stake: 100,
              confidence: 0.6,
              rationale: "无效比赛。"
            }
          ],
          parlays: [],
          strategy_summary: "无效。",
          risk_level: "medium",
          bankroll_plan: "小额。",
          skip_reasons: [],
          data_gaps: []
        }),
        battleContext,
        accountContext
      )
    ).toThrow("unknown match_id missing-match");
  });
});
```

- [ ] **Step 2: Run parser tests to verify RED**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaSlip.test.ts
```

Expected: test fails because `bettingArenaSlip.ts` does not exist.

- [ ] **Step 3: Implement parser and validator**

Create `apps/api/src/modules/betting-arena/bettingArenaSlip.ts` with:

```ts
import type { BettingArenaParlayDto, BettingArenaRiskLevel, BettingArenaSingleDto, BettingArenaSlipAction } from "@worldcup-ai-pk/shared";

interface BattleOption {
  code: string;
  label: string;
  value: string;
}

interface BattlePool {
  poolCode: string;
  options: BattleOption[];
}

interface BattleMatch {
  matchId: string;
  sportteryPools: BattlePool[];
}

interface BattleContextLike {
  matches: BattleMatch[];
}

interface AccountContextLike {
  availableBankroll: number;
}

export interface ParsedBettingArenaSlip {
  action: BettingArenaSlipAction;
  totalStake: number;
  potentialReturn: number;
  riskLevel: BettingArenaRiskLevel;
  strategySummary: string;
  bankrollPlan: string;
  singles: BettingArenaSingleDto[];
  parlays: BettingArenaParlayDto[];
  skipReasons: string[];
  dataGaps: string[];
}

function parseJsonObject(content: string): Record<string, unknown> {
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace < firstBrace) {
    throw new Error("Betting arena slip JSON parse failed: object braces not found");
  }
  const parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Betting arena slip JSON must be an object");
  }
  return parsed as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") throw new Error(`Betting arena field ${fieldName} must be a string`);
  return value;
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Betting arena field ${fieldName} must be a number`);
  return value;
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Betting arena field ${fieldName} must be a string array`);
  }
  return value;
}

function requireRiskLevel(value: unknown): BettingArenaRiskLevel {
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error("Betting arena field risk_level is invalid");
}

function requireAction(value: unknown): BettingArenaSlipAction {
  if (value === "bet" || value === "hold") return value;
  throw new Error("Betting arena field action is invalid");
}

function findOption(context: BattleContextLike, matchId: string, poolCode: string, selectionCode: string): BattleOption {
  const match = context.matches.find((item) => item.matchId === matchId);
  if (!match) throw new Error(`unknown match_id ${matchId}`);
  const pool = match.sportteryPools.find((item) => item.poolCode === poolCode);
  if (!pool) throw new Error(`unknown pool_code ${poolCode} for match_id ${matchId}`);
  const option = pool.options.find((item) => item.code === selectionCode);
  if (!option) throw new Error(`unknown selection_code ${selectionCode} for match_id ${matchId}`);
  return option;
}

function parseSingle(value: unknown, context: BattleContextLike, fieldName: string): BettingArenaSingleDto {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Betting arena field ${fieldName} must be an object`);
  const record = value as Record<string, unknown>;
  const matchId = requireString(record.match_id, `${fieldName}.match_id`);
  const poolCode = requireString(record.pool_code, `${fieldName}.pool_code`);
  const selectionCode = requireString(record.selection_code, `${fieldName}.selection_code`);
  const option = findOption(context, matchId, poolCode, selectionCode);
  const lockedOdds = requireNumber(record.locked_odds, `${fieldName}.locked_odds`);
  const contextOdds = Number(option.value);
  if (!Number.isFinite(contextOdds) || Math.abs(contextOdds - lockedOdds) > 0.0001) throw new Error(`locked_odds mismatch for ${matchId}/${poolCode}/${selectionCode}`);
  const stake = requireNumber(record.stake, `${fieldName}.stake`);
  if (stake <= 0) throw new Error(`Betting arena field ${fieldName}.stake must be positive`);
  return {
    matchId,
    poolCode,
    selectionCode,
    selectionLabel: requireString(record.selection_label, `${fieldName}.selection_label`),
    lockedOdds,
    stake,
    confidence: requireNumber(record.confidence, `${fieldName}.confidence`),
    rationale: requireString(record.rationale, `${fieldName}.rationale`)
  };
}

function parseParlay(value: unknown, context: BattleContextLike, fieldName: string): BettingArenaParlayDto {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Betting arena field ${fieldName} must be an object`);
  const record = value as Record<string, unknown>;
  const legsValue = record.legs;
  if (!Array.isArray(legsValue)) throw new Error(`Betting arena field ${fieldName}.legs must be an array`);
  const legs = legsValue.map((legValue, index) => {
    const parsed = parseSingle({ ...(legValue as Record<string, unknown>), stake: 1, confidence: 0, rationale: "" }, context, `${fieldName}.legs[${index}]`);
    return {
      matchId: parsed.matchId,
      poolCode: parsed.poolCode,
      selectionCode: parsed.selectionCode,
      selectionLabel: parsed.selectionLabel,
      lockedOdds: parsed.lockedOdds
    };
  });
  const stake = requireNumber(record.stake, `${fieldName}.stake`);
  if (stake <= 0) throw new Error(`Betting arena field ${fieldName}.stake must be positive`);
  return {
    parlayName: requireString(record.parlay_name, `${fieldName}.parlay_name`),
    stake,
    legs,
    combinedOdds: requireNumber(record.combined_odds, `${fieldName}.combined_odds`),
    confidence: requireNumber(record.confidence, `${fieldName}.confidence`),
    rationale: requireString(record.rationale, `${fieldName}.rationale`)
  };
}

export function parseBettingArenaSlip(content: string, battleContext: BattleContextLike, accountContext: AccountContextLike): ParsedBettingArenaSlip {
  const record = parseJsonObject(content);
  const action = requireAction(record.action);
  const totalStake = requireNumber(record.total_stake, "total_stake");
  const riskLevel = requireRiskLevel(record.risk_level);
  const singlesValue = record.singles;
  const parlaysValue = record.parlays;
  if (!Array.isArray(singlesValue)) throw new Error("Betting arena field singles must be an array");
  if (!Array.isArray(parlaysValue)) throw new Error("Betting arena field parlays must be an array");
  const singles = singlesValue.map((value, index) => parseSingle(value, battleContext, `singles[${index}]`));
  const parlays = parlaysValue.map((value, index) => parseParlay(value, battleContext, `parlays[${index}]`));
  const computedStake = singles.reduce((sum, item) => sum + item.stake, 0) + parlays.reduce((sum, item) => sum + item.stake, 0);
  if (Math.abs(totalStake - computedStake) > 0.0001) throw new Error("total_stake must equal singles stake plus parlay stake");
  if (totalStake > accountContext.availableBankroll * 0.5) throw new Error("total_stake exceeds max daily stake");
  if (action === "hold" && (totalStake !== 0 || singles.length > 0 || parlays.length > 0)) {
    throw new Error("hold action must not include stake");
  }
  const potentialReturn =
    singles.reduce((sum, item) => sum + item.stake * item.lockedOdds, 0) +
    parlays.reduce((sum, item) => sum + item.stake * item.combinedOdds, 0);

  return {
    action,
    totalStake,
    potentialReturn,
    riskLevel,
    strategySummary: requireString(record.strategy_summary, "strategy_summary"),
    bankrollPlan: requireString(record.bankroll_plan, "bankroll_plan"),
    singles,
    parlays,
    skipReasons: requireStringArray(record.skip_reasons, "skip_reasons"),
    dataGaps: requireStringArray(record.data_gaps, "data_gaps")
  };
}
```

- [ ] **Step 4: Run parser tests to verify GREEN**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaSlip.test.ts
corepack pnpm --filter @worldcup-ai-pk/api typecheck
```

Expected: parser tests pass and typecheck exits with code 0.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/api/src/modules/betting-arena/bettingArenaSlip.ts apps/api/test/bettingArenaSlip.test.ts
git commit -m "feat: validate betting arena slips"
```

---

## Task 4: Settlement Engine

**Files:**
- Create: `apps/api/src/modules/betting-arena/bettingArenaSettlement.ts`
- Create: `apps/api/test/bettingArenaSettlement.test.ts`

- [ ] **Step 1: Write failing settlement tests**

Create `apps/api/test/bettingArenaSettlement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { settleParsedSlip } from "../src/modules/betting-arena/bettingArenaSettlement";

const finishedMatches = [
  { matchId: "match-1", homeScore: 2, awayScore: 1, status: "finished" },
  { matchId: "match-2", homeScore: 0, awayScore: 1, status: "finished" }
];

describe("betting arena settlement", () => {
  it("settles winning and losing single bets", () => {
    expect(
      settleParsedSlip(
        {
          totalStake: 300,
          singles: [
            { matchId: "match-1", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.8, stake: 100, confidence: 0.6, rationale: "" },
            { matchId: "match-2", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.7, stake: 200, confidence: 0.6, rationale: "" }
          ],
          parlays: []
        },
        finishedMatches
      )
    ).toMatchObject({ stake: 300, returnedAmount: 180, profit: -120, status: "settled", hit: false });
  });

  it("settles winning parlay", () => {
    expect(
      settleParsedSlip(
        {
          totalStake: 100,
          singles: [],
          parlays: [
            {
              parlayName: "双关",
              stake: 100,
              combinedOdds: 3.78,
              confidence: 0.5,
              rationale: "",
              legs: [
                { matchId: "match-1", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.8 },
                { matchId: "match-2", poolCode: "HAD", selectionCode: "a", selectionLabel: "客胜", lockedOdds: 2.1 }
              ]
            }
          ]
        },
        finishedMatches
      )
    ).toMatchObject({ stake: 100, returnedAmount: 378, profit: 278, status: "settled", hit: true });
  });

  it("voids slip when a selected match result is unavailable", () => {
    expect(
      settleParsedSlip(
        {
          totalStake: 100,
          singles: [{ matchId: "missing", poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", lockedOdds: 1.8, stake: 100, confidence: 0.6, rationale: "" }],
          parlays: []
        },
        finishedMatches
      )
    ).toMatchObject({ stake: 100, returnedAmount: 100, profit: 0, status: "void", hit: false });
  });
});
```

- [ ] **Step 2: Run settlement tests to verify RED**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaSettlement.test.ts
```

Expected: test fails because `bettingArenaSettlement.ts` does not exist.

- [ ] **Step 3: Implement settlement engine**

Create `apps/api/src/modules/betting-arena/bettingArenaSettlement.ts`:

```ts
import type { BettingArenaParlayDto, BettingArenaSingleDto } from "@worldcup-ai-pk/shared";

interface ParsedSlipLike {
  totalStake: number;
  singles: BettingArenaSingleDto[];
  parlays: BettingArenaParlayDto[];
}

interface FinishedMatch {
  matchId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

export interface BettingArenaSettlementResult {
  stake: number;
  returnedAmount: number;
  profit: number;
  status: "settled" | "void";
  hit: boolean;
  legs: Array<{ matchId: string; won: boolean; voided: boolean }>;
}

function getMatch(matches: FinishedMatch[], matchId: string): FinishedMatch | null {
  return matches.find((match) => match.matchId === matchId) ?? null;
}

function isSelectionWon(selectionCode: string, match: FinishedMatch): boolean {
  if (match.homeScore === null || match.awayScore === null) return false;
  if (selectionCode === "h") return match.homeScore > match.awayScore;
  if (selectionCode === "d") return match.homeScore === match.awayScore;
  if (selectionCode === "a") return match.homeScore < match.awayScore;
  return false;
}

function settleSingle(single: BettingArenaSingleDto, matches: FinishedMatch[]) {
  const match = getMatch(matches, single.matchId);
  if (!match || match.status !== "finished" || match.homeScore === null || match.awayScore === null) {
    return { returnedAmount: single.stake, won: false, voided: true, matchId: single.matchId };
  }
  const won = isSelectionWon(single.selectionCode, match);
  return { returnedAmount: won ? single.stake * single.lockedOdds : 0, won, voided: false, matchId: single.matchId };
}

function settleParlay(parlay: BettingArenaParlayDto, matches: FinishedMatch[]) {
  const legs = parlay.legs.map((leg) => {
    const match = getMatch(matches, leg.matchId);
    if (!match || match.status !== "finished" || match.homeScore === null || match.awayScore === null) {
      return { matchId: leg.matchId, won: false, voided: true };
    }
    return { matchId: leg.matchId, won: isSelectionWon(leg.selectionCode, match), voided: false };
  });
  if (legs.some((leg) => leg.voided)) {
    return { returnedAmount: parlay.stake, won: false, voided: true, legs };
  }
  const won = legs.every((leg) => leg.won);
  return { returnedAmount: won ? parlay.stake * parlay.combinedOdds : 0, won, voided: false, legs };
}

export function settleParsedSlip(slip: ParsedSlipLike, matches: FinishedMatch[]): BettingArenaSettlementResult {
  const singleResults = slip.singles.map((single) => settleSingle(single, matches));
  const parlayResults = slip.parlays.map((parlay) => settleParlay(parlay, matches));
  const returnedAmount =
    singleResults.reduce((sum, result) => sum + result.returnedAmount, 0) +
    parlayResults.reduce((sum, result) => sum + result.returnedAmount, 0);
  const voided = singleResults.some((result) => result.voided) || parlayResults.some((result) => result.voided);
  const hit = !voided && (singleResults.some((result) => result.won) || parlayResults.some((result) => result.won));
  const legs = [
    ...singleResults.map((result) => ({ matchId: result.matchId, won: result.won, voided: result.voided })),
    ...parlayResults.flatMap((result) => result.legs)
  ];
  return {
    stake: slip.totalStake,
    returnedAmount,
    profit: returnedAmount - slip.totalStake,
    status: voided ? "void" : "settled",
    hit,
    legs
  };
}
```

- [ ] **Step 4: Run settlement tests to verify GREEN**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaSettlement.test.ts
corepack pnpm --filter @worldcup-ai-pk/api typecheck
```

Expected: settlement tests pass and typecheck exits with code 0.

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/api/src/modules/betting-arena/bettingArenaSettlement.ts apps/api/test/bettingArenaSettlement.test.ts
git commit -m "feat: settle betting arena slips"
```

---

## Task 5: Generation Service And Public API

**Files:**
- Create: `apps/api/src/modules/betting-arena/bettingArenaPrompts.ts`
- Create: `apps/api/src/modules/betting-arena/bettingArena.service.ts`
- Create: `apps/api/test/bettingArenaApi.test.ts`
- Modify: `apps/api/src/modules/public/public.routes.ts`

- [ ] **Step 1: Write failing API tests**

Create `apps/api/test/bettingArenaApi.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { buildApp } from "../src/app";
import { createTestDatabase } from "./support/testDatabase";

afterEach(() => {
  vi.restoreAllMocks();
});

function seedModelAndMatch(db: ReturnType<typeof createTestDatabase>["db"]) {
  db.prepare(
    `INSERT INTO ai_providers (id, name, display_name, base_url, api_key, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run("provider-1", "newapi", "NewAPI", "https://newapi.example.com/v1", "secret", 1, "2026-06-17T00:00:00.000Z", "2026-06-17T00:00:00.000Z");
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
  ).run("match-1", 9001, "Group Stage - 1", "2026-06-18T12:00:00.000Z", "scheduled", "Test Stadium", "home-1", "Home", null, "away-1", "Away", null, null, null, "2026-06-17T00:00:00.000Z");
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
```

- [ ] **Step 2: Run API tests to verify RED**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaApi.test.ts
```

Expected: test fails because arena routes do not exist.

- [ ] **Step 3: Implement prompt builder**

Create `apps/api/src/modules/betting-arena/bettingArenaPrompts.ts`:

```ts
export function buildBettingArenaPrompt(input: { battleContext: unknown; accountContext: unknown }): string {
  return [
    "你是 AI 实盘投注场里的虚拟投注席位经理。",
    "你可以选择下注，也可以选择空仓。",
    "硬规则：总投入不得超过 account_context.availableBankroll 的 50%。",
    "只能使用 battle_context 中提供的比赛、玩法、选项和赔率。",
    "不得编造缺失的阵容、伤停、球员、身价、赔率或外部情报。",
    "输出必须是 JSON 对象，不要 markdown，不要解释。",
    "JSON 字段必须包含 action,total_stake,singles,parlays,strategy_summary,risk_level,bankroll_plan,skip_reasons,data_gaps。",
    `account_context=${JSON.stringify(input.accountContext)}`,
    `battle_context=${JSON.stringify(input.battleContext)}`
  ].join("\n");
}
```

- [ ] **Step 4: Implement minimal service**

Create `apps/api/src/modules/betting-arena/bettingArena.service.ts` with exports `getBettingArena`, `triggerBettingArenaRound`, `getBettingArenaRound`, and `settleBettingArenaRound`. Use repository/context/parser/prompt functions from previous tasks. For first version, use this flow:

```ts
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { BettingArenaDto } from "@worldcup-ai-pk/shared";
import { runOpenAiCompatiblePrediction } from "../ai/openAiCompatibleClient";
import { buildAccountContext, buildBattleContext } from "./bettingArena.context";
import { buildBettingArenaPrompt } from "./bettingArenaPrompts";
import { createBettingArenaRound, ensureBettingArenaAccounts, getBettingArenaSummary } from "./bettingArena.repository";
import { parseBettingArenaSlip } from "./bettingArenaSlip";

interface EnabledModelRow {
  model_id: string;
  model_name: string;
  model_display_name: string;
  base_url: string;
  api_key: string;
}

function listEnabledModels(db: Database): EnabledModelRow[] {
  return db.prepare(
    `
      SELECT ai_models.id AS model_id, ai_models.model_name, ai_models.display_name AS model_display_name, ai_providers.base_url, ai_providers.api_key
      FROM ai_models
      INNER JOIN ai_providers ON ai_providers.id = ai_models.provider_id
      WHERE ai_models.enabled = 1 AND ai_providers.enabled = 1
      ORDER BY ai_models.display_name ASC
    `
  ).all() as EnabledModelRow[];
}

export function getBettingArena(db: Database): BettingArenaDto {
  return getBettingArenaSummary(db);
}

export async function triggerBettingArenaRound(db: Database, now = new Date()): Promise<BettingArenaDto> {
  ensureBettingArenaAccounts(db, now);
  const roundDate = now.toISOString().slice(0, 10);
  const lockTime = now.toISOString();
  const externalIntel = { summary: "统一外部情报未配置", dataGaps: ["未配置外部联网情报采集"] };
  const battleContext = buildBattleContext(db, { roundDate, lockTime, externalIntel });
  const round = createBettingArenaRound(db, { roundDate, lockTime, battleContext, externalIntel, now });
  db.prepare("UPDATE betting_arena_rounds SET status = ?, updated_at = ? WHERE id = ?").run("generating", now.toISOString(), round.id);

  for (const model of listEnabledModels(db)) {
    const accountContext = buildAccountContext(db, model.model_id);
    try {
      const result = await runOpenAiCompatiblePrediction(
        { baseUrl: model.base_url, apiKey: model.api_key, modelName: model.model_name },
        buildBettingArenaPrompt({ battleContext, accountContext })
      );
      const parsed = parseBettingArenaSlip(result.content, battleContext, accountContext);
      db.prepare(
        `
          INSERT INTO betting_arena_slips (
            id, round_id, model_id, action, status, total_stake, potential_return, risk_level,
            raw_response, output_json, parsed_slip_json, account_context_json, validation_error, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        randomUUID(),
        round.id,
        model.model_id,
        parsed.action,
        "accepted",
        parsed.totalStake,
        parsed.potentialReturn,
        parsed.riskLevel,
        result.rawResponse,
        result.content,
        JSON.stringify(parsed),
        JSON.stringify(accountContext),
        null,
        now.toISOString(),
        now.toISOString()
      );
      if (parsed.totalStake > 0) {
        db.prepare(
          `UPDATE betting_arena_accounts
           SET available_bankroll = available_bankroll - ?, frozen_stake = frozen_stake + ?, total_staked = total_staked + ?, order_count = order_count + 1, updated_at = ?
           WHERE model_id = ?`
        ).run(parsed.totalStake, parsed.totalStake, parsed.totalStake, now.toISOString(), model.model_id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Betting arena generation failed";
      db.prepare(
        `
          INSERT INTO betting_arena_slips (
            id, round_id, model_id, action, status, total_stake, potential_return, risk_level,
            raw_response, output_json, parsed_slip_json, account_context_json, validation_error, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(randomUUID(), round.id, model.model_id, "hold", "generation_failed", 0, 0, "low", "", "{}", "{}", JSON.stringify(accountContext), message, now.toISOString(), now.toISOString());
      db.prepare("UPDATE betting_arena_accounts SET failed_generation_count = failed_generation_count + 1, updated_at = ? WHERE model_id = ?").run(now.toISOString(), model.model_id);
    }
  }

  db.prepare("UPDATE betting_arena_rounds SET status = ?, updated_at = ? WHERE id = ?").run("locked", now.toISOString(), round.id);
  return getBettingArenaSummary(db);
}

export function getBettingArenaRound(db: Database, roundId: string): BettingArenaDto {
  const summary = getBettingArenaSummary(db);
  if (!summary.currentRound || summary.currentRound.id !== roundId) return summary;
  return summary;
}

export function settleBettingArenaRound(db: Database, roundId: string): BettingArenaDto {
  db.prepare("UPDATE betting_arena_rounds SET status = ?, updated_at = ? WHERE id = ?").run("settled", new Date().toISOString(), roundId);
  return getBettingArenaSummary(db);
}
```

- [ ] **Step 5: Register public routes**

In `apps/api/src/modules/public/public.routes.ts`, add imports:

```ts
import { getBettingArena, getBettingArenaRound, settleBettingArenaRound, triggerBettingArenaRound } from "../betting-arena/bettingArena.service";
```

Inside `registerPublicRoutes`, after `/leaderboard`, add:

```ts
  app.get("/betting-arena", async () => getBettingArena(options.db));

  app.post("/betting-arena/rounds", async () => triggerBettingArenaRound(options.db));

  app.get<{ Params: { roundId: string } }>("/betting-arena/rounds/:roundId", async (request) => getBettingArenaRound(options.db, request.params.roundId));

  app.post<{ Params: { roundId: string } }>("/betting-arena/rounds/:roundId/settle", async (request) => settleBettingArenaRound(options.db, request.params.roundId));
```

- [ ] **Step 6: Run API tests to verify GREEN**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaApi.test.ts bettingArenaRepository.test.ts bettingArenaSlip.test.ts
corepack pnpm --filter @worldcup-ai-pk/api typecheck
```

Expected: arena API and related tests pass, typecheck exits with code 0.

- [ ] **Step 7: Commit Task 5**

```bash
git add apps/api/src/modules/betting-arena/bettingArenaPrompts.ts apps/api/src/modules/betting-arena/bettingArena.service.ts apps/api/src/modules/public/public.routes.ts apps/api/test/bettingArenaApi.test.ts
git commit -m "feat: add betting arena api"
```

---

## Task 6: Frontend Arena Page

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Create: `apps/web/src/pages/BettingArenaPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add API client functions**

In `apps/web/src/api/client.ts`, add imports for `BettingArenaDto` if not already imported:

```ts
import type { BettingArenaDto } from "@worldcup-ai-pk/shared";
```

Add:

```ts
export async function getBettingArena(): Promise<BettingArenaDto> {
  const response = await request(`${apiBaseUrl}/api/public/betting-arena`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Public betting arena request failed with status ${response.status}`);
  }
  return (await response.json()) as BettingArenaDto;
}

export async function triggerBettingArenaRound(): Promise<BettingArenaDto> {
  const response = await request(`${apiBaseUrl}/api/public/betting-arena/rounds`, {
    method: "POST",
    headers: { "content-type": "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Public betting arena round request failed with status ${response.status}`);
  }
  return (await response.json()) as BettingArenaDto;
}

export async function settleBettingArenaRound(roundId: string): Promise<BettingArenaDto> {
  const response = await request(`${apiBaseUrl}/api/public/betting-arena/rounds/${roundId}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Public betting arena settlement request failed with status ${response.status}`);
  }
  return (await response.json()) as BettingArenaDto;
}
```

- [ ] **Step 2: Create arena page**

Create `apps/web/src/pages/BettingArenaPage.tsx`:

```tsx
import type { BettingArenaDto, BettingArenaSlipDto } from "@worldcup-ai-pk/shared";
import { useState } from "react";

interface BettingArenaPageProps {
  arena: BettingArenaDto | null;
  loading: boolean;
  error: string | null;
  onTriggerRound: () => Promise<BettingArenaDto>;
  onSettleRound: (roundId: string) => Promise<BettingArenaDto>;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function money(value: number): string {
  return value.toFixed(0);
}

function actionLabel(action: BettingArenaSlipDto["action"]): string {
  return action === "hold" ? "空仓" : "下注";
}

export function BettingArenaPage({ arena, loading, error, onTriggerRound, onSettleRound }: BettingArenaPageProps) {
  const [selectedSlip, setSelectedSlip] = useState<BettingArenaSlipDto | null>(null);
  const [busy, setBusy] = useState(false);

  async function triggerRound() {
    setBusy(true);
    try {
      await onTriggerRound();
    } finally {
      setBusy(false);
    }
  }

  async function settleRound() {
    if (!arena?.currentRound) return;
    setBusy(true);
    try {
      await onSettleRound(arena.currentRound.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="betting-arena" className="page-section betting-arena">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AI Live Betting Arena</p>
          <h2>AI 实盘投注场</h2>
        </div>
        <div className="section-actions">
          <button className="app-button app-button-primary" type="button" onClick={triggerRound} disabled={busy}>
            {busy ? "处理中" : "生成今日出单"}
          </button>
          <button className="app-button app-button-secondary" type="button" onClick={settleRound} disabled={busy || !arena?.currentRound}>
            结算当前轮
          </button>
        </div>
      </div>

      {loading ? <p className="status-line">正在加载实盘投注场...</p> : null}
      {error ? <p className="status-line error">{error}</p> : null}

      <div className="arena-overview">
        <div>
          <span>当前轮次</span>
          <strong>{arena?.currentRound?.roundDate ?? "未创建"}</strong>
        </div>
        <div>
          <span>状态</span>
          <strong>{arena?.currentRound?.status ?? "待启动"}</strong>
        </div>
        <div>
          <span>今日投入</span>
          <strong>{money(arena?.currentRound?.totalStaked ?? 0)}</strong>
        </div>
        <div>
          <span>潜在返还</span>
          <strong>{money(arena?.currentRound?.potentialReturn ?? 0)}</strong>
        </div>
      </div>

      <div className="arena-grid">
        <section className="arena-panel">
          <h3>AI 资金榜</h3>
          <div className="arena-account-list">
            {(arena?.accounts ?? []).map((account) => (
              <div className="arena-account-row" key={account.modelId}>
                <strong>{account.rank}. {account.modelDisplayName}</strong>
                <span>余额 {money(account.availableBankroll)}</span>
                <span>收益率 {percent(account.returnRate)}</span>
                <span>命中率 {percent(account.hitRate)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="arena-panel">
          <h3>今日出单矩阵</h3>
          <div className="arena-slip-list">
            {(arena?.slips ?? []).map((slip) => (
              <button className="arena-slip-row" type="button" key={slip.id} onClick={() => setSelectedSlip(slip)}>
                <strong>{slip.modelDisplayName}</strong>
                <span>{actionLabel(slip.action)} · {slip.status}</span>
                <span>投入 {money(slip.totalStake)}</span>
                <span>潜在 {money(slip.potentialReturn)}</span>
              </button>
            ))}
            {(arena?.slips ?? []).length === 0 ? <p className="muted">今日暂无出单。</p> : null}
          </div>
        </section>
      </div>

      {selectedSlip ? (
        <div className="arena-detail-drawer" role="dialog" aria-modal="true">
          <div className="arena-detail-panel">
            <button className="app-button app-button-secondary" type="button" onClick={() => setSelectedSlip(null)}>
              关闭
            </button>
            <h3>{selectedSlip.modelDisplayName}</h3>
            <p>{selectedSlip.strategySummary}</p>
            <div className="arena-detail-table">
              <strong>单场</strong>
              {selectedSlip.singles.map((single) => (
                <span key={`${single.matchId}-${single.poolCode}-${single.selectionCode}`}>
                  {single.matchId} · {single.poolCode} · {single.selectionLabel} · {money(single.stake)}
                </span>
              ))}
              <strong>串关</strong>
              {selectedSlip.parlays.map((parlay) => (
                <span key={parlay.parlayName}>
                  {parlay.parlayName} · {parlay.legs.length} 腿 · {money(parlay.stake)}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 3: Wire page into app**

In `apps/web/src/App.tsx`:

Add imports:

```ts
import type { BettingArenaDto } from "@worldcup-ai-pk/shared";
import { BettingArenaPage } from "./pages/BettingArenaPage";
import { getBettingArena, settleBettingArenaRound, triggerBettingArenaRound } from "./api/client";
```

Add state:

```ts
const [bettingArena, setBettingArena] = useState<BettingArenaDto | null>(null);
const [bettingArenaStatus, setBettingArenaStatus] = useState<"loading" | "loaded" | "failed">("loading");
```

Load `getBettingArena()` alongside existing initial data and refreshes. Add nav item:

```tsx
<a href="#betting-arena">实盘投注场</a>
```

Render after `FixturesPage`:

```tsx
<BettingArenaPage
  arena={bettingArena}
  loading={bettingArenaStatus === "loading"}
  error={bettingArenaStatus === "failed" ? "实盘投注场加载失败，请确认 API 服务正在运行。" : null}
  onTriggerRound={async () => {
    const nextArena = await triggerBettingArenaRound();
    setBettingArena(nextArena);
    return nextArena;
  }}
  onSettleRound={async (roundId) => {
    const nextArena = await settleBettingArenaRound(roundId);
    setBettingArena(nextArena);
    return nextArena;
  }}
/>
```

- [ ] **Step 4: Add responsive styles**

Append to `apps/web/src/styles.css`:

```css
.betting-arena {
  display: grid;
  gap: 18px;
}

.section-heading,
.section-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.arena-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.arena-overview > div,
.arena-panel,
.arena-account-row,
.arena-slip-row {
  border: 1px solid var(--border-color, #d6e0dc);
  border-radius: 8px;
  background: #fff;
}

.arena-overview > div {
  padding: 12px;
  display: grid;
  gap: 4px;
}

.arena-overview span,
.arena-account-row span,
.arena-slip-row span,
.muted {
  color: #52645f;
  font-size: 13px;
}

.arena-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 14px;
}

.arena-panel {
  padding: 14px;
}

.arena-account-list,
.arena-slip-list,
.arena-detail-table {
  display: grid;
  gap: 8px;
}

.arena-account-row,
.arena-slip-row {
  padding: 10px;
  display: grid;
  grid-template-columns: minmax(120px, 1.4fr) repeat(3, minmax(70px, 0.8fr));
  gap: 8px;
  text-align: left;
}

.arena-slip-row {
  width: 100%;
  cursor: pointer;
}

.arena-detail-drawer {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(18, 31, 29, 0.3);
  display: grid;
  place-items: center;
  padding: 20px;
}

.arena-detail-panel {
  width: min(760px, 100%);
  max-height: 86vh;
  overflow: auto;
  background: #fff;
  border-radius: 10px;
  padding: 18px;
  display: grid;
  gap: 12px;
}

@media (max-width: 760px) {
  .section-heading,
  .section-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .arena-overview,
  .arena-grid {
    grid-template-columns: 1fr;
  }

  .arena-account-row,
  .arena-slip-row {
    grid-template-columns: 1fr 1fr;
    font-size: 13px;
  }
}
```

- [ ] **Step 5: Run frontend typecheck/build verification**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web typecheck
corepack pnpm --filter @worldcup-ai-pk/web build
```

Expected: both commands exit with code 0.

- [ ] **Step 6: Commit Task 6**

```bash
git add apps/web/src/api/client.ts apps/web/src/pages/BettingArenaPage.tsx apps/web/src/App.tsx apps/web/src/styles.css
git commit -m "feat: add betting arena page"
```

---

## Task 7: Final Verification

**Files:**
- No planned source changes unless verification reveals a bug from Tasks 1-6.

- [ ] **Step 1: Run focused backend tests**

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts bettingArenaSlip.test.ts bettingArenaSettlement.test.ts bettingArenaApi.test.ts schemaMigration.test.ts
```

Expected: all focused backend tests pass.

- [ ] **Step 2: Run API typecheck and tests**

```bash
corepack pnpm --filter @worldcup-ai-pk/api typecheck
corepack pnpm --filter @worldcup-ai-pk/api test
```

Expected: typecheck exits with code 0 and the full API test suite passes.

- [ ] **Step 3: Run web typecheck and build**

```bash
corepack pnpm --filter @worldcup-ai-pk/web typecheck
corepack pnpm --filter @worldcup-ai-pk/web build
```

Expected: both commands exit with code 0.

- [ ] **Step 4: Browser smoke test**

Start or reuse the local dev server, open the app, and verify:

- top nav shows `实盘投注场`
- arena page loads without console errors
- `生成今日出单` button is visible
- accounts render after API data loads
- mobile width does not show horizontal scroll

- [ ] **Step 5: Check worktree**

```bash
git status --short
```

Expected: clean worktree after all commits.

---

## Spec Coverage Self-Review

- Initial bankroll `10000`: Task 1 schema and Task 2 repository.
- Daily max stake `50%`: Task 3 slip validator.
- Shared `battle_context`: Task 2 context builder and Task 5 service.
- Per-model `account_context`: Task 2 context builder and Task 5 service.
- Model bet slip output: Task 3 parser and Task 5 generation service.
- Settlement: Task 4 settlement engine and Task 5 settle route.
- Public API: Task 5.
- Frontend arena page: Task 6.
- Final verification: Task 7.
- External intelligence fairness: Task 2/5 include a single shared field; full web-gathering automation is intentionally not included in this first implementation plan.
