# Fixture Folding and Built-In Prompt Templates Design

## Scope

This change updates the existing World Cup AI PK app in two places:

1. The public fixtures console should keep the `未开始` tab focused on the next three natural dates: today, tomorrow, and the day after tomorrow.
2. The local admin prompt-template module should start with several built-in match prediction templates that users can edit later.

No prediction execution, provider invocation, odds ingestion, or scheduler behavior changes are included in this scope.

## Fixtures Console Behavior

The `未开始` tab will still receive all scheduled matches from the existing public matches API. The frontend will split scheduled matches into two groups after applying the current status, search, and stage filters:

- visible group: matches whose `kickoffAt` falls on today, tomorrow, or the day after tomorrow in the user's local browser date.
- folded group: all other scheduled matches that still match the active search and stage filters.

The visible group renders first using the existing date-group layout. The folded group renders behind a compact disclosure section labeled with the remaining count, such as `其余 52 场未开始比赛`. When expanded, those matches use the same date-group and match-card layout.

The `进行中` and `已结束` tabs keep the current behavior and do not fold matches.

If the current search or stage filter leaves no visible matches but does leave folded matches, the page should not show an empty-state message. It should show the folded section so users can expand it.

## Built-In Prompt Templates

The API will seed built-in prompt templates into `prompt_templates` during app startup after the schema has been applied. The seed operation is idempotent and uses stable IDs so repeated startup does not duplicate templates.

Initial templates:

- `稳健胜平负预测`: asks the model to produce a conservative 1X2 prediction with confidence and risk notes.
- `比分预测`: asks the model to predict exact score, likely score bands, and scoring rhythm.
- `爆冷风险评估`: asks the model to identify upset probability, underdog paths, and warning signals.
- `数据权重型预测`: asks the model to weigh form, squad strength, tactical matchup, odds movement, venue, travel, and schedule context.

All templates use `scope = "match_prediction"` and `enabled = true`. `稳健胜平负预测` is the default template unless the database already has a default template. Existing user-created templates and admin-edited templates are not overwritten.

## Data Flow

Fixtures:

1. `GET /api/public/matches` returns unchanged `MatchDto[]`.
2. `FixturesPage` applies status, search, and stage filters.
3. When active tab is `未开始`, `FixturesPage` partitions filtered matches into the next-three-natural-date group and the folded group.
4. Rendering uses the existing match card and date grouping helpers.

Prompt templates:

1. `buildApp` applies the database schema.
2. A prompt template seed helper inserts missing built-in templates by ID.
3. If any prompt template is already marked default, the seed helper inserts all built-ins with `is_default = 0`.
4. `GET /api/admin/prompt-templates` returns seeded and user-created templates through the existing admin API.

## Error Handling

Fixture folding is pure frontend state and does not introduce new API failures. Invalid `kickoffAt` values are not specially handled because imported fixtures already store normalized ISO timestamps.

Prompt template seeding runs locally against SQLite. Insert conflicts are ignored by checking stable IDs before insert, not by replacing rows. This preserves admin edits.

## Testing

Frontend tests will cover:

- `未开始` shows only today, tomorrow, and the day after tomorrow by default.
- later scheduled matches are hidden until the folded section is expanded.
- `已结束` continues to show finished matches without folding.

API tests will cover:

- a fresh app database starts with the four built-in prompt templates.
- repeated app startup does not duplicate templates.
- an existing default prompt template remains the only default after seeding.

