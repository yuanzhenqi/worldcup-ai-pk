# Prediction Betting UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved A+B prediction result UI, single-match parlay selection entry, structured betting plan display, clearer model failure handling, and prompt cleanup.

**Architecture:** Keep existing DTOs and APIs where possible. Add small focused helpers in `FixturesPage.tsx` for summary derivation, selected parlay state, and failure grouping; reuse `createParlayCombination` from the web client. Enhance the OpenAI-compatible client to classify response-shape failures without changing provider configuration schemas.

**Tech Stack:** React 18, Vite, Vitest, Fastify, better-sqlite3, TypeScript, existing shared DTOs in `packages/shared/src/types.ts`.

---

## File Structure

- Modify: `apps/api/src/modules/ai/openAiCompatibleClient.ts`
  - Add response classification helpers for non-JSON responses, empty assistant content, and event-stream text.
- Modify: `apps/api/src/modules/admin/builtInPromptTemplates.ts`
  - Ensure built-in templates do not introduce score prediction weighting from betting values.
- Modify: `apps/api/test/adminConfig.test.ts`
  - Add model test coverage for event-stream and empty assistant content.
- Modify: `apps/api/test/predictionAgentOutputs.test.ts`
  - Keep parser expectations aligned with clearer empty/malformed content errors if needed.
- Modify: `apps/web/src/pages/FixturesPage.tsx`
  - Add parlay selection state, structured prediction summary components, parlay generation call, and compact mobile-friendly markup.
- Modify: `apps/web/src/styles.css`
  - Add unified button classes and responsive prediction/betting summary styles.
- Modify: `apps/web/test/fixturesPage.test.tsx`
  - Add coverage for structured summary, parlay entry visibility, selection state, and workbench enablement.
- Modify: `apps/web/test/client.test.ts`
  - Existing `createParlayCombination` coverage remains; adjust only if API error handling changes.

---

### Task 1: API Model Response Classification

**Files:**
- Modify: `apps/api/src/modules/ai/openAiCompatibleClient.ts`
- Modify: `apps/api/test/adminConfig.test.ts`

- [ ] **Step 1: Add failing API tests for response-shape failures**

Append two tests inside the top-level `describe` block in `apps/api/test/adminConfig.test.ts`, next to the existing model test cases:

```ts
  it("reports event-stream model test responses as unsupported response format", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const providerResponse = await app.inject({
      method: "POST",
      url: "/api/admin/ai-providers",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "newapi",
        displayName: "NewAPI",
        baseUrl: "https://newapi.example.com/v1",
        apiKey: "secret-provider-key",
        enabled: true
      }
    });
    const provider = providerResponse.json() as { id: string };

    const modelResponse = await app.inject({
      method: "POST",
      url: "/api/admin/ai-models",
      remoteAddress: "127.0.0.1",
      payload: {
        providerId: provider.id,
        modelName: "gpt-5.5",
        displayName: "GPT 5.5",
        enabled: true
      }
    });
    const model = modelResponse.json() as { id: string };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("data: {\"choices\":[]}\n\ndata: [DONE]\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );

    const testResponse = await app.inject({
      method: "POST",
      url: `/api/admin/ai-models/${model.id}/test`,
      remoteAddress: "127.0.0.1"
    });

    expect(testResponse.statusCode).toBe(200);
    expect(testResponse.json()).toMatchObject({
      ok: false,
      status: 200,
      message: "模型测试失败：接口返回 event-stream，当前需要普通 JSON 响应"
    });

    await app.close();
  });

  it("reports empty assistant content during model tests", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const providerResponse = await app.inject({
      method: "POST",
      url: "/api/admin/ai-providers",
      remoteAddress: "127.0.0.1",
      payload: {
        name: "newapi",
        displayName: "NewAPI",
        baseUrl: "https://newapi.example.com/v1",
        apiKey: "secret-provider-key",
        enabled: true
      }
    });
    const provider = providerResponse.json() as { id: string };

    const modelResponse = await app.inject({
      method: "POST",
      url: "/api/admin/ai-models",
      remoteAddress: "127.0.0.1",
      payload: {
        providerId: provider.id,
        modelName: "gemini-3.5-flash",
        displayName: "Gemini 3.5 Flash",
        enabled: true
      }
    });
    const model = modelResponse.json() as { id: string };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "" }, finish_reason: "length" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const testResponse = await app.inject({
      method: "POST",
      url: `/api/admin/ai-models/${model.id}/test`,
      remoteAddress: "127.0.0.1"
    });

    expect(testResponse.statusCode).toBe(200);
    expect(testResponse.json()).toMatchObject({
      ok: false,
      status: 200,
      message: "模型测试失败：模型返回内容为空"
    });

    await app.close();
  });
```

- [ ] **Step 2: Run targeted test and confirm failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminConfig.test.ts
```

Expected: the two new tests fail because current `testOpenAiCompatibleModel` only checks HTTP status, content type, and JSON parse.

- [ ] **Step 3: Implement response classification**

In `apps/api/src/modules/ai/openAiCompatibleClient.ts`, add helpers near `isJsonResponse`:

```ts
function getContentType(response: Response): string {
  return response.headers.get("content-type")?.toLowerCase() ?? "";
}

function isEventStreamResponse(response: Response): boolean {
  return getContentType(response).includes("text/event-stream");
}

function isBlankText(value: string): boolean {
  return value.trim().length === 0;
}
```

Update `isJsonResponse` to use `getContentType`:

```ts
function isJsonResponse(response: Response): boolean {
  return getContentType(response).includes("application/json");
}
```

Add a safe assistant-content checker below `extractAssistantContent`:

```ts
function tryExtractAssistantContent(body: unknown): { ok: true; content: string } | { ok: false; message: string } {
  try {
    const content = extractAssistantContent(body);
    if (isBlankText(content)) {
      return { ok: false, message: "模型测试失败：模型返回内容为空" };
    }
    return { ok: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI response content is invalid";
    return { ok: false, message: `模型测试失败：${message}` };
  }
}
```

Update `testOpenAiCompatibleModel` after the HTTP status check:

```ts
  if (isEventStreamResponse(response)) {
    return {
      ok: false,
      status: response.status,
      message: "模型测试失败：接口返回 event-stream，当前需要普通 JSON 响应",
      latencyMs
    };
  }
```

Then replace the final success block after `JSON.parse(rawResponse)` with:

```ts
  const body = JSON.parse(rawResponse) as unknown;
  const assistantContent = tryExtractAssistantContent(body);
  if (!assistantContent.ok) {
    return {
      ok: false,
      status: response.status,
      message: assistantContent.message,
      latencyMs
    };
  }

  return {
    ok: true,
    status: response.status,
    message: "模型测试成功",
    latencyMs
  };
```

Update `runOpenAiCompatiblePrediction` after the `!response.ok` check:

```ts
  if (isEventStreamResponse(response)) {
    throw new Error("AI prediction response was event-stream; expected JSON");
  }
```

Then after `extractAssistantContent(body)`:

```ts
  const content = extractAssistantContent(body);
  if (isBlankText(content)) {
    throw new Error("AI prediction content was empty");
  }
```

Return `content` instead of calling `extractAssistantContent` inline.

- [ ] **Step 4: Verify API tests pass**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminConfig.test.ts publicPredictionRequest.test.ts
```

Expected: both files pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/api/src/modules/ai/openAiCompatibleClient.ts apps/api/test/adminConfig.test.ts
git commit -m "fix: classify ai response failures"
```

---

### Task 2: Prompt Template Cleanup

**Files:**
- Modify: `apps/api/src/modules/admin/builtInPromptTemplates.ts`
- Modify: `apps/api/test/adminConfig.test.ts`

- [ ] **Step 1: Add failing test for built-in prompt wording**

Append this test in `apps/api/test/adminConfig.test.ts`:

```ts
  it("does not seed built-in prompts that weight betting values for score prediction", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();
    const app = buildApp({ databasePath, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/prompt-templates",
      remoteAddress: "127.0.0.1"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { promptTemplates: Array<{ fullPrompt: string; enabled: boolean }> };
    const enabledPromptText = body.promptTemplates
      .filter((template) => template.enabled)
      .map((template) => template.fullPrompt)
      .join("\n");

    expect(enabledPromptText).not.toContain("赔率变化 10%");
    expect(enabledPromptText).not.toContain("按以下权重评估");

    await app.close();
  });
```

- [ ] **Step 2: Run targeted test and confirm failure if legacy prompt is still enabled**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminConfig.test.ts
```

Expected: fails only if the seeded test database still receives a legacy enabled template with weighted betting wording.

- [ ] **Step 3: Remove or rewrite the legacy weighted template**

In `apps/api/src/modules/admin/builtInPromptTemplates.ts`, remove any built-in template object whose prompt text contains `赔率变化 10%` or `按以下权重评估`, or rewrite it to follow the current `contextRules`.

If the legacy template is not in `builtInPromptTemplates` and only exists in the local SQLite database, add a seed cleanup inside `seedBuiltInPromptTemplates` after the transaction:

```ts
  db.prepare(
    `
      UPDATE prompt_templates
      SET enabled = 0,
          updated_at = ?
      WHERE full_prompt LIKE '%赔率变化 10%'
         OR full_prompt LIKE '%按以下权重评估%'
    `
  ).run(createdAt);
```

- [ ] **Step 4: Verify prompt test passes**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- adminConfig.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/api/src/modules/admin/builtInPromptTemplates.ts apps/api/test/adminConfig.test.ts
git commit -m "fix: disable weighted betting prompt"
```

---

### Task 3: Parlay Workbench UI and API Wiring

**Files:**
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Modify: `apps/web/test/fixturesPage.test.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Extend `FixturesPageProps` with parlay generation**

In `apps/web/src/pages/FixturesPage.tsx`, add imports:

```ts
  BettingRiskLevel,
  ParlayCombinationRunDto,
```

Then extend `FixturesPageProps`:

```ts
  onCreateParlayCombination?: (input: { matchIds: string[]; riskLevel: BettingRiskLevel; stakeUnits: number }) => Promise<ParlayCombinationRunDto>;
```

- [ ] **Step 2: Add failing tests for parlay entry visibility and enablement**

In `apps/web/test/fixturesPage.test.tsx`, update the type import to include `PredictionRunPredictionDto`:

```ts
import type { MatchDto, PredictionRunHistoryDto, PredictionRunPredictionDto, PredictionRunStatusDto, PromptTemplateConfigDto } from "@worldcup-ai-pk/shared";
```

Add helper below `visibleScheduledKickoff`:

```ts
function buildPredictionWithSingleCombination(input: { id: string; modelDisplayName: string; planName: string }): PredictionRunPredictionDto {
  return {
    id: input.id,
    modelDisplayName: input.modelDisplayName,
    predictedResult: "home",
    predictedHomeScore: 2,
    predictedAwayScore: 1,
    confidence: 0.72,
    shortReason: "主队更稳定。",
    keyFactors: ["主场"],
    oddsInterpretation: "体彩选项仅作为投注组合背景。",
    riskPoints: ["客队反击"],
    analysisReport: "详细分析报告正文。",
    singleCombination: {
      summary: "主队小胜路径更清晰。",
      primaryPlan: {
        planName: input.planName,
        riskLevel: "medium",
        legs: [{ poolCode: "HAD", selectionCode: "h", selectionLabel: "主胜", reason: "主队更稳。" }],
        stakeUnits: 2,
        expectedScenario: "2-1",
        avoidReason: null
      },
      backupPlans: [],
      passRecommendation: "可低注参与。",
      riskWarnings: ["临场阵容缺失会提高不确定性"],
      dataGaps: []
    }
  };
}
```

Add test:

```ts
  it("enables parlay generation after selecting two matches with single plans", async () => {
    const matchOne = {
      ...buildMatch({
        id: "scheduled-1",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "美国",
        homeName: "USA",
        awayDisplayNameZh: "巴拉圭",
        awayName: "Paraguay"
      }),
      hasAiPrediction: true
    };
    const matchTwo = {
      ...buildMatch({
        id: "scheduled-2",
        kickoffAt: visibleScheduledKickoff(),
        status: "scheduled",
        homeDisplayNameZh: "德国",
        homeName: "Germany",
        awayDisplayNameZh: "库拉索",
        awayName: "Curaçao"
      }),
      hasAiPrediction: true
    };
    const onLoadPredictionHistory = vi.fn()
      .mockResolvedValueOnce({
        matchId: "scheduled-1",
        runs: [{
          runId: "run-1",
          matchId: "scheduled-1",
          status: "completed",
          message: "已完成 1 个模型预测",
          predictionsCount: 1,
          logs: [],
          predictions: [buildPredictionWithSingleCombination({ id: "prediction-1", modelDisplayName: "Doubao", planName: "主胜小比分" })]
        }]
      })
      .mockResolvedValueOnce({
        matchId: "scheduled-2",
        runs: [{
          runId: "run-2",
          matchId: "scheduled-2",
          status: "completed",
          message: "已完成 1 个模型预测",
          predictionsCount: 1,
          logs: [],
          predictions: [buildPredictionWithSingleCombination({ id: "prediction-2", modelDisplayName: "Qwen", planName: "让球平保护" })]
        }]
      });
    const onCreateParlayCombination = vi.fn().mockResolvedValue({
      id: "parlay-1",
      matchIds: ["scheduled-1", "scheduled-2"],
      riskLevel: "medium",
      stakeUnits: 2,
      summary: "2 场组合：主胜小比分 + 让球平保护",
      plans: [],
      riskWarnings: ["串关会放大单场不确定性，请降低单注预算。"],
      createdAt: "2026-06-15T08:00:00.000Z"
    });

    render(
      <FixturesPage
        matches={[matchOne, matchTwo]}
        onLoadPredictionHistory={onLoadPredictionHistory}
        onCreateParlayCombination={onCreateParlayCombination}
      />
    );

    expect(await screen.findByText("主胜小比分")).toBeInTheDocument();
    expect(await screen.findByText("让球平保护")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "加入串关" })[0]);
    expect(screen.getByText("已选 1 场")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成串关组合" })).toBeDisabled();

    await userEvent.click(screen.getAllByRole("button", { name: "加入串关" })[0]);
    expect(screen.getByText("已选 2 场")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "生成串关组合" }));
    expect(onCreateParlayCombination).toHaveBeenCalledWith({
      matchIds: ["scheduled-1", "scheduled-2"],
      riskLevel: "medium",
      stakeUnits: 2
    });
    expect(await screen.findByText("2 场组合：主胜小比分 + 让球平保护")).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run targeted web test and confirm failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx
```

Expected: fails because `onCreateParlayCombination`, selection state, and active buttons do not exist.

- [ ] **Step 4: Implement parlay selection state**

In `FixturesPage`, add state:

```ts
  const [selectedParlayMatchIds, setSelectedParlayMatchIds] = useState<Set<string>>(() => new Set());
  const [parlayRiskLevel, setParlayRiskLevel] = useState<BettingRiskLevel>("medium");
  const [parlayStakeUnits, setParlayStakeUnits] = useState(2);
  const [parlayGenerating, setParlayGenerating] = useState(false);
  const [parlayResult, setParlayResult] = useState<ParlayCombinationRunDto | null>(null);
  const [parlayError, setParlayError] = useState<string | null>(null);
```

Add helper in `FixturesPage`:

```ts
  const parlayReadyMatchIds = useMemo(
    () =>
      Object.entries(predictionFeedbackByMatchId)
        .filter(([, feedback]) => Boolean(getLatestSingleCombination(feedback)))
        .map(([matchId]) => matchId),
    [predictionFeedbackByMatchId]
  );
  const selectedParlayMatches = useMemo(
    () => parlayReadyMatchIds.filter((matchId) => selectedParlayMatchIds.has(matchId)),
    [parlayReadyMatchIds, selectedParlayMatchIds]
  );
  const canCreateParlay = selectedParlayMatches.length >= 2 && Boolean(onCreateParlayCombination);
```

Add handlers:

```ts
  function toggleParlayMatch(matchId: string) {
    setSelectedParlayMatchIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(matchId)) {
        nextIds.delete(matchId);
      } else {
        nextIds.add(matchId);
      }
      return nextIds;
    });
    setParlayResult(null);
    setParlayError(null);
  }

  async function handleCreateParlayCombination() {
    if (!onCreateParlayCombination || !canCreateParlay) {
      return;
    }
    setParlayGenerating(true);
    setParlayError(null);
    try {
      const result = await onCreateParlayCombination({
        matchIds: selectedParlayMatches,
        riskLevel: parlayRiskLevel,
        stakeUnits: parlayStakeUnits
      });
      setParlayResult(result);
    } catch {
      setParlayError("串关组合生成失败，请检查所选比赛是否都有单场方案。");
    } finally {
      setParlayGenerating(false);
    }
  }
```

- [ ] **Step 5: Pass parlay props through `FixtureDateGroups` and `MatchCard`**

Add `selectedForParlay`, `onToggleParlay`, and `canSelectParlay` props to `MatchCard` and `FixtureDateGroups`. In the `MatchCard` single-plan block, add:

```tsx
                  <button
                    type="button"
                    className={`secondary-action parlay-toggle ${selectedForParlay ? "selected" : ""}`}
                    onClick={() => onToggleParlay(match.id)}
                  >
                    {selectedForParlay ? "已加入" : "加入串关"}
                  </button>
```

Render this only when `latestSingleCombination` exists.

- [ ] **Step 6: Replace disabled workbench with live workbench**

Replace the current `.parlay-workspace` block with:

```tsx
        <section className="parlay-workspace">
          <div>
            <span>串关工作台</span>
            <strong>{selectedParlayMatches.length > 0 ? `已选 ${selectedParlayMatches.length} 场` : "从已生成单场组合的比赛中选择 2 场以上"}</strong>
            <small>{selectedParlayMatches.length < 2 ? `还需 ${2 - selectedParlayMatches.length} 场` : "已满足生成条件"}</small>
          </div>
          <div className="parlay-controls">
            <label>
              <span>风险</span>
              <select value={parlayRiskLevel} onChange={(event) => setParlayRiskLevel(event.target.value as BettingRiskLevel)}>
                <option value="low">低风险</option>
                <option value="medium">中风险</option>
                <option value="high">高风险</option>
              </select>
            </label>
            <label>
              <span>注数</span>
              <input
                min={1}
                type="number"
                value={parlayStakeUnits}
                onChange={(event) => setParlayStakeUnits(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
            <button type="button" disabled={!canCreateParlay || parlayGenerating} onClick={handleCreateParlayCombination}>
              {parlayGenerating ? "生成中" : "生成串关组合"}
            </button>
          </div>
          {parlayResult ? <p className="parlay-result">{parlayResult.summary}</p> : null}
          {parlayError ? <p className="parlay-error">{parlayError}</p> : null}
        </section>
```

- [ ] **Step 7: Wire `App.tsx` to web client**

In `apps/web/src/App.tsx`, import `createParlayCombination` and pass it to `FixturesPage`:

```tsx
        onCreateParlayCombination={createParlayCombination}
```

- [ ] **Step 8: Verify targeted web tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx client.test.ts
```

Expected: pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add apps/web/src/App.tsx apps/web/src/pages/FixturesPage.tsx apps/web/src/styles.css apps/web/test/fixturesPage.test.tsx
git commit -m "feat: enable parlay workbench"
```

---

### Task 4: Structured Prediction and Betting Summary UI

**Files:**
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/fixturesPage.test.tsx`

- [ ] **Step 1: Add failing assertions for structured plan fields**

Update the existing `"requests a prediction from a scheduled match card"` test in `apps/web/test/fixturesPage.test.tsx`:

Replace expectations for the old long summary paragraph:

```ts
    expect(screen.getByText("主队小胜路径更清晰，单场组合以主胜保护为主。")).toBeInTheDocument();
```

With structured expectations:

```ts
    expect(screen.getByText("主方案")).toBeInTheDocument();
    expect(screen.getByText("玩法")).toBeInTheDocument();
    expect(screen.getByText("HAD")).toBeInTheDocument();
    expect(screen.getByText("选择")).toBeInTheDocument();
    expect(screen.getByText("主胜")).toBeInTheDocument();
    expect(screen.getByText("触发条件")).toBeInTheDocument();
    expect(screen.getByText("美国 2-1。")).toBeInTheDocument();
```

Update the table column assertion:

```ts
    expect(screen.getByRole("columnheader", { name: "主方案" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "状态" })).toBeInTheDocument();
```

- [ ] **Step 2: Run targeted test and confirm failure**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx
```

Expected: fails because the current UI renders the summary as a paragraph and table does not include plan/status columns.

- [ ] **Step 3: Add summary helpers**

In `FixturesPage.tsx`, add helper functions near `getLatestSingleCombination`:

```ts
function getPrimaryLegText(prediction: PredictionRunPredictionDto): string {
  const leg = prediction.singleCombination?.primaryPlan.legs[0];
  if (!leg) {
    return "未生成";
  }
  return `${leg.poolCode} · ${leg.selectionLabel}`;
}

function getPredictionStatusText(prediction: PredictionRunPredictionDto): string {
  return prediction.singleCombination ? "已生成组合" : "仅赛果";
}
```

- [ ] **Step 4: Replace long betting summary with structured fields**

Inside `.match-betting-summary`, replace `<p>{latestSingleCombination.summary}</p>` with:

```tsx
                  <dl className="betting-plan-grid">
                    <div>
                      <dt>玩法</dt>
                      <dd>{latestSingleCombination.primaryPlan.legs[0]?.poolCode ?? "未生成"}</dd>
                    </div>
                    <div>
                      <dt>选择</dt>
                      <dd>{latestSingleCombination.primaryPlan.legs[0]?.selectionLabel ?? "未生成"}</dd>
                    </div>
                    <div>
                      <dt>触发条件</dt>
                      <dd>{latestSingleCombination.primaryPlan.expectedScenario}</dd>
                    </div>
                    <div>
                      <dt>规避项</dt>
                      <dd>{latestSingleCombination.primaryPlan.avoidReason ?? "暂无"}</dd>
                    </div>
                  </dl>
```

Keep `summary` for report/history details, not for the card body.

- [ ] **Step 5: Update model table columns**

Change the prediction summary table header to:

```tsx
                      <th>AI 模型</th>
                      <th>胜平负</th>
                      <th>比分</th>
                      <th>信心</th>
                      <th>主方案</th>
                      <th>状态</th>
```

Change row cells:

```tsx
                        <td>{prediction.modelDisplayName}</td>
                        <td>{getPredictionResultText(prediction)}</td>
                        <td>{formatPredictionScore(prediction)}</td>
                        <td>{`${Math.round(prediction.confidence * 100)}%`}</td>
                        <td>{getPrimaryLegText(prediction)}</td>
                        <td>{getPredictionStatusText(prediction)}</td>
```

- [ ] **Step 6: Add responsive CSS**

Add to `apps/web/src/styles.css` near prediction summary styles:

```css
.betting-plan-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 10px 0 0;
}

.betting-plan-grid div {
  background: #f7faf9;
  border: 1px solid #d8e3df;
  border-radius: 8px;
  padding: 8px;
}

.betting-plan-grid dt {
  color: #64737a;
  font-size: 11px;
  font-weight: 700;
  margin: 0 0 4px;
}

.betting-plan-grid dd {
  color: #172026;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.35;
  margin: 0;
  overflow-wrap: anywhere;
}
```

Add to the existing `@media (max-width: 720px)` block:

```css
  .betting-plan-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .prediction-summary-table table {
    min-width: 560px;
  }
```

- [ ] **Step 7: Verify web tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add apps/web/src/pages/FixturesPage.tsx apps/web/src/styles.css apps/web/test/fixturesPage.test.tsx
git commit -m "feat: structure prediction betting summary"
```

---

### Task 5: Unified Button Styles and Mobile Density

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Modify: `apps/web/test/fixturesPage.test.tsx`

- [ ] **Step 1: Add stable classes to action buttons**

In `FixturesPage.tsx`, update buttons:

```tsx
          <button className="app-button app-button-primary" disabled={!match.canRequestPrediction || isRequesting} type="button" onClick={() => onOpenPrediction(match)}>
```

For data/history:

```tsx
        <button type="button" className="app-button app-button-secondary" onClick={() => onOpenContext(match)}>
```

For report:

```tsx
              <button type="button" className="app-button app-button-secondary" onClick={() => onOpenReport(feedback)}>
```

For parlay toggle:

```tsx
                    className={`app-button app-button-secondary parlay-toggle ${selectedForParlay ? "selected" : ""}`}
```

- [ ] **Step 2: Add unified button CSS**

In `apps/web/src/styles.css`, add after global element styles:

```css
.app-button {
  align-items: center;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  justify-content: center;
  line-height: 1;
  min-height: 38px;
  padding: 8px 12px;
  transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease, opacity 140ms ease;
}

.app-button-primary {
  background: #123d35;
  color: #ffffff;
}

.app-button-secondary {
  background: #edf4f1;
  color: #123d35;
}

.app-button-selected,
.parlay-toggle.selected {
  background: #123d35;
  color: #ffffff;
}

.app-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
```

Then remove duplicate button styling in `.match-action button`, `.parlay-workspace button`, and similar local selectors where they conflict with `.app-button`.

- [ ] **Step 3: Tighten mobile typography**

Inside `@media (max-width: 720px)`, add:

```css
  .page-section {
    padding: 0 14px;
  }

  .fixtures-heading h2 {
    font-size: 22px;
  }

  .match-card {
    gap: 10px;
    padding: 12px;
  }

  .match-time-block time {
    font-size: 18px;
  }

  .team-line strong {
    font-size: 15px;
  }

  .team-line small,
  .match-status-block span {
    font-size: 12px;
  }

  .prediction-feedback-block {
    font-size: 13px;
  }

  .prediction-consensus-summary span {
    font-size: 11px;
    padding: 4px 7px;
  }
```

- [ ] **Step 4: Verify mobile layout manually with browser**

Run dev server if needed:

```bash
corepack pnpm dev
```

Open the app on the active local port. In the browser, inspect widths:

- Desktop: 1280px
- Mobile: 390px

Expected:

- Buttons share visual language.
- Mobile cards show more content per screen than before.
- No horizontal page scroll.
- Prediction table may scroll within `.table-scroll`, but the page itself must not overflow horizontally.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/web/src/styles.css apps/web/src/pages/FixturesPage.tsx apps/web/test/fixturesPage.test.tsx
git commit -m "style: unify prediction action buttons"
```

---

### Task 6: Full Verification and Cleanup

**Files:**
- No planned source edits unless verification exposes a defect.

- [ ] **Step 1: Run typecheck**

Run:

```bash
corepack pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 2: Run all tests**

Run:

```bash
corepack pnpm test
```

Expected: exit 0.

- [ ] **Step 3: Check git status**

Run:

```bash
git status --short
```

Expected: only intentional tracked changes are present, or clean if all task commits were made.

- [ ] **Step 4: Final browser smoke test**

With the app running:

- Request or load a match with predictions.
- Confirm structured prediction summary.
- Select two single-plan matches.
- Generate a parlay run.
- Open prediction history and confirm model detail reports still work.

- [ ] **Step 5: Commit any verification fixes**

If Step 4 reveals a code fix, make the smallest correction, rerun affected tests, then commit:

```bash
git add <changed-files>
git commit -m "fix: polish prediction betting ui"
```

---

## Self-Review

- Spec coverage: covers model response failures, prompt cleanup, parlay entry placement, structured betting display, unified button style, and mobile density.
- Placeholder scan: no placeholder work items remain.
- Type consistency: uses existing shared types `BettingRiskLevel`, `ParlayCombinationRunDto`, `PredictionRunPredictionDto`, `SingleCombinationAgentOutputDto`, and existing client function `createParlayCombination`.
