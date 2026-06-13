# Fixture Folding and Prompt Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scheduled fixtures view show only the next three natural dates by default, and seed four editable built-in match prediction prompt templates.

**Architecture:** Keep the public matches API unchanged. Do fixture partitioning entirely inside `FixturesPage`, and seed prompt templates locally after SQLite schema setup using stable IDs and non-overwriting inserts.

**Tech Stack:** React 18, Vite, Vitest, Fastify, better-sqlite3, TypeScript.

---

## File Structure

- Modify `apps/web/src/pages/FixturesPage.tsx`: add next-three-date helpers, folded scheduled state, and a disclosure section.
- Modify `apps/web/test/fixturesPage.test.tsx`: add behavior tests for scheduled folding and finished-match non-folding.
- Create `apps/api/src/modules/admin/builtInPromptTemplates.ts`: store stable built-in prompt template definitions and seed helper.
- Modify `apps/api/src/app.ts`: call the prompt template seed helper after `applySchema(db)`.
- Modify `apps/api/test/adminConfig.test.ts`: verify seed behavior through the existing admin API.

## Task 1: Scheduled Fixture Folding

**Files:**
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Test: `apps/web/test/fixturesPage.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

Add tests that render scheduled matches on four consecutive natural dates. Use fake timers so today is deterministic:

```ts
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-06-13T08:00:00.000Z"));
```

Expected assertions:

- matches on `2026-06-13`, `2026-06-14`, and `2026-06-15` are visible.
- a match on `2026-06-16` is hidden at first.
- `其余 1 场未开始比赛` is visible.
- after clicking that button, the `2026-06-16` match is visible.
- finished matches remain visible when switching to `已结束`.

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- --run test/fixturesPage.test.tsx
```

Expected: FAIL because all scheduled matches currently render without a folded section.

- [ ] **Step 3: Implement minimal fixture folding**

In `FixturesPage.tsx`:

- add helper functions to compute local date keys for today, tomorrow, and the day after tomorrow.
- split filtered scheduled matches into `primaryMatches` and `foldedMatches`.
- add `useState(false)` for `scheduledFoldOpen`.
- render the folded section only when active status is `scheduled` and `foldedMatches.length > 0`.
- keep `live` and `finished` rendering unchanged.

- [ ] **Step 4: Run frontend test and verify GREEN**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- --run test/fixturesPage.test.tsx
corepack pnpm --filter @worldcup-ai-pk/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit fixture folding**

Run:

```bash
git add apps/web/src/pages/FixturesPage.tsx apps/web/test/fixturesPage.test.tsx
git commit -m "feat: fold distant scheduled fixtures"
```

## Task 2: Built-In Prompt Template Seeding

**Files:**
- Create: `apps/api/src/modules/admin/builtInPromptTemplates.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/adminConfig.test.ts`

- [ ] **Step 1: Write failing API tests**

Add tests to `adminConfig.test.ts`:

- fresh app database returns built-ins from `GET /api/admin/prompt-templates`.
- repeated `buildApp({ databasePath })` calls do not duplicate built-ins.
- if an existing prompt template has `is_default = 1`, built-ins are inserted without creating another default.

Expected built-in names:

```ts
[
  "稳健胜平负预测",
  "比分预测",
  "爆冷风险评估",
  "数据权重型预测"
]
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/adminConfig.test.ts
```

Expected: FAIL because no prompt templates are seeded yet.

- [ ] **Step 3: Implement prompt seed helper**

Create `builtInPromptTemplates.ts` with:

- an exported `builtInPromptTemplates` array containing stable `id`, `name`, `description`, `fullPrompt`, `promptSummary`, `scope`, `enabled`, and `isDefault`.
- an exported `seedBuiltInPromptTemplates(db: Database, now = new Date())` function.
- logic that checks whether any default prompt template exists before insert.
- logic that inserts only missing IDs and does not update existing rows.

- [ ] **Step 4: Wire seeding into app startup**

In `apps/api/src/app.ts`, import `seedBuiltInPromptTemplates` and call it immediately after `applySchema(db)`.

- [ ] **Step 5: Run API test and verify GREEN**

Run:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- --run test/adminConfig.test.ts
corepack pnpm --filter @worldcup-ai-pk/api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit prompt template seeding**

Run:

```bash
git add apps/api/src/app.ts apps/api/src/modules/admin/builtInPromptTemplates.ts apps/api/test/adminConfig.test.ts
git commit -m "feat: seed built-in prompt templates"
```

## Task 3: Final Verification

**Files:**
- No planned source changes unless verification exposes a bug.

- [ ] **Step 1: Run full verification**

Run:

```bash
corepack pnpm test && corepack pnpm typecheck && corepack pnpm build
```

Expected: all commands pass.

- [ ] **Step 2: Browser verification**

Use the local dev server and verify:

- `未开始` shows the next three natural dates by default.
- the folded section expands and shows later scheduled matches.
- `已结束` still shows scores.
- admin prompt templates list includes the four built-ins.

- [ ] **Step 3: Commit verification-only fixes if needed**

If verification exposes a defect, write a failing test for that defect, fix it, rerun verification, then commit the fix with a scoped message.

## Self-Review

- Spec coverage: Task 1 covers the fixtures console behavior; Task 2 covers built-in template seeding; Task 3 covers final verification.
- Placeholder scan: no placeholders remain.
- Type consistency: file paths and DTO field names match existing code read before writing this plan.

