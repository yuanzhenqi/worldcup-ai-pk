# Worldcup AI PK UI and Config Redesign

## 1. Scope

This spec covers the next product polish slice for Worldcup AI PK:

- Redesign the public fixtures page into a compact fixture console.
- Show Chinese team display names on public fixtures.
- Show final scores for finished matches.
- Turn the local admin page into a real configuration center.
- Add persistent configuration for OpenAI-compatible providers, models, prompt templates, and team display names.

This slice does not implement manual prediction execution, scheduled two-hour pre-match AI PK, prediction scoring, odds sync, or match detail pages. Those remain part of the broader product design in `docs/superpowers/specs/2026-06-12-worldcup-ai-pk-design.md`.

## 2. Current Verified Code Facts

The current shared match type is `MatchDto` in `packages/shared/src/types.ts`. It includes:

- `status` with values `scheduled`, `live`, `finished`, `postponed`, `cancelled`.
- `homeTeam.name` and `awayTeam.name`.
- `homeScore` and `awayScore`.
- `canRequestPrediction`.

The current public API is:

- `GET /api/public/matches`

The current admin API includes:

- `GET /api/admin/settings/api-football`
- `PUT /api/admin/settings/api-football`
- `POST /api/admin/sync/api-football/fixtures/raw`

The current SQLite schema already contains `matches`, `ai_providers`, `ai_models`, `prompt_templates`, `system_logs`, and `app_settings`. The API-Football key is stored in `app_settings` with key `apiFootball.apiKey`.

## 3. Design Reference Summary

The redesign follows patterns observed in current football fixture products:

- FIFA official pages emphasize tournament schedule and results.
- ESPN scoreboard pages emphasize score-first match rows.
- Sofascore uses status entry points such as live, finished, and upcoming.
- FotMob tournament pages separate overview, tables, knockout, and fixtures.

For this product, the best fit is a fixture console: readable, compact, and operational. It should feel more like a professional match operations interface than a marketing page.

## 4. Public Fixtures Experience

The public fixtures page becomes a fixture console.

### 4.1 Layout

The page structure:

1. Header with product name, short context, and latest sync summary.
2. Metrics strip:
   - total matches
   - scheduled matches
   - live matches
   - finished matches
3. Status segmented control:
   - `未开始`
   - `进行中`
   - `已结束`
4. Search and stage filter row.
5. Date-grouped match sections.

The default status tab is `未开始`.

### 4.2 Match Card

Every match card shows:

- kickoff date and time in Chinese locale
- venue when present
- stage
- home team logo when present
- home team Chinese display name
- away team logo when present
- away team Chinese display name
- match status label in Chinese

For `scheduled` matches:

- Show kickoff time as the primary right-side value.
- Show `请求预测` when `canRequestPrediction` is true.
- Disable or hide prediction action when `canRequestPrediction` is false.

For `live` matches:

- Show the current status label `进行中`.
- Show score if both `homeScore` and `awayScore` are not null.
- Show `比分待同步` if either score is null.

For `finished` matches:

- Show score as the primary right-side value.
- Use the format `<homeScore> - <awayScore>`.
- If either score is null, show `比分待同步`.
- Do not allow a new prediction request.

For `postponed` and `cancelled` matches:

- Include them in the date grouping.
- Show `已延期` or `已取消`.
- Do not allow a new prediction request.

### 4.3 Filtering

The fixture page supports:

- status tab filtering
- team search using Chinese display name and original API-Football name
- stage filtering using `MatchDto.stage`

The frontend does not infer match meaning from API-Football raw status codes. It uses the backend-provided `MatchStatus` value and Chinese label.

## 5. Chinese Team Display Names

Chinese display names are persisted in the backend so public UI, admin UI, and future prompt context all use the same source.

### 5.1 Storage

Add table `team_display_names`:

```sql
CREATE TABLE IF NOT EXISTS team_display_names (
  api_football_team_id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  display_name_zh TEXT NOT NULL,
  logo_url TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`api_football_team_id` uses the team ID already imported into `matches.home_team_id` and `matches.away_team_id`.

`source` values:

- `seed`
- `admin`
- `api-football`

### 5.2 Import Behavior

When importing API-Football fixtures:

1. Read `teams.home.id`, `teams.home.name`, `teams.home.logo`, `teams.away.id`, `teams.away.name`, and `teams.away.logo`.
2. Upsert `team_display_names` for both teams.
3. If a seed Chinese name exists for the team ID, set `display_name_zh` to that seed value.
4. If no seed Chinese name exists and no previous row exists, set `display_name_zh` to the API-Football original name.
5. If a row has `source = 'admin'`, do not overwrite `display_name_zh` during fixture import.
6. Always refresh `original_name`, `logo_url`, and `updated_at` from the latest fixture import.

### 5.3 Public API Shape

Extend `TeamDto`:

```ts
export interface TeamDto {
  id: string;
  name: string;
  displayNameZh: string;
  logoUrl: string | null;
}
```

`name` remains the original API-Football team name. `displayNameZh` is the display name used by the Chinese UI.

Extend `MatchDto`:

```ts
export interface MatchDto {
  statusLabelZh: string;
}
```

`statusLabelZh` values:

- `scheduled` -> `未开始`
- `live` -> `进行中`
- `finished` -> `已结束`
- `postponed` -> `已延期`
- `cancelled` -> `已取消`

## 6. Admin Configuration Center

The admin page becomes a two-column configuration center:

- Left navigation with modules.
- Right content area with the selected module.

The first module opens by default.

### 6.1 Data Source Module

This module keeps the current API-Football configuration and improves the sync status display.

It includes:

- API-Football key password input.
- Save button.
- Manual fixture sync button using the current fixture sync route.
- Latest sync result from `system_logs`.
- Imported match count from `matches`.
- Error panel for the latest API-Football failure.

This module does not call odds endpoints in this slice.

### 6.2 Model Providers Module

This module manages OpenAI-compatible provider configuration.

Extend `ai_providers` with:

```sql
ALTER TABLE ai_providers ADD COLUMN display_name TEXT;
ALTER TABLE ai_providers ADD COLUMN base_url TEXT;
```

For new rows:

- `name` stores a stable internal provider name.
- `display_name` stores the admin-facing label.
- `base_url` stores the OpenAI-compatible endpoint base URL.
- `api_key` stores the secret value.
- `enabled` controls whether models under this provider are selectable later.

API keys are write-only in admin responses. Read responses return only `apiKeyConfigured: boolean`.

### 6.3 Models Module

This module manages rows in `ai_models`.

Fields:

- provider
- `model_name`
- `display_name`
- `enabled`

The page lists models grouped by provider. Disabled providers make their models visually inactive.

### 6.4 Prompt Templates Module

Extend `prompt_templates` with:

```sql
ALTER TABLE prompt_templates ADD COLUMN description TEXT;
ALTER TABLE prompt_templates ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
```

Fields:

- `name`
- `description`
- `full_prompt`
- `prompt_summary`
- `scope`
- `enabled`
- `is_default`

Rules:

- Multiple prompt templates are allowed.
- At most one enabled template can have `is_default = 1`.
- When enabled templates exist, the admin UI highlights whether no default template is set.
- Setting one template as default clears `is_default` from the others.
- The editor is a large textarea.
- The page shows supported variables next to the textarea as static reference text.

### 6.5 Team Display Names Module

This module manages `team_display_names`.

The page supports:

- search by `display_name_zh`
- search by `original_name`
- edit `display_name_zh`
- save row
- show logo when present
- show `api_football_team_id`

Saving a row sets `source = 'admin'`.

## 7. Admin API Design

The admin API remains under `/api/admin` and remains local-only through the existing admin pre-handler.

Add routes:

- `GET /api/admin/summary`
- `POST /api/admin/sync/api-football/fixtures`
- `GET /api/admin/ai-providers`
- `POST /api/admin/ai-providers`
- `PUT /api/admin/ai-providers/:id`
- `DELETE /api/admin/ai-providers/:id`
- `GET /api/admin/ai-models`
- `POST /api/admin/ai-models`
- `PUT /api/admin/ai-models/:id`
- `DELETE /api/admin/ai-models/:id`
- `GET /api/admin/prompt-templates`
- `POST /api/admin/prompt-templates`
- `PUT /api/admin/prompt-templates/:id`
- `DELETE /api/admin/prompt-templates/:id`
- `GET /api/admin/team-display-names`
- `PUT /api/admin/team-display-names/:apiFootballTeamId`

Existing route `POST /api/admin/sync/api-football/fixtures/raw` may remain for diagnostics. The new `POST /api/admin/sync/api-football/fixtures` is the normal user-facing sync action.

## 8. Public API Design

`GET /api/public/matches` continues to return `{ matches }`.

The returned matches include:

- original team names
- Chinese display names
- logos
- scores
- `status`
- `statusLabelZh`
- `canRequestPrediction`

The public API never returns:

- API-Football key
- model provider API keys
- full prompt text
- raw AI responses

## 9. Frontend Implementation Shape

Keep the React app structure simple:

- `FixturesPage` becomes the fixture console container.
- Extract small components only where they reduce real complexity:
  - status segmented control
  - fixture group
  - match card
  - admin module shell
  - provider form
  - model form
  - prompt template form
  - team display name editor

Use the existing app shell and routing pattern. Do not introduce a full router in this slice.

Visual style:

- light professional control panel
- white and near-white surfaces
- restrained borders
- compact match cards
- subtle World Cup accent colors
- no oversized hero section
- no decorative gradient blobs

## 10. Error Handling

Fixture page:

- Empty state says no fixtures are available and points admin users to data sync.
- Failed public match fetch shows a concise retry message.
- Finished match with missing score shows `比分待同步`.

Admin:

- Save errors show the backend error message when available.
- API key fields never show stored key values.
- Provider and prompt forms validate required fields before sending requests.
- Default prompt conflicts are resolved by the backend rule that only one template remains default.
- Sync errors are written to `system_logs` and shown in the data source module.

## 11. Tests

Backend tests:

- fixture import upserts `team_display_names`
- admin-edited `display_name_zh` is not overwritten by fixture import
- public matches include `displayNameZh` and `statusLabelZh`
- finished matches include `homeScore` and `awayScore`
- model provider read responses expose `apiKeyConfigured` and do not expose `api_key`
- prompt template default rule prevents multiple default templates
- admin team display name update sets `source = 'admin'`

Frontend tests:

- fixtures page defaults to `未开始`
- status control switches to `进行中` and `已结束`
- finished match card shows score
- missing finished score shows `比分待同步`
- admin data source module renders configured state
- provider form saves OpenAI-compatible fields
- prompt templates page supports multiple rows and default selection
- team display names page edits and saves a Chinese display name

## 12. Completion Criteria

This slice is complete when:

- Public fixtures are grouped by date inside status tabs.
- Finished fixtures show scores.
- Team names render in Chinese when a Chinese display name exists.
- Admin can save API-Football, provider, model, prompt template, and team display name configuration.
- Admin key reads do not reveal stored secret values.
- Tests listed in this spec pass.
- The project still passes the existing typecheck and build commands.
