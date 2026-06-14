# Leaderboard Settlement Design

## Scope

This design covers only the real scoring leaderboard. It does not change prompt templates, Dongqiudi data ingestion, prediction context options, or live match countdown display.

## Current State

The public leaderboard API is implemented in `apps/api/src/modules/leaderboard/leaderboard.repository.ts`.

`settledRows` reads from `prediction_scores`. The score calculation function already exists in `apps/api/src/modules/predictions/scoring.ts` as `scorePrediction(finalScore, predictedScore)`.

The missing system behavior is settlement: after a match is finished and has a final score, parsed AI predictions are not automatically converted into rows in `prediction_scores`. Because of that, `settledRows` stays empty even when predictions exist.

## Goal

When matches are synced or the public leaderboard is requested, finished matches with final scores should produce one idempotent score row per parsed AI prediction. The real scoring leaderboard should then show model totals, hit rates, exact score hits, and recent scores.

## Settlement Rules

A prediction is eligible for settlement when all of these are true:

- The related match has `status = 'finished'`.
- The related match has non-null `home_score` and `away_score`.
- The prediction has `parse_status = 'parsed'`.
- The prediction has `eligible_for_scoring = 1`.
- No row already exists in `prediction_scores` for that `ai_prediction_id`.

For each eligible prediction:

- Use `matches.home_score` and `matches.away_score` as the final score.
- Use `ai_predictions.predicted_home_score` and `ai_predictions.predicted_away_score` as the predicted score.
- Calculate points with `scorePrediction`.
- Insert into `prediction_scores` with a generated id and `scored_at`.

Settlement must be idempotent. Running it repeatedly must not duplicate score rows.

## Trigger

Add a settlement service in the predictions module and call it from the public leaderboard path before `listPublicLeaderboard` reads rows.

This makes the leaderboard self-healing: if finished matches and predictions already exist, opening the leaderboard fills missing scores. It avoids relying on a separate scheduler for this phase.

Future work can also call the same service after fixture sync, but this phase only requires the public leaderboard to become accurate when viewed.

## API And UI

No DTO changes are required.

`LeaderboardDto.settledRows` remains the public contract. The existing `LeaderboardPage` can keep rendering the current columns:

- Ranking
- Model
- Total score
- Settled predictions
- 1x2 hits
- 1x2 hit rate
- Exact score hits
- Recent 5 scores

## Error Handling

Settlement should run inside a transaction. If a row fails validation unexpectedly, the service should throw so tests catch the data integrity problem. Public route behavior can keep the existing 500 behavior for unexpected server errors.

## Tests

Add API tests that prove:

- A finished match with one parsed eligible prediction creates one `prediction_scores` row and appears in `settledRows`.
- Repeated leaderboard calls do not duplicate the score row.
- Scheduled or live matches are not settled.
- Predictions with `eligible_for_scoring = 0` are not settled.

Existing `scorePrediction` unit tests remain the point scoring source of truth.
