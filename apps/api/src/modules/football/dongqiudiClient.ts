export interface DongqiudiClientConfig {
  baseUrl?: string;
}

/**
 * 懂球帝 sport-data 数据源客户端。
 * 仅访问无反爬的 sport-data.dongqiudi.com JSON 接口（页面层 m.dongqiudi.com 才有 JS challenge）。
 */
export class DongqiudiClient {
  private readonly baseUrl: string;

  constructor(config: DongqiudiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? "https://sport-data.dongqiudi.com";
  }

  async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        Accept: "application/json, text/plain, */*",
        Referer: "https://m.dongqiudi.com/"
      }
    });

    if (!response.ok) {
      throw new Error(`Dongqiudi request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }

  /** 赛前分析数据对比：交锋/战绩/身价/场均罚牌等。 */
  getPreAnalyzeContrast(dongqiudiMatchId: number): Promise<unknown> {
    return this.getJson<unknown>(`/soccer/biz/dqd/match/pre_analyze_data_contrast/${dongqiudiMatchId}?app=dqd`);
  }
}
