# AI Summary, Leaderboard, and Prompt Update Implementation Plan

> **For yzq/Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan.

**Goal:** Improve the match prediction experience by showing a compact AI consensus table on fixture cards, filling the leaderboard with real scoring plus activity data, and removing odds influence from default prediction prompts and request defaults while keeping odds visible as page data.

**Design Source:** `/Users/yzq/Desktop/project/worldcup-ai-pk/docs/superpowers/specs/2026-06-14-ai-summary-leaderboard-prompt-design.md`

**Current Worktree Constraint:** The branch already contains uncommitted edits in API, web, shared types, tests, and Dongqiudi files. Do not revert those edits. Apply changes on top of the current files and stage only files changed for this implementation.

## Task 1: Add Public Leaderboard Data Contract and API

**Files:**
- Modify: `packages/shared/src/types.ts`
- Create: `apps/api/src/modules/leaderboard/leaderboard.repository.ts`
- Modify: `apps/api/src/modules/public/public.routes.ts`
- Create: `apps/api/test/publicLeaderboard.test.ts`

**Step 1.1: Extend shared leaderboard DTOs**

In `packages/shared/src/types.ts`, keep the existing `LeaderboardRowDto` fields and add activity rows plus an envelope response:

```ts
export interface LeaderboardActiveRowDto {
  modelId: string;
  modelDisplayName: string;
  predictionsCount: number;
  parsedPredictionsCount: number;
  matchesCovered: number;
  homeWinVotes: number;
  drawVotes: number;
  awayWinVotes: number;
  averageConfidence: number | null;
  latestPredictionAt: string | null;
}

export interface LeaderboardDto {
  settledRows: LeaderboardRowDto[];
  activeRows: LeaderboardActiveRowDto[];
}
```

`LeaderboardRowDto` remains backward-compatible for existing imports.

**Step 1.2: Implement repository queries**

Create `apps/api/src/modules/leaderboard/leaderboard.repository.ts` with a single exported function:

```ts
import type { LeaderboardActiveRowDto, LeaderboardDto, LeaderboardRowDto } from "@worldcup-ai-pk/shared";
import type { Database } from "../../db/client";

interface SettledRowRecord {
  model_id: string;
  model_display_name: string;
  total_score: number | null;
  finished_matches_counted: number;
  result_hits: number | null;
  exact_score_hits: number | null;
}

interface RecentScoreRecord {
  model_id: string;
  total_points: number;
}

interface ActiveRowRecord {
  model_id: string;
  model_display_name: string;
  predictions_count: number;
  parsed_predictions_count: number;
  matches_covered: number;
  home_win_votes: number | null;
  draw_votes: number | null;
  away_win_votes: number | null;
  average_confidence: number | null;
  latest_prediction_at: string | null;
}

const toNumber = (value: unknown): number => Number(value ?? 0);

export function listPublicLeaderboard(db: Database): LeaderboardDto {
  const settledRecords = db
    .prepare(
      `
      SELECT
        ai_models.id AS model_id,
        ai_models.display_name AS model_display_name,
        SUM(prediction_scores.total_points) AS total_score,
        COUNT(prediction_scores.id) AS finished_matches_counted,
        SUM(CASE WHEN prediction_scores.result_points > 0 THEN 1 ELSE 0 END) AS result_hits,
        SUM(CASE WHEN prediction_scores.exact_score_points > 0 THEN 1 ELSE 0 END) AS exact_score_hits
      FROM prediction_scores
      INNER JOIN ai_predictions ON ai_predictions.id = prediction_scores.prediction_id
      INNER JOIN ai_models ON ai_models.id = ai_predictions.model_id
      GROUP BY ai_models.id, ai_models.display_name
      ORDER BY total_score DESC, result_hits DESC, exact_score_hits DESC, model_display_name ASC
      `
    )
    .all() as SettledRowRecord[];

  const recentScoreRecords = db
    .prepare(
      `
      SELECT model_id, total_points
      FROM (
        SELECT
          ai_predictions.model_id AS model_id,
          prediction_scores.total_points AS total_points,
          ROW_NUMBER() OVER (
            PARTITION BY ai_predictions.model_id
            ORDER BY prediction_scores.scored_at DESC, prediction_scores.id DESC
          ) AS row_number
        FROM prediction_scores
        INNER JOIN ai_predictions ON ai_predictions.id = prediction_scores.prediction_id
      )
      WHERE row_number <= 5
      ORDER BY model_id ASC, row_number ASC
      `
    )
    .all() as RecentScoreRecord[];

  const recentScoresByModel = new Map<string, number[]>();
  for (const record of recentScoreRecords) {
    const scores = recentScoresByModel.get(record.model_id) ?? [];
    scores.push(toNumber(record.total_points));
    recentScoresByModel.set(record.model_id, scores);
  }

  const settledRows: LeaderboardRowDto[] = settledRecords.map((record) => {
    const finishedMatchesCounted = toNumber(record.finished_matches_counted);
    const resultHits = toNumber(record.result_hits);

    return {
      modelId: record.model_id,
      modelDisplayName: record.model_display_name,
      totalScore: toNumber(record.total_score),
      finishedMatchesCounted,
      resultHits,
      resultAccuracy: finishedMatchesCounted > 0 ? resultHits / finishedMatchesCounted : 0,
      exactScoreHits: toNumber(record.exact_score_hits),
      recentScores: recentScoresByModel.get(record.model_id) ?? []
    };
  });

  const activeRecords = db
    .prepare(
      `
      SELECT
        ai_models.id AS model_id,
        ai_models.display_name AS model_display_name,
        COUNT(ai_predictions.id) AS predictions_count,
        SUM(CASE WHEN ai_predictions.parse_status = 'parsed' THEN 1 ELSE 0 END) AS parsed_predictions_count,
        COUNT(DISTINCT ai_predictions.match_id) AS matches_covered,
        SUM(CASE WHEN ai_predictions.predicted_result = 'home_win' THEN 1 ELSE 0 END) AS home_win_votes,
        SUM(CASE WHEN ai_predictions.predicted_result = 'draw' THEN 1 ELSE 0 END) AS draw_votes,
        SUM(CASE WHEN ai_predictions.predicted_result = 'away_win' THEN 1 ELSE 0 END) AS away_win_votes,
        AVG(ai_predictions.confidence) AS average_confidence,
        MAX(ai_predictions.created_at) AS latest_prediction_at
      FROM ai_predictions
      INNER JOIN ai_models ON ai_models.id = ai_predictions.model_id
      GROUP BY ai_models.id, ai_models.display_name
      ORDER BY predictions_count DESC, matches_covered DESC, model_display_name ASC
      `
    )
    .all() as ActiveRowRecord[];

  const activeRows: LeaderboardActiveRowDto[] = activeRecords.map((record) => ({
    modelId: record.model_id,
    modelDisplayName: record.model_display_name,
    predictionsCount: toNumber(record.predictions_count),
    parsedPredictionsCount: toNumber(record.parsed_predictions_count),
    matchesCovered: toNumber(record.matches_covered),
    homeWinVotes: toNumber(record.home_win_votes),
    drawVotes: toNumber(record.draw_votes),
    awayWinVotes: toNumber(record.away_win_votes),
    averageConfidence: record.average_confidence === null ? null : Number(record.average_confidence),
    latestPredictionAt: record.latest_prediction_at
  }));

  return { settledRows, activeRows };
}
```

**Step 1.3: Add public route**

In `apps/api/src/modules/public/public.routes.ts`:

1. Import the repository:

```ts
import { listPublicLeaderboard } from "../leaderboard/leaderboard.repository";
```

2. Add this route before match detail routes:

```ts
app.get("/leaderboard", () => listPublicLeaderboard(db));
```

**Step 1.4: Backend tests**

Create `apps/api/test/publicLeaderboard.test.ts` using the existing test setup style in `apps/api/test/publicPredictionRequest.test.ts`.

Test these exact behaviors:
- `GET /api/public/leaderboard` returns `{ settledRows: [], activeRows: [] }` on an empty DB.
- When a finished/scored prediction exists, `settledRows[0]` includes `totalScore`, `finishedMatchesCounted`, `resultHits`, `resultAccuracy`, `exactScoreHits`, and `recentScores`.
- When unscored parsed predictions exist, `activeRows[0]` includes `predictionsCount`, `parsedPredictionsCount`, `matchesCovered`, vote counts, `averageConfidence`, and `latestPredictionAt`.

Run:

```bash
npm --workspace apps/api test -- publicLeaderboard
```

## Task 2: Wire Leaderboard into the Web App

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/LeaderboardPage.tsx`
- Modify/Create tests under `apps/web/test/`

**Step 2.1: Add client method**

In `apps/web/src/api/client.ts`, import `LeaderboardDto` and add:

```ts
export async function getPublicLeaderboard(): Promise<LeaderboardDto> {
  return request<LeaderboardDto>("/api/public/leaderboard");
}
```

**Step 2.2: Load leaderboard in App**

In `apps/web/src/App.tsx`:

1. Import `LeaderboardDto` and `getPublicLeaderboard`.
2. Add state:

```ts
const [leaderboard, setLeaderboard] = useState<LeaderboardDto>({
  settledRows: [],
  activeRows: []
});
```

3. Update `loadInitialData()` to load matches, templates, and leaderboard together:

```ts
const [nextMatches, nextTemplates, nextLeaderboard] = await Promise.all([
  getPublicMatches(),
  listAdminPromptTemplates(),
  getPublicLeaderboard()
]);
setMatches(nextMatches);
setPromptTemplates(nextTemplates);
setLeaderboard(nextLeaderboard);
```

4. Add a small helper and call it after prediction requests and fixture sync:

```ts
const loadLeaderboard = async () => {
  const nextLeaderboard = await getPublicLeaderboard();
  setLeaderboard(nextLeaderboard);
};
```

5. Render:

```tsx
<LeaderboardPage leaderboard={leaderboard} />
```

**Step 2.3: Redesign leaderboard page**

Replace the single table in `apps/web/src/pages/LeaderboardPage.tsx` with two compact sections:

- “真实计分榜”: driven by `leaderboard.settledRows`
- “预测活跃榜”: driven by `leaderboard.activeRows`

Use table columns:

真实计分榜:
- 排名
- 模型
- 总分
- 已结算
- 胜平负命中
- 胜平负命中率
- 比分全中
- 近 5 场

预测活跃榜:
- 排名
- 模型
- 预测数
- 覆盖比赛
- 可解析
- 胜/平/负观点
- 平均信心
- 最近预测

When a section has no rows, show concise empty states:
- “暂无已结算预测”
- “暂无预测活动”

**Step 2.4: Frontend tests**

Update or add:
- `apps/web/test/client.test.ts`: asserts `getPublicLeaderboard()` calls `/api/public/leaderboard`.
- `apps/web/test/app.test.tsx`: mocks `getPublicLeaderboard`.
- `apps/web/test/leaderboardPage.test.tsx`: renders both sections, table rows, and empty states.

Run:

```bash
npm --workspace apps/web test -- client app leaderboardPage
```

## Task 3: Simplify AI Prediction Card into Consensus Table

**Files:**
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Modify: `apps/web/test/fixturesPage.test.tsx`

**Step 3.1: Add summary helpers**

In `apps/web/src/pages/FixturesPage.tsx`, add helpers near the existing prediction display helpers:

```ts
const predictionResultLabels: Record<NonNullable<PredictionDto["predictedResult"]>, string> = {
  home_win: "主胜",
  draw: "平局",
  away_win: "客胜"
};

function formatPredictionScore(prediction: PredictionDto): string {
  if (prediction.predictedHomeScore === null || prediction.predictedAwayScore === null) {
    return "未给出";
  }
  return `${prediction.predictedHomeScore}-${prediction.predictedAwayScore}`;
}

function getPredictionResultText(prediction: PredictionDto): string {
  return prediction.predictedResult ? predictionResultLabels[prediction.predictedResult] : "未解析";
}

function buildPredictionConsensus(predictions: PredictionDto[], failedCount: number) {
  const parsedPredictions = predictions.filter((prediction) => prediction.predictedResult);
  const resultCounts = parsedPredictions.reduce(
    (counts, prediction) => {
      if (prediction.predictedResult) {
        counts[prediction.predictedResult] += 1;
      }
      return counts;
    },
    { home_win: 0, draw: 0, away_win: 0 } as Record<NonNullable<PredictionDto["predictedResult"]>, number>
  );

  const topResult = (Object.entries(resultCounts) as Array<[NonNullable<PredictionDto["predictedResult"]>, number]>)
    .sort((left, right) => right[1] - left[1])[0];

  const scoreCounts = new Map<string, number>();
  for (const prediction of predictions) {
    const score = formatPredictionScore(prediction);
    if (score !== "未给出") {
      scoreCounts.set(score, (scoreCounts.get(score) ?? 0) + 1);
    }
  }
  const topScore = [...scoreCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "未形成共识";

  return {
    successCount: predictions.length,
    failedCount,
    topResultText: topResult && topResult[1] > 0 ? predictionResultLabels[topResult[0]] : "未形成共识",
    topScore,
    resultDistributionText: `主胜 ${resultCounts.home_win} / 平 ${resultCounts.draw} / 客胜 ${resultCounts.away_win}`
  };
}
```

Use the exact existing `PredictionDto` field names from `packages/shared/src/types.ts` when applying this step.

**Step 3.2: Replace card log block with summary table**

In the match card prediction area:

- Keep the request status message.
- Remove the long execution-log list from the card.
- Add a compact summary line:

```tsx
<div className="prediction-consensus-summary">
  <span>综合观点：{consensus.topResultText}</span>
  <span>参考比分：{consensus.topScore}</span>
  <span>{consensus.resultDistributionText}</span>
  <span>成功 {consensus.successCount} / 失败 {consensus.failedCount}</span>
</div>
```

- Add table columns:
  - AI 模型
  - 胜平负
  - 比分
  - 信心
  - 胜负手

Map each prediction row:

```tsx
<tr key={prediction.id}>
  <td>{prediction.modelDisplayName}</td>
  <td>{getPredictionResultText(prediction)}</td>
  <td>{formatPredictionScore(prediction)}</td>
  <td>{prediction.confidence === null ? "-" : `${Math.round(prediction.confidence * 100)}%`}</td>
  <td>{prediction.shortReason || prediction.reasoning?.slice(0, 80) || "未给出"}</td>
</tr>
```

If no prediction rows exist yet during a queued/running state, show:

```tsx
<p className="muted">AI 正在生成预测，完成后这里会汇总各模型观点。</p>
```

**Step 3.3: Keep detailed report entry**

The existing “查看报告” flow remains. The detailed report should keep:
- execution logs
- full reasoning
- raw response
- per-model details

Rename visible odds-related report labels:
- “赔率解读” becomes “市场背景”
- Do not describe odds as a prediction weight.

**Step 3.4: Frontend tests**

Update `apps/web/test/fixturesPage.test.tsx` to assert:
- The match card shows “综合观点”.
- The card table shows model name, result, score, confidence, and short reason.
- Execution logs are not rendered in the match card.
- Detailed report remains reachable.

Run:

```bash
npm --workspace apps/web test -- fixturesPage
```

## Task 4: Remove Odds Influence from Prediction Defaults and Built-In Prompts

**Files:**
- Modify: `apps/web/src/components/PredictionRequestDrawer.tsx`
- Modify: `apps/api/src/modules/public/public.routes.ts`
- Modify: `apps/api/src/modules/admin/builtInPromptTemplates.ts`
- Modify tests covering prediction defaults and prompt templates

**Step 4.1: Frontend prediction request defaults**

In `apps/web/src/components/PredictionRequestDrawer.tsx`:

1. Change:

```ts
const defaultTaskTypes: PredictionTaskType[] = ["result_1x2", "scoreline"];
```

2. Remove the `odds_interpretation` item from `taskOptions`.

3. Change:

```ts
const defaultDataOptions: PredictionDataOptionsDto = {
  useOdds: false,
  useApiFootballPrediction: false,
  useHeadToHead: true,
  usePlayerLineupInjuries: true,
  useDongqiudiIntel: true
};
```

4. Remove the visible “使用赔率” checkbox from this drawer. Keep `useOdds: false` in submitted data options.

Odds can still be displayed through match data/context views. This drawer must not ask models to use odds.

**Step 4.2: API prediction request defaults**

In `apps/api/src/modules/public/public.routes.ts`, update `defaultPredictionRequestInput`:

```ts
const defaultPredictionRequestInput: PredictionRequestInput = {
  taskTypes: ["result_1x2", "scoreline"],
  dataOptions: {
    useOdds: false,
    useApiFootballPrediction: false,
    useHeadToHead: true,
    usePlayerLineupInjuries: true,
    useDongqiudiIntel: true
  }
};
```

Keep the schema accepting `odds_interpretation` and `useOdds` for historical records and explicit future extension. Defaults must not use them.

**Step 4.3: Rewrite built-in prompt templates**

In `apps/api/src/modules/admin/builtInPromptTemplates.ts`:

1. Replace context rules with wording that excludes odds as a weighting factor:

```ts
const contextRules = `
数据使用规则：
1. 优先分析球队近期状态、阵容可用性、球员影响、战术风格、赛程强度和历史交锋。
2. 若上下文包含市场赔率，只能把它作为赛前市场背景说明，不得作为胜平负或比分预测的权重。
3. 不要因为赔率更低或市场更热而直接提高某一结果概率。
4. 如果你的足球判断与市场背景不一致，可以说明差异原因，但最终结论必须来自足球数据分析。
`;
```

2. Disable the built-in odds-focused template by changing the row with id `builtin-prompt-odds-driven`:

```ts
enabled: false,
name: "市场背景说明",
description: "仅用于解释市场信息，不参与默认预测权重",
scope: "manual"
```

3. Remove or rewrite odds-heavy output fields:
- `odds_analysis` becomes `market_context_note`
- `odds_overheat_signal` becomes `market_attention_note`
- “赔率驱动” wording becomes “市场背景”
- Any wording that says odds should guide probabilities is removed.

4. Update `seedBuiltInPromptTemplates()` so existing built-in templates are updated by exact `id`, not only inserted when missing:

```ts
const updateTemplate = db.prepare(`
  UPDATE prompt_templates
  SET
    name = ?,
    description = ?,
    scope = ?,
    enabled = ?,
    prompt_summary = ?,
    full_prompt = ?,
    updated_at = ?
  WHERE id = ?
`);

for (const template of builtInPromptTemplates) {
  const existing = db.prepare("SELECT id FROM prompt_templates WHERE id = ?").get(template.id);
  if (existing) {
    updateTemplate.run(
      template.name,
      template.description,
      template.scope,
      template.enabled ? 1 : 0,
      template.promptSummary,
      template.fullPrompt,
      now,
      template.id
    );
    continue;
  }

  insertTemplate.run(...);
}
```

Use the existing DB column names from the current file when applying this step.

**Step 4.4: Tests**

Update:
- `apps/web/test/predictionDrawer.test.tsx`: default selected tasks are only “胜平负” and “比分预测”; drawer does not show a selectable odds task; submitted `dataOptions.useOdds` is `false`.
- `apps/api/test/publicPredictionRequest.test.ts`: default request input stores no `odds_interpretation` task and has `dataOptions.useOdds === false`.
- Add or update admin prompt template tests to assert an existing `builtin-prompt-odds-driven` row is updated to disabled and current built-in prompts do not contain wording that makes odds a prediction weight.

Run:

```bash
npm --workspace apps/web test -- predictionDrawer
npm --workspace apps/api test -- publicPredictionRequest admin
```

## Task 5: Visual QA and Final Verification

**Step 5.1: Run targeted tests**

```bash
npm --workspace apps/api test -- publicLeaderboard publicPredictionRequest admin
npm --workspace apps/web test -- client app leaderboardPage fixturesPage predictionDrawer
```

**Step 5.2: Run broader checks**

Use the repository’s existing scripts from `package.json`. Read the file first, then run the exact available scripts. Expected commands if present:

```bash
npm test
npm run lint
npm run typecheck
```

If a script does not exist, do not invent a replacement name. Report the exact missing script.

**Step 5.3: Browser verification**

Start or reuse the local dev servers, then verify in browser:
- Fixtures page cards show the AI consensus table.
- During prediction request, intermediate state is visible without noisy logs on the card.
- “查看报告” opens a detailed model report.
- Leaderboard page shows real scoring and activity sections.
- Mobile viewport keeps prediction table readable.

Use the existing Vite/API ports from current scripts or running processes. Do not guess ports; inspect `package.json`, Vite config, or process output.

**Step 5.4: Git hygiene**

Inspect changed files:

```bash
git status --short
git diff -- apps/web/src/pages/FixturesPage.tsx apps/web/src/pages/LeaderboardPage.tsx apps/web/src/components/PredictionRequestDrawer.tsx apps/web/src/api/client.ts apps/web/src/App.tsx apps/api/src/modules/public/public.routes.ts apps/api/src/modules/admin/builtInPromptTemplates.ts apps/api/src/modules/leaderboard/leaderboard.repository.ts packages/shared/src/types.ts
```

Stage only implementation files and tests changed for this task. Do not stage unrelated dirty files unless the implementation intentionally modified them.

Commit message:

```bash
git commit -m "feat: improve ai prediction summaries and leaderboard"
```

## Completion Criteria

- Fixture cards show a compact AI prediction summary table with model, result, score, confidence, and winning key.
- The card shows a majority-style summary and success/failure count.
- Detailed reports remain available and contain full model analysis.
- Public leaderboard API returns real settled scoring and prediction activity data.
- Web leaderboard page renders both sections with empty states.
- Default prediction requests no longer include odds tasks or odds data weighting.
- Built-in prompts do not instruct models to weight predictions by odds.
- Existing built-in prompt rows are updated by id during seeding.
- Targeted tests pass, and any broader unavailable script is reported with its exact script name.
