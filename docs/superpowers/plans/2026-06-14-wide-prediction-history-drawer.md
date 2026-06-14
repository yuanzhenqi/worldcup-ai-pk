# Wide Prediction History Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop prediction history drawer wide enough for model summary tables while preserving the default drawer size for other panels.

**Architecture:** Add an optional `size` prop to `BottomDrawer`. Use `size="wide"` only for the historical prediction records drawer, then style `.bottom-drawer-wide` at desktop breakpoints.

**Tech Stack:** React, TypeScript, CSS, Vitest, Testing Library.

---

### Task 1: Failing Tests

**Files:**
- Create: `apps/web/test/bottomDrawer.test.tsx`
- Modify: `apps/web/test/fixturesPage.test.tsx`

- [ ] Add a component test proving `BottomDrawer size="wide"` renders `bottom-drawer-wide`.
- [ ] Add a fixture page test assertion proving the history drawer uses `bottom-drawer-wide`.
- [ ] Run `corepack pnpm --filter @worldcup-ai-pk/web test -- bottomDrawer.test.tsx fixturesPage.test.tsx` and verify it fails because `size` is not implemented.

### Task 2: Implementation

**Files:**
- Modify: `apps/web/src/components/BottomDrawer.tsx`
- Modify: `apps/web/src/pages/FixturesPage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Add `size?: "default" | "wide"` to `BottomDrawerProps`.
- [ ] Append `bottom-drawer-wide` to the drawer section when `size === "wide"`.
- [ ] Pass `size="wide"` to the prediction history drawer.
- [ ] At `@media (min-width: 780px)`, set `.bottom-drawer-wide` to a wider desktop width.
- [ ] Give `.history-prediction-table table` wider column-aware layout so model names and result columns stop wrapping aggressively.

### Task 3: Verification

**Files:**
- No source files

- [ ] Run focused tests.
- [ ] Run `corepack pnpm test`, `corepack pnpm typecheck`, and `corepack pnpm lint`.
- [ ] Verify the rendered history drawer in the browser on desktop and mobile viewports.
