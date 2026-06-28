import { afterEach, describe, expect, it, vi } from "vitest";
import { runOpenAiCompatiblePrediction, testOpenAiCompatibleModel } from "../src/modules/ai/openAiCompatibleClient";

const config = {
  baseUrl: "https://newapi.example.com/v1",
  apiKey: "secret-provider-key",
  modelName: "model-x"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function eventStreamResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });
}

describe("OpenAI-compatible client response normalization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runOpenAiCompatiblePrediction uses text from text/event-stream chunks during prediction calls", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      eventStreamResponse(
        [
          'data: {"choices":[{"delta":{"content":"{\\"predicted_result\\":\\"home\\","}}]}',
          'data: {"choices":[{"delta":{"content":"\\"confidence\\":0.61}"}}]}',
          "data: [DONE]",
          ""
        ].join("\n")
      )
    );

    await expect(runOpenAiCompatiblePrediction(config, "predict")).resolves.toMatchObject({
      status: 200,
      content: '{"predicted_result":"home","confidence":0.61}'
    });
  });

  it("passes an abort signal to prediction requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "{}" } }] }));

    await runOpenAiCompatiblePrediction(config, "predict");

    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("uses a larger token budget for gemini 3.5 prediction requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "{}" } }] }));

    await runOpenAiCompatiblePrediction({ ...config, modelName: "gemini-3.5-flash" }, "predict");

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as { max_tokens: number };
    expect(body.max_tokens).toBe(20000);
  });

  it("uses a larger token budget for mimo v2.5 prediction requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "{}" } }] }));

    await runOpenAiCompatiblePrediction({ ...config, modelName: "mimo-v2.5-pro" }, "predict");

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as { max_tokens: number };
    expect(body.max_tokens).toBe(20000);
  });

  it("uses model-level output token budget for prediction requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "{}" } }] }));

    await runOpenAiCompatiblePrediction({ ...config, maxOutputTokens: 4096 }, "predict");

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as { max_tokens: number };
    expect(body.max_tokens).toBe(4096);
  });

  it("retries timed out prediction requests once", async () => {
    vi.useFakeTimers();
    const abortingFetch = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (init as RequestInit).signal as AbortSignal;
          signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
        })
    );
    abortingFetch.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "{}" } }] }));

    const resultPromise = runOpenAiCompatiblePrediction(config, "predict");
    await vi.advanceTimersByTimeAsync(150_000);

    await expect(resultPromise).resolves.toMatchObject({ content: "{}" });
    expect(abortingFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("uses model-level timeout and retry count for prediction requests", async () => {
    vi.useFakeTimers();
    const abortingFetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = (init as RequestInit).signal as AbortSignal;
            signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
          })
      )
      .mockImplementationOnce(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = (init as RequestInit).signal as AbortSignal;
            signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
          })
      )
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "{}" } }] }));

    const resultPromise = runOpenAiCompatiblePrediction({ ...config, requestTimeoutMs: 1234, requestRetryCount: 2 }, "predict");
    await vi.advanceTimersByTimeAsync(1234);
    await vi.advanceTimersByTimeAsync(1234);

    await expect(resultPromise).resolves.toMatchObject({ content: "{}" });
    expect(abortingFetch).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("rejects event-stream responses with no text chunks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(eventStreamResponse(['data: {"choices":[{"delta":{}}]}', "data: [DONE]", ""].join("\n")));

    await expect(runOpenAiCompatiblePrediction(config, "predict")).rejects.toThrow("AI prediction response was empty event-stream");
  });

  it("reports HTTP 429", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: { message: "too many requests" } }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "too many requests" } }, 429));

    await expect(runOpenAiCompatiblePrediction(config, "predict")).rejects.toThrow("AI prediction rate limited with HTTP 429：too many requests");
  });

  it("reports HTTP 503", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: { message: "maintenance" } }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "maintenance" } }, 503));

    await expect(runOpenAiCompatiblePrediction(config, "predict")).rejects.toThrow("AI prediction upstream unavailable with HTTP 503：maintenance");
  });

  it('reports finish_reason: "length" as truncated', async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            finish_reason: "length",
            message: { content: "partial" }
          }
        ]
      })
    );

    await expect(runOpenAiCompatiblePrediction(config, "predict")).rejects.toThrow("AI prediction response was truncated");
  });

  it("rejects JSON responses with reasoning content and no final answer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              content: "",
              reasoning_content: "thinking"
            }
          }
        ]
      })
    );

    await expect(runOpenAiCompatiblePrediction(config, "predict")).rejects.toThrow("AI prediction returned reasoning content without final answer");
  });

  it("testOpenAiCompatibleModel performs basic text and compact JSON-shape tests", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "ok" } }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [
            {
              message: {
                content: '{"predicted_result":"home","predicted_home_score":2,"predicted_away_score":1,"confidence":0.61,"data_gaps":[]}'
              }
            }
          ]
        })
      );

    await expect(testOpenAiCompatibleModel(config, () => 100)).resolves.toEqual({
      ok: true,
      status: 200,
      message: "模型测试成功",
      latencyMs: 0
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as { stream?: unknown };
    const secondBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string) as { messages?: Array<{ content?: string }>; stream?: unknown };
    expect(firstBody.stream).toBe(false);
    expect(secondBody.stream).toBe(false);
    expect(secondBody.messages?.at(-1)?.content).toContain(
      '{"predicted_result":"home","predicted_home_score":2,"predicted_away_score":1,"confidence":0.61,"data_gaps":[]}'
    );
  });

  it("testOpenAiCompatibleModel reports HTTP 429 as rate limited", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: { message: "quota exhausted" } }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "quota exhausted" } }, 429));

    await expect(testOpenAiCompatibleModel(config, () => 100)).resolves.toEqual({
      ok: false,
      status: 429,
      message: "模型测试失败：rate limited with HTTP 429：quota exhausted",
      latencyMs: 0
    });
  });

  it("testOpenAiCompatibleModel reports HTTP 503 as upstream unavailable", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: { message: "maintenance" } }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "maintenance" } }, 503));

    await expect(testOpenAiCompatibleModel(config, () => 100)).resolves.toEqual({
      ok: false,
      status: 503,
      message: "模型测试失败：upstream unavailable with HTTP 503：maintenance",
      latencyMs: 0
    });
  });
});
