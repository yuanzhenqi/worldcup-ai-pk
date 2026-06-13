# Mobile Prediction Context Design

## Scope

This design upgrades the World Cup AI PK app in three areas:

1. Mobile-first fixture and prediction request UI.
2. Rich built-in prompt templates for odds, players, injuries, lineups, history, scoreline, and 1X2 predictions.
3. A local data platform for API-Football prediction context, including odds, official API-Football predictions, head-to-head context, and player or squad context when available.

The implementation must preserve the existing fixture tabs, the rule that scheduled fixtures show the next three natural dates before folding the rest, and the existing local admin configuration model.

## Current State

The public fixture page renders a responsive list with status tabs and match cards. The current prediction action is a direct button on each scheduled match card. The backend has `POST /api/public/matches/:matchId/prediction-request`, which creates a prediction request and prediction run according to kickoff timing rules.

The backend already has API-Football service methods for fixtures, fixture odds, live fixture odds, and API-Football fixture predictions. The database already contains `odds_snapshots`, `api_predictions`, `prediction_requests`, `prediction_runs`, and `ai_predictions`.

The built-in prompt seed currently contains four templates:

- Steady 1X2 prediction.
- Scoreline prediction.
- Upset risk.
- Weighted data prediction.

The app does not yet connect odds, API-Football official predictions, history, injuries, lineups, or player context into prediction request options.

## Product Behavior

### Mobile Fixture UI

On mobile, the fixture page becomes a list-first console:

- The status tabs remain visible near the top.
- The metrics grid becomes two columns.
- Match cards become vertical, scannable blocks.
- A match card shows time, status, score when applicable, teams, round, venue, and compact actions.
- Scheduled match cards expose two actions:
  - `预测`
  - `数据`

The `预测` action opens a bottom drawer for prediction configuration. The `数据` action opens a bottom drawer for cached context data.

Desktop keeps the same page structure but can use the same drawer interaction for consistency.

### Prediction Drawer

The prediction drawer contains:

- Match identity: home team, away team, kickoff time, venue, status.
- Context completeness summary.
- Task package multi-select:
  - 1X2 result.
  - Scoreline.
  - Odds interpretation.
  - Player, lineup, and injury impact.
  - Head-to-head history.
  - Upset risk.
- Data options:
  - Refresh context before prediction, enabled by default.
  - Use odds, enabled by default.
  - Use API-Football official prediction, enabled by default.
  - Use head-to-head history, enabled by default.
  - Use player, lineup, and injury context, enabled by default.
- Prompt options:
  - Built-in prompt template selector.
  - Custom supplemental prompt textarea.
  - Output style selector: concise conclusion or detailed report.
- Submit button: `开始预测`.

After submit, the drawer shows scheduled, running, rate-limited, rejected, or failed status. The match card keeps its compact feedback chip.

### Context Data Drawer

The data drawer shows locally cached context for a match:

- Odds summary.
- API-Football official prediction summary.
- Head-to-head summary.
- Player, lineup, and injury summary.
- Last sync time and status per data domain.

Each domain has one of these states:

- Cached.
- Unavailable.
- Refresh failed.
- Not requested.

The UI must make degraded predictions visible. If all enhanced data is unavailable, the page must say that only base fixture data is available.

## Backend Data Platform

### Cache Strategy

Prediction should prefer local cached data. If `refreshContext` is true, the backend attempts to refresh the selected data domains from API-Football before creating the prediction context.

External data fetch failures must not block the prediction request. Each failed domain is marked unavailable or refresh failed in the context completeness object.

### Tables

Use existing tables where they already match the domain:

- `odds_snapshots`: store pre-match odds and live odds snapshots. The importer extracts 1X2 odds, handicap, and over-under where available.
- `api_predictions`: store API-Football official prediction snapshots.

Add new tables:

- `fixture_context_snapshots`
  - Stores the assembled context snapshot used by prediction requests.
  - Contains match ID, domain completeness, extracted summaries, raw JSON references or raw JSON payloads, and creation time.
- `fixture_data_sync_logs`
  - Stores per-match, per-domain sync status, error text, and sync time.

First implementation should store head-to-head, player, lineup, and injury context as summarized JSON in `fixture_context_snapshots`. Split them into normalized tables only after real API-Football responses prove stable enough to justify it.

### API-Football Data Domains

The code must use exact endpoint names and JSON paths verified from project code, official documentation, or captured real API responses. If endpoint details cannot be extracted from available files or documentation, implementation must add a raw capture step and use that capture to define parsers.

The known existing service methods are:

- World Cup fixtures.
- Fixture odds.
- Fixture live odds.
- Fixture prediction.

Additional data domains for head-to-head and player, lineup, injury context must be added only after exact response shapes are captured or documented.

## Public API

### `GET /api/public/matches/:matchId/context`

Returns cached context summary for one match:

- Odds summary.
- API-Football official prediction summary.
- Head-to-head summary.
- Player, lineup, and injury summary.
- Completeness.
- Last sync status per domain.

### `POST /api/public/matches/:matchId/context/refresh`

Refreshes selected context domains for one match. The request body includes selected data options. The response returns the updated cached context summary.

### `POST /api/public/matches/:matchId/prediction-request`

Extends the existing endpoint body with:

- `taskTypes`.
- `dataOptions`.
- `promptTemplateId`.
- `customPrompt`.
- `outputStyle`.
- `refreshContext`.

The response keeps existing scheduling fields and adds context completeness.

## Admin API

Add admin sync endpoints:

- `POST /api/admin/sync/api-football/matches/:matchId/context`
  - Refreshes all supported context domains for one match.
- `POST /api/admin/sync/api-football/context/upcoming`
  - Refreshes context for upcoming matches. The first implementation defaults to the next three natural dates.

Add an admin data cache module that lists sync status for odds, API-Football official predictions, head-to-head context, and player or squad context.

## Prompt Templates

Built-in templates expand into professional templates plus task package fragments.

Professional templates:

- Steady 1X2 prediction.
- Scoreline prediction.
- Odds-driven prediction.
- Player and lineup impact.
- Head-to-head history model.
- Upset risk assessment.
- Comprehensive pre-match report.

Task fragments:

- 1X2 output requirements.
- Scoreline output requirements.
- Odds interpretation requirements.
- Player, lineup, and injury analysis requirements.
- Head-to-head analysis requirements.
- Upset risk requirements.

Prompt rules:

- Use only data present in `prediction_context`.
- Missing data must be called out as unavailable or not retrieved.
- Do not invent player status, injuries, historical matches, lineups, or odds.
- If odds and model judgment conflict, explain the conflict.
- Output must include structured fields and a readable Chinese summary.

## Prediction Output

AI prediction output should support:

- `predictedResult`.
- `predictedHomeScore`.
- `predictedAwayScore`.
- `confidence`.
- `probabilities`.
- `scorelineAlternatives`.
- `oddsInterpretation`.
- `playerImpact`.
- `headToHeadInsight`.
- `upsetRisk`.
- `keyFactors`.
- `riskPoints`.
- `dataCompleteness`.
- `shortReason`.
- `fullReport`.

The existing `ai_predictions` schema can store the core fields first. Extended fields can be stored in raw response JSON until schema expansion is implemented.

## Error Handling

Context refresh failures are domain-scoped:

- Odds failure: prediction continues without odds.
- API-Football official prediction failure: prediction continues without the official baseline.
- Head-to-head failure: prediction continues without head-to-head context.
- Player, lineup, or injury failure: prediction continues without squad context.
- All enhanced data failure: prediction continues with base fixture data and clear UI messaging.

Prediction request validation failures should return 400. Missing matches should return 404. Scheduling rules from the existing prediction planner remain unchanged.

## Testing

Backend tests:

- Context refresh stores successful domain summaries.
- Domain refresh failure records sync status and does not block prediction requests.
- Prediction request accepts selected task types and data options.
- Prediction request can refresh context before scheduling.
- Context summary endpoint does not expose API keys.

Frontend tests:

- Mobile fixture cards expose `预测` and `数据`.
- Prediction drawer opens with default task selections.
- Prediction drawer submits selected task types and data options.
- Data drawer shows cached, unavailable, and refresh failed states.
- Existing fixture filtering and folding behavior remains intact.

Browser QA:

- Desktop fixture page smoke test.
- Mobile viewport fixture list and drawer interaction.
- Prediction request drawer submission.
- Data drawer degraded state.
- Console has no relevant warnings or errors.

## Implementation Notes

Do not infer API-Football JSON paths without evidence. Add raw capture tests or fixtures for every new parser. Keep raw responses available during parser development.

Do not block the user on missing enhanced context. The prediction workflow should always degrade to base fixture data when possible.

Do not make the mobile match card carry all configuration fields. Use bottom drawers to keep the fixture list compact.
