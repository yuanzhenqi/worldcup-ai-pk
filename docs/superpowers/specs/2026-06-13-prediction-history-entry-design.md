# Prediction History Entry Design

## Goal

Add a visible per-match entry for existing AI prediction records so users can review previous prediction runs after leaving the immediate request flow.

## Approach

Use the match card as the entry point. A scheduled, live, or finished match with stored parsed predictions will show a `历史` action next to `预测` and `数据`. Clicking it opens a drawer for that match.

## Backend

Add a public endpoint under the existing match API:

`GET /api/public/matches/:matchId/prediction-runs`

The response returns the exact persisted prediction runs for the match, ordered newest first. Each run contains status, logs, parsed model predictions, and the same report fields already used by the live prediction status endpoint.

## Frontend

Add a client method to fetch match prediction history. `FixturesPage` receives it from `App`, shows the `历史` button when `match.hasAiPrediction` is true or the current in-memory feedback has predictions, then renders a `历史预测记录` drawer.

The drawer shows run status, model count, execution logs, and a `查看报告` button for runs with parsed model predictions. The existing detailed report drawer remains the report viewer.

## Error Handling

If the history request fails, the drawer shows `历史记录加载失败，请稍后重试`. Empty results show `暂无历史预测记录`.

## Testing

Cover the backend endpoint with a persisted run and parsed prediction. Cover the web client request path. Cover the match card history button, loading callback, drawer content, and report drill-down.
