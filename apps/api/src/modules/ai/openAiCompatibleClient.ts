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

function buildChatCompletionsUrl(baseUrl: string): string {
  return new URL(`${baseUrl.replace(/\/+$/, "")}/chat/completions`).toString();
}

export async function testOpenAiCompatibleModel(config: OpenAiCompatibleModelConfig, now = performance.now.bind(performance)): Promise<OpenAiCompatibleTestResult> {
  const startedAt = now();
  const response = await fetch(buildChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.modelName,
      messages: [
        {
          role: "user",
          content: "Reply with ok."
        }
      ],
      temperature: 0,
      max_tokens: 8
    })
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

export async function runOpenAiCompatiblePrediction(config: OpenAiCompatibleModelConfig, prompt: string): Promise<OpenAiCompatiblePredictionResult> {
  const response = await fetch(buildChatCompletionsUrl(config.baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
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
    })
  });
  const rawResponse = await response.text();

  if (!response.ok) {
    throw new Error(`AI prediction failed with HTTP ${response.status}`);
  }

  const body = JSON.parse(rawResponse) as unknown;
  return {
    status: response.status,
    content: extractAssistantContent(body),
    rawResponse
  };
}
