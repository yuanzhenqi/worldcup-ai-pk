# Worldcup AI PK Design

## 1. Product Scope

This project is a public 2026 FIFA World Cup website focused on fixtures, match details, odds summaries, AI match predictions, and model ranking.

The first version is a public display product:

- Public visitors can browse fixtures, match details, odds, AI predictions, and model rankings.
- Public visitors can request prediction for a match.
- The system compares configured AI models for each requested match.
- The system does not include public user registration or public user accounts.
- The local admin interface manages data sync, AI configuration, prompts, prediction tasks, records, manual fixes, and logs.

The first version uses API-Football as the match data and odds source. API-Football's own prediction endpoint is shown as a reference baseline and does not participate in AI model ranking.

## 2. Technology Stack

- Frontend: React + Vite
- Backend: Fastify + TypeScript
- Database: SQLite
- Deployment: frontend and backend on the same server

Project structure:

```txt
worldcup-ai-pk/
  apps/
    web/
    api/
  packages/
    shared/
  data/
    app.sqlite
  docs/
    superpowers/
      specs/
        2026-06-12-worldcup-ai-pk-design.md
```

## 3. Architecture

The backend exposes two API surfaces:

- Public API: read-only data for fixtures, match details, odds summaries, AI prediction display, and model rankings.
- Local admin API: model configuration, prompt configuration, API key configuration, data sync, prediction tasks, prediction records, manual fixes, and system logs.

The local admin API only accepts local access from `127.0.0.1` and `::1`.

Core data flow:

1. Admin configures the API-Football key and AI provider keys in the local admin page.
2. Admin triggers or scheduled jobs run API-Football sync for fixtures, scores, standings, odds, and API-Football prediction baseline.
3. A public visitor opens a match page and requests prediction.
4. Backend validates the match state and decides whether to schedule or run prediction.
5. Backend calls each enabled AI model with match data, odds data, API-Football baseline prediction, and the configured prompt.
6. Backend stores structured prediction results, detailed analysis, prompt summary, and backend-only raw responses.
7. After final score is available, backend scores each model using the last pre-match prediction for that match.
8. Frontend shows fixtures, match details, odds summaries, single-match AI PK, and model leaderboard.

## 4. Public Frontend Pages

### 4.1 Fixtures Page

The fixtures page shows all World Cup matches and supports filtering by date, stage, teams, and match status.

Each match item shows:

- Kickoff time
- Home team
- Away team
- Score or current status
- Whether AI prediction exists
- Whether prediction can be requested

For matches that have not started, visitors can request prediction. For matches that have started or finished, visitors cannot create a new prediction request.

### 4.2 Match Detail Page

The match detail page is the main public experience.

It shows:

- Match metadata
- Score and match status
- 1X2 odds summary
- Handicap odds summary
- Over/under odds summary
- API-Football prediction baseline
- AI model predictions
- Single-match AI PK result
- Historical prediction runs panel

Each AI prediction shows:

- Predicted result
- Predicted score
- Confidence
- Short reason
- Key factors
- Odds interpretation
- Risk points
- Score after the match is finished

### 4.3 Model Leaderboard Page

The leaderboard ranks AI models by accumulated score across finished matches.

Each model row shows:

- Total score
- Finished matches counted
- Match result hits
- Result accuracy
- Exact score hits
- Recent performance

Only the final pre-match prediction for each model and match counts toward ranking.

## 5. Local Admin Pages

The admin UI is served by the React app but uses local admin APIs that only allow local access.

Admin modules:

- Model configuration: provider, model name, display name, API key, enabled state.
- Prompt configuration: full prompt, prompt summary, scope, enabled state.
- Match data sync: manual sync for fixtures, scores, odds, and API-Football baseline prediction; latest sync result.
- Prediction tasks: visitor requests, scheduled execution time, status, failure reason, manual rerun.
- Prediction records: structured result, raw response, latency, cost fields.
- Manual fixes: corrections for match data, odds summary, parsed prediction result, and score.
- System logs: API-Football sync, AI calls, prediction jobs, scoring jobs, and errors.

## 6. Data Model

SQLite stores the following tables:

- `matches`: API-Football match ID, stage, kickoff time, teams, score, status, venue, last sync time.
- `odds_snapshots`: match ID, odds type, bookmaker, 1X2 values, handicap values, over/under values, captured time.
- `api_predictions`: API-Football baseline predictions for display only.
- `ai_providers`: provider name, API key, enabled state.
- `ai_models`: provider ID, model name, display name, enabled state.
- `prompt_templates`: full prompt, prompt summary, scope, enabled state.
- `prediction_requests`: public visitor request for a match, request time, status, next executable time.
- `prediction_runs`: one prediction round for one match, scheduled time, start time, finish time, status.
- `ai_predictions`: structured AI output, detailed analysis, backend-only raw response reference, scoring eligibility flag.
- `prediction_scores`: model score generated after final score is known.
- `manual_overrides`: admin correction records with previous value and new value.
- `system_logs`: sync, prediction, scoring, and error logs.

The exact schema, column names, indexes, and migration files will be defined during implementation and tested against code.

## 7. Prediction Task Rules

When a visitor requests prediction:

1. Backend checks whether the match has started.
2. If the match has started or finished, backend rejects the request.
3. If the match has not started and kickoff is more than 2 hours away, backend records a prediction request and schedules execution at 2 hours before kickoff.
4. If the match has not started and kickoff is less than 2 hours away, backend creates and runs a prediction task immediately.
5. The same match can be rerun with frequency limiting. The first version uses one successful run per match per 30 minutes.
6. Each run calls all enabled models with the active prompt configuration.
7. Historical predictions are retained.
8. Scoring uses only the final pre-match prediction for each model and match.

## 8. AI Provider Adapter

The backend uses provider adapters for AI calls.

The internal request format includes:

- Match information
- Teams
- Kickoff time
- Stage
- Current match state
- 1X2 odds summary
- Handicap odds summary
- Over/under odds summary
- API-Football baseline prediction
- Full prompt text

The internal response format includes:

- Predicted result
- Predicted score
- Confidence
- Short reason
- Key factors
- Odds interpretation
- Risk points
- Backend-only raw text or raw JSON

The first version uses a fixed output structure. The admin can edit prompts, but the system still requires the model response to match the fixed structure.

If parsing fails, backend stores the raw response, marks the record as parse failure, and keeps it out of public PK display until corrected.

## 9. Scoring Rules

The first version uses a transparent score-based rule:

- Correct match result: `3` points
- Exact score: additional `5` points
- Correct home-team goal count: additional `1` point
- Correct away-team goal count: additional `1` point
- Maximum score per model per match: `10` points

Examples:

- Final score `2-1`, predicted score `2-0`: correct result plus correct home goals, total `4` points.
- Final score `1-1`, predicted score `1-1`: correct result, exact score, and both team goal counts, total `10` points.

Only the final pre-match prediction for each model and match is scored.

## 10. API-Football Integration

API-Football is the data source for:

- Fixtures
- Scores
- Match status
- Standings
- 1X2 odds
- Handicap odds
- Over/under odds
- API-Football baseline prediction

The backend calls API-Football only from the server. The browser never receives the API-Football key.

The implementation must use real API responses or recorded JSON fixtures before finalizing API-Football field mappings.

## 11. Error Handling

API-Football failures:

- Store the error in `system_logs`.
- Reuse the latest successful database snapshot for public display.
- Show the latest sync status in the admin page.

API-Football rate limit:

- Store the limit response in `system_logs`.
- Back off before retrying.
- Avoid request patterns where each public page view calls API-Football.

AI call failure:

- Mark only that model's prediction as failed.
- Continue the run for other models.
- Store provider error detail in backend-only logs.

AI parse failure:

- Store raw response.
- Mark the prediction as parse failure.
- Keep it out of public PK display until corrected.

Manual correction:

- Store previous and new values in `manual_overrides`.
- Recalculate affected scores when a correction changes final match score or structured prediction.

Scoring failure:

- Store the failure in `system_logs`.
- Allow admin-triggered score recalculation.

## 12. Security Boundaries

- API-Football key and AI provider keys can be saved through the local admin page into SQLite.
- Public APIs never return API keys.
- Public APIs never return full prompts.
- Public APIs never return raw model responses.
- Public pages show prompt summaries only.
- Public visitors can request prediction but cannot pass custom prompts, model names, provider parameters, or API keys.
- Local admin API only allows local access.
- Public prediction requests are rate-limited to control AI cost.
- SQLite is stored in a persistent server directory and must be backed up.

## 13. Testing Scope

Backend tests:

- API-Football adapters using real response samples or recorded JSON.
- Prediction request rules for more than 2 hours before kickoff, less than 2 hours before kickoff, already started match, finished match, and rerun frequency limit.
- AI response parsing for valid JSON, missing fields, non-JSON text, and provider failure.
- Scoring for correct result, exact score, single team goal hit, no hit, and maximum score.
- Public API response filtering to ensure keys, full prompts, and raw responses are not returned.
- Local admin API access restriction.

Frontend tests:

- Fixtures page renders match list and request prediction state.
- Match detail page renders odds, API-Football baseline, AI predictions, and score after match completion.
- Leaderboard page renders model ranking.
- Admin pages can save model configuration, prompt configuration, trigger sync, inspect tasks, inspect records, apply manual fixes, and inspect logs.

## 14. Deployment

The first version deploys frontend and backend on the same server.

Deployment shape:

- React builds static files.
- Fastify serves APIs and can serve the built frontend or sit behind Nginx.
- SQLite file lives in a persistent local path.
- Backend scheduled jobs handle sync, prediction execution, and scoring.
- Local admin page is only accessible from local machine access.

The first version does not include public login, public user accounts, payment, comments, social sharing workflow, or full audit dashboards.
