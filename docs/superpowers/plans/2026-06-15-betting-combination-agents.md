# Betting Combination Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dual-Agent prediction flow where each enabled model first predicts the match result, then generates a Sporttery-based single-match betting combination plan; add a parlay workspace that combines selected match plans.

**Architecture:** Keep `ai_predictions` as the scoring-compatible match-result record. Add `prediction_agent_outputs` for structured Agent A and Agent B outputs, then expose those outputs through existing prediction status/history DTOs. Sporttery data becomes the primary prompt data source by preserving parsed odds pools, history, form, standings, feature and injury summaries in context snapshots.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, React, Vitest, Testing Library, Vite.

---

## File Structure

- Modify `packages/shared/src/types.ts`
  - Add betting task types, Sporttery odds pool DTOs, Agent output DTOs, parlay DTOs.
  - Extend `PredictionRunPredictionDto` with nullable Agent A and Agent B data.
- Modify `apps/api/src/db/schema.sql`
  - Add `prediction_agent_outputs`.
  - Add `parlay_combination_runs`.
- Modify `apps/api/test/schemaMigration.test.ts`
  - Assert new tables and exact column names exist after `applySchema`.
- Modify `apps/api/src/modules/context/sportteryContextParsers.ts`
  - Add structured Sporttery pool parsing while preserving raw input.
  - Remove direct football weighting language from summary strings.
- Modify `apps/api/test/sporttery.test.ts`
  - Add parser tests for HAD, HHAD and unavailable non-HAD pools using exact fixtures.
- Modify `apps/api/src/modules/context/fixtureContext.service.ts`
  - Store structured Sporttery pools under `raw.sporttery.oddsPools`.
- Create `apps/api/src/modules/predictions/predictionAgentPrompts.ts`
  - Build Agent A and Agent B prompts with separate output contracts.
- Create `apps/api/src/modules/predictions/predictionAgentOutputs.ts`
  - Parse and validate Agent A and Agent B JSON outputs.
- Modify `apps/api/src/modules/predictions/predictionExecutor.service.ts`
  - Run Agent A then Agent B for each enabled model.
  - Store Agent outputs and keep `ai_predictions` scoring behavior.
  - Return Agent output data in run status and history.
- Modify `apps/api/test/publicPredictionRequest.test.ts`
  - Verify two model calls per model when single-match combination is requested.
  - Verify Agent output rows and returned DTO fields.
- Modify `apps/api/src/modules/admin/builtInPromptTemplates.ts`
  - Replace built-in prompt text with Agent-safe templates that treat Sporttery odds as selectable purchase options and not match-result weights.
- Modify `apps/web/src/components/PredictionRequestDrawer.tsx`
  - Replace task names with result Agent, scoreline, handicap, total goals, scoreline combo, half/full, single combination and parlay.
  - Make selected task package meaningful to Agent B prompt inputs.
- Modify `apps/web/src/pages/FixturesPage.tsx`
  - Show latest single-match combination summary at top-level match card and prediction summary modal.
  - Add parlay workspace entry for selected matches.
- Modify `apps/web/src/api/client.ts`
  - Add parlay combination API function.
- Modify `apps/web/test/predictionDrawer.test.tsx`
  - Verify new default task package and labels.
- Modify `apps/web/test/fixturesPage.test.tsx`
  - Verify top-level match card shows latest Agent B summary and history still opens detailed reports.
- Modify `apps/web/test/client.test.ts`
  - Verify parlay API request URL, method and JSON body.

---

## Task 1: Shared DTOs And Task Types

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Write the shared type additions**

In `packages/shared/src/types.ts`, extend the existing `PredictionTaskType` union by adding these exact values after `"upset_risk"`:

```ts
  | "match_analysis"
  | "handicap"
  | "total_goals"
  | "scoreline_combo"
  | "half_full"
  | "single_bet_combo"
  | "parlay_combo";
```

Add these interfaces after `FixtureContextSummaryDto`:

```ts
export type SportteryOddsPoolStatus = "available" | "unavailable";

export interface SportteryOddsOptionDto {
  code: string;
  label: string;
  value: string;
}

export interface SportteryOddsPoolDto {
  poolCode: string;
  status: SportteryOddsPoolStatus;
  goalLine: string | null;
  updateDate: string | null;
  updateTime: string | null;
  options: SportteryOddsOptionDto[];
  raw: unknown;
}

export type AgentRole = "match_analysis" | "single_combo" | "parlay_combo";

export interface MatchAnalysisAgentOutputDto {
  predictedResult: PredictionResult;
  predictedHomeScore: number;
  predictedAwayScore: number;
  confidence: number;
  shortReason: string;
  keyFactors: string[];
  riskPoints: string[];
  analysisReport: string;
  dataGaps: string[];
}

export type BettingRiskLevel = "low" | "medium" | "high";

export interface BettingPlanLegDto {
  poolCode: string;
  selectionCode: string;
  selectionLabel: string;
  reason: string;
}

export interface BettingPlanDto {
  planName: string;
  riskLevel: BettingRiskLevel;
  legs: BettingPlanLegDto[];
  stakeUnits: number;
  expectedScenario: string;
  avoidReason: string | null;
}

export interface SingleCombinationAgentOutputDto {
  summary: string;
  primaryPlan: BettingPlanDto;
  backupPlans: BettingPlanDto[];
  passRecommendation: string;
  riskWarnings: string[];
  dataGaps: string[];
}

export interface ParlayCombinationInputDto {
  matchIds: string[];
  riskLevel: BettingRiskLevel;
  stakeUnits: number;
}

export interface ParlayCombinationRunDto {
  id: string;
  matchIds: string[];
  riskLevel: BettingRiskLevel;
  stakeUnits: number;
  summary: string;
  plans: BettingPlanDto[];
  riskWarnings: string[];
  createdAt: string;
}
```

Extend `PredictionRunPredictionDto` with these fields at the end:

```ts
  matchAnalysis?: MatchAnalysisAgentOutputDto | null;
  singleCombination?: SingleCombinationAgentOutputDto | null;
  sportteryOddsPools?: SportteryOddsPoolDto[];
```

- [ ] **Step 2: Run typecheck to expose compile errors**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/shared typecheck
```

Expected: PASS because added fields are optional and no callers are forced to change in this task.

- [ ] **Step 3: Commit shared type changes**

Run:

```bash
git add packages/shared/src/types.ts
git commit -m "feat: add betting agent shared types"
```

Expected: commit succeeds.

---

## Task 2: Database Tables For Agent Outputs And Parlays

**Files:**
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/test/schemaMigration.test.ts`

- [ ] **Step 1: Write the failing schema migration test**

Append this `it` block inside `describe("schema migration on app startup", () => { ... })` in `apps/api/test/schemaMigration.test.ts`:

```ts
  it("creates prediction agent output and parlay run tables", () => {
    const { db } = createTestDatabase();

    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("prediction_agent_outputs")
    ).toMatchObject({ name: "prediction_agent_outputs" });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("parlay_combination_runs")
    ).toMatchObject({ name: "parlay_combination_runs" });

    const agentOutputColumns = db.prepare("PRAGMA table_info(prediction_agent_outputs)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    expect(
      agentOutputColumns.map((column) => ({
        name: column.name,
        type: column.type,
        notnull: column.notnull
      }))
    ).toEqual([
      { name: "id", type: "TEXT", notnull: 0 },
      { name: "prediction_run_id", type: "TEXT", notnull: 1 },
      { name: "match_id", type: "TEXT", notnull: 1 },
      { name: "model_id", type: "TEXT", notnull: 1 },
      { name: "agent_role", type: "TEXT", notnull: 1 },
      { name: "output_json", type: "TEXT", notnull: 1 },
      { name: "raw_response", type: "TEXT", notnull: 1 },
      { name: "parse_status", type: "TEXT", notnull: 1 },
      { name: "error", type: "TEXT", notnull: 0 },
      { name: "created_at", type: "TEXT", notnull: 1 }
    ]);

    const parlayColumns = db.prepare("PRAGMA table_info(parlay_combination_runs)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    expect(
      parlayColumns.map((column) => ({
        name: column.name,
        type: column.type,
        notnull: column.notnull
      }))
    ).toEqual([
      { name: "id", type: "TEXT", notnull: 0 },
      { name: "match_ids_json", type: "TEXT", notnull: 1 },
      { name: "risk_level", type: "TEXT", notnull: 1 },
      { name: "stake_units", type: "INTEGER", notnull: 1 },
      { name: "output_json", type: "TEXT", notnull: 1 },
      { name: "created_at", type: "TEXT", notnull: 1 }
    ]);

    expect(() => applySchema(db)).not.toThrow();
    db.close();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- schemaMigration.test.ts
```

Expected: FAIL because `prediction_agent_outputs` does not exist.

- [ ] **Step 3: Add schema tables**

Append these statements in `apps/api/src/db/schema.sql` after the existing `prediction_run_logs` table:

```sql
CREATE TABLE IF NOT EXISTS prediction_agent_outputs (
  id TEXT PRIMARY KEY,
  prediction_run_id TEXT NOT NULL REFERENCES prediction_runs(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
  agent_role TEXT NOT NULL,
  output_json TEXT NOT NULL,
  raw_response TEXT NOT NULL,
  parse_status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prediction_agent_outputs_run
  ON prediction_agent_outputs(prediction_run_id, model_id, agent_role);

CREATE TABLE IF NOT EXISTS parlay_combination_runs (
  id TEXT PRIMARY KEY,
  match_ids_json TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  stake_units INTEGER NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

- [ ] **Step 4: Run schema test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- schemaMigration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit schema changes**

Run:

```bash
git add apps/api/src/db/schema.sql apps/api/test/schemaMigration.test.ts
git commit -m "feat: store prediction agent outputs"
```

Expected: commit succeeds.

---

## Task 3: Structured Sporttery Odds Pools

**Files:**
- Modify: `apps/api/src/modules/context/sportteryContextParsers.ts`
- Modify: `apps/api/src/modules/context/fixtureContext.service.ts`
- Modify: `apps/api/test/sporttery.test.ts`

- [ ] **Step 1: Write failing parser tests**

Add this import to `apps/api/test/sporttery.test.ts`:

```ts
import { parseSportteryOddsPools } from "../src/modules/context/sportteryContextParsers";
```

Add this test case:

```ts
  it("parses Sporttery HAD and HHAD pools while preserving unavailable pools", () => {
    const pools = parseSportteryOddsPools([
      {
        poolCode: "HAD",
        h: "1.85",
        d: "3.20",
        a: "4.10",
        goalLine: "",
        updateDate: "2026-06-15",
        updateTime: "10:00:00"
      },
      {
        poolCode: "HHAD",
        h: "2.15",
        d: "3.60",
        a: "2.75",
        goalLine: "-1.00",
        updateDate: "2026-06-15",
        updateTime: "10:00:00"
      },
      {
        poolCode: "CRS",
        h: "",
        d: "",
        a: "",
        odds: "",
        updateDate: "2026-06-15",
        updateTime: "10:00:00"
      }
    ]);

    expect(pools).toMatchObject([
      {
        poolCode: "HAD",
        status: "available",
        goalLine: null,
        updateDate: "2026-06-15",
        updateTime: "10:00:00",
        options: [
          { code: "h", label: "主胜", value: "1.85" },
          { code: "d", label: "平", value: "3.20" },
          { code: "a", label: "客胜", value: "4.10" }
        ]
      },
      {
        poolCode: "HHAD",
        status: "available",
        goalLine: "-1.00",
        options: [
          { code: "h", label: "让球主胜", value: "2.15" },
          { code: "d", label: "让球平", value: "3.60" },
          { code: "a", label: "让球客胜", value: "2.75" }
        ]
      },
      {
        poolCode: "CRS",
        status: "unavailable",
        options: []
      }
    ]);
    expect(pools[2]?.raw).toMatchObject({ poolCode: "CRS", odds: "" });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- sporttery.test.ts
```

Expected: FAIL because `parseSportteryOddsPools` is not exported.

- [ ] **Step 3: Implement parser**

Add this import at the top of `apps/api/src/modules/context/sportteryContextParsers.ts`:

```ts
import type { SportteryOddsPoolDto } from "@worldcup-ai-pk/shared";
```

Add this code below `pickOdds`:

```ts
function poolString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildStandardOptions(poolCode: string, item: Obj): SportteryOddsPoolDto["options"] {
  const h = poolString(item.h);
  const d = poolString(item.d);
  const a = poolString(item.a);
  if (!h || !d || !a) return [];

  if (poolCode === "HHAD") {
    return [
      { code: "h", label: "让球主胜", value: h },
      { code: "d", label: "让球平", value: d },
      { code: "a", label: "让球客胜", value: a }
    ];
  }

  return [
    { code: "h", label: "主胜", value: h },
    { code: "d", label: "平", value: d },
    { code: "a", label: "客胜", value: a }
  ];
}

export function parseSportteryOddsPools(oddsList: unknown): SportteryOddsPoolDto[] {
  if (!Array.isArray(oddsList)) return [];
  return (oddsList as Obj[]).map((item) => {
    const poolCode = poolString(item.poolCode) ?? "UNKNOWN";
    const options = poolCode === "HAD" || poolCode === "HHAD" ? buildStandardOptions(poolCode, item) : [];
    return {
      poolCode,
      status: options.length > 0 ? "available" : "unavailable",
      goalLine: poolString(item.goalLine),
      updateDate: poolString(item.updateDate),
      updateTime: poolString(item.updateTime),
      options,
      raw: item
    };
  });
}
```

- [ ] **Step 4: Store structured pools in context raw data**

In `apps/api/src/modules/context/fixtureContext.service.ts`, change the import:

```ts
import { extractOddsForMatch, parseSportteryOddsPools, parseSportterySummary } from "./sportteryContextParsers";
```

Replace:

```ts
        raw.sporttery = parsed.raw;
```

With:

```ts
        raw.sporttery = {
          ...parsed.raw,
          oddsPools: parseSportteryOddsPools(odds)
        };
```

- [ ] **Step 5: Run Sporttery tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- sporttery.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Sporttery parser changes**

Run:

```bash
git add apps/api/src/modules/context/sportteryContextParsers.ts apps/api/src/modules/context/fixtureContext.service.ts apps/api/test/sporttery.test.ts
git commit -m "feat: parse sporttery betting pools"
```

Expected: commit succeeds.

---

## Task 4: Agent Prompt Builders And Parsers

**Files:**
- Create: `apps/api/src/modules/predictions/predictionAgentPrompts.ts`
- Create: `apps/api/src/modules/predictions/predictionAgentOutputs.ts`
- Test: `apps/api/test/predictionAgentOutputs.test.ts`

- [ ] **Step 1: Write parser tests**

Create `apps/api/test/predictionAgentOutputs.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { parseMatchAnalysisOutput, parseSingleCombinationOutput } from "../src/modules/predictions/predictionAgentOutputs";

describe("prediction agent output parsers", () => {
  it("parses match analysis output", () => {
    expect(
      parseMatchAnalysisOutput(
        JSON.stringify({
          predicted_result: "home",
          predicted_home_score: 2,
          predicted_away_score: 1,
          confidence: 0.66,
          short_reason: "主队攻防更均衡。",
          key_factors: ["近期状态", "阵容完整性"],
          risk_points: ["客队反击速度"],
          analysis_report: "主队控球更稳定，客队依赖转换。",
          data_gaps: ["未获取首发名单"]
        })
      )
    ).toEqual({
      predictedResult: "home",
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      confidence: 0.66,
      shortReason: "主队攻防更均衡。",
      keyFactors: ["近期状态", "阵容完整性"],
      riskPoints: ["客队反击速度"],
      analysisReport: "主队控球更稳定，客队依赖转换。",
      dataGaps: ["未获取首发名单"]
    });
  });

  it("parses single combination output", () => {
    expect(
      parseSingleCombinationOutput(
        JSON.stringify({
          summary: "主队小胜路径更清晰，组合以主胜和小比分保护为主。",
          primary_plan: {
            plan_name: "稳健单场",
            risk_level: "medium",
            legs: [
              {
                pool_code: "HAD",
                selection_code: "h",
                selection_label: "主胜",
                reason: "Agent A 判断主队胜面更高。"
              }
            ],
            stake_units: 2,
            expected_scenario: "主队 2-1 或 1-0。",
            avoid_reason: null
          },
          backup_plans: [],
          pass_recommendation: "可低注参与。",
          risk_warnings: ["临场阵容缺失会提高不确定性"],
          data_gaps: ["未获取首发名单"]
        })
      ).toMatchObject({
        summary: "主队小胜路径更清晰，组合以主胜和小比分保护为主。",
        primaryPlan: {
          planName: "稳健单场",
          riskLevel: "medium",
          stakeUnits: 2
        },
        backupPlans: [],
        passRecommendation: "可低注参与。",
        riskWarnings: ["临场阵容缺失会提高不确定性"],
        dataGaps: ["未获取首发名单"]
      });
  });
});
```

- [ ] **Step 2: Run parser tests to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- predictionAgentOutputs.test.ts
```

Expected: FAIL because `predictionAgentOutputs.ts` does not exist.

- [ ] **Step 3: Create parser module**

Create `apps/api/src/modules/predictions/predictionAgentOutputs.ts` with:

```ts
import type {
  BettingPlanDto,
  BettingRiskLevel,
  MatchAnalysisAgentOutputDto,
  PredictionResult,
  SingleCombinationAgentOutputDto
} from "@worldcup-ai-pk/shared";

function parseJsonObject(content: string): Record<string, unknown> {
  const fencedMatch = /```json\s*([\s\S]*?)\s*```/.exec(content);
  const jsonText = fencedMatch?.[1] ?? content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI response JSON must be an object");
  }
  return parsed as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") throw new Error(`AI response field ${fieldName} must be a string`);
  return value;
}

function requireStringOrNull(value: unknown, fieldName: string): string | null {
  if (value === null) return null;
  return requireString(value, fieldName);
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") throw new Error(`AI response field ${fieldName} must be a number`);
  return value;
}

function requireInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`AI response field ${fieldName} must be an integer`);
  }
  return value;
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`AI response field ${fieldName} must be a string array`);
  }
  return value;
}

function requirePredictionResult(value: unknown): PredictionResult {
  if (value === "home" || value === "draw" || value === "away") return value;
  throw new Error("AI response field predicted_result is invalid");
}

function requireRiskLevel(value: unknown): BettingRiskLevel {
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error("AI response field risk_level is invalid");
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`AI response field ${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parsePlan(value: unknown, fieldName: string): BettingPlanDto {
  const record = requireRecord(value, fieldName);
  const legsValue = record.legs;
  if (!Array.isArray(legsValue)) {
    throw new Error(`AI response field ${fieldName}.legs must be an array`);
  }
  return {
    planName: requireString(record.plan_name, `${fieldName}.plan_name`),
    riskLevel: requireRiskLevel(record.risk_level),
    legs: legsValue.map((legValue, index) => {
      const leg = requireRecord(legValue, `${fieldName}.legs[${index}]`);
      return {
        poolCode: requireString(leg.pool_code, `${fieldName}.legs[${index}].pool_code`),
        selectionCode: requireString(leg.selection_code, `${fieldName}.legs[${index}].selection_code`),
        selectionLabel: requireString(leg.selection_label, `${fieldName}.legs[${index}].selection_label`),
        reason: requireString(leg.reason, `${fieldName}.legs[${index}].reason`)
      };
    }),
    stakeUnits: requireInteger(record.stake_units, `${fieldName}.stake_units`),
    expectedScenario: requireString(record.expected_scenario, `${fieldName}.expected_scenario`),
    avoidReason: requireStringOrNull(record.avoid_reason, `${fieldName}.avoid_reason`)
  };
}

export function parseMatchAnalysisOutput(content: string): MatchAnalysisAgentOutputDto {
  const record = parseJsonObject(content);
  return {
    predictedResult: requirePredictionResult(record.predicted_result),
    predictedHomeScore: requireInteger(record.predicted_home_score, "predicted_home_score"),
    predictedAwayScore: requireInteger(record.predicted_away_score, "predicted_away_score"),
    confidence: requireNumber(record.confidence, "confidence"),
    shortReason: requireString(record.short_reason, "short_reason"),
    keyFactors: requireStringArray(record.key_factors, "key_factors"),
    riskPoints: requireStringArray(record.risk_points, "risk_points"),
    analysisReport: requireString(record.analysis_report, "analysis_report"),
    dataGaps: requireStringArray(record.data_gaps, "data_gaps")
  };
}

export function parseSingleCombinationOutput(content: string): SingleCombinationAgentOutputDto {
  const record = parseJsonObject(content);
  const backupPlansValue = record.backup_plans;
  if (!Array.isArray(backupPlansValue)) {
    throw new Error("AI response field backup_plans must be an array");
  }
  return {
    summary: requireString(record.summary, "summary"),
    primaryPlan: parsePlan(record.primary_plan, "primary_plan"),
    backupPlans: backupPlansValue.map((plan, index) => parsePlan(plan, `backup_plans[${index}]`)),
    passRecommendation: requireString(record.pass_recommendation, "pass_recommendation"),
    riskWarnings: requireStringArray(record.risk_warnings, "risk_warnings"),
    dataGaps: requireStringArray(record.data_gaps, "data_gaps")
  };
}
```

- [ ] **Step 4: Create prompt builder module**

Create `apps/api/src/modules/predictions/predictionAgentPrompts.ts` with:

```ts
import type {
  FixtureContextSummaryDto,
  MatchAnalysisAgentOutputDto,
  PredictionDataOptionsDto,
  PredictionOutputStyle,
  PredictionTaskType
} from "@worldcup-ai-pk/shared";

export interface AgentPromptMatch {
  id: string;
  api_football_fixture_id: number;
  stage: string;
  kickoff_at: string;
  venue: string | null;
  home_team_name: string;
  away_team_name: string;
}

export interface PromptTemplateForAgent {
  full_prompt: string;
}

function replacePromptVariables(template: string, match: AgentPromptMatch): string {
  return template
    .replaceAll("{{homeTeam}}", match.home_team_name)
    .replaceAll("{{awayTeam}}", match.away_team_name)
    .replaceAll("{{kickoffAt}}", match.kickoff_at)
    .replaceAll("{{stage}}", match.stage)
    .replaceAll("{{venue}}", match.venue ?? "场馆待同步");
}

function buildBaseContext(input: {
  match: AgentPromptMatch;
  taskTypes: PredictionTaskType[];
  dataOptions: PredictionDataOptionsDto;
  outputStyle: PredictionOutputStyle;
  customPrompt: string;
  context: FixtureContextSummaryDto | null;
}) {
  return {
    match: {
      id: input.match.id,
      apiFootballFixtureId: input.match.api_football_fixture_id,
      stage: input.match.stage,
      kickoffAt: input.match.kickoff_at,
      venue: input.match.venue,
      homeTeam: input.match.home_team_name,
      awayTeam: input.match.away_team_name
    },
    taskTypes: input.taskTypes,
    dataOptions: input.dataOptions,
    outputStyle: input.outputStyle,
    customPrompt: input.customPrompt,
    context: input.context
  };
}

export function buildMatchAnalysisPrompt(input: {
  match: AgentPromptMatch;
  taskTypes: PredictionTaskType[];
  dataOptions: PredictionDataOptionsDto;
  outputStyle: PredictionOutputStyle;
  customPrompt: string;
  context: FixtureContextSummaryDto | null;
  promptTemplate: PromptTemplateForAgent;
}): string {
  const outputContract = {
    predicted_result: "home | draw | away",
    predicted_home_score: "integer",
    predicted_away_score: "integer",
    confidence: "number between 0 and 1",
    short_reason: "Chinese text",
    key_factors: ["Chinese text"],
    risk_points: ["Chinese text"],
    analysis_report: "Detailed Chinese analysis report",
    data_gaps: ["Chinese text"]
  };

  return [
    replacePromptVariables(input.promptTemplate.full_prompt, input.match),
    "",
    "你是 Agent A：比赛结果预测 Agent。你只负责预测赛果、比分、关键因素和风险。",
    "体彩指数只能作为可选投注品类的背景，不得把指数高低作为赛果或比分权重。",
    "prediction_context:",
    JSON.stringify(buildBaseContext(input), null, 2),
    "",
    "Return JSON only. Required JSON shape:",
    JSON.stringify(outputContract, null, 2)
  ].join("\n");
}

export function buildSingleCombinationPrompt(input: {
  match: AgentPromptMatch;
  taskTypes: PredictionTaskType[];
  dataOptions: PredictionDataOptionsDto;
  outputStyle: PredictionOutputStyle;
  customPrompt: string;
  context: FixtureContextSummaryDto | null;
  matchAnalysis: MatchAnalysisAgentOutputDto;
}): string {
  const outputContract = {
    summary: "Chinese text",
    primary_plan: {
      plan_name: "Chinese text",
      risk_level: "low | medium | high",
      legs: [
        {
          pool_code: "Sporttery poolCode",
          selection_code: "Sporttery option code",
          selection_label: "Chinese text",
          reason: "Chinese text"
        }
      ],
      stake_units: "integer",
      expected_scenario: "Chinese text",
      avoid_reason: "Chinese text or null"
    },
    backup_plans: [],
    pass_recommendation: "Chinese text",
    risk_warnings: ["Chinese text"],
    data_gaps: ["Chinese text"]
  };

  return [
    "你是 Agent B：投注组合方案 Agent。你必须基于 Agent A 的比赛判断和 prediction_context 中已存在的体彩选项生成方案。",
    "不要重新预测赛果，不要覆盖 Agent A 的比分判断。若体彩选项缺失，必须在 data_gaps 写明，并在 pass_recommendation 中降低参与建议。",
    "只输出娱乐参考方案，不承诺收益，不使用本金翻倍、稳赚、必中等表达。",
    "prediction_context:",
    JSON.stringify({
      ...buildBaseContext(input),
      matchAnalysis: input.matchAnalysis
    }, null, 2),
    "",
    "Return JSON only. Required JSON shape:",
    JSON.stringify(outputContract, null, 2)
  ].join("\n");
}
```

- [ ] **Step 5: Run parser tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- predictionAgentOutputs.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit prompt and parser modules**

Run:

```bash
git add apps/api/src/modules/predictions/predictionAgentPrompts.ts apps/api/src/modules/predictions/predictionAgentOutputs.ts apps/api/test/predictionAgentOutputs.test.ts
git commit -m "feat: add prediction agent prompts"
```

Expected: commit succeeds.

---

## Task 5: Execute Dual Agents Per Model

**Files:**
- Modify: `apps/api/src/modules/predictions/predictionExecutor.service.ts`
- Modify: `apps/api/test/publicPredictionRequest.test.ts`

- [ ] **Step 1: Write failing API test for Agent A and Agent B**

In `apps/api/test/publicPredictionRequest.test.ts`, modify the existing `"calls enabled models and stores parsed AI predictions"` test:

Replace the current `fetchMock` setup with this sequential mock:

```ts
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    predicted_result: "home",
                    predicted_home_score: 2,
                    predicted_away_score: 1,
                    confidence: 0.64,
                    short_reason: "墨西哥主场推进更稳定。",
                    analysis_report: "墨西哥控球和前场压迫更稳定，但需要防守加拿大反击。",
                    key_factors: ["主场", "前场压迫"],
                    risk_points: ["加拿大反击"],
                    data_gaps: ["未获取首发名单"]
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "主队小胜路径更清晰，单场组合以主胜保护为主。",
                    primary_plan: {
                      plan_name: "主胜小比分",
                      risk_level: "medium",
                      legs: [
                        {
                          pool_code: "HAD",
                          selection_code: "h",
                          selection_label: "主胜",
                          reason: "Agent A 判断主队胜面更高。"
                        }
                      ],
                      stake_units: 2,
                      expected_scenario: "墨西哥 2-1。",
                      avoid_reason: null
                    },
                    backup_plans: [],
                    pass_recommendation: "可低注参与。",
                    risk_warnings: ["临场阵容缺失会提高不确定性"],
                    data_gaps: ["未获取首发名单"]
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
```

Change payload `taskTypes` to:

```ts
        taskTypes: ["match_analysis", "scoreline", "single_bet_combo"],
```

Add these assertions after `expect(completedRun.predictions).toHaveLength(1);`:

```ts
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(completedRun.predictions[0]).toMatchObject({
      matchAnalysis: {
        predictedResult: "home",
        predictedHomeScore: 2,
        predictedAwayScore: 1,
        dataGaps: ["未获取首发名单"]
      },
      singleCombination: {
        summary: "主队小胜路径更清晰，单场组合以主胜保护为主。",
        primaryPlan: {
          planName: "主胜小比分",
          riskLevel: "medium",
          stakeUnits: 2
        }
      }
    });
```

Add this database assertion before `verifyDb.close();`:

```ts
    expect(
      verifyDb
        .prepare("SELECT agent_role, parse_status FROM prediction_agent_outputs WHERE match_id = ? ORDER BY created_at ASC")
        .all("match-1")
    ).toEqual([
      { agent_role: "match_analysis", parse_status: "parsed" },
      { agent_role: "single_combo", parse_status: "parsed" }
    ]);
```

- [ ] **Step 2: Run API test to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- publicPredictionRequest.test.ts
```

Expected: FAIL because the executor still calls each model once.

- [ ] **Step 3: Wire prompt builders and parsers into executor**

In `apps/api/src/modules/predictions/predictionExecutor.service.ts`:

Add imports:

```ts
import type { MatchAnalysisAgentOutputDto, SingleCombinationAgentOutputDto, SportteryOddsPoolDto } from "@worldcup-ai-pk/shared";
import { buildMatchAnalysisPrompt, buildSingleCombinationPrompt } from "./predictionAgentPrompts";
import { parseMatchAnalysisOutput, parseSingleCombinationOutput } from "./predictionAgentOutputs";
```

Replace `ParsedModelPrediction` so it extends Agent A output:

```ts
interface ParsedModelPrediction extends MatchAnalysisAgentOutputDto {
  oddsInterpretation: string;
}
```

Add these row interfaces:

```ts
interface PredictionAgentOutputRow {
  model_id: string;
  agent_role: "match_analysis" | "single_combo" | "parlay_combo";
  output_json: string;
}
```

Add helper functions below `insertParsedPrediction`:

```ts
function insertAgentOutput(db: Database, input: {
  runId: string;
  matchId: string;
  modelId: string;
  agentRole: "match_analysis" | "single_combo" | "parlay_combo";
  output: unknown;
  rawResponse: string;
  now: Date;
}) {
  db.prepare(
    `
      INSERT INTO prediction_agent_outputs (
        id,
        prediction_run_id,
        match_id,
        model_id,
        agent_role,
        output_json,
        raw_response,
        parse_status,
        error,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    randomUUID(),
    input.runId,
    input.matchId,
    input.modelId,
    input.agentRole,
    JSON.stringify(input.output),
    input.rawResponse,
    "parsed",
    null,
    input.now.toISOString()
  );
}

function readAgentOutputs(db: Database, runId: string): Map<string, {
  matchAnalysis: MatchAnalysisAgentOutputDto | null;
  singleCombination: SingleCombinationAgentOutputDto | null;
}> {
  const rows = db
    .prepare(
      `
        SELECT model_id, agent_role, output_json
        FROM prediction_agent_outputs
        WHERE prediction_run_id = ?
          AND parse_status = 'parsed'
        ORDER BY created_at ASC
      `
    )
    .all(runId) as PredictionAgentOutputRow[];
  const result = new Map<string, {
    matchAnalysis: MatchAnalysisAgentOutputDto | null;
    singleCombination: SingleCombinationAgentOutputDto | null;
  }>();
  for (const row of rows) {
    const current = result.get(row.model_id) ?? { matchAnalysis: null, singleCombination: null };
    if (row.agent_role === "match_analysis") current.matchAnalysis = JSON.parse(row.output_json) as MatchAnalysisAgentOutputDto;
    if (row.agent_role === "single_combo") current.singleCombination = JSON.parse(row.output_json) as SingleCombinationAgentOutputDto;
    result.set(row.model_id, current);
  }
  return result;
}
```

Change the `buildPredictionPrompt` call site so Agent A uses:

```ts
  const matchAnalysisPrompt = buildMatchAnalysisPrompt({
    match: input.match,
    taskTypes: input.predictionInput.taskTypes,
    dataOptions: input.predictionInput.dataOptions,
    outputStyle: input.predictionInput.outputStyle,
    customPrompt: input.predictionInput.customPrompt,
    context: input.context,
    promptTemplate
  });
```

Inside the model loop, replace the single `runOpenAiCompatiblePrediction` block with:

```ts
      const matchAnalysisResult = await runOpenAiCompatiblePrediction(
        {
          baseUrl: model.base_url,
          apiKey: model.api_key,
          modelName: model.model_name
        },
        matchAnalysisPrompt
      );
      const matchAnalysis = parseMatchAnalysisOutput(matchAnalysisResult.content);
      insertAgentOutput(input.db, {
        runId: input.runId,
        matchId: input.match.id,
        modelId: model.model_id,
        agentRole: "match_analysis",
        output: matchAnalysis,
        rawResponse: matchAnalysisResult.rawResponse,
        now: addMilliseconds(startedAt, logWriter.logs.length)
      });
      const parsedPrediction: ParsedModelPrediction = {
        ...matchAnalysis,
        oddsInterpretation: "体彩指数仅作为投注选项背景，未作为赛果权重。"
      };
      insertParsedPrediction(input.db, {
        runId: input.runId,
        matchId: input.match.id,
        modelId: model.model_id,
        promptTemplate,
        prediction: parsedPrediction,
        rawResponse: matchAnalysisResult.rawResponse,
        now: addMilliseconds(startedAt, logWriter.logs.length)
      });

      let singleCombination: SingleCombinationAgentOutputDto | null = null;
      if (input.predictionInput.taskTypes.includes("single_bet_combo")) {
        logWriter.write("info", `开始生成投注组合：${model.model_display_name}`, logModel);
        const singleCombinationResult = await runOpenAiCompatiblePrediction(
          {
            baseUrl: model.base_url,
            apiKey: model.api_key,
            modelName: model.model_name
          },
          buildSingleCombinationPrompt({
            match: input.match,
            taskTypes: input.predictionInput.taskTypes,
            dataOptions: input.predictionInput.dataOptions,
            outputStyle: input.predictionInput.outputStyle,
            customPrompt: input.predictionInput.customPrompt,
            context: input.context,
            matchAnalysis
          })
        );
        singleCombination = parseSingleCombinationOutput(singleCombinationResult.content);
        insertAgentOutput(input.db, {
          runId: input.runId,
          matchId: input.match.id,
          modelId: model.model_id,
          agentRole: "single_combo",
          output: singleCombination,
          rawResponse: singleCombinationResult.rawResponse,
          now: addMilliseconds(startedAt, logWriter.logs.length)
        });
      }
```

In the pushed `predictions` object, add:

```ts
        matchAnalysis,
        singleCombination,
        sportteryOddsPools: []
```

- [ ] **Step 4: Return stored Agent outputs in run status**

In `getPredictionRunStatus`, add `ai_predictions.model_id` to the prediction query:

```sql
          ai_predictions.model_id,
```

Add `model_id: string;` to `PredictionRunPredictionRow`.

Before `return {`, add:

```ts
  const agentOutputsByModelId = readAgentOutputs(db, run.id);
```

In the `predictions.map` object, add:

```ts
      matchAnalysis: agentOutputsByModelId.get(prediction.model_id)?.matchAnalysis ?? null,
      singleCombination: agentOutputsByModelId.get(prediction.model_id)?.singleCombination ?? null,
      sportteryOddsPools: []
```

- [ ] **Step 5: Run API test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- publicPredictionRequest.test.ts predictionAgentOutputs.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit dual-Agent executor**

Run:

```bash
git add apps/api/src/modules/predictions/predictionExecutor.service.ts apps/api/test/publicPredictionRequest.test.ts
git commit -m "feat: run match and betting agents"
```

Expected: commit succeeds.

---

## Task 6: Built-In Prompt Templates Without Result Weighting From Sporttery Odds

**Files:**
- Modify: `apps/api/src/modules/admin/builtInPromptTemplates.ts`

- [ ] **Step 1: Update context rules**

In `contextRules`, replace the lines that refer to official index weighting with these exact lines:

```ts
  "你必须只使用 prediction_context 中已经提供的数据。",
  "对缺失的球员、伤停、阵容、历史交锋、体彩选项或官方预测，必须写明未获取；不得编造任何球员状态、伤停、历史战绩、体彩选项或阵容信息。",
  "体彩选项只能作为 Agent B 生成投注组合时的可选品类和回报背景，不得作为 Agent A 胜平负或比分预测的权重。",
  "Agent A 的结论必须来自球队状态、阵容、战术、赛程、历史交锋、积分形势和伤停影响。",
  "Agent B 必须尊重 Agent A 的赛果与比分判断，只能围绕体彩可选项生成单场组合方案。",
  "若 prediction_context 包含懂球帝情报（dongqiudi_intel，含两队综合实力、近期战绩、历史交锋、身价对比、场均红黄牌等赛前情报），应结合近期战绩和历史交锋辅助判断球队状态与纪律风险；场均红黄牌可用于评估犯规与红牌风险；身价对比和综合实力百分比仅作实力参考，不得单独作为预测依据，也不得替代阵容、伤停等更直接的情报。",
  "若 prediction_context 包含体彩赛前情报（sporttery，含体彩选项、历史交锋、积分形势、近期状态、特征对比、伤停影响），积分形势用于判断小组出线压力；伤停影响用于判断阵容完整性和关键球员缺阵风险；体彩选项不得作为赛果预测权重。",
  "输出必须包含结构化字段和中文摘要。"
```

- [ ] **Step 2: Rename market template**

Replace the object with `id: "builtin-prompt-odds-driven"` by this object:

```ts
  {
    id: "builtin-prompt-odds-driven",
    name: "体彩选项说明",
    description: "解释体彩选项如何进入 Agent B 的组合方案，不参与 Agent A 赛果权重。",
    fullPrompt: [
      contextRules,
      "你是体彩选项说明分析师。请基于 prediction_context 中已经提供的体彩选项和比赛基础信息，说明 {{homeTeam}} 对阵 {{awayTeam}} 的可选投注品类。",
      "输出：1. sporttery_option_note；2. option_availability；3. football_data_gap；4. conflict_with_match_analysis；5. non_weighting_notice。"
    ].join("\n\n"),
    promptSummary: "说明体彩选项，不参与赛果权重",
    scope: "match_prediction",
    enabled: false,
    isDefault: false
  },
```

- [ ] **Step 3: Run API tests that seed prompt templates**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminConfig.test.ts publicPredictionRequest.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit prompt template changes**

Run:

```bash
git add apps/api/src/modules/admin/builtInPromptTemplates.ts
git commit -m "feat: update betting agent prompts"
```

Expected: commit succeeds.

---

## Task 7: Prediction Drawer Task Package

**Files:**
- Modify: `apps/web/src/components/PredictionRequestDrawer.tsx`
- Modify: `apps/web/test/predictionDrawer.test.tsx`

- [ ] **Step 1: Update drawer test expected defaults**

In `apps/web/test/predictionDrawer.test.tsx`, replace:

```ts
      taskTypes: ["result_1x2", "scoreline"],
```

With:

```ts
      taskTypes: ["match_analysis", "scoreline", "single_bet_combo"],
```

Add these assertions after `expect(screen.getByLabelText("使用体彩赛前情报")).toBeChecked();`:

```ts
    expect(screen.getByLabelText("赛果 Agent")).toBeChecked();
    expect(screen.getByLabelText("比分预测")).toBeChecked();
    expect(screen.getByLabelText("单场组合")).toBeChecked();
    expect(screen.getByLabelText("让球")).not.toBeChecked();
    expect(screen.getByLabelText("总进球")).not.toBeChecked();
    expect(screen.getByLabelText("半全场")).not.toBeChecked();
```

- [ ] **Step 2: Run drawer test to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- predictionDrawer.test.tsx
```

Expected: FAIL because labels and defaults are still old.

- [ ] **Step 3: Update drawer task options**

In `apps/web/src/components/PredictionRequestDrawer.tsx`, replace:

```ts
const defaultTaskTypes: PredictionTaskType[] = ["result_1x2", "scoreline"];
```

With:

```ts
const defaultTaskTypes: PredictionTaskType[] = ["match_analysis", "scoreline", "single_bet_combo"];
```

Replace `taskOptions` with:

```ts
const taskOptions: Array<{ value: PredictionTaskType; label: string }> = [
  { value: "match_analysis", label: "赛果 Agent" },
  { value: "scoreline", label: "比分预测" },
  { value: "handicap", label: "让球" },
  { value: "total_goals", label: "总进球" },
  { value: "scoreline_combo", label: "比分组合" },
  { value: "half_full", label: "半全场" },
  { value: "single_bet_combo", label: "单场组合" },
  { value: "parlay_combo", label: "串关组合" }
];
```

- [ ] **Step 4: Run drawer test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- predictionDrawer.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit drawer task package**

Run:

```bash
git add apps/web/src/components/PredictionRequestDrawer.tsx apps/web/test/predictionDrawer.test.tsx
git commit -m "feat: update prediction task package"
```

Expected: commit succeeds.

---

## Task 8: Top-Level Match Card Betting Summary

**Files:**
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Modify: `apps/web/test/fixturesPage.test.tsx`

- [ ] **Step 1: Update FixturesPage prediction test fixture**

In `apps/web/test/fixturesPage.test.tsx`, inside the prediction object returned by `onRequestPrediction`, add:

```ts
          matchAnalysis: {
            predictedResult: "home",
            predictedHomeScore: 2,
            predictedAwayScore: 1,
            confidence: 0.72,
            shortReason: "主队更稳定。",
            keyFactors: ["主场"],
            riskPoints: ["客队反击"],
            analysisReport: "详细分析报告正文。",
            dataGaps: ["未获取首发名单"]
          },
          singleCombination: {
            summary: "主队小胜路径更清晰，单场组合以主胜保护为主。",
            primaryPlan: {
              planName: "主胜小比分",
              riskLevel: "medium",
              legs: [
                {
                  poolCode: "HAD",
                  selectionCode: "h",
                  selectionLabel: "主胜",
                  reason: "Agent A 判断主队胜面更高。"
                }
              ],
              stakeUnits: 2,
              expectedScenario: "美国 2-1。",
              avoidReason: null
            },
            backupPlans: [],
            passRecommendation: "可低注参与。",
            riskWarnings: ["临场阵容缺失会提高不确定性"],
            dataGaps: ["未获取首发名单"]
          }
```

Add assertions after `expect(await screen.findByText("已完成 1 个模型预测")).toBeInTheDocument();`:

```ts
    expect(screen.getByText("最新组合方案")).toBeInTheDocument();
    expect(screen.getByText("主胜小比分")).toBeInTheDocument();
    expect(screen.getByText("中风险 · 2 注")).toBeInTheDocument();
    expect(screen.getByText("主队小胜路径更清晰，单场组合以主胜保护为主。")).toBeInTheDocument();
```

- [ ] **Step 2: Run FixturesPage test to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx
```

Expected: FAIL because the card does not render single-match combination data.

- [ ] **Step 3: Add render helper in FixturesPage**

In `apps/web/src/pages/FixturesPage.tsx`, add helper functions near existing prediction summary helpers:

```tsx
function getRiskLabel(riskLevel: "low" | "medium" | "high") {
  if (riskLevel === "low") return "低风险";
  if (riskLevel === "high") return "高风险";
  return "中风险";
}

function getLatestSingleCombination(predictionStatus: PredictionRunStatusDto | PredictionRequestResponseDto | null) {
  return predictionStatus?.predictions.find((prediction) => prediction.singleCombination)?.singleCombination ?? null;
}
```

Inside each match card, after the existing prediction summary block and before action buttons, render:

```tsx
              {getLatestSingleCombination(latestPredictionByMatchId[match.id] ?? null) ? (
                <div className="match-betting-summary">
                  <span>最新组合方案</span>
                  <strong>{getLatestSingleCombination(latestPredictionByMatchId[match.id] ?? null)?.primaryPlan.planName}</strong>
                  <small>
                    {getRiskLabel(getLatestSingleCombination(latestPredictionByMatchId[match.id] ?? null)?.primaryPlan.riskLevel ?? "medium")} ·{" "}
                    {getLatestSingleCombination(latestPredictionByMatchId[match.id] ?? null)?.primaryPlan.stakeUnits} 注
                  </small>
                  <p>{getLatestSingleCombination(latestPredictionByMatchId[match.id] ?? null)?.summary}</p>
                </div>
              ) : null}
```

Add CSS for `.match-betting-summary` in the same file or existing stylesheet used by `FixturesPage`:

```css
.match-betting-summary {
  min-width: 220px;
  max-width: 320px;
  padding: 10px 12px;
  border: 1px solid rgba(17, 71, 64, 0.16);
  border-radius: 8px;
  background: rgba(240, 248, 245, 0.9);
}

.match-betting-summary span {
  display: block;
  font-size: 12px;
  color: #51635f;
}

.match-betting-summary strong {
  display: block;
  margin-top: 3px;
  color: #123d36;
}

.match-betting-summary small {
  display: block;
  margin-top: 3px;
  color: #315a52;
}

.match-betting-summary p {
  margin: 6px 0 0;
  color: #243a36;
  font-size: 13px;
  line-height: 1.45;
}
```

- [ ] **Step 4: Run FixturesPage test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit match card summary**

Run:

```bash
git add apps/web/src/pages/FixturesPage.tsx apps/web/test/fixturesPage.test.tsx
git commit -m "feat: show latest betting plan on match cards"
```

Expected: commit succeeds.

---

## Task 9: Parlay Combination API

**Files:**
- Modify: `apps/api/src/modules/predictions/predictionExecutor.service.ts`
- Modify: `apps/api/src/routes/public.routes.ts`
- Test: `apps/api/test/publicPredictionRequest.test.ts`

- [ ] **Step 1: Write parlay endpoint test**

Add this test to `apps/api/test/publicPredictionRequest.test.ts`:

```ts
  it("creates a parlay combination from latest single-match plans", async () => {
    const { db, databasePath } = createTestDatabase();
    insertMatch(db, {
      id: "match-1",
      kickoffAt: "2099-06-12T19:00:00.000Z",
      status: "scheduled"
    });
    insertMatch(db, {
      id: "match-2",
      kickoffAt: "2099-06-13T19:00:00.000Z",
      status: "scheduled"
    });
    insertAiConfig(db);
    db.prepare(
      `
        INSERT INTO prediction_runs (id, match_id, scheduled_at, started_at, finished_at, status, failure_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "run-1",
      "match-1",
      "2026-06-13T08:00:00.000Z",
      "2026-06-13T08:00:00.000Z",
      "2026-06-13T08:00:01.000Z",
      "completed",
      null,
      "run-2",
      "match-2",
      "2026-06-13T08:10:00.000Z",
      "2026-06-13T08:10:00.000Z",
      "2026-06-13T08:10:01.000Z",
      "completed",
      null
    );
    db.prepare(
      `
        INSERT INTO prediction_agent_outputs (
          id,
          prediction_run_id,
          match_id,
          model_id,
          agent_role,
          output_json,
          raw_response,
          parse_status,
          error,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "agent-output-1",
      "run-1",
      "match-1",
      "model-1",
      "single_combo",
      JSON.stringify({
        summary: "第一场主胜保护。",
        primaryPlan: {
          planName: "第一场主胜",
          riskLevel: "medium",
          legs: [{ poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", reason: "主队更稳。" }],
          stakeUnits: 2,
          expectedScenario: "2-1",
          avoidReason: null
        },
        backupPlans: [],
        passRecommendation: "可低注参与。",
        riskWarnings: [],
        dataGaps: []
      }),
      "{}",
      "parsed",
      null,
      "2026-06-13T08:00:01.000Z",
      "agent-output-2",
      "run-2",
      "match-2",
      "model-1",
      "single_combo",
      JSON.stringify({
        summary: "第二场总进球保护。",
        primaryPlan: {
          planName: "第二场小球",
          riskLevel: "medium",
          legs: [{ poolCode: "TTG", selectionCode: "2", selectionLabel: "总进球 2", reason: "节奏偏慢。" }],
          stakeUnits: 1,
          expectedScenario: "1-1",
          avoidReason: null
        },
        backupPlans: [],
        passRecommendation: "可低注参与。",
        riskWarnings: [],
        dataGaps: []
      }),
      "{}",
      "parsed",
      null,
      "2026-06-13T08:10:01.000Z"
    );
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/public/parlay-combinations",
      payload: {
        matchIds: ["match-1", "match-2"],
        riskLevel: "medium",
        stakeUnits: 3
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matchIds: ["match-1", "match-2"],
      riskLevel: "medium",
      stakeUnits: 3,
      summary: "2 场组合：第一场主胜 + 第二场小球",
      plans: [
        expect.objectContaining({ planName: "第一场主胜" }),
        expect.objectContaining({ planName: "第二场小球" })
      ]
    });

    await app.close();
  });
```

- [ ] **Step 2: Run endpoint test to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- publicPredictionRequest.test.ts
```

Expected: FAIL because `/api/public/parlay-combinations` is not registered.

- [ ] **Step 3: Add parlay service function**

In `apps/api/src/modules/predictions/predictionExecutor.service.ts`, add:

```ts
import type { BettingPlanDto, BettingRiskLevel, ParlayCombinationRunDto } from "@worldcup-ai-pk/shared";
```

Add function:

```ts
export function createParlayCombinationRun(db: Database, input: {
  matchIds: string[];
  riskLevel: BettingRiskLevel;
  stakeUnits: number;
  now?: Date;
}): ParlayCombinationRunDto {
  const now = input.now ?? new Date();
  const plans = input.matchIds.map((matchId) => {
    const row = db
      .prepare(
        `
          SELECT output_json
          FROM prediction_agent_outputs
          WHERE match_id = ?
            AND agent_role = 'single_combo'
            AND parse_status = 'parsed'
          ORDER BY created_at DESC
          LIMIT 1
        `
      )
      .get(matchId) as { output_json: string } | undefined;
    if (!row) {
      throw new Error(`No single combo output for match ${matchId}`);
    }
    const parsed = JSON.parse(row.output_json) as { primaryPlan: BettingPlanDto };
    return parsed.primaryPlan;
  });
  const run: ParlayCombinationRunDto = {
    id: randomUUID(),
    matchIds: input.matchIds,
    riskLevel: input.riskLevel,
    stakeUnits: input.stakeUnits,
    summary: `${plans.length} 场组合：${plans.map((plan) => plan.planName).join(" + ")}`,
    plans,
    riskWarnings: ["串关会放大单场不确定性，请降低单注预算。"],
    createdAt: now.toISOString()
  };
  db.prepare(
    `
      INSERT INTO parlay_combination_runs (
        id,
        match_ids_json,
        risk_level,
        stake_units,
        output_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(run.id, JSON.stringify(input.matchIds), input.riskLevel, input.stakeUnits, JSON.stringify(run), run.createdAt);
  return run;
}
```

- [ ] **Step 4: Register public route**

In `apps/api/src/routes/public.routes.ts`, import:

```ts
import { createParlayCombinationRun } from "../modules/predictions/predictionExecutor.service";
```

Add route:

```ts
  app.post("/api/public/parlay-combinations", async (request, reply) => {
    const body = request.body as { matchIds?: unknown; riskLevel?: unknown; stakeUnits?: unknown };
    if (!Array.isArray(body.matchIds) || !body.matchIds.every((matchId) => typeof matchId === "string")) {
      return reply.status(400).send({ message: "matchIds must be a string array" });
    }
    if (body.riskLevel !== "low" && body.riskLevel !== "medium" && body.riskLevel !== "high") {
      return reply.status(400).send({ message: "riskLevel is invalid" });
    }
    if (typeof body.stakeUnits !== "number" || !Number.isInteger(body.stakeUnits) || body.stakeUnits < 1) {
      return reply.status(400).send({ message: "stakeUnits must be a positive integer" });
    }
    try {
      return createParlayCombinationRun(request.server.db, {
        matchIds: body.matchIds,
        riskLevel: body.riskLevel,
        stakeUnits: body.stakeUnits
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Parlay combination failed";
      return reply.status(409).send({ message });
    }
  });
```

- [ ] **Step 5: Run endpoint test**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- publicPredictionRequest.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit parlay API**

Run:

```bash
git add apps/api/src/modules/predictions/predictionExecutor.service.ts apps/api/src/routes/public.routes.ts apps/api/test/publicPredictionRequest.test.ts
git commit -m "feat: add parlay combination api"
```

Expected: commit succeeds.

---

## Task 10: Parlay Client And Workspace Entry

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Modify: `apps/web/test/client.test.ts`
- Modify: `apps/web/test/fixturesPage.test.tsx`

- [ ] **Step 1: Add client test**

In `apps/web/test/client.test.ts`, add:

```ts
import { createParlayCombination } from "../src/api/client";
```

Add test:

```ts
  it("creates a parlay combination", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "parlay-1",
          matchIds: ["match-1", "match-2"],
          riskLevel: "medium",
          stakeUnits: 3,
          summary: "2 场组合：第一场主胜 + 第二场小球",
          plans: [],
          riskWarnings: ["串关会放大单场不确定性，请降低单注预算。"],
          createdAt: "2026-06-15T08:00:00.000Z"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    await expect(
      createParlayCombination({
        matchIds: ["match-1", "match-2"],
        riskLevel: "medium",
        stakeUnits: 3
      })
    ).resolves.toMatchObject({
      id: "parlay-1",
      matchIds: ["match-1", "match-2"]
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/parlay-combinations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          matchIds: ["match-1", "match-2"],
          riskLevel: "medium",
          stakeUnits: 3
        })
      })
    );
  });
```

- [ ] **Step 2: Run client test to verify failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts
```

Expected: FAIL because `createParlayCombination` does not exist.

- [ ] **Step 3: Add client function**

In `apps/web/src/api/client.ts`, add imports:

```ts
  ParlayCombinationInputDto,
  ParlayCombinationRunDto,
```

Add function:

```ts
export async function createParlayCombination(input: ParlayCombinationInputDto): Promise<ParlayCombinationRunDto> {
  const response = await request(`${apiBaseUrl}/api/public/parlay-combinations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Public parlay combination request failed with status ${response.status}`);
  }
  return (await response.json()) as ParlayCombinationRunDto;
}
```

- [ ] **Step 4: Add minimal workspace entry to FixturesPage**

In `apps/web/src/pages/FixturesPage.tsx`, add a top-level compact section above date groups:

```tsx
        <section className="parlay-workspace">
          <div>
            <span>串关工作台</span>
            <strong>从已生成单场组合的比赛中选择 2 场以上</strong>
          </div>
          <button type="button" disabled>
            生成串关组合
          </button>
        </section>
```

Add CSS:

```css
.parlay-workspace {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 18px 0;
  padding: 14px 16px;
  border: 1px solid rgba(18, 61, 54, 0.14);
  border-radius: 8px;
  background: #f7fbf9;
}

.parlay-workspace span {
  display: block;
  color: #51635f;
  font-size: 12px;
}

.parlay-workspace strong {
  display: block;
  margin-top: 4px;
  color: #14211f;
}
```

- [ ] **Step 5: Run web tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts fixturesPage.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit parlay frontend entry**

Run:

```bash
git add apps/web/src/api/client.ts apps/web/src/pages/FixturesPage.tsx apps/web/test/client.test.ts apps/web/test/fixturesPage.test.tsx
git commit -m "feat: add parlay workspace entry"
```

Expected: commit succeeds.

---

## Task 11: Full Verification

**Files:**
- No file changes in this task.

- [ ] **Step 1: Run API targeted tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- schemaMigration.test.ts sporttery.test.ts predictionAgentOutputs.test.ts publicPredictionRequest.test.ts adminConfig.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run web targeted tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- predictionDrawer.test.tsx fixturesPage.test.tsx client.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run package typechecks**

Run:

```bash
corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full tests**

Run:

```bash
corepack pnpm test
```

Expected: PASS.

- [ ] **Step 5: Inspect working tree**

Run:

```bash
git status --short
```

Expected: no uncommitted source changes.

---

## Self-Review

- Spec coverage:
  - P0 single-match complete Sporttery information: Tasks 3, 4, 5, 6.
  - Dual Agent split between match result and betting combination: Tasks 4 and 5.
  - Meaningful prediction task package: Task 7.
  - Latest prediction data shown at top-level UI: Task 8.
  - Parlay combination workspace and API: Tasks 9 and 10.
  - Verification commands: Task 11.
- Placeholder scan:
  - This plan avoids the forbidden placeholder strings from the planning skill.
  - Every test step includes concrete code and an expected result.
- Type consistency:
  - `matchAnalysis`, `singleCombination`, `SportteryOddsPoolDto`, `ParlayCombinationInputDto` and `ParlayCombinationRunDto` are defined in Task 1 before use.
  - `prediction_agent_outputs` and `parlay_combination_runs` are defined in Task 2 before API reads and writes.
