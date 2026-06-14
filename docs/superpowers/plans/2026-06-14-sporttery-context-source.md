# Sporttery Context Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收口当前工作区已有的体彩赛前情报数据源改动，让 `sporttery` 稳定进入比赛数据卡和 AI 预测上下文。

**Architecture:** 保留当前未提交实现的模块边界：`SportteryClient` 负责体彩 HTTP 请求，`sportteryContextParsers` 负责摘要解析，`sportteryMapping.repository` 负责 API-Football fixture 到体彩 match id 的映射，`fixtureContext.service` 将体彩摘要写入 context snapshot。计划重点是补齐迁移幂等性、后台设置与映射测试、context refresh 链路测试，并将当前改动整理成一个可验证提交。

**Tech Stack:** TypeScript, Fastify, better-sqlite3, React, Vitest, Testing Library, Node.js scripts。

---

## Current State

当前工作区已有未提交实现，且已经通过：

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
```

已存在但未提交的主要文件：

- `packages/shared/src/types.ts`
- `apps/api/src/modules/football/sportteryClient.ts`
- `apps/api/src/modules/football/sportteryMapping.repository.ts`
- `apps/api/src/modules/context/sportteryContextParsers.ts`
- `apps/api/src/modules/context/fixtureContext.service.ts`
- `apps/api/src/modules/context/fixtureContext.repository.ts`
- `apps/api/src/modules/admin/admin.routes.ts`
- `apps/api/src/modules/public/public.routes.ts`
- `apps/api/src/modules/settings/settings.repository.ts`
- `apps/api/src/db/schema.sql`
- `apps/api/scripts/syncSportteryMappings.mjs`
- `apps/api/test/sporttery.test.ts`
- Web data option and context drawer files.

Known gap:

- `apps/api/src/db/schema.sql` currently defines `sporttery_summary_json` inside `CREATE TABLE fixture_context_snapshots` and also runs unconditional `ALTER TABLE fixture_context_snapshots ADD COLUMN sporttery_summary_json ...`. Existing tests pass but do not assert the new column; implementation must make this migration idempotent according to the project’s current schema strategy.
- No dedicated admin API test currently covers `GET/PUT /api/admin/settings/sporttery` or `/api/admin/sporttery-mappings`.
- No context refresh test currently proves mapped and enabled体彩数据 produces a `sporttery` domain summary.

---

## File Structure

- Modify: `apps/api/src/db/schema.sql`
  - Keep schema idempotent for new and old databases.
- Modify: `apps/api/test/schemaMigration.test.ts`
  - Assert `sporttery_summary_json` and `fixture_sporttery_mappings`.
- Modify: `apps/api/test/adminConfig.test.ts`
  - Add admin tests for体彩 settings and mapping CRUD.
- Modify: `apps/api/test/fixtureContextApi.test.ts`
  - Add refresh-path test proving体彩 context gets fetched when enabled and mapped.
- Review and keep existing changes in:
  - `packages/shared/src/types.ts`
  - `apps/api/src/modules/football/sportteryClient.ts`
  - `apps/api/src/modules/football/sportteryMapping.repository.ts`
  - `apps/api/src/modules/context/sportteryContextParsers.ts`
  - `apps/api/src/modules/context/fixtureContext.repository.ts`
  - `apps/api/src/modules/context/fixtureContext.service.ts`
  - `apps/api/src/modules/public/public.routes.ts`
  - `apps/api/src/modules/admin/builtInPromptTemplates.ts`
  - `apps/api/src/modules/settings/settings.repository.ts`
  - `apps/api/scripts/syncSportteryMappings.mjs`
  - `apps/web/src/components/MatchContextDrawer.tsx`
  - `apps/web/src/components/PredictionRequestDrawer.tsx`
  - `apps/web/src/pages/FixturesPage.tsx`
  - `apps/web/test/client.test.ts`
  - `apps/web/test/fixturesPage.test.tsx`
  - `apps/web/test/predictionDrawer.test.tsx`
  - `apps/api/test/sporttery.test.ts`
  - `apps/api/test/fixtureContextRepository.test.ts`
  - `apps/api/test/publicPredictionRequest.test.ts`

---

### Task 1: Schema Migration Coverage

**Files:**
- Modify: `apps/api/test/schemaMigration.test.ts`

- [ ] **Step 1: Add failing assertions for体彩 schema**

In `apps/api/test/schemaMigration.test.ts`, inside `creates fixture context cache tables and prediction request option columns`, after the existing table assertions for `prediction_run_logs`, add:

```ts
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("fixture_sporttery_mappings")
    ).toMatchObject({ name: "fixture_sporttery_mappings" });
```

After the `predictionRequestColumns` assertion block, add:

```ts
    const contextSnapshotColumns = db.prepare("PRAGMA table_info(fixture_context_snapshots)").all() as Array<{ name: string }>;
    expect(contextSnapshotColumns.map((column) => column.name)).toContain("sporttery_summary_json");
```

The local test body should include:

```ts
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("fixture_sporttery_mappings")
    ).toMatchObject({ name: "fixture_sporttery_mappings" });

    const contextSnapshotColumns = db.prepare("PRAGMA table_info(fixture_context_snapshots)").all() as Array<{ name: string }>;
    expect(contextSnapshotColumns.map((column) => column.name)).toContain("sporttery_summary_json");
```

- [ ] **Step 2: Run focused test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- schemaMigration.test.ts
```

Expected: PASS if the current schema already creates the table and column. If it fails with a duplicate-column error, proceed to Task 2 before committing.

- [ ] **Step 3: Commit test coverage if it passes**

```bash
git add apps/api/test/schemaMigration.test.ts
git commit -m "test: cover sporttery schema migration"
```

If Step 2 fails because schema is not idempotent, do not commit yet. Keep the test change staged or unstaged, complete Task 2, then commit Task 1 and Task 2 together with message:

```bash
git add apps/api/test/schemaMigration.test.ts apps/api/src/db/schema.sql
git commit -m "fix: make sporttery schema migration idempotent"
```

---

### Task 2: Schema Idempotency

**Files:**
- Modify: `apps/api/src/db/schema.sql`
- Test: `apps/api/test/schemaMigration.test.ts`

- [ ] **Step 1: Inspect current migration pattern**

Read `apps/api/src/db/schema.ts` and `apps/api/src/db/schema.sql`.

Run:

```bash
sed -n '1,220p' apps/api/src/db/schema.ts
sed -n '180,240p' apps/api/src/db/schema.sql
```

Expected: understand whether `applySchema` ignores duplicate-column errors globally or whether schema SQL must avoid duplicate `ALTER TABLE` statements.

- [ ] **Step 2: Fix duplicate sporttery column migration if needed**

If `applySchema` does not safely ignore duplicate-column errors, change `apps/api/src/db/schema.sql` so the schema remains idempotent. Use the project’s existing approach. The acceptable final state is:

```sql
CREATE TABLE IF NOT EXISTS fixture_context_snapshots (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  odds_summary_json TEXT NOT NULL,
  api_prediction_summary_json TEXT NOT NULL,
  head_to_head_summary_json TEXT NOT NULL,
  squad_summary_json TEXT NOT NULL,
  dongqiudi_intel_summary_json TEXT NOT NULL,
  sporttery_summary_json TEXT NOT NULL,
  completeness TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

and one migration path that does not break repeated startup for older DBs. If the existing `applySchema` safely ignores duplicate column errors, keep both the `CREATE TABLE` column and the `ALTER TABLE` statement unchanged.

- [ ] **Step 3: Run focused migration test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- schemaMigration.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

If Task 1 was not already committed, commit both files:

```bash
git add apps/api/src/db/schema.sql apps/api/test/schemaMigration.test.ts
git commit -m "fix: make sporttery schema migration idempotent"
```

If Task 1 was already committed and schema required no change, skip this commit.

---

### Task 3: Admin API Coverage

**Files:**
- Modify: `apps/api/test/adminConfig.test.ts`
- Existing implementation: `apps/api/src/modules/admin/admin.routes.ts`, `apps/api/src/modules/settings/settings.repository.ts`, `apps/api/src/modules/football/sportteryMapping.repository.ts`

- [ ] **Step 1: Add failing admin API test**

In `apps/api/test/adminConfig.test.ts`, after `returns fixture context sync status for admin cache module`, add:

```ts
  it("saves sporttery settings and fixture mappings", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const initialSettings = await app.inject({ method: "GET", url: "/api/admin/settings/sporttery", remoteAddress: "127.0.0.1" });
    expect(initialSettings.statusCode).toBe(200);
    expect(initialSettings.json()).toEqual({ enabled: false });

    const saveSettings = await app.inject({
      method: "PUT",
      url: "/api/admin/settings/sporttery",
      remoteAddress: "127.0.0.1",
      payload: { enabled: true }
    });
    expect(saveSettings.statusCode).toBe(200);
    expect(saveSettings.json()).toEqual({ enabled: true });

    const createMapping = await app.inject({
      method: "POST",
      url: "/api/admin/sporttery-mappings",
      remoteAddress: "127.0.0.1",
      payload: { apiFootballFixtureId: 1001, sportteryMatchId: 2040170 }
    });
    expect(createMapping.statusCode).toBe(200);
    expect(createMapping.json()).toMatchObject({
      apiFootballFixtureId: 1001,
      sportteryMatchId: 2040170
    });

    const listMappings = await app.inject({ method: "GET", url: "/api/admin/sporttery-mappings", remoteAddress: "127.0.0.1" });
    expect(listMappings.statusCode).toBe(200);
    expect(listMappings.json()).toEqual({
      mappings: [
        expect.objectContaining({
          apiFootballFixtureId: 1001,
          sportteryMatchId: 2040170
        })
      ]
    });

    const deleteMapping = await app.inject({
      method: "DELETE",
      url: "/api/admin/sporttery-mappings/1001",
      remoteAddress: "127.0.0.1"
    });
    expect(deleteMapping.statusCode).toBe(200);
    expect(deleteMapping.json()).toEqual({ deleted: true });

    const emptyMappings = await app.inject({ method: "GET", url: "/api/admin/sporttery-mappings", remoteAddress: "127.0.0.1" });
    expect(emptyMappings.statusCode).toBe(200);
    expect(emptyMappings.json()).toEqual({ mappings: [] });

    await app.close();
  });
```

- [ ] **Step 2: Run focused test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminConfig.test.ts
```

Expected: PASS if the current admin implementation is complete. If it fails, read the exact error and fix only the missing admin route, settings repository, or mapping repository behavior required by this test.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/adminConfig.test.ts apps/api/src/modules/admin/admin.routes.ts apps/api/src/modules/settings/settings.repository.ts apps/api/src/modules/football/sportteryMapping.repository.ts
git commit -m "test: cover sporttery admin settings"
```

If implementation files did not change in this task, `git add` will only stage the test file and any already-untracked implementation file required for the test.

---

### Task 4: Context Refresh Coverage

**Files:**
- Modify: `apps/api/test/fixtureContextApi.test.ts`
- Existing implementation: `apps/api/src/modules/context/fixtureContext.service.ts`, `apps/api/src/modules/public/public.routes.ts`, `apps/api/src/modules/football/sportteryMapping.repository.ts`

- [ ] **Step 1: Add context refresh test for mapped体彩 data**

In `apps/api/test/fixtureContextApi.test.ts`, add imports if missing:

```ts
import { saveSportteryEnabled } from "../src/modules/settings/settings.repository";
import { upsertSportteryMapping } from "../src/modules/football/sportteryMapping.repository";
```

Add this test after the existing context refresh tests:

```ts
  it("refreshes sporttery context when enabled and mapped", async () => {
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
    ).run(
      "match-1",
      1001,
      "Group Stage - 1",
      "2026-06-14T12:00:00.000Z",
      "scheduled",
      "BMO Field",
      "home-1",
      "德国",
      null,
      "away-1",
      "法国",
      null,
      null,
      null,
      "2026-06-13T08:00:00.000Z"
    );
    saveSportteryEnabled(db, true, new Date("2026-06-13T08:00:00.000Z"));
    upsertSportteryMapping(db, 1001, 2040170, new Date("2026-06-13T08:00:00.000Z"));
    db.close();

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes("getMatchListV1")) {
        return new Response(
          JSON.stringify({
            value: {
              matchInfoList: [
                {
                  subMatchList: [
                    {
                      matchId: 2040170,
                      oddsList: [{ poolCode: "HAD", h: "2.50", d: "3.20", a: "2.80", goalLine: "" }]
                    }
                  ]
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (href.includes("getResultHistoryV1")) {
        return new Response(
          JSON.stringify({ value: { statistics: { totalLegCnt: "6", winProbability: "50%", drawProbability: "20%", lossProbability: "30%" } } }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ value: {} }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/public/matches/match-1/context/refresh",
      payload: {
        dataOptions: {
          useOdds: false,
          useApiFootballPrediction: false,
          useHeadToHead: false,
          usePlayerLineupInjuries: false,
          useDongqiudiIntel: false,
          useSporttery: true
        }
      }
    });

    expect(response.statusCode).toBe(200);
    const sportteryDomain = response.json().domains.find((domain: { domain: string }) => domain.domain === "sporttery");
    expect(sportteryDomain).toMatchObject({
      domain: "sporttery",
      status: "cached"
    });
    expect(sportteryDomain.summary).toContain("胜平负赔率 主2.50/平3.20/客2.80");
    expect(sportteryDomain.summary).toContain("历史交锋 6场");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("getMatchListV1.qry?clientCode=3001"),
      expect.objectContaining({ headers: expect.objectContaining({ Referer: "https://www.sporttery.cn/" }) })
    );

    await app.close();
  });
```

- [ ] **Step 2: Run focused test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- fixtureContextApi.test.ts
```

Expected: PASS. If it fails because imports already exist or test helpers differ, read the file and adapt exactly to existing imports and helper names.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/fixtureContextApi.test.ts apps/api/src/modules/context/fixtureContext.service.ts apps/api/src/modules/public/public.routes.ts apps/api/src/modules/football/sportteryMapping.repository.ts
git commit -m "test: cover sporttery context refresh"
```

If implementation files did not change in this task, they will not be included unless already untracked and required.

---

### Task 5: Review Prompt and Frontend Integration

**Files:**
- Review: `apps/api/src/modules/admin/builtInPromptTemplates.ts`
- Review: `apps/web/src/components/MatchContextDrawer.tsx`
- Review: `apps/web/src/components/PredictionRequestDrawer.tsx`
- Review: `apps/web/src/pages/FixturesPage.tsx`
- Review tests: `apps/web/test/client.test.ts`, `apps/web/test/fixturesPage.test.tsx`, `apps/web/test/predictionDrawer.test.tsx`

- [ ] **Step 1: Confirm prompt rule wording**

Run:

```bash
rg -n "体彩数据|官方赔率不得作为胜平负预测的权重|useSporttery|sporttery" apps/api/src/modules/admin/builtInPromptTemplates.ts apps/web/src apps/web/test
```

Expected:

- Prompt includes `官方赔率不得作为胜平负预测的权重`.
- `MatchContextDrawer` maps `sporttery` to `体彩数据`.
- `PredictionRequestDrawer` defaults `useSporttery: true` and renders `使用体彩数据`.
- `FixturesPage` default context options include `useSporttery: true`.
- Web tests include `useSporttery` request payload expectations.

- [ ] **Step 2: Run focused web tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts fixturesPage.test.tsx predictionDrawer.test.tsx matchContextDrawer.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit frontend and prompt integration**

```bash
git add apps/api/src/modules/admin/builtInPromptTemplates.ts apps/web/src/components/MatchContextDrawer.tsx apps/web/src/components/PredictionRequestDrawer.tsx apps/web/src/pages/FixturesPage.tsx apps/web/test/client.test.ts apps/web/test/fixturesPage.test.tsx apps/web/test/predictionDrawer.test.tsx
git commit -m "feat: expose sporttery prediction option"
```

---

### Task 6: Commit Core Sporttery Source

**Files:**
- Create: `apps/api/src/modules/football/sportteryClient.ts`
- Create: `apps/api/src/modules/football/sportteryMapping.repository.ts`
- Create: `apps/api/src/modules/context/sportteryContextParsers.ts`
- Create: `apps/api/test/sporttery.test.ts`
- Create: `apps/api/scripts/syncSportteryMappings.mjs`
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/api/src/modules/context/fixtureContext.repository.ts`
- Modify: `apps/api/src/modules/context/fixtureContext.service.ts`
- Modify: `apps/api/src/modules/public/public.routes.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/src/modules/settings/settings.repository.ts`
- Modify: `apps/api/test/fixtureContextRepository.test.ts`
- Modify: `apps/api/test/publicPredictionRequest.test.ts`

- [ ] **Step 1: Run focused API tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- sporttery.test.ts fixtureContextRepository.test.ts publicPredictionRequest.test.ts adminConfig.test.ts fixtureContextApi.test.ts schemaMigration.test.ts
```

Expected: PASS.

- [ ] **Step 2: Inspect staged scope before commit**

Run:

```bash
git status --short
git diff --stat
```

Expected: remaining unstaged or untracked files should be exactly the sporttery source, schema, API, tests, script, shared type, and frontend files listed in this plan. If unrelated files appear, stop and inspect before staging.

- [ ] **Step 3: Commit remaining sporttery source**

Stage all remaining sporttery source and tests that are not already committed:

```bash
git add packages/shared/src/types.ts \
  apps/api/src/db/schema.sql \
  apps/api/src/modules/football/sportteryClient.ts \
  apps/api/src/modules/football/sportteryMapping.repository.ts \
  apps/api/src/modules/context/sportteryContextParsers.ts \
  apps/api/src/modules/context/fixtureContext.repository.ts \
  apps/api/src/modules/context/fixtureContext.service.ts \
  apps/api/src/modules/public/public.routes.ts \
  apps/api/src/modules/admin/admin.routes.ts \
  apps/api/src/modules/settings/settings.repository.ts \
  apps/api/scripts/syncSportteryMappings.mjs \
  apps/api/test/sporttery.test.ts \
  apps/api/test/fixtureContextRepository.test.ts \
  apps/api/test/publicPredictionRequest.test.ts
git commit -m "feat: add sporttery context source"
```

If some listed files were already committed by earlier tasks, Git will ignore unchanged files.

---

### Task 7: Final Verification

**Files:**
- No source changes expected.

- [ ] **Step 1: Run full verification**

Run:

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
```

Expected: all PASS.

- [ ] **Step 2: Check working tree**

Run:

```bash
git status --short
```

Expected: no output. If output remains, inspect each path. Only proceed if every remaining path is intentionally outside this feature; otherwise commit the missing sporttery file with the most relevant previous commit message.

- [ ] **Step 3: Confirm recent commits**

Run:

```bash
git log --oneline -12
```

Expected: recent commits include:

- `docs: design sporttery context source`
- plan commit for this file
- schema/test/admin/context/frontend/core sporttery commits from this plan

- [ ] **Step 4: Report final state**

Final response must include:

- Summary of体彩 data source behavior.
- Verification commands and pass status.
- Whether working tree is clean.
- Reminder that赔率 enters prompt only as background, not as prediction weight.
