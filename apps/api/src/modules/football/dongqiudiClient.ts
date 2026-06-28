export interface DongqiudiClientConfig {
  baseUrl?: string;
  mBaseUrl?: string;
}

export interface DongqiudiScheduleMatch {
  match_id: string;
  team_A_id: string;
  team_A_name: string;
  team_A_short_name: string;
  team_B_id: string;
  team_B_name: string;
  team_B_short_name: string;
  start_play: string;
  status: string;
}

export interface DongqiudiScheduleResponse {
  template?: string;
  content?: {
    matches?: DongqiudiScheduleMatch[];
  };
}

export interface DongqiudiImportantMatch {
  matchId: number;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: string;
  status: string;
}

/**
 * 解析 m.dongqiudi.com/match/{tabId} 页面内嵌的 matchListStore.matchList JSON。
 * m 站首屏 HTML（SSR）已包含完整赛程 JSON，可裸 fetch 后用括号匹配截取，无需 Playwright。
 */
export function parseImportantMatchesHtml(html: string): DongqiudiImportantMatch[] {
  const mark = '"matchList":';
  const markIndex = html.indexOf(mark);
  if (markIndex < 0) return [];
  const arrStart = html.indexOf("[", markIndex);
  if (arrStart < 0) return [];

  let depth = 0;
  let inString = false;
  let escaped = false;
  let arrEnd = -1;
  for (let index = arrStart; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        arrEnd = index;
        break;
      }
    }
  }
  if (arrEnd < 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(html.slice(arrStart, arrEnd + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item): DongqiudiImportantMatch[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const matchId = Number(record.match_id);
    if (!Number.isFinite(matchId)) return [];
    return [
      {
        matchId,
        homeTeamName: typeof record.team_A_name === "string" ? record.team_A_name : "",
        awayTeamName: typeof record.team_B_name === "string" ? record.team_B_name : "",
        kickoffAt: typeof record.start_play === "string" ? record.start_play : "",
        status: typeof record.status === "string" ? record.status : ""
      }
    ];
  });
}

/**
 * 懂球帝 sport-data 数据源客户端。
 * 仅访问无反爬的 sport-data.dongqiudi.com JSON 接口（页面层 m.dongqiudi.com 才有 JS challenge）。
 */
export class DongqiudiClient {
  private readonly baseUrl: string;
  private readonly mBaseUrl: string;

  constructor(config: DongqiudiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? "https://sport-data.dongqiudi.com";
    this.mBaseUrl = config.mBaseUrl ?? "https://m.dongqiudi.com";
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

  /** 赛程列表：按赛季、轮次、比赛周拉取比赛。 */
  getSchedule(input: { seasonId: number; roundId: number; gameweek: number }): Promise<DongqiudiScheduleResponse> {
    const params = new URLSearchParams({
      season_id: String(input.seasonId),
      round_id: String(input.roundId),
      gameweek: String(input.gameweek),
      app: "dqd",
      platform: "android",
      version: "162"
    });
    return this.getJson<DongqiudiScheduleResponse>(`/soccer/biz/data/schedule?${params.toString()}`);
  }

  /**
   * 拉取 m 站「重要比赛」聚合页（默认 tab 70）内嵌的比赛列表。
   * 页面 SSR HTML 已包含 matchListStore.matchList，可一次 fetch 拿到世界杯等赛事的近期与即将开始的比赛。
   */
  async getImportantMatches(input: { tabId: number }): Promise<DongqiudiImportantMatch[]> {
    const response = await fetch(`${this.mBaseUrl}/match/${input.tabId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        Accept: "text/html,application/json, */*",
        Referer: "https://m.dongqiudi.com/"
      }
    });

    if (!response.ok) {
      throw new Error(`Dongqiudi important matches request failed with status ${response.status}`);
    }

    const html = await response.text();
    return parseImportantMatchesHtml(html);
  }
}
