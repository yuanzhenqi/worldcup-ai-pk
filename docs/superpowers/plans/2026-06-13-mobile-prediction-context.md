# Mobile Prediction Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first prediction drawer and a local API-Football context cache so predictions can use task packages, prompt templates, odds, official API-Football prediction data, and clearly marked unavailable context domains.

**Architecture:** Add shared DTOs first, then add SQLite-backed context snapshots and sync logs, then add backend services/routes, then wire the public web client and mobile drawer UI. API-Football JSON parsers must be backed by captured responses; first implementation supports existing service methods for fixture odds, live fixture odds, and fixture prediction, while head-to-head and squad domains return explicit unavailable states until exact response shapes are captured.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, Zod, React, Vite, Vitest, Testing Library.

---

## File Structure

Create:

- `apps/api/src/modules/context/fixtureContext.repository.ts`
  - SQLite reads/writes for context snapshots and data sync logs.
- `apps/api/src/modules/context/fixtureContext.service.ts`
  - Builds public summaries and refreshes selected context domains.
- `apps/api/src/modules/context/apiFootballContextParsers.ts`
  - Pure parser helpers for supported API-Football responses.
- `apps/api/test/fixtureContextRepository.test.ts`
  - Repository and DTO conversion tests.
- `apps/api/test/fixtureContextApi.test.ts`
  - Public and admin context endpoint tests.
- `apps/web/src/components/BottomDrawer.tsx`
  - Reusable accessible bottom drawer component.
- `apps/web/src/components/PredictionRequestDrawer.tsx`
  - Prediction task and prompt configuration drawer.
- `apps/web/src/components/MatchContextDrawer.tsx`
  - Cached data display drawer.
- `apps/web/test/predictionDrawer.test.tsx`
  - Drawer behavior tests.
- `apps/web/test/matchContextDrawer.test.tsx`
  - Context drawer state tests.

Modify:

- `packages/shared/src/types.ts`
  - Add prediction task, data option, context summary, and extended request DTOs.
- `apps/api/src/db/schema.sql`
  - Add context snapshot and sync log tables. Extend prediction request table.
- `apps/api/src/modules/public/public.routes.ts`
  - Add context routes and extend prediction request endpoint body.
- `apps/api/src/modules/admin/admin.routes.ts`
  - Add local-only context sync endpoints and summary route.
- `apps/api/src/modules/admin/builtInPromptTemplates.ts`
  - Expand built-in professional prompt templates.
- `apps/web/src/api/client.ts`
  - Add context client calls and extended prediction request body.
- `apps/web/src/pages/FixturesPage.tsx`
  - Replace direct scheduled request button with prediction and data drawers.
- `apps/web/src/pages/AdminPage.tsx`
  - Add data cache status module.
- `apps/web/src/styles.css`
  - Mobile card and drawer styles.
- Existing web/api tests that assert prompt template names, client methods, and fixture card button labels.

---

## Task 1: Shared DTOs And Schema

**Files:**

- Modify: `packages/shared/src/types.ts`
- Modify: `apps/api/src/db/schema.sql`
- Test: `apps/api/test/schemaMigration.test.ts`

- [ ] **Step 1: Write the failing schema and shared type tests**

Add assertions to `apps/api/test/schemaMigration.test.ts` that verify the new tables and columns exist:

```ts
it("creates fixture context cache tables and prediction request option columns", () => {
  const { db } = createTestDatabase();

  expect(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("fixture_context_snapshots")
  ).toMatchObject({ name: "fixture_context_snapshots" });
  expect(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("fixture_data_sync_logs")
  ).toMatchObject({ name: "fixture_data_sync_logs" });

  const predictionRequestColumns = db.prepare("PRAGMA table_info(prediction_requests)").all() as Array<{ name: string }>;
  expect(predictionRequestColumns.map((column) => column.name)).toEqual(
    expect.arrayContaining([
      "context_snapshot_id",
      "task_types_json",
      "data_options_json",
      "prompt_template_id",
      "custom_prompt",
      "output_style"
    ])
  );

  expect(() => applySchema(db)).not.toThrow();

  db.close();
});
```

- [ ] **Step 2: Run schema test to verify it fails**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/schemaMigration.test.ts
```

Expected: FAIL because `fixture_context_snapshots`, `fixture_data_sync_logs`, and the new `prediction_requests` columns do not exist.

- [ ] **Step 3: Add shared DTOs**

Add to `packages/shared/src/types.ts`:

```ts
export type PredictionTaskType =
  | "result_1x2"
  | "scoreline"
  | "odds_interpretation"
  | "player_lineup_impact"
  | "head_to_head"
  | "upset_risk";

export type PredictionOutputStyle = "concise" | "detailed";

export interface PredictionDataOptionsDto {
  useOdds: boolean;
  useApiFootballPrediction: boolean;
  useHeadToHead: boolean;
  usePlayerLineupInjuries: boolean;
}

export type FixtureContextDomain = "odds" | "api_prediction" | "head_to_head" | "squad";

export type FixtureContextDomainStatus = "cached" | "unavailable" | "refresh_failed" | "not_requested";

export interface FixtureContextDomainSummaryDto {
  domain: FixtureContextDomain;
  status: FixtureContextDomainStatus;
  summary: string;
  lastSyncedAt: string | null;
  error: string | null;
}

export interface FixtureContextSummaryDto {
  matchId: string;
  completeness: "full" | "partial" | "base_only";
  domains: FixtureContextDomainSummaryDto[];
  createdAt: string | null;
}

export interface PredictionRequestInputDto {
  taskTypes: PredictionTaskType[];
  dataOptions: PredictionDataOptionsDto;
  promptTemplateId: string | null;
  customPrompt: string;
  outputStyle: PredictionOutputStyle;
  refreshContext: boolean;
}
```

Extend `PredictionRequestResponseDto`:

```ts
export interface PredictionRequestResponseDto {
  matchId: string;
  status: "scheduled" | "running" | "rejected" | "rate_limited";
  message: string;
  scheduledFor: string | null;
  context: FixtureContextSummaryDto | null;
}
```

- [ ] **Step 4: Add schema**

Append to `apps/api/src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS fixture_context_snapshots (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  odds_summary_json TEXT NOT NULL,
  api_prediction_summary_json TEXT NOT NULL,
  head_to_head_summary_json TEXT NOT NULL,
  squad_summary_json TEXT NOT NULL,
  completeness TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fixture_data_sync_logs (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  domain TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  synced_at TEXT NOT NULL
);

ALTER TABLE prediction_requests ADD COLUMN context_snapshot_id TEXT REFERENCES fixture_context_snapshots(id);
ALTER TABLE prediction_requests ADD COLUMN task_types_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE prediction_requests ADD COLUMN data_options_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE prediction_requests ADD COLUMN prompt_template_id TEXT;
ALTER TABLE prediction_requests ADD COLUMN custom_prompt TEXT NOT NULL DEFAULT '';
ALTER TABLE prediction_requests ADD COLUMN output_style TEXT NOT NULL DEFAULT 'concise';
```

- [ ] **Step 5: Run schema test to verify it passes**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/schemaMigration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run shared typecheck**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/shared typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types.ts apps/api/src/db/schema.sql apps/api/test/schemaMigration.test.ts
git commit -m "feat: add fixture context schema"
```

---

## Task 2: Context Repository

**Files:**

- Create: `apps/api/src/modules/context/fixtureContext.repository.ts`
- Test: `apps/api/test/fixtureContextRepository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Create `apps/api/test/fixtureContextRepository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./support/testDatabase";
import {
  getLatestFixtureContextSummary,
  listFixtureDataSyncLogs,
  saveFixtureContextSnapshot,
  writeFixtureDataSyncLog
} from "../src/modules/context/fixtureContext.repository";

describe("fixture context repository", () => {
  it("stores a context snapshot and returns a public summary", () => {
    const { db } = createTestDatabase();

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
      "match-1",
      1001,
      "Group Stage - 1",
      "2026-06-13T19:00:00.000Z",
      "scheduled",
      "BMO Field",
      "home-1",
      "Home",
      null,
      "away-1",
      "Away",
      null,
      null,
      null,
      "2026-06-13T08:00:00.000Z"
    );

    const snapshot = saveFixtureContextSnapshot(db, {
      matchId: "match-1",
      completeness: "partial",
      domains: [
        { domain: "odds", status: "cached", summary: "主胜 2.10，平局 3.20，客胜 3.50", lastSyncedAt: "2026-06-13T08:10:00.000Z", error: null },
        { domain: "api_prediction", status: "unavailable", summary: "未获取", lastSyncedAt: null, error: null },
        { domain: "head_to_head", status: "not_requested", summary: "未请求", lastSyncedAt: null, error: null },
        { domain: "squad", status: "refresh_failed", summary: "未获取", lastSyncedAt: "2026-06-13T08:11:00.000Z", error: "API-Football returned errors" }
      ],
      raw: { odds: { source: "test" } },
      now: new Date("2026-06-13T08:12:00.000Z")
    });

    expect(snapshot.id).toMatch(/[0-9a-f-]{36}/);
    expect(getLatestFixtureContextSummary(db, "match-1")).toMatchObject({
      matchId: "match-1",
      completeness: "partial",
      createdAt: "2026-06-13T08:12:00.000Z",
      domains: [
        { domain: "odds", status: "cached", summary: "主胜 2.10，平局 3.20，客胜 3.50" },
        { domain: "api_prediction", status: "unavailable", summary: "未获取" },
        { domain: "head_to_head", status: "not_requested", summary: "未请求" },
        { domain: "squad", status: "refresh_failed", summary: "未获取", error: "API-Football returned errors" }
      ]
    });

    db.close();
  });

  it("stores per-domain sync logs", () => {
    const { db } = createTestDatabase();

    writeFixtureDataSyncLog(db, {
      matchId: "match-1",
      domain: "odds",
      status: "refresh_failed",
      error: "API-Football returned errors",
      now: new Date("2026-06-13T08:15:00.000Z")
    });

    expect(listFixtureDataSyncLogs(db, "match-1")).toEqual([
      {
        domain: "odds",
        status: "refresh_failed",
        error: "API-Football returned errors",
        syncedAt: "2026-06-13T08:15:00.000Z"
      }
    ]);

    db.close();
  });
});
```

- [ ] **Step 2: Run repository test to verify it fails**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/fixtureContextRepository.test.ts
```

Expected: FAIL because `fixtureContext.repository.ts` does not exist.

- [ ] **Step 3: Implement repository**

Create `apps/api/src/modules/context/fixtureContext.repository.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type {
  FixtureContextDomain,
  FixtureContextDomainStatus,
  FixtureContextSummaryDto
} from "@worldcup-ai-pk/shared";

interface FixtureContextSnapshotInput {
  matchId: string;
  completeness: FixtureContextSummaryDto["completeness"];
  domains: FixtureContextSummaryDto["domains"];
  raw: unknown;
  now?: Date;
}

interface FixtureDataSyncLogInput {
  matchId: string;
  domain: FixtureContextDomain;
  status: FixtureContextDomainStatus;
  error: string | null;
  now?: Date;
}

interface FixtureContextSnapshotRow {
  id: string;
  match_id: string;
  odds_summary_json: string;
  api_prediction_summary_json: string;
  head_to_head_summary_json: string;
  squad_summary_json: string;
  completeness: FixtureContextSummaryDto["completeness"];
  created_at: string;
}

interface FixtureDataSyncLogRow {
  domain: FixtureContextDomain;
  status: FixtureContextDomainStatus;
  error: string | null;
  synced_at: string;
}

const emptyDomainSummaries: FixtureContextSummaryDto["domains"] = [
  { domain: "odds", status: "not_requested", summary: "未请求", lastSyncedAt: null, error: null },
  { domain: "api_prediction", status: "not_requested", summary: "未请求", lastSyncedAt: null, error: null },
  { domain: "head_to_head", status: "not_requested", summary: "未请求", lastSyncedAt: null, error: null },
  { domain: "squad", status: "not_requested", summary: "未请求", lastSyncedAt: null, error: null }
];

function getDomainSummary(domains: FixtureContextSummaryDto["domains"], domain: FixtureContextDomain) {
  return domains.find((summary) => summary.domain === domain) ?? emptyDomainSummaries.find((summary) => summary.domain === domain)!;
}

export function saveFixtureContextSnapshot(db: Database, input: FixtureContextSnapshotInput): { id: string } {
  const id = randomUUID();
  const createdAt = (input.now ?? new Date()).toISOString();

  db.prepare(
    `
      INSERT INTO fixture_context_snapshots (
        id,
        match_id,
        odds_summary_json,
        api_prediction_summary_json,
        head_to_head_summary_json,
        squad_summary_json,
        completeness,
        raw_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    id,
    input.matchId,
    JSON.stringify(getDomainSummary(input.domains, "odds")),
    JSON.stringify(getDomainSummary(input.domains, "api_prediction")),
    JSON.stringify(getDomainSummary(input.domains, "head_to_head")),
    JSON.stringify(getDomainSummary(input.domains, "squad")),
    input.completeness,
    JSON.stringify(input.raw),
    createdAt
  );

  return { id };
}

export function getLatestFixtureContextSummary(db: Database, matchId: string): FixtureContextSummaryDto | null {
  const row = db
    .prepare(
      `
        SELECT
          id,
          match_id,
          odds_summary_json,
          api_prediction_summary_json,
          head_to_head_summary_json,
          squad_summary_json,
          completeness,
          created_at
        FROM fixture_context_snapshots
        WHERE match_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `
    )
    .get(matchId) as FixtureContextSnapshotRow | undefined;

  if (!row) {
    return null;
  }

  return {
    matchId: row.match_id,
    completeness: row.completeness,
    createdAt: row.created_at,
    domains: [
      JSON.parse(row.odds_summary_json),
      JSON.parse(row.api_prediction_summary_json),
      JSON.parse(row.head_to_head_summary_json),
      JSON.parse(row.squad_summary_json)
    ]
  };
}

export function writeFixtureDataSyncLog(db: Database, input: FixtureDataSyncLogInput): void {
  db.prepare(
    `
      INSERT INTO fixture_data_sync_logs (
        id,
        match_id,
        domain,
        status,
        error,
        synced_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(randomUUID(), input.matchId, input.domain, input.status, input.error, (input.now ?? new Date()).toISOString());
}

export function listFixtureDataSyncLogs(db: Database, matchId: string) {
  const rows = db
    .prepare(
      `
        SELECT domain, status, error, synced_at
        FROM fixture_data_sync_logs
        WHERE match_id = ?
        ORDER BY synced_at DESC
      `
    )
    .all(matchId) as FixtureDataSyncLogRow[];

  return rows.map((row) => ({
    domain: row.domain,
    status: row.status,
    error: row.error,
    syncedAt: row.synced_at
  }));
}
```

- [ ] **Step 4: Run repository test to verify it passes**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/fixtureContextRepository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/context/fixtureContext.repository.ts apps/api/test/fixtureContextRepository.test.ts
git commit -m "feat: store fixture context snapshots"
```

---

## Task 3: Context Service And Parsers

**Files:**

- Create: `apps/api/src/modules/context/apiFootballContextParsers.ts`
- Create: `apps/api/src/modules/context/fixtureContext.service.ts`
- Test: `apps/api/test/fixtureContextApi.test.ts`

- [ ] **Step 1: Write failing parser tests inside `fixtureContextApi.test.ts`**

Create `apps/api/test/fixtureContextApi.test.ts` with parser-focused tests first:

Use response shapes verified from API-Football on 2026-06-13 for fixture `1489373`:

```ts
import { describe, expect, it } from "vitest";
import { parseApiFootballFixturePrediction, parseFixtureOddsSummary } from "../src/modules/context/apiFootballContextParsers";

describe("API-Football context parsers", () => {
  it("extracts 1X2 odds from a captured odds response", () => {
    expect(
      parseFixtureOddsSummary({
        response: [
          {
            bookmakers: [
              {
                name: "10Bet",
                bets: [
                  {
                    name: "Match Winner",
                    values: [
                      { value: "Home", odd: "13.50" },
                      { value: "Draw", odd: "6.20" },
                      { value: "Away", odd: "1.21" }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      })
    ).toEqual({
      status: "cached",
      summary: "10Bet：主胜 13.50，平局 6.20，客胜 1.21",
      raw: expect.any(Object)
    });
  });

  it("extracts API-Football official prediction percentages", () => {
    expect(
      parseApiFootballFixturePrediction({
        response: [
          {
            predictions: {
              winner: { id: 1569, name: "Qatar", comment: "Win or draw" },
              advice: "Double chance : Qatar or draw",
              percent: { home: "50%", draw: "50%", away: "0%" }
            }
          }
        ]
      })
    ).toEqual({
      status: "cached",
      summary: "预测赢家：Qatar；建议：Double chance : Qatar or draw；主胜 50%，平局 50%，客胜 0%",
      raw: expect.any(Object)
    });
  });
});
```

- [ ] **Step 2: Run parser tests to verify they fail**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/fixtureContextApi.test.ts
```

Expected: FAIL because parser module does not exist.

- [ ] **Step 3: Implement parser helpers**

Create `apps/api/src/modules/context/apiFootballContextParsers.ts`:

```ts
import type { FixtureContextDomainStatus } from "@worldcup-ai-pk/shared";

interface ParsedContextDomain {
  status: FixtureContextDomainStatus;
  summary: string;
  raw: unknown;
}

function getResponseArray(response: unknown): unknown[] {
  if (!response || typeof response !== "object" || !("response" in response)) {
    return [];
  }
  const value = (response as { response: unknown }).response;
  return Array.isArray(value) ? value : [];
}

function stringifyOdd(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseFixtureOddsSummary(response: unknown): ParsedContextDomain {
  const first = getResponseArray(response)[0];
  if (!first || typeof first !== "object" || !("bookmakers" in first)) {
    return { status: "unavailable", summary: "未获取赔率", raw: response };
  }

  const bookmakers = (first as { bookmakers: unknown }).bookmakers;
  const firstBookmaker = Array.isArray(bookmakers) ? bookmakers[0] : null;
  if (!firstBookmaker || typeof firstBookmaker !== "object") {
    return { status: "unavailable", summary: "未获取赔率", raw: response };
  }

  const bookmakerName = typeof (firstBookmaker as { name?: unknown }).name === "string" ? (firstBookmaker as { name: string }).name : "Bookmaker";
  const bets = (firstBookmaker as { bets?: unknown }).bets;
  const matchWinnerBet = Array.isArray(bets)
    ? bets.find((bet) => typeof bet === "object" && bet && (bet as { name?: unknown }).name === "Match Winner")
    : null;

  if (!matchWinnerBet || typeof matchWinnerBet !== "object") {
    return { status: "unavailable", summary: "未获取胜平负赔率", raw: response };
  }

  const values = (matchWinnerBet as { values?: unknown }).values;
  const rows = Array.isArray(values) ? values : [];
  const home = rows.find((row) => typeof row === "object" && row && (row as { value?: unknown }).value === "Home") as { odd?: unknown } | undefined;
  const draw = rows.find((row) => typeof row === "object" && row && (row as { value?: unknown }).value === "Draw") as { odd?: unknown } | undefined;
  const away = rows.find((row) => typeof row === "object" && row && (row as { value?: unknown }).value === "Away") as { odd?: unknown } | undefined;

  const homeOdd = stringifyOdd(home?.odd);
  const drawOdd = stringifyOdd(draw?.odd);
  const awayOdd = stringifyOdd(away?.odd);

  if (!homeOdd || !drawOdd || !awayOdd) {
    return { status: "unavailable", summary: "未获取完整胜平负赔率", raw: response };
  }

  return {
    status: "cached",
    summary: `${bookmakerName}：主胜 ${homeOdd}，平局 ${drawOdd}，客胜 ${awayOdd}`,
    raw: response
  };
}

export function parseApiFootballFixturePrediction(response: unknown): ParsedContextDomain {
  const first = getResponseArray(response)[0];
  if (!first || typeof first !== "object" || !("predictions" in first)) {
    return { status: "unavailable", summary: "未获取 API-Football 官方预测", raw: response };
  }

  const predictions = (first as { predictions: unknown }).predictions;
  if (!predictions || typeof predictions !== "object") {
    return { status: "unavailable", summary: "未获取 API-Football 官方预测", raw: response };
  }

  const winner = (predictions as { winner?: { name?: unknown } }).winner?.name;
  const advice = (predictions as { advice?: unknown }).advice;
  const percent = (predictions as { percent?: { home?: unknown; draw?: unknown; away?: unknown } }).percent;

  return {
    status: "cached",
    summary: `预测赢家：${typeof winner === "string" ? winner : "未给出"}；建议：${typeof advice === "string" ? advice : "未给出"}；主胜 ${
      typeof percent?.home === "string" ? percent.home : "-"
    }，平局 ${typeof percent?.draw === "string" ? percent.draw : "-"}，客胜 ${typeof percent?.away === "string" ? percent.away : "-"}`,
    raw: response
  };
}
```

- [ ] **Step 4: Add context service**

Create `apps/api/src/modules/context/fixtureContext.service.ts`:

```ts
import type { Database } from "better-sqlite3";
import type { FixtureContextSummaryDto, PredictionDataOptionsDto } from "@worldcup-ai-pk/shared";
import { FootballService } from "../football/football.service";
import { parseApiFootballFixturePrediction, parseFixtureOddsSummary } from "./apiFootballContextParsers";
import { getLatestFixtureContextSummary, saveFixtureContextSnapshot, writeFixtureDataSyncLog } from "./fixtureContext.repository";

interface RefreshFixtureContextInput {
  db: Database;
  matchId: string;
  apiFootballFixtureId: number;
  footballService: FootballService | null;
  dataOptions: PredictionDataOptionsDto;
  now?: Date;
}

function getCompleteness(domains: FixtureContextSummaryDto["domains"]): FixtureContextSummaryDto["completeness"] {
  const requestedDomains = domains.filter((domain) => domain.status !== "not_requested");
  if (requestedDomains.length === 0) {
    return "base_only";
  }
  return requestedDomains.every((domain) => domain.status === "cached") ? "full" : "partial";
}

function unavailableSummary(domain: FixtureContextSummaryDto["domains"][number]["domain"], summary: string): FixtureContextSummaryDto["domains"][number] {
  return {
    domain,
    status: "unavailable",
    summary,
    lastSyncedAt: null,
    error: null
  };
}

function notRequestedSummary(domain: FixtureContextSummaryDto["domains"][number]["domain"]): FixtureContextSummaryDto["domains"][number] {
  return {
    domain,
    status: "not_requested",
    summary: "未请求",
    lastSyncedAt: null,
    error: null
  };
}

export function getFixtureContextSummary(db: Database, matchId: string): FixtureContextSummaryDto {
  return (
    getLatestFixtureContextSummary(db, matchId) ?? {
      matchId,
      completeness: "base_only",
      createdAt: null,
      domains: [
        notRequestedSummary("odds"),
        notRequestedSummary("api_prediction"),
        notRequestedSummary("head_to_head"),
        notRequestedSummary("squad")
      ]
    }
  );
}

export async function refreshFixtureContext(input: RefreshFixtureContextInput): Promise<FixtureContextSummaryDto> {
  const now = input.now ?? new Date();
  const domains: FixtureContextSummaryDto["domains"] = [];
  const raw: Record<string, unknown> = {};

  if (input.dataOptions.useOdds && input.footballService) {
    try {
      const oddsResponse = await input.footballService.getFixtureOdds(input.apiFootballFixtureId);
      const parsed = parseFixtureOddsSummary(oddsResponse);
      raw.odds = parsed.raw;
      domains.push({ domain: "odds", status: parsed.status, summary: parsed.summary, lastSyncedAt: now.toISOString(), error: null });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "odds", status: parsed.status, error: null, now });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fixture odds refresh failed";
      domains.push({ domain: "odds", status: "refresh_failed", summary: "未获取赔率", lastSyncedAt: now.toISOString(), error: message });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "odds", status: "refresh_failed", error: message, now });
    }
  } else {
    domains.push(notRequestedSummary("odds"));
  }

  if (input.dataOptions.useApiFootballPrediction && input.footballService) {
    try {
      const predictionResponse = await input.footballService.getFixturePrediction(input.apiFootballFixtureId);
      const parsed = parseApiFootballFixturePrediction(predictionResponse);
      raw.apiPrediction = parsed.raw;
      domains.push({ domain: "api_prediction", status: parsed.status, summary: parsed.summary, lastSyncedAt: now.toISOString(), error: null });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "api_prediction", status: parsed.status, error: null, now });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fixture prediction refresh failed";
      domains.push({ domain: "api_prediction", status: "refresh_failed", summary: "未获取 API-Football 官方预测", lastSyncedAt: now.toISOString(), error: message });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "api_prediction", status: "refresh_failed", error: message, now });
    }
  } else {
    domains.push(notRequestedSummary("api_prediction"));
  }

  domains.push(input.dataOptions.useHeadToHead ? unavailableSummary("head_to_head", "历史交锋接口响应尚未捕获") : notRequestedSummary("head_to_head"));
  domains.push(input.dataOptions.usePlayerLineupInjuries ? unavailableSummary("squad", "球员、阵容、伤停接口响应尚未捕获") : notRequestedSummary("squad"));

  const completeness = getCompleteness(domains);
  saveFixtureContextSnapshot(input.db, { matchId: input.matchId, completeness, domains, raw, now });

  return getFixtureContextSummary(input.db, input.matchId);
}
```

- [ ] **Step 5: Run parser and service typecheck**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api typecheck
```

Expected: PASS.

- [ ] **Step 6: Run parser tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/fixtureContextApi.test.ts
```

Expected: PASS for parser tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/context/apiFootballContextParsers.ts apps/api/src/modules/context/fixtureContext.service.ts apps/api/test/fixtureContextApi.test.ts
git commit -m "feat: parse fixture context data"
```

---

## Task 4: Public And Admin Context APIs

**Files:**

- Modify: `apps/api/src/modules/public/public.routes.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Test: `apps/api/test/fixtureContextApi.test.ts`

- [ ] **Step 1: Add failing public API tests**

Append to `apps/api/test/fixtureContextApi.test.ts`:

```ts
import { afterEach, vi } from "vitest";
import { buildApp } from "../src/app";
import { saveApiFootballKey } from "../src/modules/settings/settings.repository";
import { createTestDatabase } from "./support/testDatabase";

function insertContextApiMatch(db: ReturnType<typeof createTestDatabase>["db"]) {
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
    "match-1",
    1001,
    "Group Stage - 1",
    "2099-06-13T19:00:00.000Z",
    "scheduled",
    "BMO Field",
    "home-1",
    "Home",
    null,
    "away-1",
    "Away",
    null,
    null,
    null,
    "2026-06-13T08:00:00.000Z"
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fixture context API", () => {
  it("returns base-only context before refresh", async () => {
    const { db, databasePath } = createTestDatabase();
    insertContextApiMatch(db);
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({ method: "GET", url: "/api/public/matches/match-1/context" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchId: "match-1",
      completeness: "base_only",
      createdAt: null
    });

    await app.close();
  });

  it("refreshes odds and official prediction context for one match", async () => {
    const { db, databasePath } = createTestDatabase();
    insertContextApiMatch(db);
    saveApiFootballKey(db, "secret-api-football-key");
    db.close();

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: [
              {
                bookmakers: [
                  {
                    name: "Bet365",
                    bets: [
                      {
                        name: "Match Winner",
                        values: [
                          { value: "Home", odd: "2.10" },
                          { value: "Draw", odd: "3.20" },
                          { value: "Away", odd: "3.50" }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: [
              {
                predictions: {
                  winner: { name: "Home" },
                  advice: "Winner : Home",
                  percent: { home: "55%", draw: "25%", away: "20%" }
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
      url: "/api/public/matches/match-1/context/refresh",
      payload: {
        dataOptions: {
          useOdds: true,
          useApiFootballPrediction: true,
          useHeadToHead: true,
          usePlayerLineupInjuries: true
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchId: "match-1",
      completeness: "partial",
      domains: expect.arrayContaining([
        expect.objectContaining({ domain: "odds", status: "cached" }),
        expect.objectContaining({ domain: "api_prediction", status: "cached" }),
        expect.objectContaining({ domain: "head_to_head", status: "unavailable" }),
        expect.objectContaining({ domain: "squad", status: "unavailable" })
      ])
    });

    await app.close();
  });
});
```

- [ ] **Step 2: Run API tests to verify they fail**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/fixtureContextApi.test.ts
```

Expected: FAIL because routes are not registered.

- [ ] **Step 3: Add route schemas and helpers**

In `apps/api/src/modules/public/public.routes.ts`, import:

```ts
import { z } from "zod";
import type { PredictionDataOptionsDto, PredictionRequestInputDto } from "@worldcup-ai-pk/shared";
import { FootballService } from "../football/football.service";
import { getApiFootballKey } from "../settings/settings.repository";
import { getFixtureContextSummary, refreshFixtureContext } from "../context/fixtureContext.service";
```

Add schemas:

```ts
const predictionDataOptionsSchema = z.object({
  useOdds: z.boolean(),
  useApiFootballPrediction: z.boolean(),
  useHeadToHead: z.boolean(),
  usePlayerLineupInjuries: z.boolean()
});

const contextRefreshSchema = z.object({
  dataOptions: predictionDataOptionsSchema
});

const defaultPredictionRequestInput: PredictionRequestInputDto = {
  taskTypes: ["result_1x2", "scoreline", "odds_interpretation"],
  dataOptions: {
    useOdds: true,
    useApiFootballPrediction: true,
    useHeadToHead: true,
    usePlayerLineupInjuries: true
  },
  promptTemplateId: null,
  customPrompt: "",
  outputStyle: "concise",
  refreshContext: true
};
```

- [ ] **Step 4: Add public context routes**

In `registerPublicRoutes`, add before the prediction request route:

```ts
app.get<{ Params: { matchId: string } }>("/matches/:matchId/context", async (request, reply) => {
  const match = options.db.prepare("SELECT id FROM matches WHERE id = ?").get(request.params.matchId) as { id: string } | undefined;

  if (!match) {
    return reply.code(404).send({ error: "Match not found" });
  }

  return getFixtureContextSummary(options.db, match.id);
});

app.post<{ Params: { matchId: string } }>("/matches/:matchId/context/refresh", async (request, reply) => {
  const parsed = contextRefreshSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid context refresh payload" });
  }

  const match = options.db
    .prepare("SELECT id, api_football_fixture_id FROM matches WHERE id = ?")
    .get(request.params.matchId) as { id: string; api_football_fixture_id: number } | undefined;

  if (!match) {
    return reply.code(404).send({ error: "Match not found" });
  }

  const apiKey = getApiFootballKey(options.db);
  const footballService = apiKey ? new FootballService({ apiKey }) : null;

  return refreshFixtureContext({
    db: options.db,
    matchId: match.id,
    apiFootballFixtureId: match.api_football_fixture_id,
    footballService,
    dataOptions: parsed.data.dataOptions as PredictionDataOptionsDto
  });
});
```

- [ ] **Step 5: Add admin context sync route**

In `apps/api/src/modules/admin/admin.routes.ts`, import `refreshFixtureContext` and add:

```ts
app.post("/sync/api-football/matches/:matchId/context", async (request, reply) => {
  const apiKey = getApiFootballKey(options.db);
  if (!apiKey) {
    return reply.code(400).send({ error: "API-Football key is not configured" });
  }

  const match = options.db
    .prepare("SELECT id, api_football_fixture_id FROM matches WHERE id = ?")
    .get(getIdParam(request, "matchId")) as { id: string; api_football_fixture_id: number } | undefined;

  if (!match) {
    return reply.code(404).send({ error: "Match not found" });
  }

  return refreshFixtureContext({
    db: options.db,
    matchId: match.id,
    apiFootballFixtureId: match.api_football_fixture_id,
    footballService: new FootballService({ apiKey }),
    dataOptions: {
      useOdds: true,
      useApiFootballPrediction: true,
      useHeadToHead: true,
      usePlayerLineupInjuries: true
    }
  });
});
```

- [ ] **Step 6: Run context API tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/fixtureContextApi.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/public/public.routes.ts apps/api/src/modules/admin/admin.routes.ts apps/api/test/fixtureContextApi.test.ts
git commit -m "feat: add fixture context APIs"
```

---

## Task 5: Extend Prediction Requests With Options And Context

**Files:**

- Modify: `apps/api/src/modules/public/public.routes.ts`
- Modify: `apps/api/test/publicPredictionRequest.test.ts`

- [ ] **Step 1: Write failing prediction request tests**

Add to `apps/api/test/publicPredictionRequest.test.ts`:

```ts
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
```

- [ ] **Step 2: Run prediction request tests to verify they fail**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/publicPredictionRequest.test.ts
```

Expected: FAIL because the endpoint ignores request body options and does not return context.

- [ ] **Step 3: Extend request schema**

In `apps/api/src/modules/public/public.routes.ts`, add:

```ts
const predictionRequestSchema = z.object({
  taskTypes: z.array(z.enum(["result_1x2", "scoreline", "odds_interpretation", "player_lineup_impact", "head_to_head", "upset_risk"])).min(1),
  dataOptions: predictionDataOptionsSchema,
  promptTemplateId: z.string().min(1).nullable(),
  customPrompt: z.string(),
  outputStyle: z.enum(["concise", "detailed"]),
  refreshContext: z.boolean()
});

function parsePredictionRequestBody(body: unknown): PredictionRequestInputDto {
  const parsed = predictionRequestSchema.safeParse(body);
  return parsed.success ? parsed.data : defaultPredictionRequestInput;
}
```

- [ ] **Step 4: Store options and context on prediction request**

Inside the existing `app.post("/matches/:matchId/prediction-request"...)`, before planning:

```ts
const predictionInput = parsePredictionRequestBody(request.body);
let context = getFixtureContextSummary(options.db, match.id);

if (predictionInput.refreshContext) {
  const apiKey = getApiFootballKey(options.db);
  const footballService = apiKey ? new FootballService({ apiKey }) : null;
  context = await refreshFixtureContext({
    db: options.db,
    matchId: match.id,
    apiFootballFixtureId: match.api_football_fixture_id,
    footballService,
    dataOptions: predictionInput.dataOptions
  });
}
```

Update match query to include `api_football_fixture_id`:

```ts
.prepare("SELECT id, api_football_fixture_id, kickoff_at, status FROM matches WHERE id = ?")
```

Update `prediction_requests` insert columns:

```sql
INSERT INTO prediction_requests (
  id,
  match_id,
  requested_at,
  status,
  next_executable_at,
  context_snapshot_id,
  task_types_json,
  data_options_json,
  prompt_template_id,
  custom_prompt,
  output_style
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Use values:

```ts
const latestContextSnapshot = options.db
  .prepare("SELECT id FROM fixture_context_snapshots WHERE match_id = ? ORDER BY created_at DESC LIMIT 1")
  .get(match.id) as { id: string } | undefined;

.run(
  randomUUID(),
  match.id,
  requestedAt,
  plan.status,
  scheduledFor,
  latestContextSnapshot?.id ?? null,
  JSON.stringify(predictionInput.taskTypes),
  JSON.stringify(predictionInput.dataOptions),
  predictionInput.promptTemplateId,
  predictionInput.customPrompt,
  predictionInput.outputStyle
);
```

Return:

```ts
const response: PredictionRequestResponseDto = {
  matchId: match.id,
  status: plan.status,
  message: plan.message,
  scheduledFor,
  context
};
```

- [ ] **Step 5: Run prediction request tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/publicPredictionRequest.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/public/public.routes.ts apps/api/test/publicPredictionRequest.test.ts
git commit -m "feat: store prediction request options"
```

---

## Task 6: Expand Built-In Prompt Templates

**Files:**

- Modify: `apps/api/src/modules/admin/builtInPromptTemplates.ts`
- Modify: `apps/api/test/adminConfig.test.ts`

- [ ] **Step 1: Update failing prompt seed test**

Change `builtInPromptTemplateNames` in `apps/api/test/adminConfig.test.ts`:

```ts
const builtInPromptTemplateNames = [
  "稳健胜平负预测",
  "比分预测",
  "赔率驱动预测",
  "球员阵容影响",
  "历史交锋模型",
  "爆冷风险评估",
  "综合赛前报告"
];
```

In the seed test, add:

```ts
expect(templates.every((template) => template.fullPrompt.includes("prediction_context"))).toBe(true);
expect(templates.every((template) => template.fullPrompt.includes("不得编造"))).toBe(true);
```

- [ ] **Step 2: Run admin config test to verify it fails**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/adminConfig.test.ts
```

Expected: FAIL because only four built-ins exist and prompts do not include the new context safety rules.

- [ ] **Step 3: Replace built-in prompt list**

Update `apps/api/src/modules/admin/builtInPromptTemplates.ts` so each template includes:

```ts
const contextRules =
  "你必须只使用 prediction_context 中已经提供的数据。对缺失的赔率、球员、伤停、阵容、历史交锋或官方预测，必须写明未获取；不得编造任何球员状态、伤停、历史战绩、赔率或阵容信息。如果赔率与模型判断冲突，必须解释冲突。输出必须包含结构化字段和中文摘要。";
```

Use seven template objects with stable ids:

```ts
{
  id: "builtin-prompt-odds-driven",
  name: "赔率驱动预测",
  description: "重点解释胜平负赔率、盘口、大小球和市场过热。",
  fullPrompt: `${contextRules}\n请基于 prediction_context 分析 {{homeTeam}} 对阵 {{awayTeam}}。重点解释赔率信号、盘口含义、大小球倾向、赔率与赛果判断是否冲突，并输出 predictedResult、probabilities、oddsInterpretation、riskPoints 和 shortReason。`,
  promptSummary: "赔率、盘口和市场信号",
  scope: "match_prediction",
  enabled: true,
  isDefault: false
}
```

Add equivalent objects for:

- `builtin-prompt-steady-1x2`
- `builtin-prompt-scoreline`
- `builtin-prompt-player-lineup`
- `builtin-prompt-head-to-head`
- `builtin-prompt-upset-risk`
- `builtin-prompt-comprehensive-report`

- [ ] **Step 4: Run admin config test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/adminConfig.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/builtInPromptTemplates.ts apps/api/test/adminConfig.test.ts
git commit -m "feat: expand prediction prompt templates"
```

---

## Task 7: Web Client And Drawers

**Files:**

- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Create: `apps/web/src/components/BottomDrawer.tsx`
- Create: `apps/web/src/components/PredictionRequestDrawer.tsx`
- Create: `apps/web/src/components/MatchContextDrawer.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/client.test.ts`
- Test: `apps/web/test/fixturesPage.test.tsx`
- Create: `apps/web/test/predictionDrawer.test.tsx`
- Create: `apps/web/test/matchContextDrawer.test.tsx`

- [ ] **Step 1: Add failing client tests**

In `apps/web/test/client.test.ts`, add imports:

```ts
  getMatchContext,
  refreshMatchContext,
```

Add tests:

```ts
it("loads public match context", async () => {
  const context = {
    matchId: "match-1",
    completeness: "base_only",
    createdAt: null,
    domains: []
  };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(context), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  );

  await expect(getMatchContext("match-1")).resolves.toEqual(context);
  expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/public/matches/match-1/context");
});

it("refreshes public match context", async () => {
  const context = {
    matchId: "match-1",
    completeness: "partial",
    createdAt: "2026-06-13T08:00:00.000Z",
    domains: []
  };
  const dataOptions = {
    useOdds: true,
    useApiFootballPrediction: true,
    useHeadToHead: true,
    usePlayerLineupInjuries: true
  };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(context), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  );

  await expect(refreshMatchContext("match-1", dataOptions)).resolves.toEqual(context);
  expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/public/matches/match-1/context/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataOptions })
  });
});
```

Update the existing `requestMatchPrediction` test to expect a JSON body matching `PredictionRequestInputDto`.

- [ ] **Step 2: Run client test to verify it fails**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- --run test/client.test.ts
```

Expected: FAIL because client functions do not exist and prediction request does not send a body.

- [ ] **Step 3: Implement client functions**

In `apps/web/src/api/client.ts`, import shared DTOs:

```ts
  FixtureContextSummaryDto,
  PredictionDataOptionsDto,
  PredictionRequestInputDto,
```

Add:

```ts
export async function getMatchContext(matchId: string): Promise<FixtureContextSummaryDto> {
  const response = await request(`${apiBaseUrl}/api/public/matches/${matchId}/context`);
  if (!response.ok) {
    throw new Error(`Public match context request failed with status ${response.status}`);
  }
  return (await response.json()) as FixtureContextSummaryDto;
}

export async function refreshMatchContext(matchId: string, dataOptions: PredictionDataOptionsDto): Promise<FixtureContextSummaryDto> {
  const response = await request(`${apiBaseUrl}/api/public/matches/${matchId}/context/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataOptions })
  });
  if (!response.ok) {
    throw new Error(`Public match context refresh failed with status ${response.status}`);
  }
  return (await response.json()) as FixtureContextSummaryDto;
}

export async function requestMatchPrediction(matchId: string, input: PredictionRequestInputDto): Promise<PredictionRequestResponseDto> {
  const response = await request(`${apiBaseUrl}/api/public/matches/${matchId}/prediction-request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Public prediction request failed with status ${response.status}`);
  }
  return (await response.json()) as PredictionRequestResponseDto;
}
```

Remove or update the old single-argument `requestMatchPrediction` definition.

- [ ] **Step 4: Add drawer component tests**

Create `apps/web/test/predictionDrawer.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MatchDto, PromptTemplateConfigDto } from "@worldcup-ai-pk/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PredictionRequestDrawer } from "../src/components/PredictionRequestDrawer";

const match: MatchDto = {
  id: "match-1",
  apiFootballFixtureId: 1001,
  stage: "Group Stage - 1",
  kickoffAt: "2026-06-13T19:00:00.000Z",
  status: "scheduled",
  statusLabelZh: "未开始",
  venue: "BMO Field",
  homeTeam: { id: "home", name: "Home", displayNameZh: "主队", logoUrl: null },
  awayTeam: { id: "away", name: "Away", displayNameZh: "客队", logoUrl: null },
  homeScore: null,
  awayScore: null,
  hasAiPrediction: false,
  canRequestPrediction: true
};

const promptTemplates: PromptTemplateConfigDto[] = [
  {
    id: "prompt-1",
    name: "综合赛前报告",
    description: "综合分析",
    fullPrompt: "prediction_context",
    promptSummary: "综合分析",
    scope: "match_prediction",
    enabled: true,
    isDefault: true
  }
];

describe("PredictionRequestDrawer", () => {
  afterEach(cleanup);

  it("submits default task package and data options", () => {
    const onSubmit = vi.fn();
    render(<PredictionRequestDrawer open match={match} promptTemplates={promptTemplates} onClose={vi.fn()} onSubmit={onSubmit} submitting={false} />);

    fireEvent.click(screen.getByRole("button", { name: "开始预测" }));

    expect(onSubmit).toHaveBeenCalledWith({
      taskTypes: ["result_1x2", "scoreline", "odds_interpretation"],
      dataOptions: {
        useOdds: true,
        useApiFootballPrediction: true,
        useHeadToHead: true,
        usePlayerLineupInjuries: true
      },
      promptTemplateId: "prompt-1",
      customPrompt: "",
      outputStyle: "concise",
      refreshContext: true
    });
  });
});
```

Create `apps/web/test/matchContextDrawer.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import type { FixtureContextSummaryDto, MatchDto } from "@worldcup-ai-pk/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchContextDrawer } from "../src/components/MatchContextDrawer";

const match = {
  id: "match-1",
  homeTeam: { displayNameZh: "主队" },
  awayTeam: { displayNameZh: "客队" }
} as MatchDto;

const context: FixtureContextSummaryDto = {
  matchId: "match-1",
  completeness: "partial",
  createdAt: "2026-06-13T08:00:00.000Z",
  domains: [
    { domain: "odds", status: "cached", summary: "主胜 2.10", lastSyncedAt: "2026-06-13T08:00:00.000Z", error: null },
    { domain: "squad", status: "refresh_failed", summary: "未获取", lastSyncedAt: "2026-06-13T08:01:00.000Z", error: "API-Football returned errors" }
  ]
};

describe("MatchContextDrawer", () => {
  afterEach(cleanup);

  it("shows cached and failed context domains", () => {
    render(<MatchContextDrawer open match={match} context={context} loading={false} onClose={vi.fn()} onRefresh={vi.fn()} />);

    expect(screen.getByText("主队 vs 客队")).toBeInTheDocument();
    expect(screen.getByText("主胜 2.10")).toBeInTheDocument();
    expect(screen.getByText("刷新失败")).toBeInTheDocument();
    expect(screen.getByText("API-Football returned errors")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run drawer tests to verify they fail**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- --run test/predictionDrawer.test.tsx test/matchContextDrawer.test.tsx
```

Expected: FAIL because drawer components do not exist.

- [ ] **Step 6: Implement `BottomDrawer`**

Create `apps/web/src/components/BottomDrawer.tsx`:

```tsx
import type { ReactNode } from "react";

interface BottomDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function BottomDrawer({ open, title, onClose, children }: BottomDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="drawer-layer" role="presentation">
      <button className="drawer-backdrop" type="button" aria-label="关闭抽屉" onClick={onClose} />
      <section className="bottom-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label="关闭">
            关闭
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Implement `PredictionRequestDrawer`**

Create `apps/web/src/components/PredictionRequestDrawer.tsx` with checkbox state for task types and data options. The default state must match the test. The submit button calls `onSubmit(input)`.

Use exact labels:

- `胜平负`
- `比分预测`
- `赔率解读`
- `球员/阵容影响`
- `历史交锋`
- `爆冷风险`
- `自动刷新预测数据`
- `使用赔率`
- `使用官方预测`
- `使用历史交锋`
- `使用球员/阵容/伤停`
- `简洁结论`
- `详细报告`

- [ ] **Step 8: Implement `MatchContextDrawer`**

Create `apps/web/src/components/MatchContextDrawer.tsx` and map status labels:

```ts
const contextStatusLabels = {
  cached: "已缓存",
  unavailable: "未获取",
  refresh_failed: "刷新失败",
  not_requested: "未请求"
};
```

- [ ] **Step 9: Wire `FixturesPage`**

In `apps/web/src/pages/FixturesPage.tsx`:

- Add props:

```ts
promptTemplates: PromptTemplateConfigDto[];
onLoadMatchContext: (matchId: string) => Promise<FixtureContextSummaryDto>;
onRefreshMatchContext: (matchId: string, dataOptions: PredictionDataOptionsDto) => Promise<FixtureContextSummaryDto>;
onRequestPrediction: (match: MatchDto, input: PredictionRequestInputDto) => Promise<PredictionRequestResponseDto>;
```

- Replace scheduled card action with `预测`.
- Add `数据` action for all match statuses.
- Manage `activePredictionMatch`, `activeContextMatch`, and context state.
- Open `PredictionRequestDrawer` and `MatchContextDrawer`.

- [ ] **Step 10: Update `App.tsx`**

Load prompt templates with `listAdminPromptTemplates()` for now because prompt templates are local admin-backed and already exposed in the client. Pass:

```tsx
<FixturesPage
  matches={matches}
  promptTemplates={promptTemplates}
  onLoadMatchContext={getMatchContext}
  onRefreshMatchContext={refreshMatchContext}
  onRequestPrediction={handleRequestPrediction}
/>
```

Update `handleRequestPrediction` signature:

```ts
async function handleRequestPrediction(match: MatchDto, input: PredictionRequestInputDto) {
  const response = await requestMatchPrediction(match.id, input);
  try {
    setMatches(await getPublicMatches());
  } catch {
    // The request feedback is still useful even if the immediate refresh fails.
  }
  return response;
}
```

- [ ] **Step 11: Add drawer and mobile CSS**

In `apps/web/src/styles.css`, add:

```css
.drawer-layer {
  inset: 0;
  position: fixed;
  z-index: 50;
}

.drawer-backdrop {
  background: rgba(23, 32, 38, 0.34);
  border: 0;
  height: 100%;
  inset: 0;
  position: absolute;
  width: 100%;
}

.bottom-drawer {
  background: #ffffff;
  border-radius: 16px 16px 0 0;
  bottom: 0;
  box-shadow: 0 -18px 48px rgba(23, 32, 38, 0.18);
  display: grid;
  gap: 16px;
  left: 0;
  max-height: min(86vh, 760px);
  overflow: auto;
  padding: 18px;
  position: absolute;
  right: 0;
}

.drawer-option-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.drawer-option-grid label,
.drawer-field {
  border: 1px solid #d8dee4;
  border-radius: 8px;
  display: grid;
  gap: 6px;
  padding: 10px;
}

@media (min-width: 780px) {
  .bottom-drawer {
    border-radius: 16px;
    bottom: 24px;
    left: auto;
    max-width: 520px;
    right: 24px;
  }
}

@media (max-width: 720px) {
  .match-card {
    gap: 12px;
    padding: 16px;
  }

  .team-line {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .team-line small {
    grid-column: 2;
  }

  .match-action {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .match-action button {
    flex: 1 1 120px;
    min-height: 42px;
  }

  .drawer-option-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 12: Run web tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- --run test/client.test.ts test/fixturesPage.test.tsx test/predictionDrawer.test.tsx test/matchContextDrawer.test.tsx test/app.test.tsx
```

Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/api/client.ts apps/web/src/App.tsx apps/web/src/pages/FixturesPage.tsx apps/web/src/components/BottomDrawer.tsx apps/web/src/components/PredictionRequestDrawer.tsx apps/web/src/components/MatchContextDrawer.tsx apps/web/src/styles.css apps/web/test/client.test.ts apps/web/test/fixturesPage.test.tsx apps/web/test/predictionDrawer.test.tsx apps/web/test/matchContextDrawer.test.tsx apps/web/test/app.test.tsx
git commit -m "feat: add mobile prediction drawers"
```

---

## Task 8: Admin Data Cache Module

**Files:**

- Modify: `apps/api/src/modules/admin/adminConfig.repository.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/pages/AdminPage.tsx`
- Test: `apps/api/test/adminConfig.test.ts`
- Test: `apps/web/test/adminPage.test.tsx`

- [ ] **Step 1: Add failing admin cache summary API test**

In `apps/api/test/adminConfig.test.ts`, add:

```ts
it("returns fixture context sync status for admin cache module", async () => {
  const { db, databasePath } = createTestDatabase();
  db.prepare(
    `
      INSERT INTO fixture_data_sync_logs (id, match_id, domain, status, error, synced_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run("log-1", "match-1", "odds", "cached", null, "2026-06-13T08:00:00.000Z");
  db.close();

  const app = buildApp({ databasePath, logger: false });
  const response = await app.inject({ method: "GET", url: "/api/admin/context-cache", remoteAddress: "127.0.0.1" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    logs: [
      {
        matchId: "match-1",
        domain: "odds",
        status: "cached",
        error: null,
        syncedAt: "2026-06-13T08:00:00.000Z"
      }
    ]
  });

  await app.close();
});
```

- [ ] **Step 2: Implement admin repository and route**

Add to `apps/api/src/modules/admin/adminConfig.repository.ts`:

```ts
export function listContextCacheLogs(db: Database) {
  const rows = db
    .prepare(
      `
        SELECT match_id, domain, status, error, synced_at
        FROM fixture_data_sync_logs
        ORDER BY synced_at DESC
        LIMIT 100
      `
    )
    .all() as Array<{ match_id: string; domain: string; status: string; error: string | null; synced_at: string }>;

  return rows.map((row) => ({
    matchId: row.match_id,
    domain: row.domain,
    status: row.status,
    error: row.error,
    syncedAt: row.synced_at
  }));
}
```

Import and add to `apps/api/src/modules/admin/admin.routes.ts`:

```ts
app.get("/context-cache", async () => ({
  logs: listContextCacheLogs(options.db)
}));
```

- [ ] **Step 3: Add frontend admin module**

Add client method in `apps/web/src/api/client.ts`:

```ts
export interface AdminContextCacheLogDto {
  matchId: string;
  domain: string;
  status: string;
  error: string | null;
  syncedAt: string;
}

export async function listAdminContextCacheLogs(): Promise<AdminContextCacheLogDto[]> {
  const response = await request(`${apiBaseUrl}/api/admin/context-cache`);
  if (!response.ok) {
    throw new Error(`Admin context cache request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { logs: AdminContextCacheLogDto[] };
  return body.logs;
}
```

In `apps/web/src/pages/AdminPage.tsx`:

- Add admin module id `context-cache`.
- Load `contextCacheLogs`.
- Render a table with columns `比赛`, `数据域`, `状态`, `错误`, `同步时间`.

- [ ] **Step 4: Run admin tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/adminConfig.test.ts
corepack pnpm --filter @worldcup-ai-pk/web test -- --run test/adminPage.test.tsx test/client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/adminConfig.repository.ts apps/api/src/modules/admin/admin.routes.ts apps/api/test/adminConfig.test.ts apps/web/src/api/client.ts apps/web/src/pages/AdminPage.tsx apps/web/test/adminPage.test.tsx apps/web/test/client.test.ts
git commit -m "feat: show context cache status"
```

---

## Task 9: Full Verification And Browser QA

**Files:**

- No source edits unless verification finds a defect.

- [ ] **Step 1: Run full tests**

Run:

```bash
corepack pnpm --recursive test
```

Expected: PASS. API test count and Web test count may increase from prior totals because this plan adds new tests.

- [ ] **Step 2: Run typecheck**

Run:

```bash
corepack pnpm --recursive typecheck
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
corepack pnpm --recursive build
```

Expected: PASS.

- [ ] **Step 4: Verify local services**

Run:

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN
lsof -nP -iTCP:5174 -sTCP:LISTEN
```

Expected: API listens on `127.0.0.1:4000`; Web listens on a Vite port such as `127.0.0.1:5174`. If Web uses a different Vite port, use that exact port for browser QA.

- [ ] **Step 5: Browser QA desktop**

Use Browser/IAB:

- Open the Web URL.
- Confirm title is `世界杯 AI PK`.
- Confirm fixture page is not blank.
- Confirm no Vite or React error overlay appears.
- Confirm console has no relevant `error` or `warn`.
- Click a scheduled match `预测`.
- Confirm drawer opens.
- Confirm default selected task package includes `胜平负`, `比分预测`, and `赔率解读`.
- Submit.
- Confirm request status feedback appears.
- Open `数据`.
- Confirm cached or degraded context state appears.

- [ ] **Step 6: Browser QA mobile**

Set viewport to `390x844`.

Verify:

- Metrics are two columns.
- Match card content does not overlap.
- `预测` and `数据` buttons fit.
- Bottom drawer is usable without horizontal scrolling.
- Drawer submit button remains visible after scrolling to the bottom.

- [ ] **Step 7: Commit QA fixes if needed**

If browser QA finds source defects, fix them with focused tests and commit:

```bash
git add <changed-files>
git commit -m "fix: polish mobile prediction context"
```

- [ ] **Step 8: Final status**

Run:

```bash
git status --short
```

Expected: no uncommitted source changes other than user-owned changes that predated execution.
