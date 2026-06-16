export interface OpenAiCompatibleModelConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

export interface OpenAiCompatibleTestResult {
  ok: boolean;
  status: number;
  message: string;
  latencyMs: number;
}

export interface OpenAiCompatiblePredictionResult {
  status: number;
  content: string;
  rawResponse: string;
}

function buildChatCompletionsUrls(baseUrl: string): string[] {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  if (normalizedBaseUrl.endsWith("/v1")) {
    return [new URL(`${normalizedBaseUrl}/chat/completions`).toString()];
  }
  return [
    new URL(`${normalizedBaseUrl}/chat/completions`).toString(),
    new URL(`${normalizedBaseUrl}/v1/chat/completions`).toString()
  ];
}

function getContentType(response: Response): string {
  return response.headers.get("content-type")?.toLowerCase() ?? "";
}

function isEventStreamResponse(response: Response): boolean {
  return getContentType(response).includes("text/event-stream");
}

function isBlankText(value: string): boolean {
  return value.trim().length === 0;
}

function isJsonResponse(response: Response): boolean {
  return getContentType(response).includes("application/json");
}

async function postChatCompletion(config: OpenAiCompatibleModelConfig, body: unknown): Promise<{ response: Response; rawResponse: string }> {
  let latestResponse: Response | null = null;
  let latestRawResponse = "";

  for (const url of buildChatCompletionsUrls(config.baseUrl)) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const rawResponse = await response.text();
    latestResponse = response;
    latestRawResponse = rawResponse;

    if (response.ok && (isJsonResponse(response) || isEventStreamResponse(response))) {
      return { response, rawResponse };
    }
  }

  if (!latestResponse) {
    throw new Error("AI request was not sent");
  }

  return { response: latestResponse, rawResponse: latestRawResponse };
}

function getJsonErrorMessage(rawResponse: string): string | null {
  try {
    const body = JSON.parse(rawResponse) as unknown;
    if (!body || typeof body !== "object" || !("error" in body)) {
      return null;
    }
    const error = (body as { error: unknown }).error;
    if (!error || typeof error !== "object" || !("message" in error)) {
      return null;
    }
    const message = (error as { message: unknown }).message;
    return typeof message === "string" && !isBlankText(message) ? message : null;
  } catch {
    return null;
  }
}

function buildHttpErrorMessage(prefix: string, status: number, rawResponse: string): string {
  let message =
    status === 429
      ? `${prefix} rate limited with HTTP ${status}`
      : status === 503
        ? `${prefix} upstream unavailable with HTTP ${status}`
        : `${prefix} failed with HTTP ${status}`;
  const errorMessage = getJsonErrorMessage(rawResponse);
  if (errorMessage) {
    message = `${message}：${errorMessage}`;
  }
  return message;
}

function getFirstChoice(body: unknown, prefix: string): unknown {
  if (!body || typeof body !== "object" || !("choices" in body)) {
    throw new Error(`${prefix} response missing choices`);
  }

  const choices = (body as { choices: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error(`${prefix} response choices is empty`);
  }

  return choices[0];
}

function getFirstChoiceFromEventBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || !("choices" in body)) {
    return null;
  }
  const choices = (body as { choices: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  return choices[0];
}

function extractTextFromJsonBody(body: unknown, prefix: string): string {
  const firstChoice = getFirstChoice(body, prefix);
  if (!firstChoice || typeof firstChoice !== "object") {
    throw new Error(`${prefix} response choice is invalid`);
  }

  if ("finish_reason" in firstChoice && (firstChoice as { finish_reason: unknown }).finish_reason === "length") {
    throw new Error(`${prefix} response was truncated`);
  }

  if (!("message" in firstChoice)) {
    throw new Error(`${prefix} response choice missing message`);
  }

  const message = (firstChoice as { message: unknown }).message;
  if (!message || typeof message !== "object") {
    throw new Error(`${prefix} response message is invalid`);
  }
  if (!("content" in message)) {
    throw new Error(`${prefix} response message missing content`);
  }

  const content = (message as { content: unknown }).content;
  if (typeof content !== "string") {
    throw new Error(`${prefix} response content is not text`);
  }

  if (isBlankText(content)) {
    const reasoningContent = "reasoning_content" in message ? (message as { reasoning_content: unknown }).reasoning_content : null;
    if (typeof reasoningContent === "string" && !isBlankText(reasoningContent)) {
      throw new Error(`${prefix} returned reasoning content without final answer`);
    }
    throw new Error(`${prefix} content was empty`);
  }

  return content;
}

function extractTextFromEventStream(rawResponse: string, prefix: string): string {
  let content = "";

  for (const line of rawResponse.split(/\r?\n/)) {
    const trimmedLine = line.trimStart();
    if (!trimmedLine.startsWith("data:")) {
      continue;
    }
    const data = trimmedLine.slice("data:".length).trim();
    if (!data || data === "[DONE]") {
      continue;
    }

    const body = JSON.parse(data) as unknown;
    const firstChoice = getFirstChoiceFromEventBody(body);
    if (!firstChoice || typeof firstChoice !== "object") {
      continue;
    }
    const delta = "delta" in firstChoice ? (firstChoice as { delta: unknown }).delta : null;
    if (delta && typeof delta === "object" && "content" in delta) {
      const deltaContent = (delta as { content: unknown }).content;
      if (typeof deltaContent === "string") {
        content += deltaContent;
      }
      continue;
    }
    if ("message" in firstChoice) {
      const message = (firstChoice as { message: unknown }).message;
      if (message && typeof message === "object" && "content" in message) {
        const messageContent = (message as { content: unknown }).content;
        if (typeof messageContent === "string") {
          content += messageContent;
        }
      }
    }
  }

  if (isBlankText(content)) {
    throw new Error(`${prefix} response was empty event-stream`);
  }

  return content;
}

function normalizeChatCompletionContent(response: Response, rawResponse: string, prefix: string): string {
  if (isEventStreamResponse(response)) {
    return extractTextFromEventStream(rawResponse, prefix);
  }
  if (!isJsonResponse(response)) {
    throw new Error(`${prefix} response was not JSON`);
  }

  const body = JSON.parse(rawResponse) as unknown;
  return extractTextFromJsonBody(body, prefix);
}

function toModelTestMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "AI model test response content is invalid";
  const prefix = "AI model test ";
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
}

export async function testOpenAiCompatibleModel(config: OpenAiCompatibleModelConfig, now = performance.now.bind(performance)): Promise<OpenAiCompatibleTestResult> {
  const startedAt = now();
  const basicTest = await postChatCompletion(config, {
    model: config.modelName,
    messages: [
      {
        role: "user",
        content: "Reply with ok."
      }
    ],
    temperature: 0,
    max_tokens: 8,
    stream: false
  });
  if (!basicTest.response.ok) {
    return {
      ok: false,
      status: basicTest.response.status,
      message: `模型测试失败：${toModelTestMessage(new Error(buildHttpErrorMessage("AI model test", basicTest.response.status, basicTest.rawResponse)))}`,
      latencyMs: Math.max(0, Math.round(now() - startedAt))
    };
  }
  try {
    normalizeChatCompletionContent(basicTest.response, basicTest.rawResponse, "AI model test");
  } catch (error) {
    return {
      ok: false,
      status: basicTest.response.status,
      message: `模型测试失败：${toModelTestMessage(error)}`,
      latencyMs: Math.max(0, Math.round(now() - startedAt))
    };
  }

  const jsonShapeTest = await postChatCompletion(config, {
    model: config.modelName,
    messages: [
      {
        role: "user",
        content:
          'Return only compact JSON with this exact shape: {"predicted_result":"home","predicted_home_score":2,"predicted_away_score":1,"confidence":0.61,"data_gaps":[]}'
      }
    ],
    temperature: 0,
    max_tokens: 120,
    stream: false
  });
  const latencyMs = Math.max(0, Math.round(now() - startedAt));

  if (!jsonShapeTest.response.ok) {
    return {
      ok: false,
      status: jsonShapeTest.response.status,
      message: `模型测试失败：${toModelTestMessage(new Error(buildHttpErrorMessage("AI model test", jsonShapeTest.response.status, jsonShapeTest.rawResponse)))}`,
      latencyMs
    };
  }
  try {
    normalizeChatCompletionContent(jsonShapeTest.response, jsonShapeTest.rawResponse, "AI model test");
  } catch (error) {
    return {
      ok: false,
      status: jsonShapeTest.response.status,
      message: `模型测试失败：${toModelTestMessage(error)}`,
      latencyMs
    };
  }

  return {
    ok: true,
    status: jsonShapeTest.response.status,
    message: "模型测试成功",
    latencyMs
  };
}

export async function runOpenAiCompatiblePrediction(config: OpenAiCompatibleModelConfig, prompt: string): Promise<OpenAiCompatiblePredictionResult> {
  const { response, rawResponse } = await postChatCompletion(config, {
    model: config.modelName,
    messages: [
      {
        role: "system",
        content: "You are a football prediction engine. Return only valid JSON."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.2,
    max_tokens: 1200,
    stream: false
  });

  if (!response.ok) {
    throw new Error(buildHttpErrorMessage("AI prediction", response.status, rawResponse));
  }

  const content = normalizeChatCompletionContent(response, rawResponse, "AI prediction");

  return {
    status: response.status,
    content,
    rawResponse
  };
}
