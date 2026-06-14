# Prediction History Summary Design

## Goal

Each match prediction history entry should show a compact prediction summary first. Detailed analysis should only appear after the user opens a specific model's prediction result.

## Design

The existing prediction history drawer in `apps/web/src/pages/FixturesPage.tsx` will keep using `PredictionRunHistoryDto`. It will render each historical run as a summary card with the same consensus facts used by current match-card prediction feedback: aggregate result, reference score, result distribution, and success/failure counts.

For each run, the drawer will show a summary table with one row per model. The row includes model name, 1x2 result, scoreline, confidence, and short reason. Each row has a `查看` action that opens the detailed report drawer for that single `PredictionRunPredictionDto`.

Execution logs will no longer be the primary history UI. They will be represented by the run status and failure count so the history drawer stays concise.

## Testing

Update the FixturesPage history test to verify:

- Opening history loads the match history.
- The drawer shows aggregate summary fields and model summary rows.
- Historical execution log text is not shown as the main content.
- Clicking one model's `查看` action opens only that model's detailed report.
