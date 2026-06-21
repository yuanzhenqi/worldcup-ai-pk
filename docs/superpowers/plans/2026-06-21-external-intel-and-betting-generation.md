# External Intel And Betting Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend-owned websearch intelligence pipeline, inject it into AI betting prompts, support concurrent per-model generation, and expose input completeness in the UI.

**Architecture:** Implement external intelligence as a focused API module with repository, websearch provider, collector, and prompt summarizer boundaries. Betting arena generation will call the collector before building `battle_context`, then all models consume the same cached intelligence. UI changes are limited to admin configuration, betting input audit, per-model request state, and portfolio bucket display.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, React, Vite, Vitest, Testing Library, pnpm, existing OpenAI-compatible model client.

## Global Constraints

- API-Football is only used for schedule fields: kickoff time, venue, teams, status, and score.
- Sporttery remains the only source for purchasable betting pools, options, and odds.
- First implementation does not add a real market value data source; missing market value stays visible as a data gap.
- First implementation uses search result title, snippet, URL, source domain, and available publish time; it does not fetch article full text.
- First implementation does not depend on Kimi `$web_search`, Perplexity, Gemini grounding, or OpenAI Responses API web search.
- Search failure must not block betting generation; it must produce structured data gaps and logs.
- Keep existing user changes in the dirty worktree. Do not revert unrelated files.

---

## File Structure

- Create `apps/api/src/modules/external-intel/externalIntel.types.ts`
  - Shared API-side types for search results, snapshots, summaries, settings, and structured data gaps.
- Create `apps/api/src/modules/external-intel/externalIntel.repository.ts`
  - Reads and writes app settings and `fixture_external_intel_snapshots`.
- Create `apps/api/src/modules/external-intel/webSearchProvider.ts`
  - Defines `WebSearchProvider` and a DuckDuckGo HTML implementation that returns normalized search results.
- Create `apps/api/src/modules/external-intel/externalIntelCollector.ts`
  - Builds search queries, runs websearch, summarizes results, caches snapshots.
- Create `apps/api/test/externalIntelRepository.test.ts`
  - Verifies schema, settings, cache lookup, and snapshot persistence.
- Create `apps/api/test/externalIntelCollector.test.ts`
  - Verifies query building, successful collection, cache reuse, and failure behavior.
- Modify `apps/api/src/db/schema.sql`
  - Adds `fixture_external_intel_snapshots`.
- Modify `apps/api/src/modules/settings/settings.repository.ts`
  - Adds external intelligence settings.
- Modify `apps/api/src/modules/admin/admin.routes.ts`
  - Adds admin endpoints for external intelligence settings and manual refresh.
- Modify `apps/api/src/modules/betting-arena/bettingArena.context.ts`
  - Reads external intelligence snapshots and injects them into `battle_context.matches[]`.
- Modify `apps/api/src/modules/betting-arena/bettingArena.service.ts`
  - Runs collection before round generation and adds per-model generation state protection.
- Modify `apps/api/src/modules/betting-arena/bettingArenaPrompts.ts`
  - Adds external intelligence and portfolio bucket instructions.
- Modify `apps/api/src/modules/betting-arena/bettingArenaSlip.ts`
  - Parses `portfolio_buckets`.
- Modify `packages/shared/src/types.ts`
  - Adds external intelligence DTOs, structured data gap DTO, portfolio bucket DTO, and admin settings DTO.
- Modify `apps/web/src/api/client.ts`
  - Adds external intelligence settings and refresh API calls.
- Modify `apps/web/src/pages/AdminPage.tsx`
  - Adds external intelligence settings controls.
- Modify `apps/web/src/pages/BettingArenaPage.tsx`
  - Shows external intelligence, data completeness, portfolio buckets, and concurrent model status.
- Modify `apps/web/test/adminPage.test.tsx`
  - Covers settings UI.
- Modify `apps/web/test/bettingArenaPage.test.tsx`
  - Covers input audit, external intelligence, portfolio buckets, and concurrent buttons.
- Modify `apps/api/test/bettingArenaApi.test.ts`, `apps/api/test/bettingArenaPrompts.test.ts`, `apps/api/test/bettingArenaSlip.test.ts`
  - Covers integration, prompt contract, and output parsing.

---

### Task 1: External Intelligence Schema, Types, And Repository

**Files:**
- Create: `apps/api/src/modules/external-intel/externalIntel.types.ts`
- Create: `apps/api/src/modules/external-intel/externalIntel.repository.ts`
- Create: `apps/api/test/externalIntelRepository.test.ts`
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/src/modules/settings/settings.repository.ts`
- Modify: `packages/shared/src/types.ts`

**Interfaces:**
- Produces:
  - `ExternalIntelStatus = "cached" | "not_configured" | "failed" | "summary_failed"`
  - `StructuredDataGapDto`
  - `ExternalIntelSummaryDto`
  - `ExternalIntelSnapshotDto`
  - `ExternalIntelSettingsDto`
  - `getExternalIntelSettings(db: Database): ExternalIntelSettings`
  - `saveExternalIntelSettings(db: Database, input: SaveExternalIntelSettingsInput, now?: Date): ExternalIntelSettings`
  - `insertExternalIntelSnapshot(db: Database, input: InsertExternalIntelSnapshotInput): ExternalIntelSnapshotRow`
  - `getFreshExternalIntelSnapshot(db: Database, input: { matchId: string; now: Date }): ExternalIntelSnapshotRow | null`
  - `getLatestExternalIntelSnapshotByMatch(db: Database, matchId: string): ExternalIntelSnapshotRow | null`

- Consumes: existing `app_settings`, `matches`, and schema migration pattern in `apps/api/src/db/schema.sql`.

- [ ] **Step 1: Add shared DTO test expectations**

Create `apps/api/test/externalIntelRepository.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "./helpers/database";
import {
  getExternalIntelSettings,
  getFreshExternalIntelSnapshot,
  getLatestExternalIntelSnapshotByMatch,
  insertExternalIntelSnapshot,
  saveExternalIntelSettings
} from "../src/modules/external-intel/externalIntel.repository";

describe("external intelligence repository", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses disabled defaults when no settings exist", () => {
    const { db } = createTestDatabase();

    expect(getExternalIntelSettings(db)).toEqual({
      enabled: false,
      provider: "duckduckgo_html",
      summarizerModelId: "",
      cacheMinutes: 60,
      maxResultsPerQuery: 5,
      maxQueriesPerMatch: 4
    });
  });

  it("saves and reads external intelligence settings", () => {
    const { db } = createTestDatabase();

    expect(
      saveExternalIntelSettings(
        db,
        {
          enabled: true,
          provider: "duckduckgo_html",
          summarizerModelId: "model-1",
          cacheMinutes: 45,
          maxResultsPerQuery: 6,
          maxQueriesPerMatch: 3
        },
        new Date("2026-06-21T10:00:00.000Z")
      )
    ).toEqual({
      enabled: true,
      provider: "duckduckgo_html",
      summarizerModelId: "model-1",
      cacheMinutes: 45,
      maxResultsPerQuery: 6,
      maxQueriesPerMatch: 3
    });

    expect(getExternalIntelSettings(db).summarizerModelId).toBe("model-1");
  });

  it("stores latest and fresh snapshots by match", () => {
    const { db } = createTestDatabase();
    db.prepare(
      `INSERT INTO matches (
        id, api_football_fixture_id, stage, kickoff_at, status, venue,
        home_team_id, home_team_name, away_team_id, away_team_name, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "match-1",
      1001,
      "Group Stage",
      "2026-06-22T10:00:00.000Z",
      "scheduled",
      "Test Stadium",
      "home-1",
      "Germany",
      "away-1",
      "Japan",
      "2026-06-21T10:00:00.000Z"
    );

    const row = insertExternalIntelSnapshot(db, {
      id: "intel-1",
      matchId: "match-1",
      provider: "duckduckgo_html",
      queryJson: JSON.stringify(["Germany Japan team news"]),
      searchResultsJson: JSON.stringify([{ title: "Team news", url: "https://example.com/news", snippet: "Lineup notes" }]),
      summaryJson: JSON.stringify({ status: "cached", summary: "Lineup notes", sourceLinks: [{ title: "Team news", url: "https://example.com/news" }], dataGaps: [] }),
      status: "cached",
      error: null,
      collectedAt: "2026-06-21T10:00:00.000Z",
      expiresAt: "2026-06-21T11:00:00.000Z",
      createdAt: "2026-06-21T10:00:00.000Z"
    });

    expect(row).toMatchObject({ id: "intel-1", match_id: "match-1", status: "cached" });
    expect(getLatestExternalIntelSnapshotByMatch(db, "match-1")).toMatchObject({ id: "intel-1" });
    expect(getFreshExternalIntelSnapshot(db, { matchId: "match-1", now: new Date("2026-06-21T10:30:00.000Z") })).toMatchObject({ id: "intel-1" });
    expect(getFreshExternalIntelSnapshot(db, { matchId: "match-1", now: new Date("2026-06-21T11:30:00.000Z") })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @worldcup-ai-pk/api test -- externalIntelRepository.test.ts`

Expected: FAIL with module-not-found errors for `externalIntel.repository`.

- [ ] **Step 3: Add shared types**

Modify `packages/shared/src/types.ts` near existing betting arena types:

```ts
export type ExternalIntelStatus = "cached" | "not_configured" | "failed" | "summary_failed";

export interface StructuredDataGapDto {
  source: string;
  code: string;
  message: string;
}

export interface ExternalIntelSourceLinkDto {
  title: string;
  url: string;
  sourceDomain: string;
  publishedAt: string | null;
}

export interface ExternalIntelSummaryDto {
  status: ExternalIntelStatus;
  summary: string;
  injuryNews: string[];
  lineupNews: string[];
  motivation: string[];
  recentFormNews: string[];
  riskSignals: string[];
  sourceLinks: ExternalIntelSourceLinkDto[];
  confidence: "low" | "medium" | "high";
  dataGaps: Array<string | StructuredDataGapDto>;
  collectedAt: string | null;
}

export interface ExternalIntelSettingsDto {
  enabled: boolean;
  provider: "duckduckgo_html";
  summarizerModelId: string;
  cacheMinutes: number;
  maxResultsPerQuery: number;
  maxQueriesPerMatch: number;
}

export interface ExternalIntelSnapshotDto {
  id: string;
  matchId: string;
  provider: string;
  status: ExternalIntelStatus;
  searchResults: Array<{
    title: string;
    url: string;
    snippet: string;
    sourceDomain: string;
    publishedAt: string | null;
  }>;
  summary: ExternalIntelSummaryDto;
  error: string | null;
  collectedAt: string;
  expiresAt: string;
}

export interface BettingArenaPortfolioBucketDto {
  bucket: "safe" | "value" | "hedge" | "upset" | "avoid";
  label: string;
  stake: number;
  rationale: string;
  items: string[];
}
```

Extend `BettingArenaSlipDto`:

```ts
portfolioBuckets: BettingArenaPortfolioBucketDto[];
```

- [ ] **Step 4: Add schema**

Modify `apps/api/src/db/schema.sql` after `fixture_data_sync_logs`:

```sql
CREATE TABLE IF NOT EXISTS fixture_external_intel_snapshots (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  query_json TEXT NOT NULL,
  search_results_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  collected_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fixture_external_intel_match_expires
  ON fixture_external_intel_snapshots(match_id, expires_at, created_at);
```

- [ ] **Step 5: Implement API-side types**

Create `apps/api/src/modules/external-intel/externalIntel.types.ts`:

```ts
import type { ExternalIntelSettingsDto, ExternalIntelStatus, ExternalIntelSummaryDto, StructuredDataGapDto } from "@worldcup-ai-pk/shared";

export type ExternalIntelSettings = ExternalIntelSettingsDto;

export interface SaveExternalIntelSettingsInput {
  enabled: boolean;
  provider: "duckduckgo_html";
  summarizerModelId: string;
  cacheMinutes: number;
  maxResultsPerQuery: number;
  maxQueriesPerMatch: number;
}

export interface ExternalIntelSearchResult {
  title: string;
  url: string;
  snippet: string;
  sourceDomain: string;
  publishedAt: string | null;
}

export interface ExternalIntelSnapshotRow {
  id: string;
  match_id: string;
  provider: string;
  query_json: string;
  search_results_json: string;
  summary_json: string;
  status: ExternalIntelStatus;
  error: string | null;
  collected_at: string;
  expires_at: string;
  created_at: string;
}

export interface InsertExternalIntelSnapshotInput {
  id: string;
  matchId: string;
  provider: string;
  queryJson: string;
  searchResultsJson: string;
  summaryJson: string;
  status: ExternalIntelStatus;
  error: string | null;
  collectedAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface ExternalIntelCollectionResult {
  matchId: string;
  status: ExternalIntelStatus;
  queries: string[];
  searchResults: ExternalIntelSearchResult[];
  summary: ExternalIntelSummaryDto;
  dataGaps: Array<string | StructuredDataGapDto>;
}
```

- [ ] **Step 6: Implement settings helpers**

Append to `apps/api/src/modules/settings/settings.repository.ts`:

```ts
import type { ExternalIntelSettingsDto } from "@worldcup-ai-pk/shared";

const externalIntelEnabledKey = "externalIntel.enabled";
const externalIntelProviderKey = "externalIntel.provider";
const externalIntelSummarizerModelIdKey = "externalIntel.summarizerModelId";
const externalIntelCacheMinutesKey = "externalIntel.cacheMinutes";
const externalIntelMaxResultsPerQueryKey = "externalIntel.maxResultsPerQuery";
const externalIntelMaxQueriesPerMatchKey = "externalIntel.maxQueriesPerMatch";

function readSetting(db: Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function writeSetting(db: Database, key: string, value: string, now: Date): void {
  db.prepare(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `
  ).run(key, value, now.toISOString());
}

function readPositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getExternalIntelSettings(db: Database): ExternalIntelSettingsDto {
  const provider = readSetting(db, externalIntelProviderKey);
  return {
    enabled: readSetting(db, externalIntelEnabledKey) === "true",
    provider: provider === "duckduckgo_html" ? "duckduckgo_html" : "duckduckgo_html",
    summarizerModelId: readSetting(db, externalIntelSummarizerModelIdKey) ?? "",
    cacheMinutes: readPositiveInt(readSetting(db, externalIntelCacheMinutesKey), 60),
    maxResultsPerQuery: readPositiveInt(readSetting(db, externalIntelMaxResultsPerQueryKey), 5),
    maxQueriesPerMatch: readPositiveInt(readSetting(db, externalIntelMaxQueriesPerMatchKey), 4)
  };
}

export function saveExternalIntelSettings(db: Database, input: ExternalIntelSettingsDto, now = new Date()): ExternalIntelSettingsDto {
  writeSetting(db, externalIntelEnabledKey, input.enabled ? "true" : "false", now);
  writeSetting(db, externalIntelProviderKey, input.provider, now);
  writeSetting(db, externalIntelSummarizerModelIdKey, input.summarizerModelId, now);
  writeSetting(db, externalIntelCacheMinutesKey, String(input.cacheMinutes), now);
  writeSetting(db, externalIntelMaxResultsPerQueryKey, String(input.maxResultsPerQuery), now);
  writeSetting(db, externalIntelMaxQueriesPerMatchKey, String(input.maxQueriesPerMatch), now);
  return getExternalIntelSettings(db);
}
```

- [ ] **Step 7: Implement repository**

Create `apps/api/src/modules/external-intel/externalIntel.repository.ts`:

```ts
import type { Database } from "better-sqlite3";
import { getExternalIntelSettings, saveExternalIntelSettings } from "../settings/settings.repository";
import type { ExternalIntelSettings, ExternalIntelSnapshotRow, InsertExternalIntelSnapshotInput, SaveExternalIntelSettingsInput } from "./externalIntel.types";

export { getExternalIntelSettings, saveExternalIntelSettings };
export type { ExternalIntelSettings, SaveExternalIntelSettingsInput };

export function insertExternalIntelSnapshot(db: Database, input: InsertExternalIntelSnapshotInput): ExternalIntelSnapshotRow {
  db.prepare(
    `
      INSERT INTO fixture_external_intel_snapshots (
        id, match_id, provider, query_json, search_results_json, summary_json,
        status, error, collected_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    input.id,
    input.matchId,
    input.provider,
    input.queryJson,
    input.searchResultsJson,
    input.summaryJson,
    input.status,
    input.error,
    input.collectedAt,
    input.expiresAt,
    input.createdAt
  );

  return db.prepare("SELECT * FROM fixture_external_intel_snapshots WHERE id = ?").get(input.id) as ExternalIntelSnapshotRow;
}

export function getFreshExternalIntelSnapshot(db: Database, input: { matchId: string; now: Date }): ExternalIntelSnapshotRow | null {
  const row = db
    .prepare(
      `
        SELECT *
        FROM fixture_external_intel_snapshots
        WHERE match_id = ?
          AND expires_at > ?
        ORDER BY collected_at DESC, created_at DESC
        LIMIT 1
      `
    )
    .get(input.matchId, input.now.toISOString()) as ExternalIntelSnapshotRow | undefined;
  return row ?? null;
}

export function getLatestExternalIntelSnapshotByMatch(db: Database, matchId: string): ExternalIntelSnapshotRow | null {
  const row = db
    .prepare(
      `
        SELECT *
        FROM fixture_external_intel_snapshots
        WHERE match_id = ?
        ORDER BY collected_at DESC, created_at DESC
        LIMIT 1
      `
    )
    .get(matchId) as ExternalIntelSnapshotRow | undefined;
  return row ?? null;
}
```

- [ ] **Step 8: Run repository tests**

Run: `corepack pnpm --filter @worldcup-ai-pk/api test -- externalIntelRepository.test.ts`

Expected: PASS.

- [ ] **Step 9: Run typecheck**

Run: `corepack pnpm --filter @worldcup-ai-pk/api typecheck`

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```bash
git add packages/shared/src/types.ts apps/api/src/db/schema.sql apps/api/src/modules/settings/settings.repository.ts apps/api/src/modules/external-intel apps/api/test/externalIntelRepository.test.ts
git commit -m "feat: add external intel repository"
```

---

### Task 2: Websearch Provider And External Intelligence Collector

**Files:**
- Create: `apps/api/src/modules/external-intel/webSearchProvider.ts`
- Create: `apps/api/src/modules/external-intel/externalIntelCollector.ts`
- Create: `apps/api/test/externalIntelCollector.test.ts`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes:
  - `ExternalIntelSearchResult`, `ExternalIntelCollectionResult`
  - `getExternalIntelSettings`, `getFreshExternalIntelSnapshot`, `insertExternalIntelSnapshot`
  - `getAiModelConnectionConfig(db, modelId)`
  - `runOpenAiCompatiblePrediction(config, prompt)`
- Produces:
  - `interface WebSearchProvider { search(input: WebSearchInput): Promise<ExternalIntelSearchResult[]> }`
  - `class DuckDuckGoHtmlWebSearchProvider implements WebSearchProvider`
  - `buildExternalIntelQueries(input: ExternalIntelQueryInput): string[]`
  - `collectExternalIntelForMatch(db, input): Promise<ExternalIntelCollectionResult>`

- [ ] **Step 1: Add dependency**

Run: `corepack pnpm --filter @worldcup-ai-pk/api add cheerio`

Expected: `apps/api/package.json` contains `cheerio`, and `pnpm-lock.yaml` changes.

- [ ] **Step 2: Write collector tests**

Create `apps/api/test/externalIntelCollector.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { WebSearchProvider } from "../src/modules/external-intel/webSearchProvider";
import { buildExternalIntelQueries, collectExternalIntelForMatch } from "../src/modules/external-intel/externalIntelCollector";
import { createTestDatabase } from "./helpers/database";

function seedMatch(db: ReturnType<typeof createTestDatabase>["db"]) {
  db.prepare(
    `INSERT INTO matches (
      id, api_football_fixture_id, stage, kickoff_at, status, venue,
      home_team_id, home_team_name, away_team_id, away_team_name, last_synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "match-1",
    1001,
    "Group Stage",
    "2026-06-22T10:00:00.000Z",
    "scheduled",
    "Test Stadium",
    "home-1",
    "Germany",
    "away-1",
    "Japan",
    "2026-06-21T10:00:00.000Z"
  );
}

describe("external intelligence collector", () => {
  it("builds bilingual match queries", () => {
    expect(
      buildExternalIntelQueries({
        homeTeamName: "Germany",
        awayTeamName: "Japan",
        kickoffAt: "2026-06-22T10:00:00.000Z",
        maxQueries: 4
      })
    ).toEqual([
      "Germany Japan 伤停 首发 世界杯",
      "Germany Japan injury lineup World Cup",
      "Germany Japan press conference team news",
      "Germany Japan motivation rotation World Cup"
    ]);
  });

  it("collects search results and writes a cached summary without a summarizer model", async () => {
    const { db } = createTestDatabase();
    seedMatch(db);
    const provider: WebSearchProvider = {
      search: vi.fn().mockResolvedValue([
        {
          title: "Germany team news",
          url: "https://example.com/germany-news",
          snippet: "Germany may rotate midfield.",
          sourceDomain: "example.com",
          publishedAt: "2026-06-21T09:00:00.000Z"
        }
      ])
    };

    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("externalIntel.enabled", "true", "2026-06-21T10:00:00.000Z");

    const result = await collectExternalIntelForMatch(db, {
      matchId: "match-1",
      homeTeamName: "Germany",
      awayTeamName: "Japan",
      kickoffAt: "2026-06-22T10:00:00.000Z",
      webSearchProvider: provider,
      now: new Date("2026-06-21T10:00:00.000Z"),
      forceRefresh: false
    });

    expect(provider.search).toHaveBeenCalledTimes(4);
    expect(result.summary.status).toBe("summary_failed");
    expect(result.summary.summary).toContain("Germany team news");
    expect(result.summary.sourceLinks[0]).toMatchObject({ url: "https://example.com/germany-news" });
  });

  it("reuses a fresh cached snapshot", async () => {
    const { db } = createTestDatabase();
    seedMatch(db);
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("externalIntel.enabled", "true", "2026-06-21T10:00:00.000Z");
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
      JSON.stringify({ status: "cached", summary: "Cached summary", sourceLinks: [], dataGaps: [], collectedAt: "2026-06-21T10:00:00.000Z" }),
      "cached",
      null,
      "2026-06-21T10:00:00.000Z",
      "2026-06-21T11:00:00.000Z",
      "2026-06-21T10:00:00.000Z"
    );
    const provider: WebSearchProvider = { search: vi.fn() };

    const result = await collectExternalIntelForMatch(db, {
      matchId: "match-1",
      homeTeamName: "Germany",
      awayTeamName: "Japan",
      kickoffAt: "2026-06-22T10:00:00.000Z",
      webSearchProvider: provider,
      now: new Date("2026-06-21T10:30:00.000Z"),
      forceRefresh: false
    });

    expect(provider.search).not.toHaveBeenCalled();
    expect(result.summary.summary).toBe("Cached summary");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `corepack pnpm --filter @worldcup-ai-pk/api test -- externalIntelCollector.test.ts`

Expected: FAIL with missing module errors.

- [ ] **Step 4: Implement websearch provider**

Create `apps/api/src/modules/external-intel/webSearchProvider.ts`:

```ts
import { load } from "cheerio";
import type { ExternalIntelSearchResult } from "./externalIntel.types";

export interface WebSearchInput {
  query: string;
  maxResults: number;
}

export interface WebSearchProvider {
  search(input: WebSearchInput): Promise<ExternalIntelSearchResult[]>;
}

function getSourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeDuckDuckGoUrl(value: string): string {
  try {
    const url = new URL(value, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return value;
  }
}

export class DuckDuckGoHtmlWebSearchProvider implements WebSearchProvider {
  async search(input: WebSearchInput): Promise<ExternalIntelSearchResult[]> {
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", input.query);
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml"
      }
    });
    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed with status ${response.status}`);
    }
    const html = await response.text();
    const $ = load(html);
    const results: ExternalIntelSearchResult[] = [];
    $(".result").each((_index, element) => {
      if (results.length >= input.maxResults) return;
      const title = $(element).find(".result__title").text().replace(/\s+/g, " ").trim();
      const href = $(element).find(".result__a").attr("href");
      const snippet = $(element).find(".result__snippet").text().replace(/\s+/g, " ").trim();
      if (!title || !href) return;
      const normalizedUrl = normalizeDuckDuckGoUrl(href);
      results.push({
        title,
        url: normalizedUrl,
        snippet,
        sourceDomain: getSourceDomain(normalizedUrl),
        publishedAt: null
      });
    });
    return results;
  }
}
```

- [ ] **Step 5: Implement collector**

Create `apps/api/src/modules/external-intel/externalIntelCollector.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { ExternalIntelSummaryDto } from "@worldcup-ai-pk/shared";
import { getAiModelConnectionConfig } from "../admin/adminConfig.repository";
import { runOpenAiCompatiblePrediction } from "../ai/openAiCompatibleClient";
import {
  getExternalIntelSettings,
  getFreshExternalIntelSnapshot,
  insertExternalIntelSnapshot
} from "./externalIntel.repository";
import type { ExternalIntelCollectionResult, ExternalIntelSearchResult } from "./externalIntel.types";
import type { WebSearchProvider } from "./webSearchProvider";

export interface ExternalIntelQueryInput {
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: string;
  maxQueries: number;
}

export interface CollectExternalIntelInput extends ExternalIntelQueryInput {
  matchId: string;
  webSearchProvider: WebSearchProvider;
  now: Date;
  forceRefresh: boolean;
}

export function buildExternalIntelQueries(input: ExternalIntelQueryInput): string[] {
  return [
    `${input.homeTeamName} ${input.awayTeamName} 伤停 首发 世界杯`,
    `${input.homeTeamName} ${input.awayTeamName} injury lineup World Cup`,
    `${input.homeTeamName} ${input.awayTeamName} press conference team news`,
    `${input.homeTeamName} ${input.awayTeamName} motivation rotation World Cup`
  ].slice(0, Math.max(1, input.maxQueries));
}

function parseSummary(value: string, fallback: ExternalIntelSummaryDto): ExternalIntelSummaryDto {
  try {
    const parsed = JSON.parse(value) as Partial<ExternalIntelSummaryDto>;
    return {
      status: parsed.status === "cached" ? "cached" : fallback.status,
      summary: typeof parsed.summary === "string" ? parsed.summary : fallback.summary,
      injuryNews: Array.isArray(parsed.injuryNews) ? parsed.injuryNews.flatMap((item) => (typeof item === "string" ? [item] : [])) : [],
      lineupNews: Array.isArray(parsed.lineupNews) ? parsed.lineupNews.flatMap((item) => (typeof item === "string" ? [item] : [])) : [],
      motivation: Array.isArray(parsed.motivation) ? parsed.motivation.flatMap((item) => (typeof item === "string" ? [item] : [])) : [],
      recentFormNews: Array.isArray(parsed.recentFormNews) ? parsed.recentFormNews.flatMap((item) => (typeof item === "string" ? [item] : [])) : [],
      riskSignals: Array.isArray(parsed.riskSignals) ? parsed.riskSignals.flatMap((item) => (typeof item === "string" ? [item] : [])) : [],
      sourceLinks: Array.isArray(parsed.sourceLinks) ? parsed.sourceLinks : fallback.sourceLinks,
      confidence: parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low" ? parsed.confidence : "low",
      dataGaps: Array.isArray(parsed.dataGaps) ? parsed.dataGaps : fallback.dataGaps,
      collectedAt: fallback.collectedAt
    };
  } catch {
    return fallback;
  }
}

function buildFallbackSummary(input: { status: ExternalIntelSummaryDto["status"]; results: ExternalIntelSearchResult[]; collectedAt: string; reason: string }): ExternalIntelSummaryDto {
  return {
    status: input.status,
    summary: input.results.length > 0 ? input.results.map((result) => `${result.title}：${result.snippet}`).join("；") : "",
    injuryNews: [],
    lineupNews: [],
    motivation: [],
    recentFormNews: [],
    riskSignals: [],
    sourceLinks: input.results.map((result) => ({
      title: result.title,
      url: result.url,
      sourceDomain: result.sourceDomain,
      publishedAt: result.publishedAt
    })),
    confidence: "low",
    dataGaps: [{ source: "external_intel", code: input.status, message: input.reason }],
    collectedAt: input.collectedAt
  };
}

async function summarizeWithModel(db: Database, input: { modelId: string; homeTeamName: string; awayTeamName: string; results: ExternalIntelSearchResult[]; collectedAt: string }): Promise<ExternalIntelSummaryDto> {
  if (!input.modelId) {
    return buildFallbackSummary({ status: "summary_failed", results: input.results, collectedAt: input.collectedAt, reason: "未配置外部情报总结模型" });
  }
  const model = getAiModelConnectionConfig(db, input.modelId);
  if (!model) {
    return buildFallbackSummary({ status: "summary_failed", results: input.results, collectedAt: input.collectedAt, reason: "外部情报总结模型不存在或未启用" });
  }
  const prompt = [
    "你是世界杯赛前情报整理员。只根据 search_results 总结，不得编造。",
    "输出 JSON，字段：status,summary,injuryNews,lineupNews,motivation,recentFormNews,riskSignals,sourceLinks,confidence,dataGaps。",
    `match=${input.homeTeamName} vs ${input.awayTeamName}`,
    `collectedAt=${input.collectedAt}`,
    `search_results=${JSON.stringify(input.results)}`
  ].join("\n");
  const response = await runOpenAiCompatiblePrediction(model, prompt);
  const fallback = buildFallbackSummary({ status: "summary_failed", results: input.results, collectedAt: input.collectedAt, reason: "外部情报总结解析失败" });
  return parseSummary(response.content, fallback);
}

export async function collectExternalIntelForMatch(db: Database, input: CollectExternalIntelInput): Promise<ExternalIntelCollectionResult> {
  const settings = getExternalIntelSettings(db);
  const collectedAt = input.now.toISOString();
  const expiresAt = new Date(input.now.getTime() + settings.cacheMinutes * 60_000).toISOString();
  if (!settings.enabled) {
    const summary = buildFallbackSummary({ status: "not_configured", results: [], collectedAt, reason: "统一外部情报采集未启用" });
    return { matchId: input.matchId, status: "not_configured", queries: [], searchResults: [], summary, dataGaps: summary.dataGaps };
  }
  if (!input.forceRefresh) {
    const fresh = getFreshExternalIntelSnapshot(db, { matchId: input.matchId, now: input.now });
    if (fresh) {
      const summary = JSON.parse(fresh.summary_json) as ExternalIntelSummaryDto;
      const results = JSON.parse(fresh.search_results_json) as ExternalIntelSearchResult[];
      return { matchId: input.matchId, status: fresh.status, queries: JSON.parse(fresh.query_json) as string[], searchResults: results, summary, dataGaps: summary.dataGaps };
    }
  }

  const queries = buildExternalIntelQueries({ ...input, maxQueries: settings.maxQueriesPerMatch });
  try {
    const settledResults = await Promise.all(
      queries.map((query) => input.webSearchProvider.search({ query, maxResults: settings.maxResultsPerQuery }))
    );
    const byUrl = new Map<string, ExternalIntelSearchResult>();
    for (const result of settledResults.flat()) {
      if (result.url && !byUrl.has(result.url)) byUrl.set(result.url, result);
    }
    const searchResults = [...byUrl.values()].slice(0, settings.maxResultsPerQuery * settings.maxQueriesPerMatch);
    const summary = await summarizeWithModel(db, { modelId: settings.summarizerModelId, homeTeamName: input.homeTeamName, awayTeamName: input.awayTeamName, results: searchResults, collectedAt });
    const status = summary.status;
    insertExternalIntelSnapshot(db, {
      id: randomUUID(),
      matchId: input.matchId,
      provider: settings.provider,
      queryJson: JSON.stringify(queries),
      searchResultsJson: JSON.stringify(searchResults),
      summaryJson: JSON.stringify(summary),
      status,
      error: null,
      collectedAt,
      expiresAt,
      createdAt: collectedAt
    });
    return { matchId: input.matchId, status, queries, searchResults, summary, dataGaps: summary.dataGaps };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const summary = buildFallbackSummary({ status: "failed", results: [], collectedAt, reason: `外部情报采集失败：${message}` });
    insertExternalIntelSnapshot(db, {
      id: randomUUID(),
      matchId: input.matchId,
      provider: settings.provider,
      queryJson: JSON.stringify(queries),
      searchResultsJson: "[]",
      summaryJson: JSON.stringify(summary),
      status: "failed",
      error: message,
      collectedAt,
      expiresAt,
      createdAt: collectedAt
    });
    return { matchId: input.matchId, status: "failed", queries, searchResults: [], summary, dataGaps: summary.dataGaps };
  }
}
```

- [ ] **Step 6: Run collector tests**

Run: `corepack pnpm --filter @worldcup-ai-pk/api test -- externalIntelCollector.test.ts externalIntelRepository.test.ts`

Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run: `corepack pnpm --filter @worldcup-ai-pk/api typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/modules/external-intel apps/api/test/externalIntelCollector.test.ts
git commit -m "feat: collect external match intelligence"
```

---

### Task 3: Inject External Intelligence Into Betting Arena Context

**Files:**
- Modify: `apps/api/src/modules/betting-arena/bettingArena.context.ts`
- Modify: `apps/api/src/modules/betting-arena/bettingArena.service.ts`
- Modify: `apps/api/test/bettingArenaRepository.test.ts`
- Modify: `apps/api/test/bettingArenaApi.test.ts`

**Interfaces:**
- Consumes:
  - `collectExternalIntelForMatch(db, input)`
  - `DuckDuckGoHtmlWebSearchProvider`
  - `getLatestExternalIntelSnapshotByMatch(db, matchId)`
- Produces:
  - `battleContext.matches[].externalIntel`
  - `battleContext.matches[].dataGaps` containing structured entries for external intelligence failures.

- [ ] **Step 1: Add failing repository test**

Append to `apps/api/test/bettingArenaRepository.test.ts`:

```ts
it("injects external intelligence snapshots into battle context", () => {
  const { db } = createTestDatabase();
  seedModelAndMatch(db);
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
      dataGaps: [],
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
      sourceLinks: [{ url: "https://example.com/news" }]
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts`

Expected: FAIL because `externalIntel` is not injected.

- [ ] **Step 3: Inject latest snapshot in context**

Modify `apps/api/src/modules/betting-arena/bettingArena.context.ts`:

```ts
import type { ExternalIntelSummaryDto, StructuredDataGapDto } from "@worldcup-ai-pk/shared";
import { getLatestExternalIntelSnapshotByMatch } from "../external-intel/externalIntel.repository";
```

Add helpers:

```ts
function parseExternalIntelSummary(value: string): ExternalIntelSummaryDto | null {
  const parsed = parseJsonOrNull(value);
  if (!isRecord(parsed) || typeof parsed.status !== "string") return null;
  return {
    status: parsed.status === "cached" || parsed.status === "not_configured" || parsed.status === "failed" || parsed.status === "summary_failed" ? parsed.status : "failed",
    summary: readStringValue(parsed.summary),
    injuryNews: Array.isArray(parsed.injuryNews) ? parsed.injuryNews.flatMap((item) => (typeof item === "string" ? [item] : [])) : [],
    lineupNews: Array.isArray(parsed.lineupNews) ? parsed.lineupNews.flatMap((item) => (typeof item === "string" ? [item] : [])) : [],
    motivation: Array.isArray(parsed.motivation) ? parsed.motivation.flatMap((item) => (typeof item === "string" ? [item] : [])) : [],
    recentFormNews: Array.isArray(parsed.recentFormNews) ? parsed.recentFormNews.flatMap((item) => (typeof item === "string" ? [item] : [])) : [],
    riskSignals: Array.isArray(parsed.riskSignals) ? parsed.riskSignals.flatMap((item) => (typeof item === "string" ? [item] : [])) : [],
    sourceLinks: Array.isArray(parsed.sourceLinks) ? parsed.sourceLinks as ExternalIntelSummaryDto["sourceLinks"] : [],
    confidence: parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low" ? parsed.confidence : "low",
    dataGaps: Array.isArray(parsed.dataGaps) ? parsed.dataGaps as Array<string | StructuredDataGapDto> : [],
    collectedAt: typeof parsed.collectedAt === "string" ? parsed.collectedAt : null
  };
}

function getExternalIntelForMatch(db: Database, matchId: string): ExternalIntelSummaryDto {
  const snapshot = getLatestExternalIntelSnapshotByMatch(db, matchId);
  const summary = snapshot ? parseExternalIntelSummary(snapshot.summary_json) : null;
  return (
    summary ?? {
      status: "not_configured",
      summary: "",
      injuryNews: [],
      lineupNews: [],
      motivation: [],
      recentFormNews: [],
      riskSignals: [],
      sourceLinks: [],
      confidence: "low",
      dataGaps: [{ source: "external_intel", code: "not_configured", message: "统一外部情报尚未采集" }],
      collectedAt: null
    }
  );
}
```

In both `buildBattleContext` and `enrichBattleContext`, before returning each match:

```ts
const externalIntel = getExternalIntelForMatch(db, row.id);
```

Include:

```ts
externalIntel,
dataGaps: [...buildDataGaps({ homeTeamProfile, awayTeamProfile, historicalMatchup, sportteryPools }), ...externalIntel.dataGaps]
```

- [ ] **Step 4: Collect external intelligence before round generation**

Modify `apps/api/src/modules/betting-arena/bettingArena.service.ts` imports:

```ts
import { collectExternalIntelForMatch } from "../external-intel/externalIntelCollector";
import { DuckDuckGoHtmlWebSearchProvider } from "../external-intel/webSearchProvider";
```

In `refreshBettingArenaMatchContext`, after `refreshFixtureContext(...)`:

```ts
const webSearchProvider = new DuckDuckGoHtmlWebSearchProvider();
await collectExternalIntelForMatch(db, {
  matchId: match.id,
  homeTeamName: resolveDisplayNameZh({
    teamId: match.home_team_id,
    originalName: match.home_team_name,
    displayNameZh: match.home_team_display_name_zh,
    displayNameSource: match.home_team_display_name_source
  }),
  awayTeamName: resolveDisplayNameZh({
    teamId: match.away_team_id,
    originalName: match.away_team_name,
    displayNameZh: match.away_team_display_name_zh,
    displayNameSource: match.away_team_display_name_source
  }),
  kickoffAt: match.kickoff_at,
  webSearchProvider,
  now: input.now,
  forceRefresh: false
});
```

- [ ] **Step 5: Add API integration test**

Append to `apps/api/test/bettingArenaApi.test.ts`:

```ts
it("injects collected external intelligence into betting prompts", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-21T10:00:00.000Z"));
  const { db, databasePath } = createTestDatabase();
  seedModelAndMatch(db);
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run("externalIntel.enabled", "true", "2026-06-21T10:00:00.000Z");

  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const requestUrl = String(url);
    if (requestUrl.includes("duckduckgo.com")) {
      return new Response(
        `<html><body><div class="result"><a class="result__a" href="https://example.com/team-news">Team news</a><a class="result__title">Team news</a><div class="result__snippet">Germany confirms striker fitness.</div></div></body></html>`,
        { status: 200, headers: { "content-type": "text/html" } }
      );
    }
    if (requestUrl.includes("newapi.example.com")) {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const prompt = body.messages.at(-1)?.content ?? "";
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
  await app.close();
});
```

- [ ] **Step 6: Run tests**

Run: `corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts bettingArenaApi.test.ts externalIntelCollector.test.ts`

Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run: `corepack pnpm --filter @worldcup-ai-pk/api typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add apps/api/src/modules/betting-arena apps/api/test/bettingArenaRepository.test.ts apps/api/test/bettingArenaApi.test.ts
git commit -m "feat: inject external intel into betting context"
```

---

### Task 4: Portfolio Prompt Contract And Slip Parsing

**Files:**
- Modify: `apps/api/src/modules/betting-arena/bettingArenaPrompts.ts`
- Modify: `apps/api/src/modules/betting-arena/bettingArenaSlip.ts`
- Modify: `apps/api/src/modules/betting-arena/bettingArena.repository.ts`
- Modify: `apps/api/test/bettingArenaPrompts.test.ts`
- Modify: `apps/api/test/bettingArenaSlip.test.ts`
- Modify: `apps/api/test/bettingArenaRepository.test.ts`

**Interfaces:**
- Consumes:
  - Existing slip parser `parseBettingArenaSlip`
  - `BettingArenaPortfolioBucketDto`
- Produces:
  - `parsedSlip.portfolioBuckets`
  - `BettingArenaSlipDto.portfolioBuckets`
  - Prompt requiring `portfolio_buckets`

- [ ] **Step 1: Extend prompt test**

Modify `apps/api/test/bettingArenaPrompts.test.ts`:

```ts
expect(prompt).toContain("稳胆区");
expect(prompt).toContain("价值区");
expect(prompt).toContain("防冷区");
expect(prompt).toContain("回避区");
expect(prompt).toContain("禁止把全部资金押到低赔率热门");
expect(prompt).toContain("portfolio_buckets");
expect(prompt).toContain("命中路径");
expect(prompt).toContain("失败路径");
```

- [ ] **Step 2: Extend slip parser test**

Append to `apps/api/test/bettingArenaSlip.test.ts`:

```ts
it("parses portfolio buckets from model output", () => {
  const battleContext = {
    matches: [
      {
        matchId: "match-1",
        sportteryPools: [{ poolCode: "HAD", options: [{ code: "h", label: "主胜", value: "1.85" }] }]
      }
    ]
  };

  const parsed = parseBettingArenaSlip(
    JSON.stringify({
      action: "bet",
      total_stake: 100,
      singles: [{ matchId: "match-1", poolCode: "HAD", selectionCode: "h", lockedOdds: 1.85, stake: 100, confidence: 0.62, rationale: "命中路径清楚，失败路径是轮换。" }],
      parlays: [],
      portfolio_buckets: [
        {
          bucket: "safe",
          label: "稳胆",
          stake: 100,
          rationale: "主队基本面更稳。",
          items: ["match-1 HAD h"]
        },
        {
          bucket: "avoid",
          label: "回避",
          stake: 0,
          rationale: "无外部情报。",
          items: []
        }
      ],
      strategy_summary: "分桶出单。",
      risk_level: "medium",
      bankroll_plan: "投入 1%。",
      skip_reasons: [],
      data_gaps: []
    }),
    battleContext,
    { availableBankroll: 10000 }
  );

  expect(parsed.portfolioBuckets).toEqual([
    { bucket: "safe", label: "稳胆", stake: 100, rationale: "主队基本面更稳。", items: ["match-1 HAD h"] },
    { bucket: "avoid", label: "回避", stake: 0, rationale: "无外部情报。", items: [] }
  ]);
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaPrompts.test.ts bettingArenaSlip.test.ts`

Expected: FAIL because prompt and parser do not support `portfolio_buckets`.

- [ ] **Step 4: Update prompt**

Modify `apps/api/src/modules/betting-arena/bettingArenaPrompts.ts` array:

```ts
"投注组合必须分桶：稳胆区 safe、价值区 value、让球保护区 hedge、防冷区 upset、回避区 avoid。",
"禁止把全部资金押到低赔率热门；低赔率只能作为组合的一部分，不能成为唯一策略。",
"每个投注项必须说明命中路径和失败路径；串关必须说明每一关为什么适合组合。",
"输出 JSON 字段必须包含 action,total_stake,singles,parlays,portfolio_buckets,strategy_summary,risk_level,bankroll_plan,skip_reasons,data_gaps。",
"portfolio_buckets 每项必须包含 bucket,label,stake,rationale,items；bucket 只能是 safe,value,hedge,upset,avoid。",
```

- [ ] **Step 5: Update parser**

Modify `apps/api/src/modules/betting-arena/bettingArenaSlip.ts`:

```ts
import type { BettingArenaPortfolioBucketDto } from "@worldcup-ai-pk/shared";
```

Add:

```ts
function parsePortfolioBuckets(rawBuckets: unknown): BettingArenaPortfolioBucketDto[] {
  if (!Array.isArray(rawBuckets)) return [];
  return rawBuckets.flatMap((rawBucket): BettingArenaPortfolioBucketDto[] => {
    if (!isRecord(rawBucket)) return [];
    const bucket = readOptionalStringField(rawBucket, ["bucket"], "portfolio_buckets[].bucket") ?? "";
    if (bucket !== "safe" && bucket !== "value" && bucket !== "hedge" && bucket !== "upset" && bucket !== "avoid") return [];
    const items = Array.isArray(rawBucket.items) ? rawBucket.items.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];
    return [
      {
        bucket,
        label: readOptionalStringField(rawBucket, ["label"], "portfolio_buckets[].label") ?? bucket,
        stake: readOptionalNumberField(rawBucket, ["stake"], "portfolio_buckets[].stake", 0),
        rationale: readOptionalStringField(rawBucket, ["rationale", "reason"], "portfolio_buckets[].rationale") ?? "",
        items
      }
    ];
  });
}
```

In return object of `parseBettingArenaSlip`:

```ts
portfolioBuckets: parsePortfolioBuckets(slip.portfolio_buckets ?? slip.portfolioBuckets),
```

Modify `ParsedBettingArenaSlip` near the top of `apps/api/src/modules/betting-arena/bettingArenaSlip.ts`:

```ts
portfolioBuckets: BettingArenaPortfolioBucketDto[];
```

In the hold return object, add:

```ts
portfolioBuckets: parsePortfolioBuckets(slip.portfolio_buckets ?? slip.portfolioBuckets),
```

In the bet return object, add:

```ts
portfolioBuckets: parsePortfolioBuckets(slip.portfolio_buckets ?? slip.portfolioBuckets),
```

- [ ] **Step 6: Update repository DTO mapping**

Modify `apps/api/src/modules/betting-arena/bettingArena.repository.ts` in `toSlipDto`:

```ts
portfolioBuckets: Array.isArray(parsed.portfolioBuckets) ? parsed.portfolioBuckets : [],
```

- [ ] **Step 7: Run tests**

Run: `corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaPrompts.test.ts bettingArenaSlip.test.ts bettingArenaRepository.test.ts`

Expected: PASS.

- [ ] **Step 8: Run typecheck**

Run: `corepack pnpm --filter @worldcup-ai-pk/api typecheck`

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add packages/shared/src/types.ts apps/api/src/modules/betting-arena apps/api/test/bettingArenaPrompts.test.ts apps/api/test/bettingArenaSlip.test.ts apps/api/test/bettingArenaRepository.test.ts
git commit -m "feat: add portfolio betting buckets"
```

---

### Task 5: Concurrent Per-Model Betting Generation

**Files:**
- Modify: `apps/api/src/modules/betting-arena/bettingArena.service.ts`
- Modify: `apps/api/src/modules/betting-arena/bettingArena.repository.ts`
- Modify: `apps/api/test/bettingArenaApi.test.ts`
- Modify: `apps/web/src/pages/BettingArenaPage.tsx`
- Modify: `apps/web/test/bettingArenaPage.test.tsx`

**Interfaces:**
- Consumes:
  - Existing route `POST /api/public/betting-arena/rounds/:roundId/models/:modelId`
- Produces:
  - Multiple frontend model requests can be in flight.
  - Same `roundId + modelId` duplicate request returns existing state.
  - Round status is derived from slip states after generation attempts.

- [ ] **Step 1: Add API duplicate request test**

Append to `apps/api/test/bettingArenaApi.test.ts`:

```ts
it("does not create duplicate slips for repeated model generation", async () => {
  const { db, databasePath } = createTestDatabase();
  seedModelAndMatch(db);
  const round = createBettingArenaRound(db, {
    roundDate: "2026-06-21",
    lockTime: "2026-06-21T10:00:00.000Z",
    battleContext: buildBattleContext(db, {
      roundDate: "2026-06-21",
      lockTime: "2026-06-21T10:00:00.000Z",
      externalIntel: { summary: "统一外部情报由比赛级 externalIntel 提供", dataGaps: [] }
    }),
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
  const app = buildApp({ databasePath, logger: false });

  const response = await app.inject({ method: "POST", url: `/api/public/betting-arena/rounds/${round.id}/models/model-1` });

  expect(response.statusCode).toBe(200);
  const count = db.prepare("SELECT COUNT(*) AS count FROM betting_arena_slips WHERE round_id = ? AND model_id = ?").get(round.id, "model-1") as { count: number };
  expect(count.count).toBe(1);
  await app.close();
});
```

- [ ] **Step 2: Add Web concurrent button test**

Append to `apps/web/test/bettingArenaPage.test.tsx`:

```tsx
it("allows multiple model generation buttons to be busy at the same time", async () => {
  let resolveFirst: (value: BettingArenaDto) => void = () => {};
  let resolveSecond: (value: BettingArenaDto) => void = () => {};
  const arenaWithTwoModels: BettingArenaDto = {
    ...arena,
    accounts: [
      arena.accounts[0],
      { ...arena.accounts[0], modelId: "model-2", modelDisplayName: "Model Two", rank: 2 }
    ],
    slips: []
  };
  const first = new Promise<BettingArenaDto>((resolve) => {
    resolveFirst = resolve;
  });
  const second = new Promise<BettingArenaDto>((resolve) => {
    resolveSecond = resolve;
  });
  const onTriggerModel = vi.fn((roundId: string, modelId: string) => (modelId === "model-1" ? first : second));
  render(
    <BettingArenaPage
      arena={arenaWithTwoModels}
      loading={false}
      error={null}
      onTriggerRound={vi.fn()}
      onTriggerModel={onTriggerModel}
      onSettleRound={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "单独生成 Model One" }));
  fireEvent.click(screen.getByRole("button", { name: "单独生成 Model Two" }));

  expect(screen.getAllByText("生成中").length).toBe(2);
  expect(screen.getByText("正在生成 2 个模型")).toBeInTheDocument();

  resolveFirst(arenaWithTwoModels);
  resolveSecond(arenaWithTwoModels);
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaApi.test.ts
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx
```

Expected: Web test FAILS because only one `busyModelId` exists. API test FAILS because the repeated model generation path does not return before attempting generation.

- [ ] **Step 4: Implement backend duplicate guard**

Modify `apps/api/src/modules/betting-arena/bettingArena.service.ts`:

```ts
function hasRoundSlipForModel(db: Database, input: { roundId: string; modelId: string }): boolean {
  const row = db.prepare("SELECT id FROM betting_arena_slips WHERE round_id = ? AND model_id = ? LIMIT 1").get(input.roundId, input.modelId) as { id: string } | undefined;
  return Boolean(row);
}
```

At start of `triggerBettingArenaModel` after model lookup:

```ts
if (hasRoundSlipForModel(db, { roundId: input.roundId, modelId: input.modelId })) {
  return getBettingArenaSummary(db);
}
```

Keep the unique index as the final database guard.

- [ ] **Step 5: Update round status safely**

Add helper in `bettingArena.service.ts`:

```ts
function updateRoundStatusFromSlips(db: Database, roundId: string, timestamp: string): void {
  const pending = db
    .prepare("SELECT COUNT(*) AS count FROM betting_arena_slips WHERE round_id = ? AND status = ?")
    .get(roundId, "pending") as { count: number };
  db.prepare("UPDATE betting_arena_rounds SET status = ?, updated_at = ? WHERE id = ?").run(pending.count > 0 ? "generating" : "locked", timestamp, roundId);
}
```

Replace direct `UPDATE betting_arena_rounds SET status = 'locked'` in `triggerBettingArenaModel` with:

```ts
updateRoundStatusFromSlips(db, input.roundId, timestamp);
```

- [ ] **Step 6: Implement frontend multi-busy state**

Modify `apps/web/src/pages/BettingArenaPage.tsx`:

```ts
const [busyModelIds, setBusyModelIds] = useState<Set<string>>(() => new Set());
const busyModelCount = busyModelIds.size;
```

Replace `busyModelId` usage:

```ts
setBusyModelIds((current) => new Set(current).add(modelId));
```

In `finally`:

```ts
setBusyModelIds((current) => {
  const next = new Set(current);
  next.delete(modelId);
  return next;
});
```

Button:

```tsx
disabled={!arena?.currentRound || busyModelIds.has(account.modelId)}
```

Text:

```tsx
{busyModelIds.has(account.modelId) ? "生成中" : `单独生成 ${account.modelDisplayName}`}
```

Status line:

```tsx
{busyModelCount > 0 ? <p className="status-line">正在生成 {busyModelCount} 个模型</p> : null}
```

- [ ] **Step 7: Run tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaApi.test.ts
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Run typecheck**

Run: `corepack pnpm typecheck`

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add apps/api/src/modules/betting-arena/bettingArena.service.ts apps/api/test/bettingArenaApi.test.ts apps/web/src/pages/BettingArenaPage.tsx apps/web/test/bettingArenaPage.test.tsx
git commit -m "feat: support concurrent betting model generation"
```

---

### Task 6: Admin Settings And Betting Input UI

**Files:**
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/src/modules/admin/adminConfig.repository.ts`
- Modify: `apps/api/test/adminConfig.test.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/pages/AdminPage.tsx`
- Modify: `apps/web/src/pages/BettingArenaPage.tsx`
- Modify: `apps/web/test/adminPage.test.tsx`
- Modify: `apps/web/test/client.test.ts`
- Modify: `apps/web/test/bettingArenaPage.test.tsx`

**Interfaces:**
- Produces:
  - `GET /api/admin/settings/external-intel`
  - `PUT /api/admin/settings/external-intel`
  - `POST /api/admin/matches/:matchId/external-intel/refresh`
  - Web client functions:
    - `getAdminExternalIntelSettings()`
    - `saveAdminExternalIntelSettings(input)`
    - `refreshAdminMatchExternalIntel(matchId)`

- [ ] **Step 1: Add client tests**

Append to `apps/web/test/client.test.ts`:

```ts
it("gets and saves admin external intelligence settings", async () => {
  const settings = {
    enabled: true,
    provider: "duckduckgo_html",
    summarizerModelId: "model-1",
    cacheMinutes: 60,
    maxResultsPerQuery: 5,
    maxQueriesPerMatch: 4
  };
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(settings), { status: 200, headers: { "content-type": "application/json" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify(settings), { status: 200, headers: { "content-type": "application/json" } }));

  await expect(getAdminExternalIntelSettings()).resolves.toEqual(settings);
  await expect(saveAdminExternalIntelSettings(settings)).resolves.toEqual(settings);

  expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/admin/settings/external-intel");
  expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/settings/external-intel", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings)
  });
});
```

- [ ] **Step 2: Add admin page test**

Append to `apps/web/test/adminPage.test.tsx`:

```tsx
it("edits external intelligence settings", async () => {
  render(<AdminPage />);

  fireEvent.click(await screen.findByRole("button", { name: "数据源" }));
  fireEvent.click(await screen.findByRole("button", { name: "外部情报" }));
  fireEvent.click(screen.getByLabelText("启用统一外部情报"));
  fireEvent.change(screen.getByLabelText("总结模型"), { target: { value: "model-1" } });
  fireEvent.change(screen.getByLabelText("缓存分钟"), { target: { value: "45" } });
  fireEvent.click(screen.getByRole("button", { name: "保存外部情报配置" }));

  expect(saveAdminExternalIntelSettings).toHaveBeenCalledWith({
    enabled: true,
    provider: "duckduckgo_html",
    summarizerModelId: "model-1",
    cacheMinutes: 45,
    maxResultsPerQuery: 5,
    maxQueriesPerMatch: 4
  });
});
```

- [ ] **Step 3: Extend betting page UI test**

Modify `apps/web/test/bettingArenaPage.test.tsx` fixture to include:

```ts
externalIntel: {
  status: "cached",
  summary: "德国主力前锋可出场。",
  injuryNews: ["主力前锋可出场"],
  lineupNews: ["中场可能轮换"],
  motivation: ["争取提前出线"],
  recentFormNews: [],
  riskSignals: ["轮换幅度不明"],
  sourceLinks: [{ title: "Team news", url: "https://example.com/news", sourceDomain: "example.com", publishedAt: null }],
  confidence: "medium",
  dataGaps: [],
  collectedAt: "2026-06-21T10:00:00.000Z"
}
```

Add assertions:

```ts
expect(screen.getByText("外部情报")).toBeInTheDocument();
expect(screen.getByText("德国主力前锋可出场。")).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Team news" })).toHaveAttribute("href", "https://example.com/news");
```

For portfolio buckets, add to slip fixture:

```ts
portfolioBuckets: [{ bucket: "safe", label: "稳胆", stake: 200, rationale: "基本面优势明确。", items: ["德国 主胜"] }]
```

Assert:

```ts
expect(screen.getByText("组合分桶")).toBeInTheDocument();
expect(screen.getByText("稳胆 · 投入 200")).toBeInTheDocument();
```

- [ ] **Step 4: Run tests to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts adminPage.test.tsx bettingArenaPage.test.tsx
```

Expected: FAIL because APIs and UI are missing.

- [ ] **Step 5: Add admin API routes**

Modify `apps/api/src/modules/admin/admin.routes.ts` imports:

```ts
import { collectExternalIntelForMatch } from "../external-intel/externalIntelCollector";
import { getExternalIntelSettings, saveExternalIntelSettings } from "../external-intel/externalIntel.repository";
import { DuckDuckGoHtmlWebSearchProvider } from "../external-intel/webSearchProvider";
```

Add schema:

```ts
const externalIntelSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.literal("duckduckgo_html"),
  summarizerModelId: z.string(),
  cacheMinutes: z.number().int().min(5).max(1440),
  maxResultsPerQuery: z.number().int().min(1).max(10),
  maxQueriesPerMatch: z.number().int().min(1).max(8)
});
```

Add routes:

```ts
app.get("/settings/external-intel", async () => getExternalIntelSettings(options.db));

app.put("/settings/external-intel", async (request, reply) => {
  const parsed = externalIntelSettingsSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid external intelligence settings payload" });
  }
  return saveExternalIntelSettings(options.db, parsed.data);
});
```

Add refresh route only after reading exact match row fields from `matches`:

```ts
app.post("/matches/:matchId/external-intel/refresh", async (request, reply) => {
  const matchId = getIdParam(request, "matchId");
  const match = options.db
    .prepare("SELECT id, kickoff_at, home_team_name, away_team_name FROM matches WHERE id = ?")
    .get(matchId) as { id: string; kickoff_at: string; home_team_name: string; away_team_name: string } | undefined;
  if (!match) return reply.code(404).send({ error: "Match not found" });
  return collectExternalIntelForMatch(options.db, {
    matchId: match.id,
    homeTeamName: match.home_team_name,
    awayTeamName: match.away_team_name,
    kickoffAt: match.kickoff_at,
    webSearchProvider: new DuckDuckGoHtmlWebSearchProvider(),
    now: new Date(),
    forceRefresh: true
  });
});
```

- [ ] **Step 6: Add client functions**

Modify `apps/web/src/api/client.ts` imports to include `ExternalIntelSettingsDto`.

Add:

```ts
export async function getAdminExternalIntelSettings(): Promise<ExternalIntelSettingsDto> {
  const response = await request(`${apiBaseUrl}/api/admin/settings/external-intel`);
  if (!response.ok) {
    throw new Error(`Admin external intelligence settings request failed with status ${response.status}`);
  }
  return (await response.json()) as ExternalIntelSettingsDto;
}

export async function saveAdminExternalIntelSettings(input: ExternalIntelSettingsDto): Promise<ExternalIntelSettingsDto> {
  const response = await request(`${apiBaseUrl}/api/admin/settings/external-intel`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Admin external intelligence settings save failed with status ${response.status}`);
  }
  return (await response.json()) as ExternalIntelSettingsDto;
}

export async function refreshAdminMatchExternalIntel(matchId: string): Promise<unknown> {
  const response = await request(`${apiBaseUrl}/api/admin/matches/${matchId}/external-intel/refresh`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Admin external intelligence refresh failed with status ${response.status}`);
  }
  return response.json();
}
```

- [ ] **Step 7: Add Admin UI controls**

Modify `apps/web/src/pages/AdminPage.tsx`:

```ts
const [externalIntelSettings, setExternalIntelSettings] = useState<ExternalIntelSettingsDto>({
  enabled: false,
  provider: "duckduckgo_html",
  summarizerModelId: "",
  cacheMinutes: 60,
  maxResultsPerQuery: 5,
  maxQueriesPerMatch: 4
});
```

Load in existing admin data effect:

```ts
const externalIntel = await getAdminExternalIntelSettings();
setExternalIntelSettings(externalIntel);
```

Save handler:

```ts
async function handleSaveExternalIntelSettings() {
  const saved = await saveAdminExternalIntelSettings(externalIntelSettings);
  setExternalIntelSettings(saved);
}
```

Render under data source/admin settings area:

```tsx
<section className="admin-panel">
  <h3>外部情报</h3>
  <label>
    <input
      aria-label="启用统一外部情报"
      type="checkbox"
      checked={externalIntelSettings.enabled}
      onChange={(event) => setExternalIntelSettings((current) => ({ ...current, enabled: event.target.checked }))}
    />
    启用统一外部情报
  </label>
  <label>
    总结模型
    <select
      aria-label="总结模型"
      value={externalIntelSettings.summarizerModelId}
      onChange={(event) => setExternalIntelSettings((current) => ({ ...current, summarizerModelId: event.target.value }))}
    >
      <option value="">不使用模型总结，只注入搜索摘要</option>
      {models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.displayName}
        </option>
      ))}
    </select>
  </label>
  <label>
    缓存分钟
    <input
      aria-label="缓存分钟"
      type="number"
      min={5}
      max={1440}
      value={externalIntelSettings.cacheMinutes}
      onChange={(event) => setExternalIntelSettings((current) => ({ ...current, cacheMinutes: Number(event.target.value) }))}
    />
  </label>
  <button className="app-button app-button-primary" type="button" onClick={handleSaveExternalIntelSettings}>
    保存外部情报配置
  </button>
</section>
```

- [ ] **Step 8: Add Betting UI display**

Modify `apps/web/src/pages/BettingArenaPage.tsx` summary parser:

```ts
const externalIntel = isRecord(match.externalIntel) ? match.externalIntel : null;
```

Include in match row:

```ts
externalIntel: {
  status: readString(externalIntel?.status),
  summary: readString(externalIntel?.summary),
  sourceLinks: Array.isArray(externalIntel?.sourceLinks) ? externalIntel.sourceLinks : [],
  collectedAt: readString(externalIntel?.collectedAt)
}
```

Render in input panel:

```tsx
<section>
  <h4>外部情报</h4>
  <p>{match.externalIntel.summary || "暂无外部情报摘要"}</p>
  <p>采集时间：{match.externalIntel.collectedAt || "暂无"}</p>
  {match.externalIntel.sourceLinks.map((source) => {
    if (!isRecord(source)) return null;
    const url = readString(source.url);
    const title = readString(source.title) || url;
    return url ? (
      <a key={url} href={url} target="_blank" rel="noreferrer">
        {title}
      </a>
    ) : null;
  })}
</section>
```

Render portfolio buckets in slip details:

```tsx
<div className="arena-detail-table">
  <strong>组合分桶</strong>
  {selectedSlip.portfolioBuckets.length === 0 ? <span className="muted">暂无组合分桶</span> : null}
  {selectedSlip.portfolioBuckets.map((bucket) => (
    <div className="arena-pick-row" key={`${bucket.bucket}-${bucket.label}`}>
      <span>
        {bucket.label} · 投入 {money(bucket.stake)}
      </span>
      <span>{bucket.rationale}</span>
    </div>
  ))}
</div>
```

- [ ] **Step 9: Run Web tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts adminPage.test.tsx bettingArenaPage.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Run API tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminConfig.test.ts bettingArenaApi.test.ts externalIntelCollector.test.ts externalIntelRepository.test.ts
```

Expected: PASS.

- [ ] **Step 11: Run full verification**

Run:

```bash
corepack pnpm typecheck
corepack pnpm --filter @worldcup-ai-pk/api test -- externalIntelRepository.test.ts externalIntelCollector.test.ts bettingArenaApi.test.ts bettingArenaPrompts.test.ts bettingArenaSlip.test.ts adminConfig.test.ts
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts adminPage.test.tsx bettingArenaPage.test.tsx
rg -n "candi""date" /Users/yzq/Desktop/project/worldcup-ai-pk
```

Expected:
- Typecheck PASS.
- Listed API and Web tests PASS.
- `rg` returns no matches.

- [ ] **Step 12: Commit**

Run:

```bash
git add apps/api/src/modules/admin apps/api/test/adminConfig.test.ts apps/web/src/api/client.ts apps/web/src/pages/AdminPage.tsx apps/web/src/pages/BettingArenaPage.tsx apps/web/test/client.test.ts apps/web/test/adminPage.test.tsx apps/web/test/bettingArenaPage.test.tsx
git commit -m "feat: expose external intel betting controls"
```
