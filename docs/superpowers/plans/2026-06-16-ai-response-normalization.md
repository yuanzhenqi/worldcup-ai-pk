# AI Response Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make model return handling explicit and robust across JSON, SSE, empty-stream, truncated, reasoning-only, rate-limit, upstream-unavailable, and minor schema-drift cases.

**Architecture:** Add focused normalization helpers inside the existing OpenAI-compatible client, then route both model tests and prediction calls through them. Keep prediction schema strict for scoring-critical fields while accepting `data_gaps` as a string or string array. Preserve existing API shapes and secret-safe admin responses.

**Tech Stack:** TypeScript, Fastify, Vitest, built-in `fetch`, SQLite-backed model configuration.

---

## File Structure

- Modify `apps/api/src/modules/ai/openAiCompatibleClient.ts`
  - Owns request URL fallback, HTTP response categorization, SSE parsing, assistant content extraction, model test, and prediction call behavior.
- Create `apps/api/test/openAiCompatibleClient.test.ts`
  - Unit-level tests for response normalization without the full Fastify app.
- Modify `apps/api/src/modules/predictions/predictionAgentOutputs.ts`
  - Keeps prediction output validation and adds controlled `data_gaps` string coercion.
- Modify `apps/api/test/predictionAgentOutputs.test.ts`
  - Adds parser regression tests for string `data_gaps`.
- Modify `apps/api/test/publicPredictionRequest.test.ts`
  - Updates integration expectations for empty SSE, rate-limit, upstream-unavailable, and reasoning-only messages.
- Modify `apps/api/test/adminConfig.test.ts`
  - Updates admin model test expectations and adds JSON-shape test behavior.
- Modify `apps/api/data/app.sqlite`
  - Add or update the local `claude-sonnet-4-6` model row through a script or API call after code tests pass.

---

### Task 1: OpenAI-Compatible Response Normalization

**Files:**
- Create: `apps/api/test/openAiCompatibleClient.test.ts`
- Modify: `apps/api/src/modules/ai/openAiCompatibleClient.ts`

- [ ] **Step 1: Write failing unit tests for normalized prediction responses**

Create `apps/api/test/openAiCompatibleClient.test.ts` with these tests:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { runOpenAiCompatiblePrediction, testOpenAiCompatibleModel } from "../src/modules/ai/openAiCompatibleClient";

const config = {
  baseUrl: "https://newapi.example.com/v1",
  apiKey: "secret-provider-key",
  modelName: "model-x"
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openAiCompatibleClient", () => {
  it("uses text from event-stream chunks during prediction calls", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        [
          'data: {"choices":[{"delta":{"content":"{\\"predicted_result\\":\\"home\\""}}]}',
          "",
          'data: {"choices":[{"delta":{"content":",\\"confidence\\":0.61}"}}]}',
          "",
          "data: [DONE]",
          ""
        ].join("\n"),
        { status: 200, headers: { "content-type": "text/event-stream" } }
      )
    );

    await expect(runOpenAiCompatiblePrediction(config, "prompt")).resolves.toMatchObject({
      status: 200,
      content: '{"predicted_result":"home","confidence":0.61}'
    });
  });

  it("rejects event-stream responses with no text chunks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response('data: {"choices":[]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );

    await expect(runOpenAiCompatiblePrediction(config, "prompt")).rejects.toThrow("AI prediction response was empty event-stream");
  });

  it("reports rate-limit responses clearly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "rate_limited", message: "too fast" } }), {
        status: 429,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(runOpenAiCompatiblePrediction(config, "prompt")).rejects.toThrow("AI prediction rate limited with HTTP 429");
  });

  it("reports upstream unavailable responses clearly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "service_unavailable", message: "upstream unavailable" } }), {
        status: 503,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(runOpenAiCompatiblePrediction(config, "prompt")).rejects.toThrow("AI prediction upstream unavailable with HTTP 503");
  });

  it("reports truncated JSON responses before empty content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: "{" }, finish_reason: "length" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(runOpenAiCompatiblePrediction(config, "prompt")).rejects.toThrow("AI prediction response was truncated");
  });

  it("rejects reasoning-only JSON responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: "", reasoning_content: "thinking" }, finish_reason: "stop" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(runOpenAiCompatiblePrediction(config, "prompt")).rejects.toThrow("AI prediction returned reasoning content without final answer");
  });

  it("tests both basic text and compact JSON shape for admin model tests", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '{"predicted_result":"home","predicted_home_score":2,"predicted_away_score":1,"confidence":0.61,"data_gaps":[]}'
                },
                finish_reason: "stop"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    await expect(testOpenAiCompatibleModel(config, () => 100)).resolves.toMatchObject({
      ok: true,
      status: 200,
      message: "模型测试成功"
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the new unit test to verify RED**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api test -- openAiCompatibleClient.test.ts
```

Expected: tests fail because event-stream is not parsed, `429` and `503` messages are generic, reasoning-only is reported as empty content, and the admin test only calls fetch once.

- [ ] **Step 3: Implement minimal response normalization helpers**

Modify `apps/api/src/modules/ai/openAiCompatibleClient.ts`:

```ts
type CompletionChoice = {
  finish_reason?: unknown;
  message?: unknown;
  delta?: unknown;
};

function extractErrorMessage(rawResponse: string): string | null {
  try {
    const body = JSON.parse(rawResponse) as unknown;
    if (!body || typeof body !== "object" || !("error" in body)) return null;
    const error = (body as { error: unknown }).error;
    if (!error || typeof error !== "object" || !("message" in error)) return null;
    const message = (error as { message: unknown }).message;
    return typeof message === "string" && message.trim().length > 0 ? message : null;
  } catch {
    return null;
  }
}

function classifyHttpFailure(response: Response, rawResponse: string, prefix: string): string {
  const detail = extractErrorMessage(rawResponse);
  const suffix = detail ? `：${detail}` : "";
  if (response.status === 429) return `${prefix} rate limited with HTTP 429${suffix}`;
  if (response.status === 503) return `${prefix} upstream unavailable with HTTP 503${suffix}`;
  return `${prefix} failed with HTTP ${response.status}${suffix}`;
}

function getObjectField(record: unknown, fieldName: string): unknown {
  if (!record || typeof record !== "object") return undefined;
  return (record as Record<string, unknown>)[fieldName];
}

function readTextField(record: unknown, fieldName: string): string | null {
  const value = getObjectField(record, fieldName);
  return typeof value === "string" ? value : null;
}

function extractAssistantContent(body: unknown, prefix: string): string {
  if (!body || typeof body !== "object" || !("choices" in body)) {
    throw new Error(`${prefix} missing choices`);
  }

  const choices = (body as { choices: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error(`${prefix} choices is empty`);
  }

  const firstChoice = choices[0] as CompletionChoice;
  if (firstChoice.finish_reason === "length") {
    throw new Error(`${prefix} response was truncated`);
  }

  const message = firstChoice && typeof firstChoice === "object" ? firstChoice.message : null;
  if (!message || typeof message !== "object") {
    throw new Error(`${prefix} choice missing message`);
  }

  const content = readTextField(message, "content");
  if (content === null) {
    throw new Error(`${prefix} response content is not text`);
  }
  if (!isBlankText(content)) {
    return content;
  }

  const reasoningContent = readTextField(message, "reasoning_content");
  if (reasoningContent && !isBlankText(reasoningContent)) {
    throw new Error(`${prefix} returned reasoning content without final answer`);
  }
  throw new Error(`${prefix} content was empty`);
}

function parseEventStreamContent(rawResponse: string, prefix: string): string {
  const lines = rawResponse
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"));

  let content = "";
  for (const line of lines) {
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") continue;
    let chunk: unknown;
    try {
      chunk = JSON.parse(payload);
    } catch {
      continue;
    }
    const choices = getObjectField(chunk, "choices");
    if (!Array.isArray(choices) || choices.length === 0) continue;
    const firstChoice = choices[0] as CompletionChoice;
    const delta = firstChoice.delta ?? firstChoice.message;
    const text = readTextField(delta, "content");
    if (text) content += text;
  }

  if (isBlankText(content)) {
    throw new Error(`${prefix} response was empty event-stream`);
  }
  return content;
}

function normalizeCompletionResponse(response: Response, rawResponse: string, prefix: string): string {
  if (!response.ok) {
    throw new Error(classifyHttpFailure(response, rawResponse, prefix));
  }
  if (isEventStreamResponse(response)) {
    return parseEventStreamContent(rawResponse, prefix);
  }
  if (!isJsonResponse(response)) {
    throw new Error(`${prefix} response was not JSON`);
  }
  const body = JSON.parse(rawResponse) as unknown;
  return extractAssistantContent(body, prefix);
}
```

Then update `runOpenAiCompatiblePrediction` to call:

```ts
const content = normalizeCompletionResponse(response, rawResponse, "AI prediction");
```

Add `stream: false` to both request bodies:

```ts
stream: false
```

Update `testOpenAiCompatibleModel` to run a basic text request followed by a compact JSON request. Use `normalizeCompletionResponse(response, rawResponse, "AI model test")` for both responses. Return `模型测试失败：${message}` where `message` is the error message with the `AI model test ` prefix removed.

- [ ] **Step 4: Run the new unit test to verify GREEN**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api test -- openAiCompatibleClient.test.ts
```

Expected: all tests in `openAiCompatibleClient.test.ts` pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/api/src/modules/ai/openAiCompatibleClient.ts apps/api/test/openAiCompatibleClient.test.ts
git commit -m "fix: normalize ai provider responses"
```

---

### Task 2: Prediction Output Parser Schema Drift

**Files:**
- Modify: `apps/api/src/modules/predictions/predictionAgentOutputs.ts`
- Modify: `apps/api/test/predictionAgentOutputs.test.ts`

- [ ] **Step 1: Write failing parser tests for string `data_gaps`**

Add to `apps/api/test/predictionAgentOutputs.test.ts`:

```ts
it("coerces string data_gaps in match analysis output", () => {
  expect(
    parseMatchAnalysisOutput(
      JSON.stringify({
        predicted_result: "home",
        predicted_home_score: 2,
        predicted_away_score: 1,
        confidence: 0.66,
        short_reason: "主队更稳。",
        key_factors: ["状态"],
        risk_points: ["反击"],
        analysis_report: "主队更稳。",
        data_gaps: "未获取首发名单"
      })
    )
  ).toMatchObject({ dataGaps: ["未获取首发名单"] });
});

it("coerces string data_gaps in single combination output", () => {
  expect(
    parseSingleCombinationOutput(
      JSON.stringify({
        summary: "主队方向更清晰。",
        primary_plan: {
          plan_name: "稳健单场",
          risk_level: "medium",
          legs: [
            {
              pool_code: "HAD",
              selection_code: "h",
              selection_label: "主胜",
              reason: "赛果判断支持主队。"
            }
          ],
          stake_units: 2,
          expected_scenario: "主队小胜。",
          avoid_reason: null
        },
        backup_plans: [],
        pass_recommendation: "低注参与。",
        risk_warnings: ["阵容未确认"],
        data_gaps: "缺少临场首发"
      })
    )
  ).toMatchObject({ dataGaps: ["缺少临场首发"] });
});
```

- [ ] **Step 2: Run parser tests to verify RED**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api test -- predictionAgentOutputs.test.ts
```

Expected: the two new tests fail with `AI response field data_gaps must be a string array`.

- [ ] **Step 3: Implement focused string coercion**

In `apps/api/src/modules/predictions/predictionAgentOutputs.ts`, replace `requireStringArray` with:

```ts
function requireStringArray(value: unknown, fieldName: string): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`AI response field ${fieldName} must be a string array`);
  }
  return value;
}
```

- [ ] **Step 4: Run parser tests to verify GREEN**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api test -- predictionAgentOutputs.test.ts
```

Expected: all parser tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/api/src/modules/predictions/predictionAgentOutputs.ts apps/api/test/predictionAgentOutputs.test.ts
git commit -m "fix: tolerate ai data gap strings"
```

---

### Task 3: Update Integration Tests and Admin Model Test Behavior

**Files:**
- Modify: `apps/api/test/publicPredictionRequest.test.ts`
- Modify: `apps/api/test/adminConfig.test.ts`
- Modify only if Task 1 unit implementation needs route-level adjustment: `apps/api/src/modules/admin/admin.routes.ts`

- [ ] **Step 1: Update prediction request expectations for explicit failure categories**

In `apps/api/test/publicPredictionRequest.test.ts`, update the event-stream test name and expected message:

```ts
it("fails a public prediction run when the model returns empty event-stream", async () => {
```

Expected log message:

```ts
message: "模型预测失败：GPT-4o mini：AI prediction response was empty event-stream"
```

Update the empty content test expected message:

```ts
message: "模型预测失败：GPT-4o mini：AI prediction content was empty"
```

Add one test for reasoning-only JSON response:

```ts
it("fails a public prediction run when the model returns reasoning without final answer", async () => {
  const { db, databasePath } = createTestDatabase();
  insertMatch(db, {
    id: "match-1",
    kickoffAt: "2099-06-12T19:00:00.000Z",
    status: "scheduled"
  });
  insertAiConfig(db);
  db.close();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "", reasoning_content: "thinking" }, finish_reason: "stop" }]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );

  const app = buildApp({ databasePath, logger: false });
  const response = await app.inject({ method: "POST", url: "/api/public/matches/match-1/prediction-request" });
  const body = response.json();

  expect(response.statusCode).toBe(200);
  const failedRun = await waitForRunStatus(app, body.runId, "failed");
  expect(failedRun.logs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        level: "error",
        message: "模型预测失败：GPT-4o mini：AI prediction returned reasoning content without final answer"
      })
    ])
  );

  await app.close();
});
```

- [ ] **Step 2: Update admin model test expectations**

In `apps/api/test/adminConfig.test.ts`, update the event-stream test expectation:

```ts
message: "模型测试失败：response was empty event-stream"
```

Update the empty/truncated test expectation:

```ts
message: "模型测试失败：response was truncated"
```

Add a test for the second JSON-shape request failing:

```ts
it("reports JSON-shape model test failures without returning provider secrets", async () => {
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

  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: "{" }, finish_reason: "length" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
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
    message: "模型测试失败：response was truncated"
  });
  expect(JSON.stringify(testResponse.json())).not.toContain("secret-provider-key");

  await app.close();
});
```

- [ ] **Step 3: Run focused integration tests to verify RED or GREEN after Task 1**

Run:

```bash
pnpm --filter @worldcup-ai-pk/api test -- publicPredictionRequest.test.ts adminConfig.test.ts
```

Expected after Task 1: updated tests pass. If they fail because route code wraps messages differently, adjust only the wrapper string in `testOpenAiCompatibleModel`, not the test intent.

- [ ] **Step 4: Commit Task 3**

```bash
git add apps/api/test/publicPredictionRequest.test.ts apps/api/test/adminConfig.test.ts apps/api/src/modules/admin/admin.routes.ts
git commit -m "test: cover ai response diagnostics"
```

If `apps/api/src/modules/admin/admin.routes.ts` is unchanged, omit it from `git add`.

---

### Task 4: Add Local Claude Model Configuration

**Files:**
- Modify: `apps/api/data/app.sqlite`

- [ ] **Step 1: Inspect exact provider and current model rows**

Run:

```bash
sqlite3 -header -column apps/api/data/app.sqlite "SELECT id, name, display_name, enabled FROM ai_providers ORDER BY updated_at DESC; SELECT id, provider_id, model_name, display_name, enabled FROM ai_models ORDER BY display_name;"
```

Expected: identify the provider row that owns the NewAPI key. Do not print or query `api_key`.

- [ ] **Step 2: Insert or update `claude-sonnet-4-6`**

Use the exact provider ID from Step 1. If a row with `model_name='claude-sonnet-4-6'` exists, update it. If not, insert it.

Example command, replacing `PROVIDER_ID_FROM_STEP_1` with the exact value from Step 1:

```bash
sqlite3 apps/api/data/app.sqlite "INSERT INTO ai_models (id, provider_id, model_name, display_name, enabled, created_at, updated_at) SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), 'PROVIDER_ID_FROM_STEP_1', 'claude-sonnet-4-6', 'Claude Sonnet 4.6', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE NOT EXISTS (SELECT 1 FROM ai_models WHERE model_name = 'claude-sonnet-4-6');"
```

Then run:

```bash
sqlite3 apps/api/data/app.sqlite "UPDATE ai_models SET display_name = 'Claude Sonnet 4.6', enabled = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE model_name = 'claude-sonnet-4-6';"
```

- [ ] **Step 3: Verify model row exists**

Run:

```bash
sqlite3 -header -column apps/api/data/app.sqlite "SELECT model_name, display_name, enabled FROM ai_models WHERE model_name = 'claude-sonnet-4-6';"
```

Expected:

```text
model_name           display_name       enabled
-------------------  -----------------  -------
claude-sonnet-4-6    Claude Sonnet 4.6  1
```

- [ ] **Step 4: Commit Task 4**

```bash
git add apps/api/data/app.sqlite
git commit -m "chore: add claude sonnet model"
```

---

### Task 5: Final Verification

**Files:**
- No planned source changes unless verification exposes a bug from Tasks 1-4.

- [ ] **Step 1: Run focused API tests**

```bash
pnpm --filter @worldcup-ai-pk/api test -- openAiCompatibleClient.test.ts predictionAgentOutputs.test.ts publicPredictionRequest.test.ts adminConfig.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run API typecheck**

```bash
pnpm --filter @worldcup-ai-pk/api typecheck
```

Expected: TypeScript exits with code 0.

- [ ] **Step 3: Run full API test suite**

```bash
pnpm --filter @worldcup-ai-pk/api test
```

Expected: all API tests pass.

- [ ] **Step 4: Check worktree status**

```bash
git status --short
```

Expected: clean worktree after all commits.

---

## Spec Coverage Self-Review

- Response normalization is covered by Task 1.
- Prediction parser schema drift is covered by Task 2.
- Admin model test behavior is covered by Task 3.
- `claude-sonnet-4-6` local model configuration is covered by Task 4.
- Verification commands are covered by Task 5.
- No UI, schedule, betting arena, or prompt redesign work is included.
