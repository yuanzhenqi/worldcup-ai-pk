# Betting Arena History Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI 实盘投注场 show reliable historical settlement detail, correct hit metrics, and allow a new same-day betting round after all orders are settled.

**Architecture:** Store same-day rounds as ordered sessions with `round_sequence`. Expose settlement JSON and derived item-level metrics through the existing betting arena DTO. Keep UI first-level views compact and move detailed reasoning, prompt snapshots, and settlement legs into the drawer.

**Tech Stack:** SQLite via `better-sqlite3`, Fastify API, shared TypeScript DTOs, React + CSS, Vitest.

## Global Constraints

- API-Football remains schedule-only in betting context.
- Sporttery remains the source for betting玩法 and odds.
- The UI must distinguish `投注命中率` from `盈利出单率`.
- Same-day settled rounds must not be mutated when a new betting session is generated.
- Existing user data must migrate without losing historical rounds, slips, or settlements.

---

### Task 1: Backend Round Sessions And Settlement DTOs

**Files:**
- Modify: `apps/api/src/db/schema.sql`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/api/src/modules/betting-arena/bettingArena.repository.ts`
- Modify: `apps/api/src/modules/betting-arena/bettingArena.service.ts`
- Test: `apps/api/test/bettingArenaRepository.test.ts`
- Test: `apps/api/test/bettingArenaApi.test.ts`

**Interfaces:**
- Produces: `BettingArenaRoundDto.roundSequence: number`
- Produces: `BettingArenaSlipDto.settlement: BettingArenaSettlementDto | null`
- Produces: `BettingArenaAccountDto.pickHitRate: number`
- Produces: real `BettingArenaDto.history` rows from recent rounds

- [ ] **Step 1: Write failing tests**

Add tests proving same-day settled rounds create the next sequence, settlement details hydrate into slips, and account metrics expose both item hit rate and profitable-slip rate.

- [ ] **Step 2: Run test to verify failure**

Run: `corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts bettingArenaApi.test.ts`

- [ ] **Step 3: Implement storage and DTO changes**

Add `round_sequence`, migrate existing DBs by rebuilding `betting_arena_rounds` when needed, join settlements into slip rows, and derive settlement item stats from stored settlement JSON.

- [ ] **Step 4: Run test to verify pass**

Run: `corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts bettingArenaApi.test.ts bettingArenaSettlement.test.ts`

### Task 2: Betting Arena UI Restructure

**Files:**
- Modify: `apps/web/src/pages/BettingArenaPage.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/bettingArenaPage.test.tsx`

**Interfaces:**
- Consumes: `roundSequence`, settlement DTOs, account hit metrics, and history rows from Task 1.
- Produces: compact first-level AI 实盘投注场, history settlement section, and detailed drawer tables.

- [ ] **Step 1: Write failing UI tests**

Add tests for `投注命中率`, `盈利出单率`, historical settlement rows, and settlement status badges in the detail drawer.

- [ ] **Step 2: Run test to verify failure**

Run: `corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx`

- [ ] **Step 3: Implement UI**

Replace the old two-panel layout with score cards, compact account standings, current order cards, and historical settlement rows. Keep detail text in the drawer.

- [ ] **Step 4: Run test to verify pass**

Run: `corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx`

### Task 3: Verification

**Files:**
- Read: `package.json`
- Read: `apps/api/package.json`
- Read: `apps/web/package.json`

- [ ] **Step 1: Typecheck**

Run: `corepack pnpm typecheck`

- [ ] **Step 2: Targeted tests**

Run backend and web targeted tests listed above.

- [ ] **Step 3: Rendered UI check**

Use the available browser workflow against `http://localhost:5173/` and verify AI 实盘投注场 desktop and mobile layouts.
