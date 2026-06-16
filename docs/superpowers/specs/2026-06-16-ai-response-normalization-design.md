# AI Response Normalization Design

## Context

The current prediction flow treats most model failures as generic model errors. Recent tests against the configured NewAPI provider showed several distinct response shapes:

- `claude-sonnet-4-6` returns normal JSON content through both OpenAI Chat and Anthropic Messages style endpoints.
- `gpt-5.4` and previous GPT IDs can return `text/event-stream` with no generated text.
- `gpt-5.5-openai-compact` can return `HTTP 503` from its upstream channel.
- `qwen3.7-plus` can return `HTTP 429`.
- `gemini-3.5-flash` can truncate JSON when the output limit is too small.
- `kimi-k2.6` can return non-empty `reasoning_content` while `content` is empty.
- `MiniMax-M3` can return JSON-like content with schema drift, such as `data_gaps` as a string.

The goal is to make these cases explicit, compatible where safe, and diagnosable where not safe.

## Scope

This change is limited to the API backend model call and parsing layer:

- `apps/api/src/modules/ai/openAiCompatibleClient.ts`
- `apps/api/src/modules/predictions/predictionAgentOutputs.ts`
- focused API tests under `apps/api/test`
- model configuration data only if needed for `claude-sonnet-4-6`

This change does not redesign the prediction UI, betting UI, schedule cards, or live betting arena.

## Response Normalization

Add a normalization layer inside the OpenAI-compatible client before returning assistant text to prediction code.

Supported response handling:

- JSON response with `choices[0].message.content`: return content when it is non-empty.
- JSON response with `finish_reason` equal to `length`: fail with a clear truncation error that includes the model name context supplied by the caller.
- JSON response with empty `content` and non-empty `reasoning_content`: fail with a clear "reasoning-only" error. The system must not treat reasoning text as final answer content.
- `text/event-stream`: parse `data:` chunks. If chunks contain text deltas, merge and return that text. If the stream has no text deltas, fail with a clear empty-stream error.
- HTTP `429`: fail with a clear rate-limit error.
- HTTP `503`: fail with a clear upstream-unavailable error.
- Other non-JSON and non-stream responses: keep a clear unsupported-format error.

The client must not log or return provider API keys.

## Prediction Output Parsing

Keep strict validation for decisions that affect scoring or betting, but tolerate harmless formatting drift:

- Strip markdown JSON fences as currently supported.
- Accept `data_gaps` as a string by converting it to a single-item string array.
- Continue rejecting invalid `predicted_result`, non-numeric scores, confidence outside `0..1`, and invalid betting option references.

This keeps model output flexible without silently changing core prediction meaning.

## Model Test Endpoint

The admin model test should become closer to production behavior:

- Keep the existing basic text test.
- Add a compact JSON-shape test using the same normalization logic.
- Report whether the failure is rate-limit, upstream-unavailable, empty-stream, reasoning-only, truncated, invalid JSON, or schema drift.

The endpoint response must remain secret-safe.

## Configuration

Add or update a model row for:

- model name: `claude-sonnet-4-6`
- display name: `Claude Sonnet 4.6`

Do not enable GPT models automatically unless their direct generation test returns non-empty content.

## Testing

Add failing tests before implementation for:

- parsing SSE streams with text deltas.
- rejecting SSE streams with no text deltas.
- reporting HTTP `429` as rate-limit.
- reporting HTTP `503` as upstream unavailable.
- rejecting reasoning-only responses without treating `reasoning_content` as final output.
- accepting `data_gaps` as a string and converting it to an array.
- admin model test surfacing the improved failure message without leaking secrets.

Existing prediction request tests for event-stream and empty content should be updated to the new explicit messages.

## Acceptance Criteria

- Model failures in prediction logs show the specific failure category.
- A model that returns valid SSE text can be used.
- A model that returns empty SSE is reported as empty-stream.
- Kimi-style reasoning-only responses are reported accurately.
- MiniMax-style `data_gaps` string output no longer fails the entire model prediction.
- `claude-sonnet-4-6` is available in local model configuration after the update.
- API test and typecheck commands pass.
