# Task 3 Report

## Objective
Inject external intelligence snapshots into the betting arena battle context and collect external intel before round generation.

## Files Changed
- `apps/api/src/modules/betting-arena/bettingArena.context.ts`
- `apps/api/src/modules/betting-arena/bettingArena.service.ts`
- `apps/api/test/bettingArenaRepository.test.ts`
- `apps/api/test/bettingArenaApi.test.ts`

## TDD Red State
The repository test was added first and failed before implementation, as expected:

```text
FAIL  test/bettingArenaRepository.test.ts > betting arena repository and context > injects external intelligence snapshots into battle context
AssertionError: expected { matchId: 'match-1', …(14) } to match object { externalIntel: { …(3) } }

- Expected
+ Received

  Object {
   "externalIntel": Object {
     "sourceLinks": Array [
       Object {
         "url": "https://example.com/news",
       },
     ],
     "status": "cached",
     "summary": "德国赛前发布会确认主力前锋可出场。",
   },
```

## Implementation
- Added match-level external intel lookup in betting arena context using the latest `fixture_external_intel_snapshots` row.
- Parsed snapshot summaries into `ExternalIntelSummaryDto`, including structured `dataGaps`.
- Extended battle context matches with `externalIntel`.
- Merged external intel data gaps into each match's `dataGaps`.
- Collected external intel during `refreshBettingArenaMatchContext` with `DuckDuckGoHtmlWebSearchProvider` and `collectExternalIntelForMatch`.

## Verification
- `corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts bettingArenaApi.test.ts externalIntelCollector.test.ts`
- `corepack pnpm --filter @worldcup-ai-pk/api typecheck`

## Result
Both the targeted tests and typecheck passed after implementation.

## Review Follow-up
Reviewer raised a concern that string-form `externalIntel.dataGaps` might be dropped during battle context rehydration. Verified against the implementation: `readStructuredDataGaps` already preserves strings and structured `{ source, code, message }` gaps. Added a regression assertion to `bettingArenaRepository.test.ts` covering both shapes.

Verification:
- `corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaRepository.test.ts`
  - Passed.
