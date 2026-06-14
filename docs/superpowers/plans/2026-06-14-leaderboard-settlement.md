# Leaderboard Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the real leaderboard populate automatically from finished match results and parsed AI predictions.

**Architecture:** Add an idempotent settlement service in the predictions module. The public leaderboard route will call settlement before reading leaderboard rows, so existing finished matches and predictions become visible without a separate scheduler.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, Vitest.

---

### Task 1: Public Leaderboard Settlement Tests

**Files:**
- Modify: `apps/api/test/publicLeaderboard.test.ts`

- [ ] **Step 1: Write the failing test for automatic settlement**

Add this test inside `describe("public leaderboard API", ...)`:

```ts
it("settles eligible finished-match predictions before returning the public leaderboard", async () => {
  const { db, databasePath } = createTestDatabase();
  insertMatch(db, { id: "match-1", status: "finished", homeScore: 2, awayScore: 1 });
  insertAiConfig(db);
  insertPredictionRun(db);
  insertAiPrediction(db, {
    id: "prediction-1",
    modelId: "model-1",
    result: "home",
    confidence: 0.8,
    createdAt: "2026-06-13T08:00:02.000Z"
  });
  db.close();

  const app = buildApp({ databasePath, logger: false });
  const response = await app.inject({ method: "GET", url: "/api/public/leaderboard" });

  expect(response.statusCode).toBe(200);
  expect(response.json().settledRows).toEqual([
    {
      modelId: "model-1",
      modelDisplayName: "GPT-4o mini",
      totalScore: 10,
      finishedMatchesCounted: 1,
      resultHits: 1,
      resultAccuracy: 1,
      exactScoreHits: 1,
      recentScores: [10]
    }
  ]);

  await app.close();
});
```

- [ ] **Step 2: Write the failing test for idempotency**

Add this test after the automatic settlement test:

```ts
it("does not duplicate scores when the leaderboard is requested repeatedly", async () => {
  const { db, databasePath } = createTestDatabase();
  insertMatch(db, { id: "match-1", status: "finished", homeScore: 2, awayScore: 1 });
  insertAiConfig(db);
  insertPredictionRun(db);
  insertAiPrediction(db, {
    id: "prediction-1",
    modelId: "model-1",
    result: "home",
    confidence: 0.8,
    createdAt: "2026-06-13T08:00:02.000Z"
  });
  db.close();

  const app = buildApp({ databasePath, logger: false });
  await app.inject({ method: "GET", url: "/api/public/leaderboard" });
  await app.inject({ method: "GET", url: "/api/public/leaderboard" });
  await app.close();

  const checkDb = createDatabase(databasePath);
  const row = checkDb
    .prepare("SELECT COUNT(*) AS count FROM prediction_scores WHERE ai_prediction_id = ?")
    .get("prediction-1") as { count: number };
  checkDb.close();
  expect(row.count).toBe(1);
});
```

Add `createDatabase` import at the top:

```ts
import { createDatabase } from "../src/db/connection";
```

- [ ] **Step 3: Write the failing test for non-finished matches**

Add this test:

```ts
it("does not settle live or scheduled matches", async () => {
  const { db, databasePath } = createTestDatabase();
  insertMatch(db, { id: "match-1", status: "live", homeScore: 1, awayScore: 0 });
  insertAiConfig(db);
  insertPredictionRun(db);
  insertAiPrediction(db, {
    id: "prediction-1",
    modelId: "model-1",
    result: "home",
    confidence: 0.8,
    createdAt: "2026-06-13T08:00:02.000Z"
  });
  db.close();

  const app = buildApp({ databasePath, logger: false });
  const response = await app.inject({ method: "GET", url: "/api/public/leaderboard" });

  expect(response.statusCode).toBe(200);
  expect(response.json().settledRows).toEqual([]);

  await app.close();
});
```

- [ ] **Step 4: Run tests and verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- publicLeaderboard.test.ts
```

Expected result: tests fail because leaderboard settlement has not been implemented yet.

### Task 2: Settlement Service

**Files:**
- Create: `apps/api/src/modules/predictions/predictionSettlement.service.ts`
- Modify: `apps/api/src/modules/public/public.routes.ts`

- [ ] **Step 1: Implement settlement service**

Create `apps/api/src/modules/predictions/predictionSettlement.service.ts`:

```ts
import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { scorePrediction } from "./scoring";

interface EligiblePredictionRow {
  prediction_id: string;
  match_id: string;
  model_id: string;
  final_home_score: number;
  final_away_score: number;
  predicted_home_score: number;
  predicted_away_score: number;
}

export function settleFinishedMatchPredictions(db: Database, now = new Date()): number {
  const rows = db
    .prepare(
      `
        SELECT
          ai_predictions.id AS prediction_id,
          ai_predictions.match_id AS match_id,
          ai_predictions.model_id AS model_id,
          matches.home_score AS final_home_score,
          matches.away_score AS final_away_score,
          ai_predictions.predicted_home_score AS predicted_home_score,
          ai_predictions.predicted_away_score AS predicted_away_score
        FROM ai_predictions
        INNER JOIN matches ON matches.id = ai_predictions.match_id
        LEFT JOIN prediction_scores ON prediction_scores.ai_prediction_id = ai_predictions.id
        WHERE matches.status = 'finished'
          AND matches.home_score IS NOT NULL
          AND matches.away_score IS NOT NULL
          AND ai_predictions.parse_status = 'parsed'
          AND ai_predictions.eligible_for_scoring = 1
          AND prediction_scores.id IS NULL
      `
    )
    .all() as EligiblePredictionRow[];

  const insert = db.prepare(
    `
      INSERT INTO prediction_scores (
        id,
        ai_prediction_id,
        match_id,
        model_id,
        result_points,
        exact_score_points,
        home_goals_points,
        away_goals_points,
        total_points,
        scored_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  );

  const scoredAt = now.toISOString();
  const transaction = db.transaction((items: EligiblePredictionRow[]) => {
    for (const row of items) {
      const score = scorePrediction(
        { homeScore: row.final_home_score, awayScore: row.final_away_score },
        { homeScore: row.predicted_home_score, awayScore: row.predicted_away_score }
      );

      insert.run(
        randomUUID(),
        row.prediction_id,
        row.match_id,
        row.model_id,
        score.resultPoints,
        score.exactScorePoints,
        score.homeGoalsPoints,
        score.awayGoalsPoints,
        score.totalPoints,
        scoredAt
      );
    }
  });

  transaction(rows);
  return rows.length;
}
```

- [ ] **Step 2: Call settlement before returning leaderboard**

Modify `apps/api/src/modules/public/public.routes.ts`:

```ts
import { settleFinishedMatchPredictions } from "../predictions/predictionSettlement.service";
```

Replace:

```ts
app.get("/leaderboard", async () => listPublicLeaderboard(options.db));
```

With:

```ts
app.get("/leaderboard", async () => {
  settleFinishedMatchPredictions(options.db);
  return listPublicLeaderboard(options.db);
});
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- publicLeaderboard.test.ts
```

Expected result: `publicLeaderboard.test.ts` passes.

### Task 3: Final Verification

**Files:**
- No source files

- [ ] **Step 1: Run all tests**

Run:

```bash
corepack pnpm test
```

Expected result: all API, web, and shared tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
corepack pnpm typecheck
```

Expected result: all TypeScript projects pass.

- [ ] **Step 3: Run lint**

Run:

```bash
corepack pnpm lint
```

Expected result: all lint scripts pass.

- [ ] **Step 4: Commit implementation**

Stage only files changed for this implementation:

```bash
git add apps/api/src/modules/predictions/predictionSettlement.service.ts apps/api/src/modules/public/public.routes.ts apps/api/test/publicLeaderboard.test.ts
git commit -m "feat: settle leaderboard scores"
```
