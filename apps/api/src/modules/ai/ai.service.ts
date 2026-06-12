import type { AiPredictionInput, AiProviderAdapter, ParsedAiPrediction } from "./providers/base";

export class AiService {
  private readonly providers: Map<string, AiProviderAdapter>;

  constructor(providers: AiProviderAdapter[]) {
    this.providers = new Map(providers.map((provider) => [provider.name, provider]));
  }

  async predict(providerName: string, input: AiPredictionInput): Promise<ParsedAiPrediction> {
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`AI provider is not registered: ${providerName}`);
    }

    return provider.predict(input);
  }
}
