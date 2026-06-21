# Task 4 Report

## Scope

Implemented Task 4 for betting arena portfolio betting buckets.

## Files Touched

- `apps/api/src/modules/betting-arena/bettingArenaPrompts.ts`
- `apps/api/src/modules/betting-arena/bettingArenaSlip.ts`
- `apps/api/test/bettingArenaPrompts.test.ts`
- `apps/api/test/bettingArenaSlip.test.ts`
- `apps/api/test/bettingArenaRepository.test.ts`

`apps/api/src/modules/betting-arena/bettingArena.repository.ts` did not need a change because `toSlipDto` already mapped `parsed.portfolioBuckets` into `BettingArenaSlipDto.portfolioBuckets`.

## TDD Baseline Failure

I first added the new assertions from the task brief and ran:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaPrompts.test.ts bettingArenaSlip.test.ts bettingArenaRepository.test.ts
```

The expected failures were:

- `bettingArenaPrompts.test.ts` failed because the prompt did not contain the new portfolio bucket language such as `稳胆区`.
- `bettingArenaSlip.test.ts` failed because `parseBettingArenaSlip` did not parse `portfolio_buckets`.

The first failure output also showed the prompt still ended with the old field list, without `portfolio_buckets`.

## Implementation

- Extended the betting prompt with the portfolio bucket contract:
  - `稳胆区 safe`
  - `价值区 value`
  - `让球保护区 hedge`
  - `防冷区 upset`
  - `回避区 avoid`
  - `portfolio_buckets` in the required JSON fields
  - explicit `命中路径` and `失败路径` requirements
- Added `BettingArenaPortfolioBucketDto` support to `parseBettingArenaSlip`.
  - Accepts both `portfolio_buckets` and `portfolioBuckets`.
  - Accepts only valid bucket values.
  - Preserves `label`, `stake`, `rationale`, and string `items`.
  - Returns portfolio buckets for both `hold` and `bet` slips.
- Added regression coverage for:
  - prompt contract strings
  - parsing `portfolio_buckets`
  - repository DTO hydration of `portfolioBuckets`

## Verification

Passed:

```bash
corepack pnpm --filter @worldcup-ai-pk/api test -- bettingArenaPrompts.test.ts bettingArenaSlip.test.ts bettingArenaRepository.test.ts
corepack pnpm --filter @worldcup-ai-pk/api typecheck
```

## Notes

- No changes were required in `bettingArena.repository.ts`.
- Existing unrelated dirty files in the worktree were left untouched.
