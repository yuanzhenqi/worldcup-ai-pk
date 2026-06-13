# Prediction History Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a per-match `历史` entry that opens stored AI prediction runs and lets users view detailed reports.

**Architecture:** Reuse the existing prediction run status DTO shape for each historical run. Add one public API endpoint, one web client method, and one drawer flow inside `FixturesPage`.

**Tech Stack:** Fastify, better-sqlite3, React, Vitest, Testing Library, shared TypeScript DTOs.

---

### Task 1: Backend Match History Endpoint

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/api/src/modules/predictions/predictionExecutor.service.ts`
- Modify: `apps/api/src/modules/public/public.routes.ts`
- Test: `apps/api/test/publicPredictionRequest.test.ts`

- [x] **Step 1: Write the failing API test**

Add a test that inserts a run and parsed prediction for `match-1`, then calls `GET /api/public/matches/match-1/prediction-runs` and expects `{ matchId: "match-1", runs: [...] }`.

- [x] **Step 2: Run API test to verify it fails**

Run: `corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/publicPredictionRequest.test.ts`

- [x] **Step 3: Implement DTO and repository logic**

Add `PredictionRunHistoryDto` with `matchId` and `runs: PredictionRunStatusDto[]`. Add a function that lists run ids by match id ordered by `scheduled_at DESC`, then maps them through `getPredictionRunStatus`.

- [x] **Step 4: Add the public route**

Register `GET /matches/:matchId/prediction-runs` in public routes and return the new DTO with `cache-control: no-store`.

- [x] **Step 5: Run API test to verify it passes**

Run: `corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/publicPredictionRequest.test.ts`

### Task 2: Frontend History Client

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/web/test/client.test.ts`

- [x] **Step 1: Write the failing client test**

Add a test for `getMatchPredictionHistory("match-1")` expecting a GET to `/api/public/matches/match-1/prediction-runs` with `cache: "no-store"`.

- [x] **Step 2: Run client test to verify it fails**

Run: `corepack pnpm --filter @worldcup-ai-pk/web test -- --run test/client.test.ts`

- [x] **Step 3: Implement the client method**

Import `PredictionRunHistoryDto` and add `getMatchPredictionHistory(matchId)`.

- [x] **Step 4: Run client test to verify it passes**

Run: `corepack pnpm --filter @worldcup-ai-pk/web test -- --run test/client.test.ts`

### Task 3: Match Card History Drawer

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Test: `apps/web/test/app.test.tsx`
- Test: `apps/web/test/fixturesPage.test.tsx`

- [x] **Step 1: Write the failing UI test**

Add a test with `hasAiPrediction: true`, click `历史`, expect the load callback to receive the match id, expect `历史预测记录`, the run summary, logs, and `查看报告`.

- [x] **Step 2: Run UI test to verify it fails**

Run: `corepack pnpm --filter @worldcup-ai-pk/web test -- --run test/fixturesPage.test.tsx test/app.test.tsx`

- [x] **Step 3: Implement the drawer flow**

Add an optional `onLoadPredictionHistory` prop. Show `历史` when persisted or in-memory predictions exist. Store loading/error/history state and render a `BottomDrawer`.

- [x] **Step 4: Wire App**

Pass `getMatchPredictionHistory` from `App` into `FixturesPage`.

- [x] **Step 5: Run UI test to verify it passes**

Run: `corepack pnpm --filter @worldcup-ai-pk/web test -- --run test/fixturesPage.test.tsx test/app.test.tsx`

### Task 4: Final Verification

**Files:**
- Verify all changed files.

- [x] **Step 1: Run typecheck**

Run: `corepack pnpm --recursive typecheck`

- [x] **Step 2: Run full tests**

Run: `corepack pnpm --recursive test`

- [x] **Step 3: Browser smoke test**

Open the app, click a match with `历史`, confirm the drawer opens and a report can be opened.

- [x] **Step 4: Commit**

Run:

```bash
git add packages/shared/src/types.ts apps/api/src/modules/predictions/predictionExecutor.service.ts apps/api/src/modules/public/public.routes.ts apps/api/test/publicPredictionRequest.test.ts apps/web/src/api/client.ts apps/web/src/App.tsx apps/web/src/pages/FixturesPage.tsx apps/web/test/client.test.ts apps/web/test/app.test.tsx apps/web/test/fixturesPage.test.tsx docs/superpowers/specs/2026-06-13-prediction-history-entry-design.md docs/superpowers/plans/2026-06-13-prediction-history-entry.md
git commit -m "feat: add prediction history entry"
```
