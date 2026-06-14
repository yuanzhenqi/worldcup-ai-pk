# 体彩优先预测上下文 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sporttery the only default prediction context source, add automatic Sporttery mapping sync, improve data presentation, and surface latest prediction summaries on match cards.

**Architecture:** Keep existing context domain infrastructure, but change default callers to request only `sporttery`. Add a Sporttery mapping sync service that can be reused by admin bulk sync and per-match refresh. Keep API-Football for fixtures, scores, statuses, and team base data only.

**Tech Stack:** TypeScript, Fastify, SQLite via better-sqlite3, React, Vitest, Testing Library, Vite.

---

## File Structure

- Modify `apps/api/src/modules/football/sportteryMapping.repository.ts`
  - Add reusable mapping sync helpers using exact Chinese team names.
- Modify `apps/api/src/modules/context/fixtureContext.service.ts`
  - Accept match team names.
  - Ensure Sporttery mapping before refresh.
  - Return `unavailable` when Sporttery has no matching World Cup row.
- Modify `apps/api/src/modules/public/public.routes.ts`
  - Select home/away team ids and display-name rows for refresh calls.
  - Resolve the same Chinese display names used by the public schedule.
  - Default prediction request data options to Sporttery only.
- Modify `apps/api/src/modules/admin/admin.routes.ts`
  - Add bulk Sporttery mapping sync endpoint.
  - Use Sporttery-only defaults in admin context refresh.
  - Reuse `listMatches` so bulk sync uses the public schedule's Chinese display names.
- Modify `apps/api/src/modules/context/sportteryContextParsers.ts`
  - Change summary text to section labels: `官方指数` / `历史交锋` / `积分形势` / `近期状态` / `特征对比` / `伤停影响`.
- Modify `apps/api/src/modules/admin/builtInPromptTemplates.ts`
  - Replace UI-facing old market wording with `官方指数` / `市场背景`.
  - Keep the rule that official index values must not be prediction weights.
- Modify tests:
  - `apps/api/test/fixtureContextApi.test.ts`
  - `apps/api/test/adminConfig.test.ts`
  - `apps/api/test/publicPredictionRequest.test.ts`
  - `apps/api/test/sporttery.test.ts`
- Modify `apps/web/src/api/client.ts`
  - Add admin Sporttery settings, mapping list, and sync API methods.
- Modify `apps/web/src/pages/AdminPage.tsx`
  - Add Sporttery data source controls and sync feedback.
- Modify `apps/web/src/components/PredictionRequestDrawer.tsx`
  - Simplify data source section to Sporttery only.
- Modify `apps/web/src/components/MatchContextDrawer.tsx`
  - Render Sporttery-only intelligence sections.
- Modify `apps/web/src/pages/FixturesPage.tsx`
  - Change default context/prediction options.
  - Load latest prediction history summary at card level for matches with history.
- Modify tests:
  - `apps/web/test/client.test.ts`
  - `apps/web/test/adminPage.test.tsx`
  - `apps/web/test/predictionDrawer.test.tsx`
  - `apps/web/test/matchContextDrawer.test.tsx`
  - `apps/web/test/fixturesPage.test.tsx`

---

## Task 1: Sporttery Auto Mapping Service

**Files:**
- Modify: `apps/api/src/modules/football/sportteryMapping.repository.ts`
- Test: `apps/api/test/sporttery.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `apps/api/test/sporttery.test.ts`:

```ts
import { createTestDatabase } from "./support/testDatabase";
import {
  ensureSportteryMappingForFixture,
  syncSportteryMappingsForMatches
} from "../src/modules/football/sportteryMapping.repository";

it("syncs exact World Cup Sporttery fixture mappings", () => {
  const { db } = createTestDatabase();
  const result = syncSportteryMappingsForMatches(db, {
    matches: [
      { apiFootballFixtureId: 1001, homeTeamName: "德国", awayTeamName: "库拉索" },
      { apiFootballFixtureId: 1002, homeTeamName: "荷兰", awayTeamName: "日本" }
    ],
    sportteryMatchList: {
      value: {
        matchInfoList: [
          {
            subMatchList: [
              { leagueAbbName: "世界杯", leagueAllName: "世界杯", homeTeamAbbName: "德国", awayTeamAbbName: "库拉索", matchId: 2040170 },
              { leagueAbbName: "芬超", leagueAllName: "芬超", homeTeamAbbName: "荷兰", awayTeamAbbName: "日本", matchId: 9999999 }
            ]
          }
        ]
      }
    }
  });

  expect(result).toEqual({
    matched: 1,
    unmatched: 0,
    totalSportteryMatches: 1
  });
  expect(db.prepare("SELECT api_football_fixture_id, sporttery_match_id FROM fixture_sporttery_mappings").all()).toEqual([
    { api_football_fixture_id: 1001, sporttery_match_id: 2040170 }
  ]);
  db.close();
});

it("ensures a single Sporttery mapping when exact names match", () => {
  const { db } = createTestDatabase();
  const mapping = ensureSportteryMappingForFixture(db, {
    apiFootballFixtureId: 1001,
    homeTeamName: "德国",
    awayTeamName: "库拉索",
    sportteryMatchList: {
      value: {
        matchInfoList: [
          {
            subMatchList: [
              { leagueAbbName: "世界杯", leagueAllName: "世界杯", homeTeamAbbName: "德国", awayTeamAbbName: "库拉索", matchId: 2040170 }
            ]
          }
        ]
      }
    }
  });

  expect(mapping).toMatchObject({ apiFootballFixtureId: 1001, sportteryMatchId: 2040170 });
  db.close();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- sporttery.test.ts
```

Expected: FAIL because `ensureSportteryMappingForFixture` and `syncSportteryMappingsForMatches` are not exported.

- [ ] **Step 3: Implement mapping helpers**

Add to `apps/api/src/modules/football/sportteryMapping.repository.ts`:

```ts
interface SportteryMatchListInput {
  value?: {
    matchInfoList?: unknown[];
  };
}

interface MatchMappingInput {
  apiFootballFixtureId: number;
  homeTeamName: string;
  awayTeamName: string;
}

interface SyncSportteryMappingsInput {
  matches: MatchMappingInput[];
  sportteryMatchList: unknown;
  now?: Date;
}

export interface SportteryMappingSyncResult {
  matched: number;
  unmatched: number;
  totalSportteryMatches: number;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function listWorldCupSportteryMatches(sportteryMatchList: unknown): Array<{ homeTeamName: string; awayTeamName: string; sportteryMatchId: number }> {
  const days = (sportteryMatchList as SportteryMatchListInput)?.value?.matchInfoList;
  if (!Array.isArray(days)) return [];

  const matches: Array<{ homeTeamName: string; awayTeamName: string; sportteryMatchId: number }> = [];
  for (const day of days) {
    const subMatchList = (day as { subMatchList?: unknown[] })?.subMatchList;
    if (!Array.isArray(subMatchList)) continue;
    for (const item of subMatchList) {
      const record = item as Record<string, unknown>;
      const leagueAbbName = text(record.leagueAbbName);
      const leagueAllName = text(record.leagueAllName);
      const homeTeamName = text(record.homeTeamAbbName);
      const awayTeamName = text(record.awayTeamAbbName);
      const sportteryMatchId = record.matchId;
      if ((leagueAbbName !== "世界杯" && leagueAllName !== "世界杯") || !homeTeamName || !awayTeamName || typeof sportteryMatchId !== "number") {
        continue;
      }
      matches.push({ homeTeamName, awayTeamName, sportteryMatchId });
    }
  }
  return matches;
}

export function ensureSportteryMappingForFixture(
  db: Database,
  input: MatchMappingInput & { sportteryMatchList: unknown; now?: Date }
): SportteryMappingDto | null {
  const existing = getSportteryMappingByFixtureId(db, input.apiFootballFixtureId);
  if (existing) return existing;

  const sportteryMatch = listWorldCupSportteryMatches(input.sportteryMatchList).find(
    (match) => match.homeTeamName === input.homeTeamName && match.awayTeamName === input.awayTeamName
  );
  if (!sportteryMatch) return null;

  return upsertSportteryMapping(db, input.apiFootballFixtureId, sportteryMatch.sportteryMatchId, input.now);
}

export function syncSportteryMappingsForMatches(db: Database, input: SyncSportteryMappingsInput): SportteryMappingSyncResult {
  const sportteryMatches = listWorldCupSportteryMatches(input.sportteryMatchList);
  let matched = 0;
  for (const match of input.matches) {
    const sportteryMatch = sportteryMatches.find(
      (item) => item.homeTeamName === match.homeTeamName && item.awayTeamName === match.awayTeamName
    );
    if (!sportteryMatch) continue;
    upsertSportteryMapping(db, match.apiFootballFixtureId, sportteryMatch.sportteryMatchId, input.now);
    matched += 1;
  }
  return {
    matched,
    unmatched: sportteryMatches.length - matched,
    totalSportteryMatches: sportteryMatches.length
  };
}
```

- [ ] **Step 4: Verify task tests pass**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- sporttery.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/football/sportteryMapping.repository.ts apps/api/test/sporttery.test.ts
git commit -m "feat: sync sporttery fixture mappings"
```

---

## Task 2: Sporttery-Only Context Refresh

**Files:**
- Modify: `apps/api/src/modules/context/fixtureContext.service.ts`
- Modify: `apps/api/src/modules/public/public.routes.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Test: `apps/api/test/fixtureContextApi.test.ts`
- Test: `apps/api/test/publicPredictionRequest.test.ts`

- [ ] **Step 1: Write failing API refresh tests**

Add to `apps/api/test/fixtureContextApi.test.ts`:

```ts
it("auto maps and refreshes sporttery context for an exact World Cup team match", async () => {
  const { db, databasePath } = createTestDatabase();
  insertContextApiMatch(db);
  saveSportteryEnabled(db, true);
  db.close();

  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({
      value: {
        matchInfoList: [{ subMatchList: [{ leagueAbbName: "世界杯", leagueAllName: "世界杯", homeTeamAbbName: "Home", awayTeamAbbName: "Away", matchId: 2040170, oddsList: [{ poolCode: "HHAD", h: "1.68", d: "4.85", a: "3.05", goalLine: "-3.00" }] }] }]
      }
    }), { status: 200, headers: { "content-type": "application/json" } }))
    .mockResolvedValue(new Response(JSON.stringify({ value: {} }), { status: 200, headers: { "content-type": "application/json" } }));

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
  expect(response.json().domains).toEqual(expect.arrayContaining([
    expect.objectContaining({ domain: "sporttery", status: "cached", summary: expect.stringContaining("官方指数：") })
  ]));
  await app.close();
});

it("returns unavailable sporttery context when the match is not covered", async () => {
  const { db, databasePath } = createTestDatabase();
  insertContextApiMatch(db);
  saveSportteryEnabled(db, true);
  db.close();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
    value: {
      matchInfoList: [{ subMatchList: [{ leagueAbbName: "世界杯", leagueAllName: "世界杯", homeTeamAbbName: "德国", awayTeamAbbName: "库拉索", matchId: 2040170 }] }]
    }
  }), { status: 200, headers: { "content-type": "application/json" } }));

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
  expect(response.json().domains).toEqual(expect.arrayContaining([
    expect.objectContaining({ domain: "sporttery", status: "unavailable", summary: "体彩暂未覆盖该场比赛" })
  ]));
  await app.close();
});
```

- [ ] **Step 2: Update prediction request default test**

In `apps/api/test/publicPredictionRequest.test.ts`, update the existing default data options assertion to:

```ts
expect(JSON.parse(row.data_options_json)).toEqual({
  useOdds: false,
  useApiFootballPrediction: false,
  useHeadToHead: false,
  usePlayerLineupInjuries: false,
  useDongqiudiIntel: false,
  useSporttery: true
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- fixtureContextApi.test.ts publicPredictionRequest.test.ts
```

Expected: FAIL because auto mapping is not wired into refresh and defaults still include old context fields.

- [ ] **Step 4: Implement service input and unavailable behavior**

Modify `RefreshFixtureContextInput` in `apps/api/src/modules/context/fixtureContext.service.ts`:

```ts
  homeTeamName: string;
  awayTeamName: string;
```

Import `ensureSportteryMappingForFixture`:

```ts
import { ensureSportteryMappingForFixture } from "../football/sportteryMapping.repository";
```

Replace Sporttery branch with:

```ts
  if (input.dataOptions.useSporttery && input.sportteryClient) {
    try {
      const matchList = await input.sportteryClient.getMatchList();
      const ensuredMapping = input.sportteryMatchId
        ? { sportteryMatchId: input.sportteryMatchId }
        : ensureSportteryMappingForFixture(input.db, {
            apiFootballFixtureId: input.apiFootballFixtureId,
            homeTeamName: input.homeTeamName,
            awayTeamName: input.awayTeamName,
            sportteryMatchList: matchList,
            now
          });

      if (!ensuredMapping) {
        domains.push({ domain: "sporttery", status: "unavailable", summary: "体彩暂未覆盖该场比赛", lastSyncedAt: now.toISOString(), error: null });
        writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "sporttery", status: "unavailable", error: null, now });
      } else {
        const [history, tables, result, feature, injuries] = await Promise.all([
          input.sportteryClient.getResultHistory(ensuredMapping.sportteryMatchId),
          input.sportteryClient.getMatchTables(ensuredMapping.sportteryMatchId),
          input.sportteryClient.getMatchResult(ensuredMapping.sportteryMatchId),
          input.sportteryClient.getMatchFeature(ensuredMapping.sportteryMatchId),
          input.sportteryClient.getInjurySuspension(ensuredMapping.sportteryMatchId)
        ]);
        const odds = extractOddsForMatch(matchList, ensuredMapping.sportteryMatchId);
        const parsed = parseSportterySummary({ odds, history, tables, result, feature, injuries });
        raw.sporttery = parsed.raw;
        domains.push({ domain: "sporttery", status: parsed.status, summary: parsed.summary, lastSyncedAt: now.toISOString(), error: null });
        writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "sporttery", status: parsed.status, error: null, now });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sporttery refresh failed";
      domains.push({ domain: "sporttery", status: "refresh_failed", summary: "未获取体彩数据", lastSyncedAt: now.toISOString(), error: message });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "sporttery", status: "refresh_failed", error: message, now });
    }
  } else {
    domains.push(notRequestedSummary("sporttery"));
  }
```

- [ ] **Step 5: Pass names through routes and change defaults**

In `apps/api/src/modules/public/public.routes.ts`, change default data options:

```ts
  dataOptions: {
    useOdds: false,
    useApiFootballPrediction: false,
    useHeadToHead: false,
    usePlayerLineupInjuries: false,
    useDongqiudiIntel: false,
    useSporttery: true
  },
```

Add import:

```ts
import { worldCupTeamNamesZh } from "../teams/worldCupTeamNames.zh";
```

Add helper in `public.routes.ts`:

```ts
function resolveDisplayNameZh(input: { teamId: string; originalName: string; displayNameZh: string | null; displayNameSource: string | null }): string {
  return input.displayNameSource === "admin" ? input.displayNameZh ?? input.originalName : worldCupTeamNamesZh[input.teamId] ?? input.displayNameZh ?? input.originalName;
}
```

Update `SELECT` for `/matches/:matchId/context/refresh` to include ids and display rows:

```sql
matches.home_team_id,
matches.home_team_name,
home_display.display_name_zh AS home_team_display_name_zh,
home_display.source AS home_team_display_name_source,
matches.away_team_id,
matches.away_team_name,
away_display.display_name_zh AS away_team_display_name_zh,
away_display.source AS away_team_display_name_source
```

and add joins:

```sql
LEFT JOIN team_display_names AS home_display ON home_display.api_football_team_id = matches.home_team_id
LEFT JOIN team_display_names AS away_display ON away_display.api_football_team_id = matches.away_team_id
```

Pass these to `refreshFixtureContext`:

```ts
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
```

Do the same in prediction request refresh. In `apps/api/src/modules/admin/admin.routes.ts`, import `worldCupTeamNamesZh` and use the same helper for admin single-match refresh.

- [ ] **Step 6: Verify API tests pass**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- fixtureContextApi.test.ts publicPredictionRequest.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/context/fixtureContext.service.ts apps/api/src/modules/public/public.routes.ts apps/api/src/modules/admin/admin.routes.ts apps/api/test/fixtureContextApi.test.ts apps/api/test/publicPredictionRequest.test.ts
git commit -m "feat: use sporttery-only context refresh"
```

---

## Task 3: Admin Bulk Sporttery Sync API

**Files:**
- Modify: `apps/api/src/modules/admin/admin.routes.ts`
- Test: `apps/api/test/adminConfig.test.ts`

- [ ] **Step 1: Write failing admin API test**

Add after `saves sporttery settings and fixture mappings` in `apps/api/test/adminConfig.test.ts`:

```ts
it("syncs sporttery mappings from exact World Cup team names", async () => {
  const { db, databasePath } = createTestDatabase();
  db.prepare(
    `
      INSERT INTO matches (
        id, api_football_fixture_id, stage, kickoff_at, status, venue,
        home_team_id, home_team_name, home_team_logo_url,
        away_team_id, away_team_name, away_team_logo_url,
        home_score, away_score, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run("match-1", 1001, "Group Stage", "2026-06-14T17:00:00.000Z", "scheduled", null, "home-1", "德国", null, "away-1", "库拉索", null, null, null, "2026-06-13T08:00:00.000Z");
  db.close();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
    value: {
      matchInfoList: [{ subMatchList: [{ leagueAbbName: "世界杯", leagueAllName: "世界杯", homeTeamAbbName: "德国", awayTeamAbbName: "库拉索", matchId: 2040170 }] }]
    }
  }), { status: 200, headers: { "content-type": "application/json" } }));

  const app = buildApp({ databasePath, logger: false });
  const response = await app.inject({ method: "POST", url: "/api/admin/sporttery-mappings/sync", remoteAddress: "127.0.0.1" });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ matched: 1, unmatched: 0, totalSportteryMatches: 1 });
  await app.close();
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminConfig.test.ts
```

Expected: FAIL with 404 for `/api/admin/sporttery-mappings/sync`.

- [ ] **Step 3: Implement route**

In `apps/api/src/modules/admin/admin.routes.ts`, import `syncSportteryMappingsForMatches`.
Also import `listMatches`:

```ts
import { listMatches } from "../matches/match.repository";
```

Add route before `/sporttery-mappings/:apiFootballFixtureId`:

```ts
  app.post("/sporttery-mappings/sync", async () => {
    const sportteryClient = new SportteryClient();
    const matchList = await sportteryClient.getMatchList();
    const matches = listMatches(options.db);

    return syncSportteryMappingsForMatches(options.db, {
      matches: matches.map((match) => ({
        apiFootballFixtureId: match.apiFootballFixtureId,
        homeTeamName: match.homeTeam.displayNameZh,
        awayTeamName: match.awayTeam.displayNameZh
      })),
      sportteryMatchList: matchList
    });
  });
```

- [ ] **Step 4: Verify test passes**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminConfig.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin.routes.ts apps/api/test/adminConfig.test.ts
git commit -m "feat: add sporttery mapping sync api"
```

---

## Task 4: Sporttery Summary Text and Prompt Wording

**Files:**
- Modify: `apps/api/src/modules/context/sportteryContextParsers.ts`
- Modify: `apps/api/src/modules/admin/builtInPromptTemplates.ts`
- Test: `apps/api/test/sporttery.test.ts`
- Test: `apps/api/test/adminConfig.test.ts`

- [ ] **Step 1: Update parser test expectations**

In `apps/api/test/sporttery.test.ts`, change expectations:

```ts
expect(r.summary).toContain("官方指数：胜平负 主2.50/平3.20/客2.80；让球胜平负 主1.90/平3.50/客3.80(让-1.00)");
expect(r.summary).toContain("历史交锋：6场 胜50%/平20%/负30%");
expect(r.summary).toContain("积分形势：主排名1积3 客排名3积0");
expect(r.summary).toContain("特征对比：近10场胜率 主70% 客40%");
expect(r.summary).toContain("伤停影响：主[穆西亚拉·中场] 客[无]");
```

- [ ] **Step 2: Add prompt wording assertions**

In `apps/api/test/adminConfig.test.ts`, update built-in prompt test assertions:

```ts
expect(templates.map((template) => template.fullPrompt).join("\n")).toContain("官方指数不得作为胜平负预测的权重");
expect(templates.map((template) => template.fullPrompt).join("\n")).toContain("官方指数");
expect(templates.map((template) => template.name)).not.toContain("赔率驱动");
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- sporttery.test.ts adminConfig.test.ts
```

Expected: FAIL because summaries still use old text.

- [ ] **Step 4: Implement parser text**

In `parseSportterySummary`, replace pushes with section text:

```ts
  const indexParts: string[] = [];
  if (had.h && had.d && had.a) indexParts.push(`胜平负 主${had.h}/平${had.d}/客${had.a}`);
  if (hhad.h && hhad.d && hhad.a) indexParts.push(`让球胜平负 主${hhad.h}/平${hhad.d}/客${hhad.a}${hhad.goalLine ? `(让${hhad.goalLine})` : ""}`);
  if (indexParts.length > 0) parts.push(`官方指数：${indexParts.join("；")}`);
```

Use these labels for the rest:

```ts
parts.push(`历史交锋：${str(stats.totalLegCnt) ?? "?"}场 胜${str(stats.winProbability) ?? "-"}/平${str(stats.drawProbability) ?? "-"}/负${str(stats.lossProbability) ?? "-"}`);
parts.push(`积分形势：主${homeT ?? "无"} 客${awayT ?? "无"}`);
parts.push(`近期状态：主${homeR ?? "无"} 客${awayR ?? "无"}`);
parts.push(`特征对比：近${str(ea?.totalLegCnt) ?? "?"}场胜率 主${str(ea?.homeScoreRatio) ?? "-"}% 客${str(ea?.awayScoreRatio) ?? "-"}%`);
parts.push(`伤停影响：主[${homeI || "无"}] 客[${awayI || "无"}]`);
```

- [ ] **Step 5: Implement prompt text**

In `builtInPromptTemplates.ts`, change the Sporttery rule to:

```ts
"若 prediction_context 包含体彩赛前情报（sporttery，含官方指数、历史交锋、积分形势、近期状态、特征对比、伤停影响），官方指数只可作为市场背景说明，不得直接决定预测；积分形势用于判断小组出线压力；伤停影响用于判断阵容完整性和关键球员缺阵风险；官方指数不得作为胜平负预测的权重。",
```

Rename built-in market prompt display name from `市场背景说明` only if tests show the current name conflicts with user-facing copy. Do not rename ids.

- [ ] **Step 6: Verify tests pass**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- sporttery.test.ts adminConfig.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/context/sportteryContextParsers.ts apps/api/src/modules/admin/builtInPromptTemplates.ts apps/api/test/sporttery.test.ts apps/api/test/adminConfig.test.ts
git commit -m "feat: format sporttery intelligence summary"
```

---

## Task 5: Web API Client and Admin Sporttery UI

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/pages/AdminPage.tsx`
- Test: `apps/web/test/client.test.ts`
- Test: `apps/web/test/adminPage.test.tsx`

- [ ] **Step 1: Add failing client tests**

In `apps/web/test/client.test.ts`, add:

```ts
import { getAdminSportterySettings, listAdminSportteryMappings, saveAdminSportterySettings, syncAdminSportteryMappings } from "../src/api/client";

it("loads and saves admin sporttery settings", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true }), { status: 200, headers: { "content-type": "application/json" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: false }), { status: 200, headers: { "content-type": "application/json" } }));

  await expect(getAdminSportterySettings()).resolves.toEqual({ enabled: true });
  await expect(saveAdminSportterySettings(false)).resolves.toEqual({ enabled: false });
  expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/admin/settings/sporttery");
  expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/settings/sporttery", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false })
  });
});

it("loads and syncs admin sporttery mappings", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ mappings: [{ apiFootballFixtureId: 1001, sportteryMatchId: 2040170, updatedAt: "2026-06-14T08:00:00.000Z" }] }), { status: 200, headers: { "content-type": "application/json" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ matched: 12, unmatched: 10, totalSportteryMatches: 22 }), { status: 200, headers: { "content-type": "application/json" } }));

  await expect(listAdminSportteryMappings()).resolves.toHaveLength(1);
  await expect(syncAdminSportteryMappings()).resolves.toEqual({ matched: 12, unmatched: 10, totalSportteryMatches: 22 });
  expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/admin/sporttery-mappings");
  expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/sporttery-mappings/sync", { method: "POST" });
});
```

- [ ] **Step 2: Add failing admin page test**

In `apps/web/test/adminPage.test.tsx`, extend the API mock:

```ts
getAdminSportterySettings: vi.fn().mockResolvedValue({ enabled: true }),
saveAdminSportterySettings: vi.fn().mockResolvedValue({ enabled: false }),
listAdminSportteryMappings: vi.fn().mockResolvedValue([{ apiFootballFixtureId: 1001, sportteryMatchId: 2040170, updatedAt: "2026-06-14T08:00:00.000Z" }]),
syncAdminSportteryMappings: vi.fn().mockResolvedValue({ matched: 12, unmatched: 10, totalSportteryMatches: 22 }),
```

Add:

```ts
it("renders and syncs sporttery data source settings", async () => {
  render(<AdminPage />);

  expect(await screen.findByText("体彩赛前情报")).toBeInTheDocument();
  expect(screen.getByText("已启用")).toBeInTheDocument();
  expect(screen.getByText("1 场已映射")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "同步体彩映射" }));

  expect(syncAdminSportteryMappings).toHaveBeenCalled();
  expect(await screen.findByText("体彩映射同步完成：匹配 12 场，未匹配 10 场")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts adminPage.test.tsx
```

Expected: FAIL because client functions and UI are missing.

- [ ] **Step 4: Implement client functions**

In `apps/web/src/api/client.ts`, add:

```ts
export interface SportterySettingsStatus {
  enabled: boolean;
}

export interface AdminSportteryMappingDto {
  apiFootballFixtureId: number;
  sportteryMatchId: number;
  updatedAt: string;
}

export interface AdminSportteryMappingSyncResult {
  matched: number;
  unmatched: number;
  totalSportteryMatches: number;
}

export async function getAdminSportterySettings(): Promise<SportterySettingsStatus> {
  const response = await request(`${apiBaseUrl}/api/admin/settings/sporttery`);
  if (!response.ok) throw new Error(`Admin Sporttery settings request failed with status ${response.status}`);
  return (await response.json()) as SportterySettingsStatus;
}

export async function saveAdminSportterySettings(enabled: boolean): Promise<SportterySettingsStatus> {
  const response = await request(`${apiBaseUrl}/api/admin/settings/sporttery`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled })
  });
  if (!response.ok) throw new Error(`Admin Sporttery settings save failed with status ${response.status}`);
  return (await response.json()) as SportterySettingsStatus;
}

export async function listAdminSportteryMappings(): Promise<AdminSportteryMappingDto[]> {
  const response = await request(`${apiBaseUrl}/api/admin/sporttery-mappings`);
  if (!response.ok) throw new Error(`Admin Sporttery mappings request failed with status ${response.status}`);
  const body = (await response.json()) as { mappings: AdminSportteryMappingDto[] };
  return body.mappings;
}

export async function syncAdminSportteryMappings(): Promise<AdminSportteryMappingSyncResult> {
  const response = await request(`${apiBaseUrl}/api/admin/sporttery-mappings/sync`, { method: "POST" });
  if (!response.ok) throw new Error(`Admin Sporttery mappings sync failed with status ${response.status}`);
  return (await response.json()) as AdminSportteryMappingSyncResult;
}
```

- [ ] **Step 5: Implement AdminPage controls**

In `AdminPage.tsx`, import functions and types from client. Add state:

```ts
  const [sportteryEnabled, setSportteryEnabled] = useState<boolean | null>(null);
  const [sportteryMappingsCount, setSportteryMappingsCount] = useState(0);
```

Load them in `loadAdminData()`:

```ts
const [settings, sportterySettings, sportteryMappings, nextSummary, nextProviders, nextModels, nextPromptTemplates, nextContextCacheLogs, nextTeams] = await Promise.all([
  getAdminApiFootballSettings(),
  getAdminSportterySettings(),
  listAdminSportteryMappings(),
  getAdminSummary(),
  listAdminAiProviders(),
  listAdminAiModels(),
  listAdminPromptTemplates(),
  listAdminContextCacheLogs(),
  listAdminTeamDisplayNames("")
]);
setSportteryEnabled(sportterySettings.enabled);
setSportteryMappingsCount(sportteryMappings.length);
```

Add handlers:

```ts
  async function handleToggleSporttery() {
    const nextEnabled = !(sportteryEnabled ?? false);
    const settings = await saveAdminSportterySettings(nextEnabled);
    setSportteryEnabled(settings.enabled);
    setStatusText(settings.enabled ? "体彩赛前情报已启用" : "体彩赛前情报已停用");
  }

  async function handleSyncSportteryMappings() {
    setStatusText("正在同步体彩映射...");
    const result = await syncAdminSportteryMappings();
    setSportteryMappingsCount((await listAdminSportteryMappings()).length);
    setStatusText(`体彩映射同步完成：匹配 ${result.matched} 场，未匹配 ${result.unmatched} 场`);
  }
```

Render in data-source panel below API-Football controls:

```tsx
<section className="admin-subsection">
  <header>
    <h4>体彩赛前情报</h4>
    <span>{sportteryEnabled ? "已启用" : "未启用"}</span>
  </header>
  <p className="muted">用于预测上下文：官方指数、历史交锋、积分形势、近期状态、特征对比和伤停影响。</p>
  <div className="settings-actions">
    <button type="button" onClick={handleToggleSporttery}>
      {sportteryEnabled ? "停用体彩情报" : "启用体彩情报"}
    </button>
    <button type="button" onClick={handleSyncSportteryMappings}>
      同步体彩映射
    </button>
  </div>
  <p className="status-line">{sportteryMappingsCount} 场已映射</p>
</section>
```

- [ ] **Step 6: Verify web tests pass**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts adminPage.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/api/client.ts apps/web/src/pages/AdminPage.tsx apps/web/test/client.test.ts apps/web/test/adminPage.test.tsx
git commit -m "feat: add sporttery admin sync controls"
```

---

## Task 6: Sporttery-Only Prediction Drawer and Data Card

**Files:**
- Modify: `apps/web/src/components/PredictionRequestDrawer.tsx`
- Modify: `apps/web/src/components/MatchContextDrawer.tsx`
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Test: `apps/web/test/predictionDrawer.test.tsx`
- Test: `apps/web/test/matchContextDrawer.test.tsx`
- Test: `apps/web/test/fixturesPage.test.tsx`

- [ ] **Step 1: Update prediction drawer test**

In `apps/web/test/predictionDrawer.test.tsx`, update expected default submit:

```ts
dataOptions: {
  useOdds: false,
  useApiFootballPrediction: false,
  useHeadToHead: false,
  usePlayerLineupInjuries: false,
  useDongqiudiIntel: false,
  useSporttery: true
}
```

Add assertions:

```ts
expect(screen.getByLabelText("使用体彩赛前情报")).toBeChecked();
expect(screen.queryByText("使用历史交锋")).not.toBeInTheDocument();
expect(screen.queryByText("使用球员阵容与伤停")).not.toBeInTheDocument();
expect(screen.queryByText("使用懂球帝情报")).not.toBeInTheDocument();
```

- [ ] **Step 2: Update context drawer test**

In `apps/web/test/matchContextDrawer.test.tsx`, use context:

```ts
const context: FixtureContextSummaryDto = {
  matchId: "match-1",
  completeness: "full",
  createdAt: "2026-06-13T08:00:00.000Z",
  domains: [
    { domain: "sporttery", status: "cached", summary: "官方指数：让球胜平负 主1.68/平4.85/客3.05\n历史交锋：6场 胜50%/平20%/负30%\n伤停影响：主[穆西亚拉·中场] 客[无]", lastSyncedAt: "2026-06-13T08:00:00.000Z", error: null },
    { domain: "odds", status: "cached", summary: "旧来源", lastSyncedAt: "2026-06-13T08:00:00.000Z", error: null }
  ]
};
```

Assert:

```ts
expect(screen.getByText("赛前情报")).toBeInTheDocument();
expect(screen.getByText("官方指数")).toBeInTheDocument();
expect(screen.getByText("让球胜平负 主1.68/平4.85/客3.05")).toBeInTheDocument();
expect(screen.getByText("伤停影响")).toBeInTheDocument();
expect(screen.queryByText("旧来源")).not.toBeInTheDocument();
```

- [ ] **Step 3: Update fixtures page context defaults**

In `apps/web/test/fixturesPage.test.tsx`, change data-card refresh expected options:

```ts
expect(onRefreshMatchContext).toHaveBeenCalledWith("scheduled-1", {
  useOdds: false,
  useApiFootballPrediction: false,
  useHeadToHead: false,
  usePlayerLineupInjuries: false,
  useDongqiudiIntel: false,
  useSporttery: true
});
```

Use mocked context domain:

```ts
domains: [
  { domain: "sporttery", status: "cached", summary: "官方指数：主1.68/平4.85/客3.05\n历史交锋：6场\n伤停影响：主[无] 客[无]", lastSyncedAt: "2026-06-13T08:00:00.000Z", error: null }
]
```

- [ ] **Step 4: Run tests and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- predictionDrawer.test.tsx matchContextDrawer.test.tsx fixturesPage.test.tsx
```

Expected: FAIL because UI still shows old options and data card lists all domains.

- [ ] **Step 5: Implement prediction drawer**

Set `defaultDataOptions` in `PredictionRequestDrawer.tsx`:

```ts
const defaultDataOptions: PredictionDataOptionsDto = {
  useOdds: false,
  useApiFootballPrediction: false,
  useHeadToHead: false,
  usePlayerLineupInjuries: false,
  useDongqiudiIntel: false,
  useSporttery: true
};
```

Replace the data source labels with one checkbox:

```tsx
<label>
  <input
    type="checkbox"
    checked={dataOptions.useSporttery}
    onChange={(event) =>
      setDataOptions({
        useOdds: false,
        useApiFootballPrediction: false,
        useHeadToHead: false,
        usePlayerLineupInjuries: false,
        useDongqiudiIntel: false,
        useSporttery: event.target.checked
      })
    }
  />
  <span>使用体彩赛前情报</span>
</label>
```

- [ ] **Step 6: Implement Sporttery-only data card**

In `MatchContextDrawer.tsx`, derive only Sporttery domain:

```ts
const sportteryDomain = context?.domains.find((domain) => domain.domain === "sporttery") ?? null;
```

Add parser:

```ts
function parseSportterySummarySections(summary: string): Array<{ label: string; value: string }> {
  return summary
    .split(/\n|；(?=(官方指数|历史交锋|积分形势|近期状态|特征对比|伤停影响)：)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf("：");
      return separatorIndex > -1
        ? { label: part.slice(0, separatorIndex), value: part.slice(separatorIndex + 1) }
        : { label: "情报摘要", value: part };
    });
}
```

Render `sportteryDomain` only. Use title `赛前情报`.

- [ ] **Step 7: Implement FixturesPage defaults**

Set `defaultContextDataOptions` in `FixturesPage.tsx` to Sporttery-only:

```ts
const defaultContextDataOptions: PredictionDataOptionsDto = {
  useOdds: false,
  useApiFootballPrediction: false,
  useHeadToHead: false,
  usePlayerLineupInjuries: false,
  useDongqiudiIntel: false,
  useSporttery: true
};
```

- [ ] **Step 8: Verify tests pass**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- predictionDrawer.test.tsx matchContextDrawer.test.tsx fixturesPage.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/PredictionRequestDrawer.tsx apps/web/src/components/MatchContextDrawer.tsx apps/web/src/pages/FixturesPage.tsx apps/web/test/predictionDrawer.test.tsx apps/web/test/matchContextDrawer.test.tsx apps/web/test/fixturesPage.test.tsx
git commit -m "feat: use sporttery-only prediction controls"
```

---

## Task 7: Latest Prediction Summary on Match Cards

**Files:**
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Test: `apps/web/test/fixturesPage.test.tsx`

- [ ] **Step 1: Write failing test**

Add to `apps/web/test/fixturesPage.test.tsx`:

```ts
it("shows latest historical prediction summary on the match card", async () => {
  const match = {
    ...buildMatch({
      id: "scheduled-1",
      kickoffAt: "2026-06-14T12:00:00.000Z",
      status: "scheduled",
      homeDisplayNameZh: "美国",
      homeName: "USA",
      awayDisplayNameZh: "巴拉圭",
      awayName: "Paraguay"
    }),
    hasAiPrediction: true
  };
  const onLoadPredictionHistory = vi.fn().mockResolvedValue({
    matchId: "scheduled-1",
    runs: [
      {
        runId: "run-1",
        matchId: "scheduled-1",
        status: "completed",
        message: "已完成 2 个模型预测",
        predictionsCount: 2,
        logs: [],
        predictions: [
          { id: "prediction-1", modelDisplayName: "GPT-4o mini", predictedResult: "home", predictedHomeScore: 2, predictedAwayScore: 1, confidence: 0.72, shortReason: "主队更稳定。", keyFactors: [], oddsInterpretation: "官方指数仅作背景。", riskPoints: [], analysisReport: "报告一" },
          { id: "prediction-2", modelDisplayName: "Claude Sonnet", predictedResult: "home", predictedHomeScore: 2, predictedAwayScore: 0, confidence: 0.64, shortReason: "边路优势明显。", keyFactors: [], oddsInterpretation: "官方指数仅作背景。", riskPoints: [], analysisReport: "报告二" }
        ]
      }
    ]
  });

  render(<FixturesPage matches={[match]} onLoadPredictionHistory={onLoadPredictionHistory} />);

  expect(await screen.findByText("综合观点：主胜")).toBeInTheDocument();
  expect(screen.getByText("参考比分：2-1")).toBeInTheDocument();
  expect(screen.getByText("主胜 2 / 平 0 / 客胜 0")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx
```

Expected: FAIL because card does not preload latest history summary.

- [ ] **Step 3: Implement latest history preload**

In `FixturesPage.tsx`, import `useEffect`:

```ts
import { useEffect, useMemo, useState } from "react";
```

Add state:

```ts
const [loadedHistoryMatchIds, setLoadedHistoryMatchIds] = useState<Set<string>>(() => new Set());
```

Add effect:

```ts
useEffect(() => {
  if (!onLoadPredictionHistory) return;
  const matchesToLoad = matches.filter((match) => match.hasAiPrediction && !loadedHistoryMatchIds.has(match.id));
  if (matchesToLoad.length === 0) return;

  let cancelled = false;
  for (const match of matchesToLoad) {
    void onLoadPredictionHistory(match.id)
      .then((history) => {
        if (cancelled) return;
        const latestRun = history.runs.find((run) => run.predictions.length > 0);
        if (!latestRun) return;
        setPredictionFeedbackByMatchId((currentFeedback) => ({
          ...currentFeedback,
          [match.id]: getPredictionFeedback(latestRun)
        }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        setLoadedHistoryMatchIds((currentIds) => new Set(currentIds).add(match.id));
      });
  }

  return () => {
    cancelled = true;
  };
}, [loadedHistoryMatchIds, matches, onLoadPredictionHistory]);
```

- [ ] **Step 4: Verify test passes**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/FixturesPage.tsx apps/web/test/fixturesPage.test.tsx
git commit -m "feat: show latest prediction summary on cards"
```

---

## Task 8: Final Verification

**Files:**
- No edits expected.

- [ ] **Step 1: Run full tests**

```bash
corepack pnpm test
```

Expected: API and web test suites pass.

- [ ] **Step 2: Run typecheck**

```bash
corepack pnpm typecheck
```

Expected: all workspace projects pass TypeScript.

- [ ] **Step 3: Run lint**

```bash
corepack pnpm lint
```

Expected: all workspace lint commands pass.

- [ ] **Step 4: Check repo status**

```bash
git status --short
git log --oneline -12
```

Expected: clean worktree. Latest commits include the Sporttery-only implementation commits.

- [ ] **Step 5: Runtime smoke check**

```bash
curl -sS http://127.0.0.1:4000/api/public/health
curl -sS -I http://127.0.0.1:5173/
```

Expected: API returns `{"ok":true,"service":"worldcup-ai-pk-api"}` and web returns HTTP 200.
