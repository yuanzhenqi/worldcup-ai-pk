# Worldcup AI PK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first public MVP for Worldcup AI PK with fixtures, match details, odds summaries, visitor-triggered AI predictions, model ranking, and local-only admin management.

**Architecture:** Use a monorepo with `apps/web` for React + Vite, `apps/api` for Fastify + TypeScript, and `packages/shared` for shared types. The API owns SQLite persistence, API-Football sync, AI provider adapters, prediction scheduling, scoring, public read APIs, and local-only admin APIs.

**Tech Stack:** React, Vite, TypeScript, Fastify, SQLite, Vitest, Playwright, pnpm workspaces.

---

## File Structure

Create this structure:

```txt
worldcup-ai-pk/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  .gitignore
  .env.example
  apps/
    api/
      package.json
      tsconfig.json
      src/
        app.ts
        server.ts
        config/env.ts
        db/connection.ts
        db/migrate.ts
        db/schema.sql
        modules/public/public.routes.ts
        modules/admin/admin.routes.ts
        modules/football/apiFootballClient.ts
        modules/football/football.service.ts
        modules/predictions/prediction.service.ts
        modules/predictions/scoring.ts
        modules/ai/ai.service.ts
        modules/ai/providers/base.ts
        modules/logs/log.service.ts
      test/
        scoring.test.ts
        predictionRules.test.ts
        publicApiFiltering.test.ts
    web/
      package.json
      index.html
      tsconfig.json
      vite.config.ts
      src/
        main.tsx
        App.tsx
        api/client.ts
        pages/FixturesPage.tsx
        pages/MatchDetailPage.tsx
        pages/LeaderboardPage.tsx
        pages/AdminPage.tsx
        styles.css
      test/
        App.test.tsx
    shared/
      package.json
      tsconfig.json
      src/
        index.ts
        types.ts
```

Responsibility boundaries:

- `packages/shared/src/types.ts`: API DTOs and domain enums shared by frontend and backend.
- `apps/api/src/db/*`: SQLite connection and schema migration.
- `apps/api/src/modules/football/*`: API-Football integration and data normalization.
- `apps/api/src/modules/predictions/*`: visitor request rules, run scheduling, scoring.
- `apps/api/src/modules/ai/*`: AI provider abstraction and model execution.
- `apps/api/src/modules/public/*`: public read-only routes.
- `apps/api/src/modules/admin/*`: local-only admin routes.
- `apps/web/src/pages/*`: route-level React pages.

## Task 1: Initialize Workspace

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Initialize Git repository**

Run:

```bash
git init
```

Expected: `.git/` exists in `/Users/yzq/Desktop/project/worldcup-ai-pk`.

- [ ] **Step 2: Create root workspace files**

Create `package.json`:

```json
{
  "name": "worldcup-ai-pk",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "pnpm --parallel --filter @worldcup-ai-pk/api --filter @worldcup-ai-pk/web dev",
    "build": "pnpm --recursive build",
    "test": "pnpm --recursive test",
    "lint": "pnpm --recursive lint",
    "typecheck": "pnpm --recursive typecheck"
  },
  "devDependencies": {
    "typescript": "^5.5.4"
  },
  "packageManager": "pnpm@9.12.3"
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
.env
data/*.sqlite
data/*.sqlite-shm
data/*.sqlite-wal
coverage/
.DS_Store
```

Create `.env.example`:

```bash
API_HOST=127.0.0.1
API_PORT=4000
DATABASE_PATH=./data/app.sqlite
PUBLIC_WEB_ORIGIN=http://127.0.0.1:5173
```

- [ ] **Step 3: Install root dependencies**

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` is created.

- [ ] **Step 4: Commit workspace setup**

Run:

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example pnpm-lock.yaml
git commit -m "chore: initialize workspace"
```

Expected: commit succeeds.

## Task 2: Create Shared Types Package

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types.ts`

- [ ] **Step 1: Create package files**

Create `packages/shared/package.json`:

```json
{
  "name": "@worldcup-ai-pk/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "vitest": "^2.1.1"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `packages/shared/src/types.ts`:

```ts
export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";

export type PredictionResult = "home" | "draw" | "away";

export interface TeamDto {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface MatchDto {
  id: string;
  apiFootballFixtureId: number;
  stage: string;
  kickoffAt: string;
  status: MatchStatus;
  venue: string | null;
  homeTeam: TeamDto;
  awayTeam: TeamDto;
  homeScore: number | null;
  awayScore: number | null;
  hasAiPrediction: boolean;
  canRequestPrediction: boolean;
}

export interface OddsSummaryDto {
  matchId: string;
  capturedAt: string;
  bookmaker: string;
  homeWin: number | null;
  draw: number | null;
  awayWin: number | null;
  handicap: string | null;
  overUnder: string | null;
}

export interface ApiFootballPredictionDto {
  matchId: string;
  predictedWinner: string | null;
  advice: string | null;
  homePercent: string | null;
  drawPercent: string | null;
  awayPercent: string | null;
}

export interface AiPredictionDto {
  id: string;
  matchId: string;
  modelDisplayName: string;
  predictedResult: PredictionResult;
  predictedHomeScore: number;
  predictedAwayScore: number;
  confidence: number;
  shortReason: string;
  keyFactors: string[];
  oddsInterpretation: string;
  riskPoints: string[];
  promptSummary: string;
  createdAt: string;
  score: number | null;
}

export interface LeaderboardRowDto {
  modelId: string;
  modelDisplayName: string;
  totalScore: number;
  finishedMatchesCounted: number;
  resultHits: number;
  resultAccuracy: number;
  exactScoreHits: number;
  recentScores: number[];
}

export interface PredictionRequestResponseDto {
  matchId: string;
  status: "scheduled" | "running" | "rejected" | "rate_limited";
  message: string;
  scheduledFor: string | null;
}
```

Create `packages/shared/src/index.ts`:

```ts
export * from "./types";
```

- [ ] **Step 2: Run shared typecheck**

Run:

```bash
pnpm --filter @worldcup-ai-pk/shared typecheck
```

Expected: command exits with code `0`.

- [ ] **Step 3: Commit shared package**

Run:

```bash
git add packages/shared
git commit -m "chore: add shared types package"
```

Expected: commit succeeds.

## Task 3: Create API App and SQLite Schema

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/db/schema.sql`
- Create: `apps/api/src/db/connection.ts`
- Create: `apps/api/src/db/migrate.ts`

- [ ] **Step 1: Create API package files**

Create `apps/api/package.json`:

```json
{
  "name": "@worldcup-ai-pk/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.1",
    "@worldcup-ai-pk/shared": "workspace:*",
    "better-sqlite3": "^11.3.0",
    "fastify": "^4.28.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.5.5",
    "tsx": "^4.19.1",
    "vitest": "^2.1.1"
  }
}
```

Create `apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 2: Create environment loader**

Create `apps/api/src/config/env.ts`:

```ts
import { z } from "zod";

const envSchema = z.object({
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_PATH: z.string().default("./data/app.sqlite"),
  PUBLIC_WEB_ORIGIN: z.string().url().default("http://127.0.0.1:5173")
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(input);
}
```

- [ ] **Step 3: Create SQLite schema**

Create `apps/api/src/db/schema.sql`:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  api_football_fixture_id INTEGER NOT NULL UNIQUE,
  stage TEXT NOT NULL,
  kickoff_at TEXT NOT NULL,
  status TEXT NOT NULL,
  venue TEXT,
  home_team_id TEXT NOT NULL,
  home_team_name TEXT NOT NULL,
  home_team_logo_url TEXT,
  away_team_id TEXT NOT NULL,
  away_team_name TEXT NOT NULL,
  away_team_logo_url TEXT,
  home_score INTEGER,
  away_score INTEGER,
  last_synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS odds_snapshots (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  odds_type TEXT NOT NULL,
  bookmaker TEXT NOT NULL,
  home_win REAL,
  draw REAL,
  away_win REAL,
  handicap TEXT,
  over_under TEXT,
  captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_predictions (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  predicted_winner TEXT,
  advice TEXT,
  home_percent TEXT,
  draw_percent TEXT,
  away_percent TEXT,
  raw_json TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES ai_providers(id),
  model_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  full_prompt TEXT NOT NULL,
  prompt_summary TEXT NOT NULL,
  scope TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prediction_requests (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL,
  next_executable_at TEXT
);

CREATE TABLE IF NOT EXISTS prediction_runs (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  scheduled_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  status TEXT NOT NULL,
  failure_reason TEXT
);

CREATE TABLE IF NOT EXISTS ai_predictions (
  id TEXT PRIMARY KEY,
  prediction_run_id TEXT NOT NULL REFERENCES prediction_runs(id),
  match_id TEXT NOT NULL REFERENCES matches(id),
  model_id TEXT NOT NULL REFERENCES ai_models(id),
  prompt_template_id TEXT NOT NULL REFERENCES prompt_templates(id),
  predicted_result TEXT NOT NULL,
  predicted_home_score INTEGER NOT NULL,
  predicted_away_score INTEGER NOT NULL,
  confidence REAL NOT NULL,
  short_reason TEXT NOT NULL,
  key_factors_json TEXT NOT NULL,
  odds_interpretation TEXT NOT NULL,
  risk_points_json TEXT NOT NULL,
  raw_response TEXT NOT NULL,
  parse_status TEXT NOT NULL,
  eligible_for_scoring INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prediction_scores (
  id TEXT PRIMARY KEY,
  ai_prediction_id TEXT NOT NULL REFERENCES ai_predictions(id),
  match_id TEXT NOT NULL REFERENCES matches(id),
  model_id TEXT NOT NULL REFERENCES ai_models(id),
  result_points INTEGER NOT NULL,
  exact_score_points INTEGER NOT NULL,
  home_goals_points INTEGER NOT NULL,
  away_goals_points INTEGER NOT NULL,
  total_points INTEGER NOT NULL,
  scored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_overrides (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);
```

- [ ] **Step 4: Create SQLite connection and migration runner**

Create `apps/api/src/db/connection.ts`:

```ts
import Database from "better-sqlite3";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { loadEnv } from "../config/env";

export function createDatabase(path = loadEnv().DATABASE_PATH): Database.Database {
  const resolvedPath = resolve(path);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const db = new Database(resolvedPath);
  db.pragma("foreign_keys = ON");
  return db;
}
```

Create `apps/api/src/db/migrate.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDatabase } from "./connection";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(currentDir, "schema.sql");
const schema = readFileSync(schemaPath, "utf8");

const db = createDatabase();
db.exec(schema);
db.close();
console.log("SQLite schema migrated");
```

- [ ] **Step 5: Run migration**

Run:

```bash
pnpm install
pnpm --filter @worldcup-ai-pk/api migrate
```

Expected: output includes `SQLite schema migrated`.

- [ ] **Step 6: Commit API database setup**

Run:

```bash
git add apps/api package.json pnpm-lock.yaml data .gitignore
git commit -m "feat: add api database schema"
```

Expected: commit succeeds.

## Task 4: Add Scoring Tests and Implementation

**Files:**

- Create: `apps/api/test/scoring.test.ts`
- Create: `apps/api/src/modules/predictions/scoring.ts`

- [ ] **Step 1: Write failing scoring tests**

Create `apps/api/test/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scorePrediction } from "../src/modules/predictions/scoring";

describe("scorePrediction", () => {
  it("awards 10 points for exact score", () => {
    expect(scorePrediction({ homeScore: 1, awayScore: 1 }, { homeScore: 1, awayScore: 1 })).toEqual({
      resultPoints: 3,
      exactScorePoints: 5,
      homeGoalsPoints: 1,
      awayGoalsPoints: 1,
      totalPoints: 10
    });
  });

  it("awards result and one goal point", () => {
    expect(scorePrediction({ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 0 })).toEqual({
      resultPoints: 3,
      exactScorePoints: 0,
      homeGoalsPoints: 1,
      awayGoalsPoints: 0,
      totalPoints: 4
    });
  });

  it("awards no result points when outcome is wrong", () => {
    expect(scorePrediction({ homeScore: 0, awayScore: 1 }, { homeScore: 1, awayScore: 0 })).toEqual({
      resultPoints: 0,
      exactScorePoints: 0,
      homeGoalsPoints: 0,
      awayGoalsPoints: 0,
      totalPoints: 0
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api test -- scoring.test.ts
```

Expected: FAIL because `../src/modules/predictions/scoring` does not exist.

- [ ] **Step 3: Implement scoring**

Create `apps/api/src/modules/predictions/scoring.ts`:

```ts
export interface ScoreInput {
  homeScore: number;
  awayScore: number;
}

export interface ScoreBreakdown {
  resultPoints: number;
  exactScorePoints: number;
  homeGoalsPoints: number;
  awayGoalsPoints: number;
  totalPoints: number;
}

function outcome(score: ScoreInput): "home" | "draw" | "away" {
  if (score.homeScore > score.awayScore) return "home";
  if (score.homeScore < score.awayScore) return "away";
  return "draw";
}

export function scorePrediction(finalScore: ScoreInput, predictedScore: ScoreInput): ScoreBreakdown {
  const resultPoints = outcome(finalScore) === outcome(predictedScore) ? 3 : 0;
  const exactScorePoints =
    finalScore.homeScore === predictedScore.homeScore && finalScore.awayScore === predictedScore.awayScore ? 5 : 0;
  const homeGoalsPoints = finalScore.homeScore === predictedScore.homeScore ? 1 : 0;
  const awayGoalsPoints = finalScore.awayScore === predictedScore.awayScore ? 1 : 0;

  return {
    resultPoints,
    exactScorePoints,
    homeGoalsPoints,
    awayGoalsPoints,
    totalPoints: resultPoints + exactScorePoints + homeGoalsPoints + awayGoalsPoints
  };
}
```

- [ ] **Step 4: Run scoring tests**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api test -- scoring.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit scoring**

Run:

```bash
git add apps/api/src/modules/predictions/scoring.ts apps/api/test/scoring.test.ts
git commit -m "feat: add prediction scoring"
```

Expected: commit succeeds.

## Task 5: Implement Prediction Request Rules

**Files:**

- Create: `apps/api/test/predictionRules.test.ts`
- Create: `apps/api/src/modules/predictions/prediction.service.ts`

- [ ] **Step 1: Write failing rule tests**

Create `apps/api/test/predictionRules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planPredictionRequest } from "../src/modules/predictions/prediction.service";

describe("planPredictionRequest", () => {
  it("schedules at two hours before kickoff when kickoff is more than two hours away", () => {
    const result = planPredictionRequest({
      now: new Date("2026-06-12T10:00:00.000Z"),
      kickoffAt: new Date("2026-06-12T15:00:00.000Z"),
      matchStatus: "scheduled",
      latestSuccessfulRunAt: null
    });

    expect(result).toEqual({
      status: "scheduled",
      scheduledFor: new Date("2026-06-12T13:00:00.000Z"),
      message: "Prediction scheduled for two hours before kickoff"
    });
  });

  it("runs immediately when kickoff is less than two hours away", () => {
    const result = planPredictionRequest({
      now: new Date("2026-06-12T13:30:00.000Z"),
      kickoffAt: new Date("2026-06-12T15:00:00.000Z"),
      matchStatus: "scheduled",
      latestSuccessfulRunAt: null
    });

    expect(result).toEqual({
      status: "running",
      scheduledFor: new Date("2026-06-12T13:30:00.000Z"),
      message: "Prediction will run immediately"
    });
  });

  it("rejects requests after kickoff", () => {
    const result = planPredictionRequest({
      now: new Date("2026-06-12T15:01:00.000Z"),
      kickoffAt: new Date("2026-06-12T15:00:00.000Z"),
      matchStatus: "live",
      latestSuccessfulRunAt: null
    });

    expect(result.status).toBe("rejected");
  });

  it("rate limits reruns within 30 minutes", () => {
    const result = planPredictionRequest({
      now: new Date("2026-06-12T13:20:00.000Z"),
      kickoffAt: new Date("2026-06-12T15:00:00.000Z"),
      matchStatus: "scheduled",
      latestSuccessfulRunAt: new Date("2026-06-12T13:00:00.000Z")
    });

    expect(result.status).toBe("rate_limited");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api test -- predictionRules.test.ts
```

Expected: FAIL because `prediction.service` does not exist.

- [ ] **Step 3: Implement planning function**

Create `apps/api/src/modules/predictions/prediction.service.ts`:

```ts
import type { MatchStatus } from "@worldcup-ai-pk/shared";

export interface PredictionPlanInput {
  now: Date;
  kickoffAt: Date;
  matchStatus: MatchStatus;
  latestSuccessfulRunAt: Date | null;
}

export interface PredictionPlan {
  status: "scheduled" | "running" | "rejected" | "rate_limited";
  scheduledFor: Date | null;
  message: string;
}

const twoHoursMs = 2 * 60 * 60 * 1000;
const thirtyMinutesMs = 30 * 60 * 1000;

export function planPredictionRequest(input: PredictionPlanInput): PredictionPlan {
  if (input.matchStatus !== "scheduled" || input.now >= input.kickoffAt) {
    return {
      status: "rejected",
      scheduledFor: null,
      message: "Prediction requests are closed after kickoff"
    };
  }

  if (input.latestSuccessfulRunAt && input.now.getTime() - input.latestSuccessfulRunAt.getTime() < thirtyMinutesMs) {
    return {
      status: "rate_limited",
      scheduledFor: null,
      message: "Prediction was already generated within the last 30 minutes"
    };
  }

  const twoHoursBeforeKickoff = new Date(input.kickoffAt.getTime() - twoHoursMs);

  if (input.now < twoHoursBeforeKickoff) {
    return {
      status: "scheduled",
      scheduledFor: twoHoursBeforeKickoff,
      message: "Prediction scheduled for two hours before kickoff"
    };
  }

  return {
    status: "running",
    scheduledFor: input.now,
    message: "Prediction will run immediately"
  };
}
```

- [ ] **Step 4: Run rule tests**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api test -- predictionRules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit prediction rules**

Run:

```bash
git add apps/api/src/modules/predictions/prediction.service.ts apps/api/test/predictionRules.test.ts
git commit -m "feat: add prediction request rules"
```

Expected: commit succeeds.

## Task 6: Implement Fastify App and Public API Filtering

**Files:**

- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/modules/public/public.routes.ts`
- Create: `apps/api/test/publicApiFiltering.test.ts`

- [ ] **Step 1: Write failing public API filtering test**

Create `apps/api/test/publicApiFiltering.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("public API filtering", () => {
  it("does not expose keys, full prompts, or raw responses in health payload", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/api/public/health" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(body)).not.toContain("api_key");
    expect(JSON.stringify(body)).not.toContain("full_prompt");
    expect(JSON.stringify(body)).not.toContain("raw_response");

    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api test -- publicApiFiltering.test.ts
```

Expected: FAIL because `src/app.ts` does not exist.

- [ ] **Step 3: Implement Fastify app**

Create `apps/api/src/modules/public/public.routes.ts`:

```ts
import type { FastifyInstance } from "fastify";

export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "worldcup-ai-pk-api"
  }));
}
```

Create `apps/api/src/app.ts`:

```ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./config/env";
import { registerPublicRoutes } from "./modules/public/public.routes";

export function buildApp() {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: env.PUBLIC_WEB_ORIGIN
  });

  app.register(registerPublicRoutes, { prefix: "/api/public" });

  return app;
}
```

Create `apps/api/src/server.ts`:

```ts
import { buildApp } from "./app";
import { loadEnv } from "./config/env";

const env = loadEnv();
const app = buildApp();

await app.listen({
  host: env.API_HOST,
  port: env.API_PORT
});
```

- [ ] **Step 4: Run API tests and typecheck**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api test
pnpm --filter @worldcup-ai-pk/api typecheck
```

Expected: both commands exit with code `0`.

- [ ] **Step 5: Commit Fastify base**

Run:

```bash
git add apps/api/src/app.ts apps/api/src/server.ts apps/api/src/modules/public/public.routes.ts apps/api/test/publicApiFiltering.test.ts
git commit -m "feat: add fastify public api"
```

Expected: commit succeeds.

## Task 7: Implement API-Football Client Boundary

**Files:**

- Create: `apps/api/src/modules/football/apiFootballClient.ts`
- Create: `apps/api/src/modules/football/football.service.ts`
- Modify: `apps/api/src/modules/admin/admin.routes.ts`

- [ ] **Step 1: Create API-Football client**

Create `apps/api/src/modules/football/apiFootballClient.ts`:

```ts
export interface ApiFootballClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export class ApiFootballClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ApiFootballClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://v3.football.api-sports.io";
  }

  async getJson<T>(path: string, query: Record<string, string | number>): Promise<T> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      searchParams.set(key, String(value));
    }

    const response = await fetch(`${this.baseUrl}${path}?${searchParams.toString()}`, {
      headers: {
        "x-apisports-key": this.apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`API-Football request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
```

- [ ] **Step 2: Create service methods with exact endpoints**

Create `apps/api/src/modules/football/football.service.ts`:

```ts
import { ApiFootballClient } from "./apiFootballClient";

export interface FootballServiceConfig {
  apiKey: string;
}

export class FootballService {
  private readonly client: ApiFootballClient;

  constructor(config: FootballServiceConfig) {
    this.client = new ApiFootballClient({ apiKey: config.apiKey });
  }

  getWorldCupFixtures() {
    return this.client.getJson<unknown>("/fixtures", { league: 1, season: 2026 });
  }

  getFixtureOdds(apiFootballFixtureId: number) {
    return this.client.getJson<unknown>("/odds", { fixture: apiFootballFixtureId });
  }

  getFixtureLiveOdds(apiFootballFixtureId: number) {
    return this.client.getJson<unknown>("/odds/live", { fixture: apiFootballFixtureId });
  }

  getFixturePrediction(apiFootballFixtureId: number) {
    return this.client.getJson<unknown>("/predictions", { fixture: apiFootballFixtureId });
  }
}
```

- [ ] **Step 3: Typecheck API-Football boundary**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api typecheck
```

Expected: command exits with code `0`.

- [ ] **Step 4: Commit API-Football boundary**

Run:

```bash
git add apps/api/src/modules/football
git commit -m "feat: add api football client boundary"
```

Expected: commit succeeds.

## Task 8: Implement AI Provider Abstraction

**Files:**

- Create: `apps/api/src/modules/ai/providers/base.ts`
- Create: `apps/api/src/modules/ai/ai.service.ts`

- [ ] **Step 1: Define provider interface**

Create `apps/api/src/modules/ai/providers/base.ts`:

```ts
import type { PredictionResult } from "@worldcup-ai-pk/shared";

export interface AiPredictionInput {
  matchTitle: string;
  kickoffAt: string;
  stage: string;
  oddsSummary: string;
  apiFootballBaseline: string;
  prompt: string;
}

export interface ParsedAiPrediction {
  predictedResult: PredictionResult;
  predictedHomeScore: number;
  predictedAwayScore: number;
  confidence: number;
  shortReason: string;
  keyFactors: string[];
  oddsInterpretation: string;
  riskPoints: string[];
  rawResponse: string;
}

export interface AiProviderAdapter {
  name: string;
  predict(input: AiPredictionInput): Promise<ParsedAiPrediction>;
}
```

- [ ] **Step 2: Create AI service**

Create `apps/api/src/modules/ai/ai.service.ts`:

```ts
import type { AiPredictionInput, AiProviderAdapter, ParsedAiPrediction } from "./providers/base";

export class AiService {
  private readonly providers: Map<string, AiProviderAdapter>;

  constructor(providers: AiProviderAdapter[]) {
    this.providers = new Map(providers.map((provider) => [provider.name, provider]));
  }

  async predict(providerName: string, input: AiPredictionInput): Promise<ParsedAiPrediction> {
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`AI provider is not registered: ${providerName}`);
    }

    return provider.predict(input);
  }
}
```

- [ ] **Step 3: Typecheck AI abstraction**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api typecheck
```

Expected: command exits with code `0`.

- [ ] **Step 4: Commit AI boundary**

Run:

```bash
git add apps/api/src/modules/ai
git commit -m "feat: add ai provider abstraction"
```

Expected: commit succeeds.

## Task 9: Create Web App Shell

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/styles.css`

- [ ] **Step 1: Create web package**

Create `apps/web/package.json`:

```json
{
  "name": "@worldcup-ai-pk/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -p tsconfig.json && vite build",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "@worldcup-ai-pk/shared": "workspace:*",
    "vite": "^5.4.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "vitest": "^2.1.1"
  }
}
```

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>世界杯 AI PK</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

Create `apps/web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
```

- [ ] **Step 2: Create app shell**

Create `apps/web/src/api/client.ts`:

```ts
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4000";

export async function getPublicHealth(): Promise<{ ok: boolean; service: string }> {
  const response = await fetch(`${apiBaseUrl}/api/public/health`);
  if (!response.ok) {
    throw new Error(`Public API health request failed with status ${response.status}`);
  }
  return (await response.json()) as { ok: boolean; service: string };
}
```

Create `apps/web/src/App.tsx`:

```tsx
import "./styles.css";

export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">2026 世界杯</p>
          <h1>AI 模型预测 PK</h1>
        </div>
        <nav>
          <a href="#fixtures">赛程</a>
          <a href="#leaderboard">排行榜</a>
          <a href="#admin">后台</a>
        </nav>
      </header>
      <section className="intro">
        <h2>赛程、赔率与 AI 预测对比</h2>
        <p>公开页面展示比赛信息、赔率摘要、AI 预测和模型排行榜。后台仅本机访问。</p>
      </section>
    </main>
  );
}
```

Create `apps/web/src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root was not found");
}

createRoot(root).render(<App />);
```

Create `apps/web/src/styles.css`:

```css
:root {
  color: #172026;
  background: #f5f7f8;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

a {
  color: inherit;
  text-decoration: none;
}

.app-shell {
  min-height: 100vh;
}

.topbar {
  align-items: center;
  background: #ffffff;
  border-bottom: 1px solid #d8dee4;
  display: flex;
  justify-content: space-between;
  padding: 20px 32px;
}

.topbar h1 {
  font-size: 24px;
  letter-spacing: 0;
  line-height: 1.2;
  margin: 0;
}

.topbar nav {
  display: flex;
  gap: 20px;
}

.eyebrow {
  color: #527064;
  font-size: 13px;
  margin: 0 0 4px;
}

.intro {
  margin: 40px auto;
  max-width: 960px;
  padding: 0 24px;
}

.intro h2 {
  font-size: 32px;
  letter-spacing: 0;
  margin: 0 0 12px;
}

.intro p {
  color: #50606a;
  font-size: 17px;
  line-height: 1.7;
  margin: 0;
}
```

- [ ] **Step 3: Build web app**

Run:

```bash
pnpm --filter @worldcup-ai-pk/web build
```

Expected: command exits with code `0`.

- [ ] **Step 4: Commit web shell**

Run:

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat: add web app shell"
```

Expected: commit succeeds.

## Task 10: Implement Public Pages With API Contracts

**Files:**

- Create: `apps/web/src/pages/FixturesPage.tsx`
- Create: `apps/web/src/pages/MatchDetailPage.tsx`
- Create: `apps/web/src/pages/LeaderboardPage.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Create fixtures page**

Create `apps/web/src/pages/FixturesPage.tsx`:

```tsx
import type { MatchDto } from "@worldcup-ai-pk/shared";

interface FixturesPageProps {
  matches: MatchDto[];
}

export function FixturesPage({ matches }: FixturesPageProps) {
  return (
    <section id="fixtures" className="page-section">
      <h2>赛程</h2>
      <div className="match-list">
        {matches.map((match) => (
          <article className="match-row" key={match.id}>
            <time>{new Date(match.kickoffAt).toLocaleString("zh-CN")}</time>
            <strong>
              {match.homeTeam.name} vs {match.awayTeam.name}
            </strong>
            <span>{match.status}</span>
            <button disabled={!match.canRequestPrediction}>请求预测</button>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create match detail page**

Create `apps/web/src/pages/MatchDetailPage.tsx`:

```tsx
import type { AiPredictionDto, ApiFootballPredictionDto, MatchDto, OddsSummaryDto } from "@worldcup-ai-pk/shared";

interface MatchDetailPageProps {
  match: MatchDto;
  odds: OddsSummaryDto | null;
  apiPrediction: ApiFootballPredictionDto | null;
  aiPredictions: AiPredictionDto[];
}

export function MatchDetailPage({ match, odds, apiPrediction, aiPredictions }: MatchDetailPageProps) {
  return (
    <section className="page-section">
      <h2>
        {match.homeTeam.name} vs {match.awayTeam.name}
      </h2>
      <div className="detail-grid">
        <article>
          <h3>赔率摘要</h3>
          <p>主胜：{odds?.homeWin ?? "-"}</p>
          <p>平局：{odds?.draw ?? "-"}</p>
          <p>客胜：{odds?.awayWin ?? "-"}</p>
          <p>盘口：{odds?.handicap ?? "-"}</p>
          <p>大小球：{odds?.overUnder ?? "-"}</p>
        </article>
        <article>
          <h3>API-Football 参考预测</h3>
          <p>{apiPrediction?.advice ?? "暂无参考预测"}</p>
        </article>
      </div>
      <div className="prediction-list">
        {aiPredictions.map((prediction) => (
          <article className="prediction-card" key={prediction.id}>
            <h3>{prediction.modelDisplayName}</h3>
            <p>
              {prediction.predictedHomeScore}-{prediction.predictedAwayScore}，置信度 {prediction.confidence}
            </p>
            <p>{prediction.shortReason}</p>
            <p>{prediction.oddsInterpretation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create leaderboard page**

Create `apps/web/src/pages/LeaderboardPage.tsx`:

```tsx
import type { LeaderboardRowDto } from "@worldcup-ai-pk/shared";

interface LeaderboardPageProps {
  rows: LeaderboardRowDto[];
}

export function LeaderboardPage({ rows }: LeaderboardPageProps) {
  return (
    <section id="leaderboard" className="page-section">
      <h2>模型总榜</h2>
      <table>
        <thead>
          <tr>
            <th>模型</th>
            <th>总分</th>
            <th>计分比赛</th>
            <th>赛果命中</th>
            <th>比分命中</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.modelId}>
              <td>{row.modelDisplayName}</td>
              <td>{row.totalScore}</td>
              <td>{row.finishedMatchesCounted}</td>
              <td>{row.resultHits}</td>
              <td>{row.exactScoreHits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 4: Wire placeholder data in App**

Modify `apps/web/src/App.tsx`:

```tsx
import type { MatchDto } from "@worldcup-ai-pk/shared";
import { FixturesPage } from "./pages/FixturesPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import "./styles.css";

const sampleMatches: MatchDto[] = [];

export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">2026 世界杯</p>
          <h1>AI 模型预测 PK</h1>
        </div>
        <nav>
          <a href="#fixtures">赛程</a>
          <a href="#leaderboard">排行榜</a>
          <a href="#admin">后台</a>
        </nav>
      </header>
      <section className="intro">
        <h2>赛程、赔率与 AI 预测对比</h2>
        <p>公开页面展示比赛信息、赔率摘要、AI 预测和模型排行榜。后台仅本机访问。</p>
      </section>
      <FixturesPage matches={sampleMatches} />
      <LeaderboardPage rows={[]} />
    </main>
  );
}
```

- [ ] **Step 5: Build web app**

Run:

```bash
pnpm --filter @worldcup-ai-pk/web build
```

Expected: command exits with code `0`.

- [ ] **Step 6: Commit public pages**

Run:

```bash
git add apps/web/src
git commit -m "feat: add public page components"
```

Expected: commit succeeds.

## Task 11: Implement Local Admin Page Skeleton

**Files:**

- Create: `apps/web/src/pages/AdminPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Create: `apps/api/src/modules/admin/admin.routes.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Create admin page skeleton**

Create `apps/web/src/pages/AdminPage.tsx`:

```tsx
const modules = ["模型配置", "提示词配置", "比赛数据同步", "预测任务", "预测记录", "人工修正", "系统日志"];

export function AdminPage() {
  return (
    <section id="admin" className="page-section admin-section">
      <h2>本地后台</h2>
      <div className="admin-grid">
        {modules.map((module) => (
          <article className="admin-card" key={module}>
            <h3>{module}</h3>
            <p>仅本机访问的后台模块。</p>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Register admin page**

Modify `apps/web/src/App.tsx`:

```tsx
import type { MatchDto } from "@worldcup-ai-pk/shared";
import { AdminPage } from "./pages/AdminPage";
import { FixturesPage } from "./pages/FixturesPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import "./styles.css";

const sampleMatches: MatchDto[] = [];

export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">2026 世界杯</p>
          <h1>AI 模型预测 PK</h1>
        </div>
        <nav>
          <a href="#fixtures">赛程</a>
          <a href="#leaderboard">排行榜</a>
          <a href="#admin">后台</a>
        </nav>
      </header>
      <section className="intro">
        <h2>赛程、赔率与 AI 预测对比</h2>
        <p>公开页面展示比赛信息、赔率摘要、AI 预测和模型排行榜。后台仅本机访问。</p>
      </section>
      <FixturesPage matches={sampleMatches} />
      <LeaderboardPage rows={[]} />
      <AdminPage />
    </main>
  );
}
```

- [ ] **Step 3: Add local-only admin route**

Create `apps/api/src/modules/admin/admin.routes.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from "fastify";

function isLocalRequest(request: FastifyRequest): boolean {
  const ip = request.ip;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    if (!isLocalRequest(request)) {
      await reply.code(403).send({ error: "Admin API is local-only" });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "worldcup-ai-pk-admin"
  }));
}
```

Modify `apps/api/src/app.ts`:

```ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./config/env";
import { registerAdminRoutes } from "./modules/admin/admin.routes";
import { registerPublicRoutes } from "./modules/public/public.routes";

export function buildApp() {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: env.PUBLIC_WEB_ORIGIN
  });

  app.register(registerPublicRoutes, { prefix: "/api/public" });
  app.register(registerAdminRoutes, { prefix: "/api/admin" });

  return app;
}
```

- [ ] **Step 4: Build and typecheck**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api typecheck
pnpm --filter @worldcup-ai-pk/web build
```

Expected: both commands exit with code `0`.

- [ ] **Step 5: Commit admin skeleton**

Run:

```bash
git add apps/api/src/modules/admin apps/api/src/app.ts apps/web/src
git commit -m "feat: add local admin skeleton"
```

Expected: commit succeeds.

## Task 12: Final Verification

**Files:**

- Modify after failures only: files changed by previous tasks.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all commands exit with code `0`.

- [ ] **Step 2: Start API server**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api dev
```

Expected: server listens on `http://127.0.0.1:4000`.

- [ ] **Step 3: Start web server**

Run in a second shell:

```bash
pnpm --filter @worldcup-ai-pk/web dev
```

Expected: Vite listens on `http://127.0.0.1:5173`.

- [ ] **Step 4: Verify health endpoints**

Run:

```bash
curl http://127.0.0.1:4000/api/public/health
curl http://127.0.0.1:4000/api/admin/health
```

Expected public health JSON:

```json
{"ok":true,"service":"worldcup-ai-pk-api"}
```

Expected admin health JSON:

```json
{"ok":true,"service":"worldcup-ai-pk-admin"}
```

- [ ] **Step 5: Commit final verification fixes**

Run only if Step 1 through Step 4 required code changes:

```bash
git add .
git commit -m "fix: pass mvp verification"
```

Expected: commit succeeds if changes exist; skip this step when `git status --short` is empty.

## Self-Review

Spec coverage:

- Fixtures, match details, odds summaries, AI prediction display, leaderboard, and admin surface are covered by Tasks 6 through 11.
- SQLite persistence and schema are covered by Task 3.
- Prediction request timing, rerun limit, and scoring are covered by Tasks 4 and 5.
- API-Football boundary is covered by Task 7.
- AI provider abstraction is covered by Task 8.
- Public API filtering and local admin API restriction are covered by Tasks 6 and 11.

Implementation limits:

- This plan builds the MVP foundation and first pass UI shell.
- Full API-Football response mapping requires real API responses or recorded JSON before exact field mapping is implemented.
- Real AI provider adapters require provider keys and model names from admin configuration before live calls are enabled.
