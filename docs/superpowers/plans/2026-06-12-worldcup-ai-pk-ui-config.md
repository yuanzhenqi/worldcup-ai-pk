# Worldcup AI PK UI and Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the fixtures page into a status-based Chinese fixture console and turn the local admin page into a real configuration center for data source, AI providers, models, prompt templates, and team display names.

**Architecture:** Keep Fastify as the source of data meaning: imports populate SQLite, repositories return display-ready DTOs, and React renders without guessing API-Football status codes or secret values. Extend the existing schema and admin routes rather than creating a parallel configuration system. Keep the frontend as the current app shell without adding a router.

**Tech Stack:** React 18, Vite, Fastify, TypeScript, SQLite through `better-sqlite3`, Vitest, pnpm.

---

## File Structure

Modify existing files:

- `packages/shared/src/types.ts`: extend `TeamDto`, `MatchDto`, and add admin DTO types.
- `apps/api/src/db/schema.sql`: add `team_display_names`; extend `ai_providers` and `prompt_templates`.
- `apps/api/src/db/schema.ts`: apply schema statements one by one so duplicate `ALTER TABLE ADD COLUMN` errors can be ignored safely.
- `apps/api/src/modules/football/fixtureImport.service.ts`: upsert team display names during fixture import.
- `apps/api/src/modules/matches/match.repository.ts`: join team display names and return Chinese display fields.
- `apps/api/src/modules/admin/admin.routes.ts`: add summary, sync, providers, models, prompt templates, and team display name routes.
- `apps/web/src/api/client.ts`: add client functions and response types for new admin APIs.
- `apps/web/src/pages/FixturesPage.tsx`: replace flat list with fixture console.
- `apps/web/src/pages/AdminPage.tsx`: replace placeholder cards with module navigation and real forms.
- `apps/web/src/styles.css`: restyle fixtures and admin configuration center.

Create new files:

- `apps/api/src/modules/teams/teamDisplayName.repository.ts`: team display name reads, upserts, and admin updates.
- `apps/api/src/modules/teams/worldCupTeamNames.zh.ts`: seed Chinese display names keyed by verified API-Football team IDs from synced fixtures.
- `apps/api/src/modules/admin/adminConfig.repository.ts`: admin summary, providers, models, and prompt template persistence.
- `apps/api/test/teamDisplayNames.test.ts`: backend tests for import and admin-edited Chinese names.
- `apps/api/test/adminConfig.test.ts`: backend tests for provider/model/prompt/team admin APIs.
- `apps/web/test/fixturesPage.test.tsx`: frontend tests for status tabs and score display if React Testing Library is added in Task 7.
- `apps/web/test/adminPage.test.tsx`: frontend tests for admin forms if React Testing Library is added in Task 8.

Do not create prediction execution, scheduled jobs, odds sync, or match detail routing in this plan.

---

### Task 1: Schema Migration Support

**Files:**
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/src/db/schema.ts`
- Test: `apps/api/test/schemaMigration.test.ts`

- [ ] **Step 1: Extend schema migration test**

In `apps/api/test/schemaMigration.test.ts`, assert the new table and columns exist after `applySchema(db)`.

Add assertions using SQLite pragmas:

```ts
const teamColumns = db.prepare("PRAGMA table_info(team_display_names)").all() as Array<{ name: string }>;
expect(teamColumns.map((column) => column.name)).toEqual([
  "api_football_team_id",
  "original_name",
  "display_name_zh",
  "logo_url",
  "source",
  "created_at",
  "updated_at"
]);

const providerColumns = db.prepare("PRAGMA table_info(ai_providers)").all() as Array<{ name: string }>;
expect(providerColumns.map((column) => column.name)).toContain("display_name");
expect(providerColumns.map((column) => column.name)).toContain("base_url");

const promptColumns = db.prepare("PRAGMA table_info(prompt_templates)").all() as Array<{ name: string }>;
expect(promptColumns.map((column) => column.name)).toContain("description");
expect(promptColumns.map((column) => column.name)).toContain("is_default");
```

- [ ] **Step 2: Run schema test and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- schemaMigration.test.ts
```

Expected: FAIL because `team_display_names`, `ai_providers.display_name`, `ai_providers.base_url`, `prompt_templates.description`, or `prompt_templates.is_default` is missing.

- [ ] **Step 3: Update `schema.sql`**

In `apps/api/src/db/schema.sql`, update the existing `ai_providers` table definition:

```sql
CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Update the existing `prompt_templates` table definition:

```sql
CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  full_prompt TEXT NOT NULL,
  prompt_summary TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Add after `matches`:

```sql
CREATE TABLE IF NOT EXISTS team_display_names (
  api_football_team_id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  display_name_zh TEXT NOT NULL,
  logo_url TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Add idempotent `ALTER TABLE` statements after table creation so existing local SQLite files receive new columns:

```sql
ALTER TABLE ai_providers ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_providers ADD COLUMN base_url TEXT NOT NULL DEFAULT '';
ALTER TABLE prompt_templates ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE prompt_templates ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
```

Update `apps/api/src/db/schema.ts` so repeated schema application does not fail on existing columns:

```ts
import type { Database } from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(currentDir, "schema.sql");

function splitSqlStatements(schema: string): string[] {
  return schema
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function isDuplicateColumnError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("duplicate column name");
}

export function applySchema(db: Database): void {
  const schema = readFileSync(schemaPath, "utf8");

  for (const statement of splitSqlStatements(schema)) {
    try {
      db.exec(`${statement};`);
    } catch (error) {
      if (!statement.startsWith("ALTER TABLE") || !isDuplicateColumnError(error)) {
        throw error;
      }
    }
  }
}
```

- [ ] **Step 4: Run schema test and typecheck**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- schemaMigration.test.ts
corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.sql apps/api/src/db/schema.ts apps/api/test/schemaMigration.test.ts
git commit -m "feat: extend config and team display schema"
```

---

### Task 2: Team Display Name Repository and Fixture Import

**Files:**
- Modify: `packages/shared/src/types.ts`
- Create: `apps/api/src/modules/teams/worldCupTeamNames.zh.ts`
- Create: `apps/api/src/modules/teams/teamDisplayName.repository.ts`
- Modify: `apps/api/src/modules/football/fixtureImport.service.ts`
- Test: `apps/api/test/teamDisplayNames.test.ts`
- Test: `apps/api/test/apiFootballFixtureImport.test.ts`

- [ ] **Step 1: Write failing import tests**

Create `apps/api/test/teamDisplayNames.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { importApiFootballFixturesResponse } from "../src/modules/football/fixtureImport.service";
import { listTeamDisplayNames, updateTeamDisplayName } from "../src/modules/teams/teamDisplayName.repository";
import { createTestDatabase } from "./support/testDatabase";

describe("team display names", () => {
  it("upserts Chinese display names while importing fixtures", () => {
    const { db } = createTestDatabase();

    importApiFootballFixturesResponse(db, {
      response: [
        {
          fixture: { id: 1489369, date: "2026-06-11T19:00:00+00:00", status: { short: "FT" } },
          league: { round: "Group Stage - 1" },
          teams: {
            home: { id: 16, name: "Mexico", logo: "https://media.api-sports.io/football/teams/16.png" },
            away: { id: 1531, name: "South Africa", logo: "https://media.api-sports.io/football/teams/1531.png" }
          },
          goals: { home: 2, away: 0 }
        }
      ]
    }, new Date("2026-06-12T13:45:00.000Z"));

    expect(listTeamDisplayNames(db, "")).toEqual([
      {
        apiFootballTeamId: "16",
        originalName: "Mexico",
        displayNameZh: "墨西哥",
        logoUrl: "https://media.api-sports.io/football/teams/16.png",
        source: "seed"
      },
      {
        apiFootballTeamId: "1531",
        originalName: "South Africa",
        displayNameZh: "南非",
        logoUrl: "https://media.api-sports.io/football/teams/1531.png",
        source: "seed"
      }
    ]);

    db.close();
  });

  it("does not overwrite admin-edited Chinese display names during import", () => {
    const { db } = createTestDatabase();

    importApiFootballFixturesResponse(db, {
      response: [
        {
          fixture: { id: 1, date: "2026-06-11T19:00:00+00:00", status: { short: "NS" } },
          league: { round: "Group Stage - 1" },
          teams: {
            home: { id: 16, name: "Mexico", logo: null },
            away: { id: 1531, name: "South Africa", logo: null }
          },
          goals: { home: null, away: null }
        }
      ]
    });

    updateTeamDisplayName(db, "16", "墨西哥队");

    importApiFootballFixturesResponse(db, {
      response: [
        {
          fixture: { id: 2, date: "2026-06-12T19:00:00+00:00", status: { short: "NS" } },
          league: { round: "Group Stage - 1" },
          teams: {
            home: { id: 16, name: "Mexico", logo: "https://media.api-sports.io/football/teams/16.png" },
            away: { id: 1531, name: "South Africa", logo: null }
          },
          goals: { home: null, away: null }
        }
      ]
    });

    expect(listTeamDisplayNames(db, "墨西哥队")[0]).toMatchObject({
      apiFootballTeamId: "16",
      originalName: "Mexico",
      displayNameZh: "墨西哥队",
      logoUrl: "https://media.api-sports.io/football/teams/16.png",
      source: "admin"
    });

    db.close();
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- teamDisplayNames.test.ts
```

Expected: FAIL because `teamDisplayName.repository.ts` and seed file do not exist.

- [ ] **Step 3: Add seed names**

Create `apps/api/src/modules/teams/worldCupTeamNames.zh.ts`:

```ts
export const worldCupTeamNamesZh: Record<string, string> = {
  "16": "墨西哥",
  "1531": "南非",
  "5529": "加拿大",
  "1113": "波黑"
};
```

When implementing beyond these verified test IDs, add entries only after reading current local match data or API-Football response logs. Do not infer IDs from names.

- [ ] **Step 4: Add team display DTO type**

In `packages/shared/src/types.ts`, add:

```ts
export interface TeamDisplayNameDto {
  apiFootballTeamId: string;
  originalName: string;
  displayNameZh: string;
  logoUrl: string | null;
  source: "seed" | "admin" | "api-football";
}
```

- [ ] **Step 5: Add repository**

Create `apps/api/src/modules/teams/teamDisplayName.repository.ts`:

```ts
import type { Database } from "better-sqlite3";
import type { TeamDisplayNameDto } from "@worldcup-ai-pk/shared";
import { worldCupTeamNamesZh } from "./worldCupTeamNames.zh";

interface TeamDisplayNameRow {
  api_football_team_id: string;
  original_name: string;
  display_name_zh: string;
  logo_url: string | null;
  source: "seed" | "admin" | "api-football";
}

export interface UpsertTeamDisplayNameInput {
  apiFootballTeamId: string;
  originalName: string;
  logoUrl: string | null;
  now: Date;
}

function toDto(row: TeamDisplayNameRow): TeamDisplayNameDto {
  return {
    apiFootballTeamId: row.api_football_team_id,
    originalName: row.original_name,
    displayNameZh: row.display_name_zh,
    logoUrl: row.logo_url,
    source: row.source
  };
}

export function upsertTeamDisplayName(db: Database, input: UpsertTeamDisplayNameInput): void {
  const existing = db.prepare("SELECT source, display_name_zh FROM team_display_names WHERE api_football_team_id = ?").get(input.apiFootballTeamId) as
    | { source: string; display_name_zh: string }
    | undefined;
  const seedName = worldCupTeamNamesZh[input.apiFootballTeamId];
  const displayNameZh = existing?.source === "admin" ? existing.display_name_zh : seedName ?? existing?.display_name_zh ?? input.originalName;
  const source = existing?.source === "admin" ? "admin" : seedName ? "seed" : "api-football";

  db.prepare(
    `
      INSERT INTO team_display_names (
        api_football_team_id,
        original_name,
        display_name_zh,
        logo_url,
        source,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(api_football_team_id) DO UPDATE SET
        original_name = excluded.original_name,
        display_name_zh = excluded.display_name_zh,
        logo_url = excluded.logo_url,
        source = excluded.source,
        updated_at = excluded.updated_at
    `
  ).run(input.apiFootballTeamId, input.originalName, displayNameZh, input.logoUrl, source, input.now.toISOString(), input.now.toISOString());
}

export function listTeamDisplayNames(db: Database, query: string): TeamDisplayNameDto[] {
  const normalizedQuery = `%${query.trim()}%`;
  const rows = db.prepare(
    `
      SELECT api_football_team_id, original_name, display_name_zh, logo_url, source
      FROM team_display_names
      WHERE ? = '%%' OR original_name LIKE ? OR display_name_zh LIKE ?
      ORDER BY display_name_zh ASC, original_name ASC
    `
  ).all(normalizedQuery, normalizedQuery, normalizedQuery) as TeamDisplayNameRow[];

  return rows.map(toDto);
}

export function updateTeamDisplayName(db: Database, apiFootballTeamId: string, displayNameZh: string, now = new Date()): TeamDisplayNameDto {
  db.prepare(
    `
      UPDATE team_display_names
      SET display_name_zh = ?, source = 'admin', updated_at = ?
      WHERE api_football_team_id = ?
    `
  ).run(displayNameZh, now.toISOString(), apiFootballTeamId);

  const row = db.prepare(
    `
      SELECT api_football_team_id, original_name, display_name_zh, logo_url, source
      FROM team_display_names
      WHERE api_football_team_id = ?
    `
  ).get(apiFootballTeamId) as TeamDisplayNameRow | undefined;

  if (!row) {
    throw new Error(`Team display name not found: ${apiFootballTeamId}`);
  }

  return toDto(row);
}
```

- [ ] **Step 6: Wire fixture import**

In `apps/api/src/modules/football/fixtureImport.service.ts`, import and call `upsertTeamDisplayName` inside the transaction after reading home and away teams:

```ts
import { upsertTeamDisplayName } from "../teams/teamDisplayName.repository";
```

Inside the loop:

```ts
const now = syncedAt;

upsertTeamDisplayName(db, {
  apiFootballTeamId: String(homeTeamId),
  originalName: homeTeamName,
  logoUrl: item.teams?.home?.logo ?? null,
  now
});

upsertTeamDisplayName(db, {
  apiFootballTeamId: String(awayTeamId),
  originalName: awayTeamName,
  logoUrl: item.teams?.away?.logo ?? null,
  now
});
```

- [ ] **Step 7: Run existing fixture import test unchanged**

Run the existing `apps/api/test/apiFootballFixtureImport.test.ts` with no assertion changes in this task. This confirms team display name upserts do not change the public match DTO before Task 3.

- [ ] **Step 8: Run tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- teamDisplayNames.test.ts apiFootballFixtureImport.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/types.ts apps/api/src/modules/teams apps/api/src/modules/football/fixtureImport.service.ts apps/api/test/teamDisplayNames.test.ts apps/api/test/apiFootballFixtureImport.test.ts
git commit -m "feat: persist Chinese team display names"
```

---

### Task 3: Public Matches DTO with Chinese Names and Status Labels

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/api/src/modules/matches/match.repository.ts`
- Modify: `apps/api/test/publicMatches.test.ts`
- Modify: `apps/api/test/apiFootballFixtureImport.test.ts`

- [ ] **Step 1: Update public matches test**

In `apps/api/test/publicMatches.test.ts`, insert rows into `team_display_names` for both teams:

```ts
db.prepare(
  `
    INSERT INTO team_display_names (
      api_football_team_id,
      original_name,
      display_name_zh,
      logo_url,
      source,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)
  `
).run(
  "team-home",
  "Mexico",
  "墨西哥",
  null,
  "admin",
  "2026-06-12T10:00:00.000Z",
  "2026-06-12T10:00:00.000Z",
  "team-away",
  "Canada",
  "加拿大",
  null,
  "admin",
  "2026-06-12T10:00:00.000Z",
  "2026-06-12T10:00:00.000Z"
);
```

Update the expected match object:

```ts
expect(body.matches[0]).toMatchObject({
  status: "scheduled",
  statusLabelZh: "未开始",
  homeTeam: {
    id: "team-home",
    name: "Mexico",
    displayNameZh: "墨西哥",
    logoUrl: null
  },
  awayTeam: {
    id: "team-away",
    name: "Canada",
    displayNameZh: "加拿大",
    logoUrl: null
  }
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- publicMatches.test.ts
```

Expected: FAIL because `statusLabelZh` and `displayNameZh` are not returned.

- [ ] **Step 3: Extend public match DTO types**

In `packages/shared/src/types.ts`, update `TeamDto` and `MatchDto`:

```ts
export interface TeamDto {
  id: string;
  name: string;
  displayNameZh: string;
  logoUrl: string | null;
}

export interface MatchDto {
  id: string;
  apiFootballFixtureId: number;
  stage: string;
  kickoffAt: string;
  status: MatchStatus;
  statusLabelZh: string;
  venue: string | null;
  homeTeam: TeamDto;
  awayTeam: TeamDto;
  homeScore: number | null;
  awayScore: number | null;
  hasAiPrediction: boolean;
  canRequestPrediction: boolean;
}
```

- [ ] **Step 4: Update repository row mapping**

In `apps/api/src/modules/matches/match.repository.ts`, add:

```ts
function getStatusLabelZh(status: MatchStatus): string {
  switch (status) {
    case "scheduled":
      return "未开始";
    case "live":
      return "进行中";
    case "finished":
      return "已结束";
    case "postponed":
      return "已延期";
    case "cancelled":
      return "已取消";
  }
}
```

Extend `MatchRow`:

```ts
home_team_display_name_zh: string | null;
away_team_display_name_zh: string | null;
```

Update `toMatchDto`:

```ts
statusLabelZh: getStatusLabelZh(row.status),
homeTeam: {
  id: row.home_team_id,
  name: row.home_team_name,
  displayNameZh: row.home_team_display_name_zh ?? row.home_team_name,
  logoUrl: row.home_team_logo_url
},
awayTeam: {
  id: row.away_team_id,
  name: row.away_team_name,
  displayNameZh: row.away_team_display_name_zh ?? row.away_team_name,
  logoUrl: row.away_team_logo_url
},
```

Update SQL:

```sql
LEFT JOIN team_display_names AS home_display ON home_display.api_football_team_id = matches.home_team_id
LEFT JOIN team_display_names AS away_display ON away_display.api_football_team_id = matches.away_team_id
```

Select:

```sql
home_display.display_name_zh AS home_team_display_name_zh,
away_display.display_name_zh AS away_team_display_name_zh,
```

- [ ] **Step 5: Update fixture import expected DTOs**

In `apps/api/test/apiFootballFixtureImport.test.ts`, each expected team object must include `displayNameZh`. Each expected match must include `statusLabelZh`.

Example for Mexico:

```ts
statusLabelZh: "已结束",
homeTeam: {
  id: "16",
  name: "Mexico",
  displayNameZh: "墨西哥",
  logoUrl: "https://media.api-sports.io/football/teams/16.png"
}
```

- [ ] **Step 6: Run backend tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- publicMatches.test.ts apiFootballFixtureImport.test.ts teamDisplayNames.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types.ts apps/api/src/modules/matches/match.repository.ts apps/api/test/publicMatches.test.ts apps/api/test/apiFootballFixtureImport.test.ts
git commit -m "feat: return Chinese match display data"
```

---

### Task 4: Admin Configuration Repository and Routes

**Files:**
- Modify: `packages/shared/src/types.ts`
- Create: `apps/api/src/modules/admin/adminConfig.repository.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Test: `apps/api/test/adminConfig.test.ts`

- [ ] **Step 1: Write failing admin config tests**

Create `apps/api/test/adminConfig.test.ts` with tests for provider secrets, models, prompts, and team names:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createTestDatabase } from "./support/testDatabase";

describe("admin config API", () => {
  it("saves OpenAI-compatible providers without returning API keys", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/admin/ai-providers",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "openrouter",
        displayName: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "secret-provider-key",
        enabled: true
      }
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      name: "openrouter",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      enabled: true,
      apiKeyConfigured: true
    });
    expect(JSON.stringify(createResponse.json())).not.toContain("secret-provider-key");

    const listResponse = await app.inject({ method: "GET", url: "/api/admin/ai-providers", remoteAddress: "127.0.0.1" });
    expect(listResponse.statusCode).toBe(200);
    expect(JSON.stringify(listResponse.json())).not.toContain("secret-provider-key");

    await app.close();
  });

  it("keeps one default prompt template", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const first = await app.inject({
      method: "POST",
      url: "/api/admin/prompt-templates",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "保守预测",
        description: "偏重不败概率",
        fullPrompt: "请预测 {{homeTeam}} 对阵 {{awayTeam}}。",
        promptSummary: "保守预测",
        scope: "match_prediction",
        enabled: true,
        isDefault: true
      }
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/admin/prompt-templates",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "赔率参考",
        description: "结合赔率",
        fullPrompt: "结合赔率预测 {{homeTeam}} 对阵 {{awayTeam}}。",
        promptSummary: "赔率参考",
        scope: "match_prediction",
        enabled: true,
        isDefault: true
      }
    });
    expect(second.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/api/admin/prompt-templates", remoteAddress: "127.0.0.1" });
    const templates = list.json().promptTemplates as Array<{ isDefault: boolean }>;
    expect(templates.filter((template) => template.isDefault)).toHaveLength(1);

    await app.close();
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminConfig.test.ts
```

Expected: FAIL because admin config routes do not exist.

- [ ] **Step 3: Extend admin config DTO types**

In `packages/shared/src/types.ts`, add:

```ts
export interface AdminSummaryDto {
  matchCount: number;
  scheduledCount: number;
  liveCount: number;
  finishedCount: number;
  latestSyncLog: {
    level: string;
    source: string;
    message: string;
    createdAt: string;
  } | null;
}

export interface AiProviderConfigDto {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  enabled: boolean;
  apiKeyConfigured: boolean;
}

export interface AiModelConfigDto {
  id: string;
  providerId: string;
  modelName: string;
  displayName: string;
  enabled: boolean;
}

export interface PromptTemplateConfigDto {
  id: string;
  name: string;
  description: string;
  fullPrompt: string;
  promptSummary: string;
  scope: string;
  enabled: boolean;
  isDefault: boolean;
}
```

- [ ] **Step 4: Implement repository**

Create `apps/api/src/modules/admin/adminConfig.repository.ts` with these exported functions:

```ts
export function getAdminSummary(db: Database): AdminSummaryDto;
export function listAiProviders(db: Database): AiProviderConfigDto[];
export function createAiProvider(db: Database, input: SaveAiProviderInput, now?: Date): AiProviderConfigDto;
export function updateAiProvider(db: Database, id: string, input: SaveAiProviderInput, now?: Date): AiProviderConfigDto;
export function deleteAiProvider(db: Database, id: string): void;
export function listAiModels(db: Database): AiModelConfigDto[];
export function createAiModel(db: Database, input: SaveAiModelInput, now?: Date): AiModelConfigDto;
export function updateAiModel(db: Database, id: string, input: SaveAiModelInput, now?: Date): AiModelConfigDto;
export function deleteAiModel(db: Database, id: string): void;
export function listPromptTemplates(db: Database): PromptTemplateConfigDto[];
export function createPromptTemplate(db: Database, input: SavePromptTemplateInput, now?: Date): PromptTemplateConfigDto;
export function updatePromptTemplate(db: Database, id: string, input: SavePromptTemplateInput, now?: Date): PromptTemplateConfigDto;
export function deletePromptTemplate(db: Database, id: string): void;
```

Use `crypto.randomUUID()` for IDs. Convert SQLite integer booleans to `boolean` in DTOs. Never include `api_key` in returned DTOs; return `apiKeyConfigured: Boolean(row.api_key)`.

When saving a prompt with `isDefault: true`, run:

```sql
UPDATE prompt_templates SET is_default = 0 WHERE id != ?
```

- [ ] **Step 5: Implement route validation**

In `apps/api/src/modules/admin/admin.routes.ts`, add Zod schemas:

```ts
const aiProviderSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  enabled: z.boolean()
});

const aiModelSchema = z.object({
  providerId: z.string().min(1),
  modelName: z.string().min(1),
  displayName: z.string().min(1),
  enabled: z.boolean()
});

const promptTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  fullPrompt: z.string().min(1),
  promptSummary: z.string().min(1),
  scope: z.string().min(1),
  enabled: z.boolean(),
  isDefault: z.boolean()
});

const teamDisplayNameUpdateSchema = z.object({
  displayNameZh: z.string().min(1)
});
```

- [ ] **Step 6: Add routes**

Add all routes from the spec in `registerAdminRoutes`. Use existing local-only hook.

For team display names:

```ts
app.get("/team-display-names", async (request) => {
  const query = typeof request.query === "object" && request.query && "q" in request.query ? String((request.query as { q?: unknown }).q ?? "") : "";
  return { teams: listTeamDisplayNames(options.db, query) };
});

app.put("/team-display-names/:apiFootballTeamId", async (request, reply) => {
  const parsed = teamDisplayNameUpdateSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "Invalid team display name payload" });
  }
  const params = request.params as { apiFootballTeamId: string };
  return updateTeamDisplayName(options.db, params.apiFootballTeamId, parsed.data.displayNameZh);
});
```

- [ ] **Step 7: Run admin tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminConfig.test.ts adminSettings.test.ts adminApi.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/types.ts apps/api/src/modules/admin/admin.routes.ts apps/api/src/modules/admin/adminConfig.repository.ts apps/api/test/adminConfig.test.ts
git commit -m "feat: add admin configuration APIs"
```

---

### Task 5: Admin Fixture Sync Endpoint and Summary

**Files:**
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/src/modules/admin/adminConfig.repository.ts`
- Test: `apps/api/test/adminRawFixturesSync.test.ts`
- Test: `apps/api/test/adminConfig.test.ts`

- [ ] **Step 1: Add sync route test**

In `apps/api/test/adminRawFixturesSync.test.ts`, add a test for `POST /api/admin/sync/api-football/fixtures` using the same mock pattern already present in that file for raw fixture sync.

Expected response:

```ts
expect(response.statusCode).toBe(200);
expect(response.json()).toEqual({ synced: true, imported: 2 });
```

- [ ] **Step 2: Add summary route test**

In `apps/api/test/adminConfig.test.ts`, add:

```ts
it("returns admin summary counts", async () => {
  const { db, databasePath } = createTestDatabase();
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
  ).run("match-1", 1001, "Group Stage", "2026-06-12T19:00:00.000Z", "finished", null, "16", "Mexico", null, "1531", "South Africa", null, 2, 0, "2026-06-12T10:00:00.000Z");
  db.close();

  const app = buildApp({ databasePath, logger: false });
  const response = await app.inject({ method: "GET", url: "/api/admin/summary", remoteAddress: "127.0.0.1" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    matchCount: 1,
    scheduledCount: 0,
    liveCount: 0,
    finishedCount: 1
  });

  await app.close();
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminRawFixturesSync.test.ts adminConfig.test.ts
```

Expected: FAIL because the normal sync route and summary route do not exist.

- [ ] **Step 4: Implement normal sync route**

In `apps/api/src/modules/admin/admin.routes.ts`, add:

```ts
app.post("/sync/api-football/fixtures", async (request, reply) => {
  const apiKey = getApiFootballKey(options.db);

  if (!apiKey) {
    return reply.code(400).send({ error: "API-Football key is not configured" });
  }

  const footballService = new FootballService({ apiKey });
  const fixturesResponse = await footballService.getWorldCupFixtures();
  const errors = getApiFootballErrors(fixturesResponse);

  if (errors) {
    writeSystemLog(options.db, {
      level: "error",
      source: "api-football",
      message: "API-Football fixtures sync failed",
      details: { errors }
    });
    return reply.code(502).send({ synced: false, error: "API-Football returned errors", errors });
  }

  const importResult = importApiFootballFixturesResponse(options.db, fixturesResponse);
  writeSystemLog(options.db, {
    level: "info",
    source: "api-football",
    message: "API-Football fixtures synced",
    details: importResult
  });

  return { synced: true, imported: importResult.imported };
});
```

- [ ] **Step 5: Implement summary repository**

In `getAdminSummary`, count from `matches`:

```sql
SELECT
  COUNT(*) AS match_count,
  SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled_count,
  SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) AS live_count,
  SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) AS finished_count
FROM matches
```

For latest sync log:

```sql
SELECT level, source, message, created_at
FROM system_logs
WHERE source = 'api-football'
ORDER BY created_at DESC
LIMIT 1
```

- [ ] **Step 6: Run tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminRawFixturesSync.test.ts adminConfig.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/admin/admin.routes.ts apps/api/src/modules/admin/adminConfig.repository.ts apps/api/test/adminRawFixturesSync.test.ts apps/api/test/adminConfig.test.ts
git commit -m "feat: add admin sync summary"
```

---

### Task 6: Web API Client

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/web/test/client.test.ts`

- [ ] **Step 1: Extend web client tests**

In `apps/web/test/client.test.ts`, import and test:

```ts
getAdminSummary,
syncApiFootballFixtures,
listAdminAiProviders,
saveAdminAiProvider,
listAdminPromptTemplates,
saveAdminPromptTemplate,
listAdminTeamDisplayNames,
saveAdminTeamDisplayName
```

Example provider save assertion:

```ts
it("saves OpenAI-compatible provider configuration", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({
      id: "provider-1",
      name: "openrouter",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      enabled: true,
      apiKeyConfigured: true
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  );

  await expect(saveAdminAiProvider({
    name: "openrouter",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "secret-provider-key",
    enabled: true
  })).resolves.toMatchObject({ apiKeyConfigured: true });

  expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/admin/ai-providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "openrouter",
      displayName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "secret-provider-key",
      enabled: true
    })
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts
```

Expected: FAIL because the new client functions do not exist.

- [ ] **Step 3: Add client interfaces and functions**

In `apps/web/src/api/client.ts`, import admin DTOs:

```ts
import type {
  AdminSummaryDto,
  AiModelConfigDto,
  AiProviderConfigDto,
  MatchDto,
  PromptTemplateConfigDto,
  TeamDisplayNameDto
} from "@worldcup-ai-pk/shared";
```

Add request interfaces:

```ts
export interface SaveAiProviderRequest {
  name: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

export interface SaveAiModelRequest {
  providerId: string;
  modelName: string;
  displayName: string;
  enabled: boolean;
}

export interface SavePromptTemplateRequest {
  name: string;
  description: string;
  fullPrompt: string;
  promptSummary: string;
  scope: string;
  enabled: boolean;
  isDefault: boolean;
}
```

Add functions:

```ts
export async function getAdminSummary(): Promise<AdminSummaryDto> {
  const response = await fetch(`${apiBaseUrl}/api/admin/summary`);
  if (!response.ok) {
    throw new Error(`Admin summary request failed with status ${response.status}`);
  }
  return (await response.json()) as AdminSummaryDto;
}

export async function syncApiFootballFixtures(): Promise<{ synced: boolean; imported: number }> {
  const response = await fetch(`${apiBaseUrl}/api/admin/sync/api-football/fixtures`, { method: "POST" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API-Football fixtures sync failed with status ${response.status}`);
  }
  return (await response.json()) as { synced: boolean; imported: number };
}
```

Add equivalent list/save functions for providers, models, prompt templates, and team display names using the exact routes in the spec.

- [ ] **Step 4: Run web client tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/client.ts apps/web/test/client.test.ts
git commit -m "feat: add admin config web client"
```

---

### Task 7: Fixtures Console UI

**Files:**
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Modify: `apps/web/src/styles.css`
- Optional Test: `apps/web/test/fixturesPage.test.tsx`

- [ ] **Step 1: Decide whether to add React Testing Library**

If you add component rendering tests, install:

```bash
corepack pnpm --filter @worldcup-ai-pk/web add -D @testing-library/react @testing-library/jest-dom jsdom
```

Then update `apps/web/vite.config.ts` test environment to `jsdom`.

If you do not add these dependencies, skip component tests and verify this task through typecheck, build, and Browser visual testing after Task 8.

- [ ] **Step 2: If dependencies were added, write fixtures UI tests**

Create `apps/web/test/fixturesPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FixturesPage } from "../src/pages/FixturesPage";

describe("FixturesPage", () => {
  it("defaults to scheduled fixtures and can switch to finished fixtures", async () => {
    render(<FixturesPage matches={[
      {
        id: "scheduled-1",
        apiFootballFixtureId: 1,
        stage: "Group Stage - 1",
        kickoffAt: "2026-06-12T19:00:00.000Z",
        status: "scheduled",
        statusLabelZh: "未开始",
        venue: "BMO Field",
        homeTeam: { id: "5529", name: "Canada", displayNameZh: "加拿大", logoUrl: null },
        awayTeam: { id: "1113", name: "Bosnia & Herzegovina", displayNameZh: "波黑", logoUrl: null },
        homeScore: null,
        awayScore: null,
        hasAiPrediction: false,
        canRequestPrediction: true
      },
      {
        id: "finished-1",
        apiFootballFixtureId: 2,
        stage: "Group Stage - 1",
        kickoffAt: "2026-06-11T19:00:00.000Z",
        status: "finished",
        statusLabelZh: "已结束",
        venue: "Estadio Azteca",
        homeTeam: { id: "16", name: "Mexico", displayNameZh: "墨西哥", logoUrl: null },
        awayTeam: { id: "1531", name: "South Africa", displayNameZh: "南非", logoUrl: null },
        homeScore: 2,
        awayScore: 0,
        hasAiPrediction: false,
        canRequestPrediction: false
      }
    ]} />);

    expect(screen.getByText("加拿大")).toBeInTheDocument();
    expect(screen.queryByText("墨西哥")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "已结束" }));
    expect(screen.getByText("墨西哥")).toBeInTheDocument();
    expect(screen.getByText("2 - 0")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run optional UI test and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx
```

Expected: FAIL because the status control and score-first finished card are not implemented.

- [ ] **Step 4: Implement fixture console**

In `apps/web/src/pages/FixturesPage.tsx`, replace the flat `match-list` with:

- local state `activeStatus` defaulting to `"scheduled"`
- local state `searchText`
- local state `stageFilter`
- derived counts from `matches`
- derived `stages`
- filtered matches
- date grouping using `Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" })`

Use `match.homeTeam.displayNameZh` and `match.awayTeam.displayNameZh`.

Use score helper:

```ts
function getScoreText(match: MatchDto): string {
  if (match.homeScore === null || match.awayScore === null) {
    return "比分待同步";
  }
  return `${match.homeScore} - ${match.awayScore}`;
}
```

- [ ] **Step 5: Restyle fixtures**

In `apps/web/src/styles.css`, add styles for:

- `.fixtures-console`
- `.fixture-metrics`
- `.status-tabs`
- `.fixture-filters`
- `.fixture-date-group`
- `.match-card`
- `.team-line`
- `.score-pill`
- responsive behavior under `720px`

Keep cards compact. Avoid large hero sections and decorative blobs.

- [ ] **Step 6: Run checks**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test
corepack pnpm --filter @worldcup-ai-pk/web typecheck
corepack pnpm --filter @worldcup-ai-pk/web build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/FixturesPage.tsx apps/web/src/styles.css apps/web/test/fixturesPage.test.tsx apps/web/package.json pnpm-lock.yaml apps/web/vite.config.ts
git commit -m "feat: redesign fixtures console"
```

If no React Testing Library dependencies were added, omit `apps/web/test/fixturesPage.test.tsx`, `apps/web/package.json`, `pnpm-lock.yaml`, and `apps/web/vite.config.ts` from the commit.

---

### Task 8: Admin Configuration Center UI

**Files:**
- Modify: `apps/web/src/pages/AdminPage.tsx`
- Modify: `apps/web/src/styles.css`
- Optional Test: `apps/web/test/adminPage.test.tsx`

- [ ] **Step 1: If React Testing Library exists, write admin UI test**

Create `apps/web/test/adminPage.test.tsx` only if Task 7 added component testing dependencies.

Test module labels render:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminPage } from "../src/pages/AdminPage";

vi.mock("../src/api/client", () => ({
  getAdminApiFootballSettings: vi.fn().mockResolvedValue({ configured: true }),
  getAdminSummary: vi.fn().mockResolvedValue({ matchCount: 72, scheduledCount: 70, liveCount: 0, finishedCount: 2, latestSyncLog: null }),
  listAdminAiProviders: vi.fn().mockResolvedValue([]),
  listAdminAiModels: vi.fn().mockResolvedValue([]),
  listAdminPromptTemplates: vi.fn().mockResolvedValue([]),
  listAdminTeamDisplayNames: vi.fn().mockResolvedValue([]),
  saveAdminApiFootballKey: vi.fn(),
  syncApiFootballFixtures: vi.fn(),
  saveAdminAiProvider: vi.fn(),
  saveAdminAiModel: vi.fn(),
  saveAdminPromptTemplate: vi.fn(),
  saveAdminTeamDisplayName: vi.fn()
}));

describe("AdminPage", () => {
  it("renders configuration center modules", async () => {
    render(<AdminPage />);
    expect(await screen.findByText("数据源配置")).toBeInTheDocument();
    expect(screen.getByText("模型供应商")).toBeInTheDocument();
    expect(screen.getByText("提示词模板")).toBeInTheDocument();
    expect(screen.getByText("球队中文名")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run optional test and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- adminPage.test.tsx
```

Expected: FAIL because the admin module UI is not implemented.

- [ ] **Step 3: Implement module shell**

In `apps/web/src/pages/AdminPage.tsx`, replace static `modules` cards with:

```ts
type AdminModule = "data-source" | "providers" | "models" | "prompts" | "teams";

const adminModules: Array<{ id: AdminModule; label: string }> = [
  { id: "data-source", label: "数据源配置" },
  { id: "providers", label: "模型供应商" },
  { id: "models", label: "模型列表" },
  { id: "prompts", label: "提示词模板" },
  { id: "teams", label: "球队中文名" }
];
```

Use `useEffect` to load settings, summary, providers, models, prompts, and teams through the client functions from Task 6.

- [ ] **Step 4: Implement data source module**

Keep existing API-Football key save behavior. Add:

- imported match count
- scheduled/live/finished counts
- normal sync button calling `syncApiFootballFixtures`
- latest sync log display

- [ ] **Step 5: Implement providers and models modules**

Provider form fields:

- display name
- internal name
- base URL
- API key
- enabled checkbox

Model form fields:

- provider select
- model name
- display name
- enabled checkbox

After save, reload the list. Do not display API key values.

- [ ] **Step 6: Implement prompt templates module**

Prompt form fields:

- name
- description
- prompt summary
- scope
- full prompt textarea
- enabled checkbox
- default checkbox

Show static supported variables:

```txt
{{homeTeam}}
{{awayTeam}}
{{kickoffAt}}
{{stage}}
{{venue}}
```

After save, reload prompt template list.

- [ ] **Step 7: Implement team display name module**

Fields:

- search input
- team rows with logo, original name, API-Football team ID, Chinese display input, source
- save button per row

Save calls `saveAdminTeamDisplayName(apiFootballTeamId, displayNameZh)` and reloads search results.

- [ ] **Step 8: Restyle admin**

In `apps/web/src/styles.css`, add styles for:

- `.admin-layout`
- `.admin-sidebar`
- `.admin-module-button`
- `.admin-panel`
- `.admin-form-grid`
- `.admin-table`
- `.secret-note`
- `.config-status`

Keep text compact and avoid nested cards inside cards.

- [ ] **Step 9: Run web checks**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test
corepack pnpm --filter @worldcup-ai-pk/web typecheck
corepack pnpm --filter @worldcup-ai-pk/web build
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/pages/AdminPage.tsx apps/web/src/styles.css apps/web/test/adminPage.test.tsx
git commit -m "feat: build admin configuration center"
```

If no component test was added, omit `apps/web/test/adminPage.test.tsx`.

---

### Task 9: Full Verification and Browser QA

**Files:**
- Modify only files needed to fix issues discovered by verification.

- [ ] **Step 1: Run full automated checks**

Run:

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
```

Expected: all commands PASS.

- [ ] **Step 2: Start dev servers**

Run:

```bash
corepack pnpm dev
```

Expected:

- API listening on `http://127.0.0.1:4000`
- Web listening on `http://127.0.0.1:5173/`

- [ ] **Step 3: Browser QA fixtures**

Open `http://127.0.0.1:5173/`.

Verify:

- default fixtures tab is `未开始`
- tabs switch to `进行中` and `已结束`
- finished matches show scores
- Chinese team names appear where seed or admin display names exist
- search filters by Chinese and original names
- stage filter changes visible list
- mobile width does not create overlapping text

- [ ] **Step 4: Browser QA admin**

Open the admin section in the same app.

Verify:

- API-Football configured state renders
- normal fixture sync button works when API key is configured
- provider can be saved and listed with no API key revealed
- model can be saved under a provider
- prompt template can be saved and marked default
- team Chinese display name can be edited and affects public fixtures after reload

- [ ] **Step 5: Commit verification fixes**

If verification required fixes:

```bash
git add packages/shared/src/types.ts apps/api/src/db/schema.sql apps/api/src/db/schema.ts apps/api/src/modules/football/fixtureImport.service.ts apps/api/src/modules/matches/match.repository.ts apps/api/src/modules/admin/admin.routes.ts apps/api/src/modules/admin/adminConfig.repository.ts apps/api/src/modules/teams apps/api/test apps/web/src/api/client.ts apps/web/src/pages/FixturesPage.tsx apps/web/src/pages/AdminPage.tsx apps/web/src/styles.css apps/web/test apps/web/package.json apps/web/vite.config.ts pnpm-lock.yaml
git commit -m "fix: polish UI config verification issues"
```

If no fixes were required, do not create an empty commit.

---

## Plan Self-Review

Spec coverage:

- Fixture console: Task 7.
- Finished scores: Task 3 and Task 7.
- Chinese team display names: Task 2, Task 3, Task 8.
- Admin configuration center: Task 4, Task 5, Task 6, Task 8.
- Secret handling: Task 4 and Task 8.
- Tests and verification: every task plus Task 9.

Placeholder scan:

- No `TBD`.
- No `TODO`.
- No deferred implementation placeholders.

Type consistency:

- `displayNameZh`, `statusLabelZh`, `apiKeyConfigured`, `baseUrl`, `modelName`, `promptSummary`, and `isDefault` are defined before use.
- Existing `apiFootball.apiKey`, `MatchDto`, and current route prefixes match verified source files.
