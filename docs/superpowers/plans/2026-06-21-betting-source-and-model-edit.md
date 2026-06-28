# Betting Source And Model Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复模型编辑流程、优化串关中文展示、清理投注场数据来源边界，并重写投注提示词的数据模块关联。

**Architecture:** 后台模型编辑只改 Web 客户端和后台页状态；API 已有 `PUT /api/admin/ai-models/:id`。投注场数据边界在上下文刷新服务中收口，展示和提示词分别在 Web 页面与 prompt builder 中表达同一套来源规则。

**Tech Stack:** React 18, Vite, TypeScript, Fastify, better-sqlite3, Vitest.

## Global Constraints

- API-Football 在 AI 实盘投注场中仅用于赛程。
- 赔率和投注玩法全部来自体彩。
- 提示词不得把赔率作为赛果预测权重。
- 不新增外部数据源依赖；未配置的统一外部联网情报必须明确展示为未配置。
- 不回滚当前工作区已有改动。

---

### Task 1: Model Edit Flow

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/pages/AdminPage.tsx`
- Test: `apps/web/test/client.test.ts`
- Test: `apps/web/test/adminPage.test.tsx`

**Interfaces:**
- Produces: `updateAdminAiModel(id: string, input: SaveAiModelRequest): Promise<AiModelConfigDto>`
- Consumes: existing `PUT /api/admin/ai-models/:id`

- [ ] **Step 1: Write failing client test**

Add a test in `apps/web/test/client.test.ts` that calls `updateAdminAiModel("model-1", input)` and expects:

```ts
expect(fetchMock).toHaveBeenCalledWith("/api/admin/ai-models/model-1", {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(input)
});
```

- [ ] **Step 2: Add client method**

Implement:

```ts
export async function updateAdminAiModel(id: string, input: SaveAiModelRequest): Promise<AiModelConfigDto> {
  const response = await request(`${apiBaseUrl}/api/admin/ai-models/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Admin AI model update failed with status ${response.status}`);
  }
  return (await response.json()) as AiModelConfigDto;
}
```

- [ ] **Step 3: Write failing AdminPage test**

Add a test in `apps/web/test/adminPage.test.tsx`:

```ts
fireEvent.click(await screen.findByRole("button", { name: "编辑 Claude Sonnet 4.6" }));
expect(screen.getByLabelText("模型标识")).toHaveValue("claude-sonnet-4-6");
fireEvent.change(screen.getByLabelText("输出 token 上限"), { target: { value: "20000" } });
fireEvent.click(screen.getByRole("button", { name: "更新模型" }));
expect(updateAdminAiModelMock).toHaveBeenCalledWith("model-1", expect.objectContaining({ maxOutputTokens: 20000 }));
```

- [ ] **Step 4: Implement AdminPage editing**

Add:

```ts
const [editingModelId, setEditingModelId] = useState<string | null>(null);
```

Add `handleEditModel(model)` that copies exact DTO fields into `modelForm`. Change submit logic to call `updateAdminAiModel(editingModelId, modelForm)` when editing. Add “编辑” and “取消编辑” buttons.

- [ ] **Step 5: Verify**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts adminPage.test.tsx
```

Expected: all tests pass.

### Task 2: Betting Source Boundary

**Files:**
- Modify: `apps/api/src/modules/betting-arena/bettingArena.service.ts`
- Modify: `apps/api/src/modules/betting-arena/bettingArena.context.ts`
- Modify: `apps/web/src/pages/BettingArenaPage.tsx`
- Test: `apps/api/test/bettingArenaApi.test.ts`
- Test: `apps/web/test/bettingArenaPage.test.tsx`

**Interfaces:**
- Produces: battle context with API-Football source shown as schedule-only.
- Consumes: existing `refreshFixtureContext` data options.

- [ ] **Step 1: Write API failing test**

Update `apps/api/test/bettingArenaApi.test.ts` so the mocked `FootballService` non-schedule methods are not called during betting round generation. Assert the generated prompt does not contain API-Football odds, official prediction, squad, or API-Football head-to-head summaries.

- [ ] **Step 2: Disable API-Football non-schedule options**

In `refreshBettingArenaMatchContext`, set:

```ts
dataOptions: {
  useOdds: false,
  useApiFootballPrediction: false,
  useHeadToHead: false,
  usePlayerLineupInjuries: false,
  useDongqiudiIntel: Boolean(dongqiudiClient),
  useSporttery: Boolean(sportteryClient),
  useTeamProfile: true
}
```

- [ ] **Step 3: Filter betting context domains**

In `readContextDomains`, keep only:

```ts
["dongqiudi_intel", "sporttery", "team_profile"]
```

and add a schedule-only source in the Web source breakdown rather than deriving it from fixture context domains.

- [ ] **Step 4: Update Web source breakdown test**

In `apps/web/test/bettingArenaPage.test.tsx`, expect “API-Football：仅赛程” and “体彩：投注玩法与赔率”.

- [ ] **Step 5: Verify**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaApi.test.ts
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx
```

Expected: all tests pass.

### Task 3: Prompt Module Rewrite

**Files:**
- Modify: `apps/api/src/modules/betting-arena/bettingArenaPrompts.ts`
- Test: `apps/api/test/bettingArenaPrompts.test.ts`

**Interfaces:**
- Produces: prompt text with explicit module names and weighting rule.
- Consumes: unchanged `buildBettingArenaPrompt(input)`.

- [ ] **Step 1: Write failing prompt test**

Expect prompt to contain:

```ts
expect(prompt).toContain("schedule：只包含 API-Football 赛程字段");
expect(prompt).toContain("sporttery_betting_options：体彩可购买玩法、选项和锁定赔率");
expect(prompt).toContain("赔率不得作为赛果判断权重");
```

- [ ] **Step 2: Rewrite prompt instructions**

Update `buildBettingArenaPrompt` to include the module list, the two-stage reasoning instruction, and the JSON output contract.

- [ ] **Step 3: Verify**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaPrompts.test.ts
```

Expected: all tests pass.

### Task 4: Parlay Display

**Files:**
- Modify: `apps/web/src/pages/BettingArenaPage.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/bettingArenaPage.test.tsx`

**Interfaces:**
- Produces: `poolDisplayName(poolCode: string): string`
- Produces: `formatParlayType(legsCount: number): string`

- [ ] **Step 1: Write failing display test**

Add fixture with a two-leg parlay containing `HAD` and `HHAD`. Expect the detail view to show:

```ts
expect(screen.getByText("2 串 1")).toBeInTheDocument();
expect(screen.getByText(/胜平负/)).toBeInTheDocument();
expect(screen.getByText(/让球胜平负/)).toBeInTheDocument();
expect(screen.queryByText(/HAD ·/)).not.toBeInTheDocument();
```

- [ ] **Step 2: Add formatting helpers**

Implement:

```ts
function poolDisplayName(poolCode: string): string {
  const labels: Record<string, string> = {
    HAD: "胜平负",
    HHAD: "让球胜平负",
    CRS: "比分",
    TTG: "总进球",
    HAFU: "半全场"
  };
  return labels[poolCode] ?? poolCode;
}

function formatParlayType(legsCount: number): string {
  return `${legsCount} 串 1`;
}
```

- [ ] **Step 3: Render structured parlay cards**

Replace raw parlay text with fields:

- 组合类型
- 投入
- 组合赔率
- 潜在返还
- 信心
- 腿项列表

- [ ] **Step 4: Verify**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx
```

Expected: all tests pass.

### Task 5: Full Verification

**Files:**
- No new source edits.

- [ ] **Step 1: Typecheck**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api typecheck
corepack pnpm --filter @worldcup-ai-pk/web typecheck
corepack pnpm --filter @worldcup-ai-pk/shared typecheck
```

Expected: all commands exit 0.

- [ ] **Step 2: Full tests**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test
corepack pnpm --filter @worldcup-ai-pk/web test
```

Expected: all tests pass.

- [ ] **Step 3: Build**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api build
corepack pnpm --filter @worldcup-ai-pk/web build
```

Expected: both builds exit 0.

