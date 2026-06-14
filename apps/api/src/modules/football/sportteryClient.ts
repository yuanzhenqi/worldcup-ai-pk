export interface SportteryClientConfig {
  baseUrl?: string;
}

/**
 * 体彩竞彩 webapi 客户端。sport-data 无反爬，可裸 fetch（美国 IP 实测直连 200 JSON）。
 * 统一前缀 https://webapi.sporttery.cn/gateway/uniform/football/，详情接口参数 source=web&sportteryMatchId。
 */
export class SportteryClient {
  private readonly baseUrl: string;

  constructor(config: SportteryClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? "https://webapi.sporttery.cn";
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        Referer: "https://www.sporttery.cn/"
      }
    });

    if (!response.ok) {
      throw new Error(`Sporttery request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  }

  /** 全赛程 + 各玩法赔率（无需 mid，autoMap 与单场赔率提取均用此）。 */
  getMatchList(): Promise<unknown> {
    return this.getJson<unknown>(`/gateway/uniform/football/getMatchListV1.qry?clientCode=3001`);
  }

  getResultHistory(matchId: number): Promise<unknown> {
    return this.getJson<unknown>(`/gateway/uniform/football/getResultHistoryV1.qry?source=web&sportteryMatchId=${matchId}`);
  }

  getMatchTables(matchId: number): Promise<unknown> {
    return this.getJson<unknown>(`/gateway/uniform/football/getMatchTablesV2.qry?source=web&sportteryMatchId=${matchId}`);
  }

  getMatchResult(matchId: number): Promise<unknown> {
    return this.getJson<unknown>(`/gateway/uniform/football/getMatchResultV1.qry?source=web&sportteryMatchId=${matchId}`);
  }

  getMatchFeature(matchId: number): Promise<unknown> {
    return this.getJson<unknown>(`/gateway/uniform/football/getMatchFeatureV1.qry?source=web&sportteryMatchId=${matchId}`);
  }

  getInjurySuspension(matchId: number): Promise<unknown> {
    return this.getJson<unknown>(`/gateway/uniform/football/getInjurySuspensionV1.qry?source=web&sportteryMatchId=${matchId}`);
  }
}
