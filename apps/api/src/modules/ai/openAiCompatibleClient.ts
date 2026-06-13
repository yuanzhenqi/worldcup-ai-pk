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
