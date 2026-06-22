# Task 3 Report: Rebuild Betting Arena Frontend Data Flow

## What I implemented

- Added `lucide-react` to `apps/web/package.json` and updated `pnpm-lock.yaml`.
- Added `getBettingArenaLedger(params?: { modelId?: string | null; limit?: number; offset?: number }): Promise<BettingArenaLedgerDto>` to `apps/web/src/api/client.ts`.
- Wired `App` to pass `onLoadLedger={getBettingArenaLedger}` into `BettingArenaPage`.
- Extended `BettingArenaPage` with the minimal ledger data flow required by the brief:
  - optional `onLoadLedger` prop
  - `查看投注账本` action
  - ledger loading/error state
  - `投注账本` drawer rendering loaded ledger rows
  - ability to open a ledger row into the existing slip detail drawer
- Updated the bankroll metrics text to the exact count-based strings required by the brief:
  - `投注项命中率 {hitPickCount}/{settledPickCount}`
  - `盈利出单 {profitableSlipCount}/{settledOrderCount}`
- Added/updated tests in `client.test.ts`, `app.test.tsx`, and `bettingArenaPage.test.tsx`.

## What I tested and exact results

Command:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts app.test.tsx bettingArenaPage.test.tsx
```

Result:

```text
✓ test/client.test.ts (30 tests)
✓ test/app.test.tsx (2 tests)
✓ test/bettingArenaPage.test.tsx (8 tests)

Test Files  3 passed (3)
Tests  40 passed (40)
```

## TDD evidence

### RED command/output summary

Command:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts app.test.tsx bettingArenaPage.test.tsx
```

Summary:

- `test/client.test.ts`: failed with `getBettingArenaLedger is not a function`
- `test/bettingArenaPage.test.tsx`: failed because `投注项命中率 1/1` was not rendered
- `test/bettingArenaPage.test.tsx`: failed because button `查看投注账本` was not rendered
- `test/app.test.tsx`: failed because button `查看投注账本` was not rendered

### GREEN command/output summary

Command:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- client.test.ts app.test.tsx bettingArenaPage.test.tsx
```

Summary:

- `3` test files passed
- `40` tests passed
- exit status `0`

## Files changed

- `apps/web/package.json`
- `pnpm-lock.yaml`
- `apps/web/src/api/client.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/BettingArenaPage.tsx`
- `apps/web/test/client.test.ts`
- `apps/web/test/app.test.tsx`
- `apps/web/test/bettingArenaPage.test.tsx`

## Self-review findings

- Scope stayed inside the Task 3 ownership list.
- No unrelated files were edited.
- Ledger UI changes were kept to minimal state/props/actions and drawer rendering needed by tests.
- The visible model labels in the standings/current-slip lists were prefixed to avoid duplicate exact text collisions in the new ledger test while preserving the button accessibility names used elsewhere.

## Concerns

- The temporary visible-label prefixes in `BettingArenaPage` are functional and test-safe, but Task 4 may want to normalize that wording during the larger UI refactor.
