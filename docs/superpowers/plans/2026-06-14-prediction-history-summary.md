# Prediction History Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change match prediction history from log-first display to summary-first display with single-model detailed reports.

**Architecture:** Keep existing API DTOs unchanged. Update `FixturesPage.tsx` state and rendering to reuse the existing prediction consensus helper, then adjust CSS for the history summary table and single report drawer.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Vite.

---

### Task 1: History Summary Test

**Files:**
- Modify: `apps/web/test/fixturesPage.test.tsx`

- [ ] **Step 1: Update the historical prediction test**

Change the test named `opens historical prediction runs from a match card` so it includes two predictions, expects consensus summary text, expects model summary rows, expects the historical log message to be absent, clicks the `查看` button for one model, and expects only that model's detailed report.

- [ ] **Step 2: Run the test and verify it fails**

Run: `corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx`

Expected: FAIL because the current history drawer still renders logs and opens all model reports through `查看报告`.

### Task 2: History UI Implementation

**Files:**
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Change report state to a single model prediction**

Update `activePredictionReport` from `PredictionRunPredictionDto[] | null` to `PredictionRunPredictionDto | null`.

- [ ] **Step 2: Render history run summary cards**

For each historical run, compute `buildPredictionConsensus(run.predictions, errorLogCount)` and render aggregate chips plus the model summary table.

- [ ] **Step 3: Open one model report from history**

Each model row gets a `查看` button that calls `setActivePredictionReport(prediction)`.

- [ ] **Step 4: Keep match-card report behavior usable**

For current match feedback, the existing `查看报告` action should open the first prediction report when predictions exist.

- [ ] **Step 5: Adjust CSS**

Add concise styling for history cards, summary metadata, and table row actions while preserving mobile horizontal scrolling.

### Task 3: Verification

**Files:**
- No source files

- [ ] **Step 1: Run focused web tests**

Run: `corepack pnpm --filter @worldcup-ai-pk/web test -- fixturesPage.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run: `corepack pnpm test`

Expected: PASS.

Run: `corepack pnpm typecheck`

Expected: PASS.

Run: `corepack pnpm lint`

Expected: PASS.
