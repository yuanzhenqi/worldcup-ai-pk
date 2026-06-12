export interface ApiFootballClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export class ApiFootballClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ApiFootballClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://v3.football.api-sports.io";
  }

  async getJson<T>(path: string, query: Record<string, string | number>): Promise<T> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      searchParams.set(key, String(value));
    }

    const response = await fetch(`${this.baseUrl}${path}?${searchParams.toString()}`, {
      headers: {
        "x-apisports-key": this.apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`API-Football request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
