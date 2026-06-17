# AI Live Betting Arena Design

## Context

The project already has match schedules, model predictions, two-agent single-match betting simulations, parlay generation, prediction history, and prediction scoring. The next product step is a separate AI live betting arena where each enabled AI model manages its own virtual bankroll and competes by simulated betting return.

This module is independent from the existing prediction leaderboard. Existing prediction scoring measures whether models predicted match outcomes correctly. The live betting arena measures bankroll performance under shared data, shared rules, and model-specific strategy.

## Goals

- Give every enabled AI model a virtual bankroll starting at `10000`.
- Let each model decide whether to bet, how much to bet, and which single or parlay positions to take.
- Limit each model to a maximum daily stake of `50%` of its current available bankroll.
- Feed every model the same complete battle data package for the same daily round.
- Feed each model its own account history and bankroll state before each round.
- Lock every model's bet slip and input data snapshot at submission time.
- Settle bet slips against real match results and locked odds.
- Rank models by return rate, with balance, hit rate, order rate, and failure rate visible.
- Keep first-level UI concise and move long strategy reports into detail views.

## Non-Goals

- No real-money betting or order placement.
- No user-facing claims of guaranteed profit.
- No hidden model-specific data advantage.
- No odds-driven match prediction weighting. Odds can be used by the betting strategy agent for risk and return composition, not as the primary match result predictor.
- No complex bankroll algorithms imposed by the system in the first version. Models choose their own strategy within hard limits.
- No automatic use of unavailable or unverified player, lineup, injury, value, or odds data.

## Core Rules

### Bankroll

- Each model starts with `10000`.
- Account state includes:
  - available bankroll
  - frozen stake
  - settled bankroll
  - total asset value
  - cumulative return rate
  - cumulative staked amount
  - cumulative returned amount
  - order count
  - settled order count
  - hit count
  - failed generation count
- A bet slip freezes stake immediately after it is accepted.
- Frozen stake is released only during settlement.

### Daily Stake Limit

For each model and each daily round:

- `maxDailyStake = availableBankroll * 0.5`
- The model may stake any amount from `0` to `maxDailyStake`.
- A stake of `0` is allowed and means the model chooses to hold cash.
- Any submitted stake above the limit is rejected for that model's round and recorded as invalid output.

### Bet Slip Lock

A bet slip is immutable after acceptance.

The system stores:

- model id
- round id
- model output
- parsed bet slip
- locked battle context snapshot
- locked account context snapshot
- locked odds for every selected leg
- generation status
- validation errors if invalid

## Round Lifecycle

### Round Creation

A daily round groups all eligible matches by local match date.

Eligible matches:

- match status is scheduled
- kickoff has not started
- Sporttery data is available or explicitly marked unavailable
- the match appears in the day's battle context

Round status:

- `draft`: round exists but generation has not started.
- `generating`: model bet slips are being generated.
- `locked`: accepted slips are locked.
- `settling`: results are being settled.
- `settled`: all settled outcomes are recorded.
- `failed`: round cannot proceed because shared context generation failed.

### Triggering

First version supports:

- manual trigger from the arena page
- automatic trigger two hours before the earliest eligible match if no manual round has been locked

The automatic trigger may be implemented as an API-side function that can be called by the existing app refresh loop or a later scheduler. The first version does not need a separate daemon.

### Model Generation

For each enabled model:

1. Build the shared `battle_context`.
2. Build that model's `account_context`.
3. Call the model with a live betting prompt.
4. Parse and validate the returned JSON.
5. Accept, reject, or mark hold-cash.
6. Store generation logs.

Generation failures do not stop other models. A failed model records:

- generation status
- failure type
- failure message
- failed generation count increment

## Unified Input Data

### Shared Battle Context

Every model receives the same `battle_context` for the same round.

It includes:

- round date and lock time
- list of eligible matches
- match id
- kickoff time
- stage
- venue
- home and away teams
- match status
- Sporttery available pools and selections
- locked odds and option labels
- historical head-to-head summary
- recent form summary
- group or table context
- injuries and suspensions
- lineup and formation data when available
- player information when available
- squad value or team value information when available
- external intelligence summary collected by the system
- data gaps

If data is missing, the context must say it is missing. The prompt must forbid models from inventing missing facts.

### External Intelligence

Models may benefit from internet-derived information, but not by independently searching.

The system creates a single external intelligence package before model generation. That package is injected into every model's `battle_context`.

The first version may store this field as:

- manual summary
- scraped summary
- future search-agent summary
- empty summary with a clear data gap

All models receive the same external intelligence field.

### Account Context

Each model receives its own `account_context`:

- current available bankroll
- frozen stake
- current total asset value
- cumulative return rate
- rank
- gap to first place
- gap to average
- lifetime order count
- lifetime settled order count
- lifetime hit rate
- last five bet slips
- last five settlement results
- last post-round review
- active unsettled exposure

This lets models evolve their own strategies over time while preserving shared match data fairness.

## Model Output Contract

The model returns one JSON object.

Required top-level fields:

- `action`: `"bet"` or `"hold"`
- `total_stake`
- `singles`
- `parlays`
- `strategy_summary`
- `risk_level`
- `bankroll_plan`
- `skip_reasons`
- `data_gaps`

Single bet fields:

- `match_id`
- `pool_code`
- `selection_code`
- `selection_label`
- `locked_odds`
- `stake`
- `confidence`
- `rationale`

Parlay fields:

- `parlay_name`
- `stake`
- `legs`
- `combined_odds`
- `confidence`
- `rationale`

Parlay leg fields:

- `match_id`
- `pool_code`
- `selection_code`
- `selection_label`
- `locked_odds`

Validation:

- `total_stake` must equal singles stake plus parlay stake.
- `total_stake` must not exceed `availableBankroll * 0.5`.
- `stake` values must be positive numbers.
- every selected `match_id` must exist in the battle context.
- every selected `pool_code` and `selection_code` must exist in the locked Sporttery options.
- `locked_odds` must match the locked context value.
- `action="hold"` must have `total_stake=0`, empty singles, and empty parlays.

## Settlement

Settlement runs after matches finish and scores are synced.

Single bet settlement:

- if selected outcome wins, return `stake * locked_odds`
- if selected outcome loses, return `0`
- if match is canceled or result is unavailable, mark as void and return stake

Parlay settlement:

- all legs must win
- return `stake * combined_odds` when all legs win
- return `0` if any leg loses
- void behavior uses the first-version rule: if any leg is void, mark the parlay as void and return stake

Account update:

- release frozen stake
- add settlement return to available bankroll
- update cumulative staked amount
- update cumulative returned amount
- update return rate
- update order and hit counters

## API Surface

First version public API:

- `GET /api/public/betting-arena`
  - returns current accounts, current round, latest slips, leaderboard rows, and recent daily summaries
- `POST /api/public/betting-arena/rounds`
  - manually creates or triggers today's round
- `GET /api/public/betting-arena/rounds/:roundId`
  - returns round details, model slips, logs, and locked context summaries
- `POST /api/public/betting-arena/rounds/:roundId/settle`
  - settles a round when results are available

Admin API can be added later for advanced resets. First version may use development-only database reset scripts if needed.

## UI Design

Add top navigation item:

- `实盘投注场`

Page sections:

### Today Overview

Show:

- round date
- status
- eligible match count
- models participating
- total staked today
- potential return
- settled return
- next automatic trigger time

### AI Bankroll Leaderboard

Table or compact cards:

- rank
- model
- available bankroll
- total asset value
- return rate
- today's stake
- hit rate
- order rate
- failure rate

Default sort: return rate descending.

### Today Bet Matrix

One row per model:

- model name
- action: bet or hold
- total stake
- singles count
- parlays count
- risk level
- potential return
- status
- detail button

First-level text must stay concise. Strategy paragraphs go to detail.

### Bet Slip Detail

Show:

- model strategy summary
- account context summary
- singles table
- parlays table
- data gaps
- validation result
- settlement result
- model post-round review when available

### Daily History

Show:

- date
- total staked
- total returned
- best model
- worst model
- round status
- detail entry

## Prompt Design

Prompt stance:

- The model acts as a virtual betting desk manager.
- It may choose to hold cash.
- It must stay within the 50% daily stake limit.
- It must only use provided data.
- It must not invent unavailable facts.
- It must explain risk in structured fields.
- It must output JSON only.

Prompt sections:

- role and objective
- hard rules
- account context
- battle context
- allowed bet option schema
- output JSON schema
- validation warnings

## Testing

Backend tests:

- creates accounts for enabled models with initial bankroll `10000`
- creates a daily round with eligible matches
- builds identical battle context for every model in the same round
- builds distinct account context per model
- accepts a valid hold-cash output
- accepts a valid single bet within 50% daily limit
- rejects stake above 50% daily limit
- rejects unknown match id
- rejects unknown pool or selection
- freezes accepted stake
- settles winning single bet
- settles losing single bet
- settles winning parlay
- settles losing parlay
- updates leaderboard by return rate
- generation failure increments failure count without stopping other models

Frontend tests or manual verification:

- arena navigation exists
- overview loads
- leaderboard renders
- today's bet matrix renders
- detail drawer shows structured singles and parlays
- mobile layout avoids horizontal scroll

## Rollout Plan

Recommended implementation order:

1. database schema and shared DTOs
2. account and round repositories
3. bet slip parser and validator
4. settlement engine
5. prompt builder and generation service
6. public API routes
7. frontend arena page
8. manual trigger and settle controls
9. final verification

## Risks

- Sporttery option structures vary by pool. Validators must use the locked context instead of unverified option names.
- Some matches may lack odds or result data. These cases must produce data gaps or void settlement, not fabricated decisions.
- Model output may exceed bankroll constraints. Rejection must be explicit and recorded.
- External intelligence gathering can introduce fairness issues if not shared. The system must create one shared summary per round.
- Full automation requires a scheduler later. First version can expose manual trigger and a callable automatic-trigger function.
