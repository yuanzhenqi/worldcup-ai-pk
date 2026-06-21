# Task 5 Report: Concurrent Per-Model Betting Generation

## Scope

Implemented Task 5 only in:

- `apps/api/src/modules/betting-arena/bettingArena.service.ts`
- `apps/api/test/bettingArenaApi.test.ts`
- `apps/web/src/pages/BettingArenaPage.tsx`
- `apps/web/test/bettingArenaPage.test.tsx`

No repository file changes were needed.

## Red Phase

I added the required tests first and ran the focused suites.

### API test failure

Command:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaApi.test.ts
```

Failure observed:

- `does not regenerate an existing slip for the same round and model`
- The endpoint still called `fetch` once, which proved it was regenerating instead of returning the existing round/model state.

### Web test failure

Command:

```bash
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx
```

Failure observed:

- `allows multiple model generation buttons to be busy at the same time`
- The page only showed one `生成中` state, proving the UI still tracked a single busy model.

## Implementation

### Backend

- Added a round/model existence guard in `bettingArena.service.ts` so repeated `POST /api/public/betting-arena/rounds/:roundId/models/:modelId` requests return the existing summary instead of generating again.
- Added `updateRoundStatusFromSlips` and used it after model generation and on duplicate short-circuit paths.
- Kept the existing unique `(round_id, model_id)` database constraint as the final protection.

### Frontend

- Replaced the single `busyModelId` state with a `Set<string>` of busy model IDs.
- Added a busy-model count status line.
- Kept each model button independently disabled while its own request is in flight.

### Tests

- Added API coverage for duplicate model generation short-circuiting.
- Added web coverage for two concurrent model-generation requests.

## Verification

Final checks passed:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaApi.test.ts
corepack pnpm --filter @worldcup-ai-pk/web test -- bettingArenaPage.test.tsx
corepack pnpm typecheck
```

Notes:

- `corepack pnpm typecheck` initially failed on `apps/web/test/bettingArenaPage.test.tsx` because the local slip fixture was missing `portfolioBuckets`.
- I added `portfolioBuckets: []` to that fixture and reran typecheck successfully.
