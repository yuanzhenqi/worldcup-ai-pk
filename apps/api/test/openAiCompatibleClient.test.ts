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

  it("rejects event-stream responses with no text chunks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(eventStreamResponse(['data: {"choices":[{"delta":{}}]}', "data: [DONE]", ""].join("\n")));

    await expect(runOpenAiCompatiblePrediction(config, "predict")).rejects.toThrow("AI prediction response was empty event-stream");
  });

  it("reports HTTP 429", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ error: { message: "too many requests" } }, 429));

    await expect(runOpenAiCompatiblePrediction(config, "predict")).rejects.toThrow("AI prediction rate limited with HTTP 429：too many requests");
  });

  it("reports HTTP 503", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ error: { message: "maintenance" } }, 503));

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
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ error: { message: "quota exhausted" } }, 429));

    await expect(testOpenAiCompatibleModel(config, () => 100)).resolves.toEqual({
      ok: false,
      status: 429,
      message: "模型测试失败：rate limited with HTTP 429：quota exhausted",
      latencyMs: 0
    });
  });

  it("testOpenAiCompatibleModel reports HTTP 503 as upstream unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ error: { message: "maintenance" } }, 503));

    await expect(testOpenAiCompatibleModel(config, () => 100)).resolves.toEqual({
      ok: false,
      status: 503,
      message: "模型测试失败：upstream unavailable with HTTP 503：maintenance",
      latencyMs: 0
    });
  });
});
