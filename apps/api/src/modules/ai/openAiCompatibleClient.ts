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

    if (response.ok && isJsonResponse(response)) {
      return { response, rawResponse };
    }
  }

  if (!latestResponse) {
    throw new Error("AI request was not sent");
  }

  return { response: latestResponse, rawResponse: latestRawResponse };
}

export async function testOpenAiCompatibleModel(config: OpenAiCompatibleModelConfig, now = performance.now.bind(performance)): Promise<OpenAiCompatibleTestResult> {
  const startedAt = now();
  const { response, rawResponse } = await postChatCompletion(config, {
      model: config.modelName,
      messages: [
        {
          role: "user",
          content: "Reply with ok."
        }
      ],
      temperature: 0,
      max_tokens: 8
    });
  const latencyMs = Math.max(0, Math.round(now() - startedAt));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: `模型测试失败：HTTP ${response.status}`,
      latencyMs
    };
  }
  if (isEventStreamResponse(response)) {
    return {
      ok: false,
      status: response.status,
      message: "模型测试失败：接口返回 event-stream，当前需要普通 JSON 响应",
      latencyMs
    };
  }
  if (!isJsonResponse(response)) {
    return {
      ok: false,
      status: response.status,
      message: "模型测试失败：接口返回的不是 JSON",
      latencyMs
    };
  }

  const body = JSON.parse(rawResponse) as unknown;
  const assistantContent = tryExtractAssistantContent(body);
  if (!assistantContent.ok) {
    return {
      ok: false,
      status: response.status,
      message: assistantContent.message,
      latencyMs
    };
  }

  return {
    ok: true,
    status: response.status,
    message: "模型测试成功",
    latencyMs
  };
}

function extractAssistantContent(body: unknown): string {
  if (!body || typeof body !== "object" || !("choices" in body)) {
    throw new Error("AI response missing choices");
  }

  const choices = (body as { choices: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("AI response choices is empty");
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object" || !("message" in firstChoice)) {
    throw new Error("AI response choice missing message");
  }

  const message = (firstChoice as { message: unknown }).message;
  if (!message || typeof message !== "object" || !("content" in message)) {
    throw new Error("AI response message missing content");
  }

  const content = (message as { content: unknown }).content;
  if (typeof content !== "string") {
    throw new Error("AI response content is not text");
  }

  return content;
}

function tryExtractAssistantContent(body: unknown): { ok: true; content: string } | { ok: false; message: string } {
  try {
    const content = extractAssistantContent(body);
    if (isBlankText(content)) {
      return { ok: false, message: "模型测试失败：模型返回内容为空" };
    }
    return { ok: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI response content is invalid";
    return { ok: false, message: `模型测试失败：${message}` };
  }
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
      max_tokens: 1200
    });

  if (!response.ok) {
    throw new Error(`AI prediction failed with HTTP ${response.status}`);
  }
  if (isEventStreamResponse(response)) {
    throw new Error("AI prediction response was event-stream; expected JSON");
  }
  if (!isJsonResponse(response)) {
    throw new Error("AI prediction response was not JSON");
  }

  const body = JSON.parse(rawResponse) as unknown;
  const content = extractAssistantContent(body);
  if (isBlankText(content)) {
    throw new Error("AI prediction content was empty");
  }

  return {
    status: response.status,
    content,
    rawResponse
  };
}
