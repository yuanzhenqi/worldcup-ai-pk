import type { BettingArenaRoundDto } from "@worldcup-ai-pk/shared";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatAuditValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

export function formatJsonText(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];
}

export function formatDataGap(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  const source = readString(value.source);
  const code = readString(value.code);
  const message = readString(value.message);
  if (!source && !code && !message) return JSON.stringify(value);
  return `${source || "unknown"} · ${code || "unknown"}：${message || "未提供说明"}`;
}

function readSourceLinks(value: unknown): Array<{ title: string; url: string; sourceDomain: string; publishedAt: string | null }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const url = readString(item.url);
    if (!url) return [];
    return [
      {
        title: readString(item.title) || url,
        url,
        sourceDomain: readString(item.sourceDomain),
        publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : null
      }
    ];
  });
}

export function domainLabel(domain: string): string {
  const labels: Record<string, string> = {
    odds: "指数",
    api_prediction: "官方预测",
    head_to_head: "历史交锋",
    squad: "阵容伤停",
    dongqiudi_intel: "懂球帝情报",
    sporttery: "体彩数据",
    team_profile: "球队资料"
  };
  return labels[domain] ?? domain;
}

export function domainStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    cached: "已缓存",
    unavailable: "暂无",
    refresh_failed: "刷新失败",
    not_requested: "未请求"
  };
  return labels[status] ?? status;
}

export function poolDisplayName(poolCode: string): string {
  const labels: Record<string, string> = {
    HAD: "胜平负",
    HHAD: "让球胜平负",
    CRS: "比分",
    TTG: "总进球",
    HAFU: "半全场"
  };
  return labels[poolCode] ?? poolCode;
}

export function parlayDisplayName(legsCount: number): string {
  return `${legsCount} 串 1`;
}

function summarizeSourceDomains(
  contextDomains: Array<{ domain: string; status: string; summary: string; error: string }>,
  domains: string[],
  emptyText: string
): string {
  const rows = contextDomains.filter((entry) => domains.includes(entry.domain));
  if (rows.length === 0) return emptyText;
  return rows
    .map((entry) => {
      const detail = entry.summary || entry.error || "暂无摘要";
      return `${domainLabel(entry.domain)} ${domainStatusLabel(entry.status)}：${detail}`;
    })
    .join("；");
}

function summarizeDongqiudiIntel(
  contextDomains: Array<{ domain: string; status: string; summary: string; error: string }>
): string {
  const rows = contextDomains.filter((entry) => entry.domain === "dongqiudi_intel");
  if (rows.length === 0 || rows.every((entry) => entry.status !== "cached")) {
    return "懂球帝情报未采集";
  }
  return rows
    .map((entry) => {
      const detail = entry.summary || entry.error || "暂无摘要";
      return `${domainLabel(entry.domain)} ${domainStatusLabel(entry.status)}：${detail}`;
    })
    .join("；");
}

function summarizeExternalIntelSource(externalIntel: { status: string; summary: string; collectedAt: string }): string {
  if (!externalIntel.status && !externalIntel.summary) {
    return "当前模型可基于自身联网能力补充公开情报；本地统一采集源尚未配置";
  }
  const statusText = externalIntel.status ? domainStatusLabel(externalIntel.status) : "已采集";
  if (!externalIntel.summary) {
    return "外部联网情报无摘要";
  }
  return `统一采集${statusText}：${externalIntel.summary}`;
}

function buildSourceBreakdown(input: {
  contextDomains: Array<{ domain: string; status: string; summary: string; error: string }>;
  sportteryPoolsCount: number;
  externalIntel: { status: string; summary: string; collectedAt: string };
}) {
  return [
    {
      source: "API-Football",
      detail: "仅赛程：比赛时间、场地、球队、状态和比分"
    },
    {
      source: "体彩",
      detail:
        input.sportteryPoolsCount > 0
          ? `投注玩法与赔率：已注入 ${input.sportteryPoolsCount} 个体彩玩法池，并读取体彩赛前摘要`
          : summarizeSourceDomains(input.contextDomains, ["sporttery"], "投注玩法与赔率：未读取到体彩玩法池")
    },
    {
      source: "懂球帝",
      detail: summarizeDongqiudiIntel(input.contextDomains)
    },
    {
      source: "本地资料",
      detail: summarizeSourceDomains(input.contextDomains, ["team_profile"], "已注入本地球队资料框架，部分球队资料可能为空")
    },
    {
      source: "外部联网情报",
      detail: summarizeExternalIntelSource(input.externalIntel)
    }
  ];
}

function formatTeamProfile(profile: unknown) {
  const source = isRecord(profile) ? profile : {};
  const keyPlayers = Array.isArray(source.keyPlayers)
    ? source.keyPlayers.flatMap((player) => {
        if (!isRecord(player)) return [];
        const name = readString(player.name);
        const position = readString(player.position);
        const club = readString(player.club);
        return name ? [`${name}${position ? ` / ${position}` : ""}${club ? ` / ${club}` : ""}`] : [];
      })
    : [];
  const injuries = Array.isArray(source.injuries)
    ? source.injuries.flatMap((injury) => {
        if (!isRecord(injury)) return [];
        const player = readString(injury.player);
        const status = readString(injury.status);
        const injuryText = readString(injury.injury);
        return player ? [`${player}${status ? ` / ${status}` : ""}${injuryText ? ` / ${injuryText}` : ""}`] : [];
      })
    : [];
  const worldCupHistory = isRecord(source.worldCupHistory) ? source.worldCupHistory : null;
  const appearances = worldCupHistory ? readNumber(worldCupHistory.appearances) : null;
  const bestResult = worldCupHistory ? readString(worldCupHistory.bestResult) : "";
  const titles = worldCupHistory ? readNumber(worldCupHistory.titles) : null;

  return {
    wc26TeamId: readString(source.wc26TeamId),
    coach: readString(source.coach),
    playingStyle: readString(source.playingStyle),
    keyPlayers,
    injuries,
    worldCupHistory:
      appearances !== null || bestResult || titles !== null
        ? `参赛 ${appearances ?? "-"} 次 · 最好成绩 ${bestResult || "-"} · 冠军 ${titles ?? "-"} 次`
        : "",
    qualifyingSummary: readString(source.qualifyingSummary),
    marketValue: source.marketValue === null ? "暂无身价数据源" : readString(source.marketValue)
  };
}

function formatHistoricalMatchup(matchup: unknown): string {
  if (!isRecord(matchup)) return "暂无两队世界杯历史交锋数据";
  const totalMatches = readNumber(matchup.totalMatches);
  const homeWins = readNumber(matchup.homeWins);
  const draws = readNumber(matchup.draws);
  const awayWins = readNumber(matchup.awayWins);
  const summary = readString(matchup.summary);
  const record =
    totalMatches !== null
      ? `${totalMatches} 场 · 主 ${homeWins ?? "-"} 胜 / ${draws ?? "-"} 平 / 客 ${awayWins ?? "-"} 胜`
      : "暂无战绩统计";
  return summary ? `${record}。${summary}` : record;
}

function formatContrastPair(value: unknown): ContrastPair | null {
  if (!isRecord(value)) return null;
  const home = readString(value.home);
  const away = readString(value.away);
  if (!home && !away) return null;
  return { home, away };
}

function formatDongqiudiComparison(value: unknown): BattleContextMatchSummary["dongqiudiComparison"] {
  if (!isRecord(value)) return null;
  return {
    comprehensive: formatContrastPair(value.comprehensive),
    h2h: formatContrastPair(value.h2h),
    recentForm: formatContrastPair(value.recentForm),
    avgGoals: formatContrastPair(value.avgGoals),
    avgConceded: formatContrastPair(value.avgConceded),
    marketValue: formatContrastPair(value.marketValue),
    cards: formatContrastPair(value.cards)
  };
}

function formatGroupStandings(value: unknown): BattleContextMatchSummary["groupStandings"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): BattleContextMatchSummary["groupStandings"] => {
    if (!isRecord(row)) return [];
    return [
      {
        group: readString(row.group),
        rank: readNumber(row.rank) ?? 0,
        teamId: readString(row.teamId),
        teamName: readString(row.teamName),
        points: readNumber(row.points) ?? 0,
        played: readNumber(row.played) ?? 0,
        win: readNumber(row.win) ?? 0,
        draw: readNumber(row.draw) ?? 0,
        lose: readNumber(row.lose) ?? 0,
        goalsFor: readNumber(row.goalsFor) ?? 0,
        goalsAgainst: readNumber(row.goalsAgainst) ?? 0,
        goalsDiff: readNumber(row.goalsDiff) ?? 0,
        description: typeof row.description === "string" ? row.description : null
      }
    ];
  });
}

export interface BattleContextMatchSummary {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  poolsCount: number;
  optionsCount: number;
  dataGapsCount: number;
  dataGaps: string[];
  homeTeamProfile: ReturnType<typeof formatTeamProfile>;
  awayTeamProfile: ReturnType<typeof formatTeamProfile>;
  historicalMatchup: string;
  contextDomains: Array<{ domain: string; status: string; summary: string; error: string }>;
  externalIntel: {
    status: string;
    summary: string;
    injuryNews: string[];
    lineupNews: string[];
    motivation: string[];
    recentFormNews: string[];
    riskSignals: string[];
    sourceLinks: Array<{ title: string; url: string; sourceDomain: string; publishedAt: string | null }>;
    collectedAt: string;
  };
  sourceBreakdown: Array<{ source: string; detail: string }>;
  sportteryPools: Array<{ poolCode: string; options: Array<{ code: string; label: string; value: string; goalLine?: string | null }> }>;
  groupStandings: Array<{
    group: string;
    rank: number;
    teamId: string;
    teamName: string;
    points: number;
    played: number;
    win: number;
    draw: number;
    lose: number;
    goalsFor: number;
    goalsAgainst: number;
    goalsDiff: number;
    description: string | null;
  }>;
  dongqiudiComparison: {
    comprehensive: ContrastPair | null;
    h2h: ContrastPair | null;
    recentForm: ContrastPair | null;
    avgGoals: ContrastPair | null;
    avgConceded: ContrastPair | null;
    marketValue: ContrastPair | null;
    cards: ContrastPair | null;
  } | null;
}

export interface ContrastPair {
  home: string;
  away: string;
}

export interface BattleContextSummary {
  matches: BattleContextMatchSummary[];
  poolsCount: number;
  optionsCount: number;
  dataGapsCount: number;
}

export function getBattleContextSummary(round: BettingArenaRoundDto | null | undefined): BattleContextSummary {
  const battleContext = round?.battleContext;
  const matches = isRecord(battleContext) && Array.isArray(battleContext.matches) ? battleContext.matches : [];
  const matchRows = matches.flatMap((match) => {
    if (!isRecord(match)) return [];
    const sportteryPools = Array.isArray(match.sportteryPools)
      ? match.sportteryPools.flatMap((pool) => {
          if (!isRecord(pool)) return [];
          const options = Array.isArray(pool.options)
            ? pool.options.flatMap((opt) => {
                if (!isRecord(opt)) return [];
                return [{ code: readString(opt.code), label: readString(opt.label), value: readString(opt.value), goalLine: typeof opt.goalLine === "string" || opt.goalLine === null ? opt.goalLine : null }];
              })
            : [];
          return [{ poolCode: readString(pool.poolCode), options }];
        })
      : [];
    const dataGaps = Array.isArray(match.dataGaps) ? match.dataGaps : [];
    const contextDomains = Array.isArray(match.contextDomains)
      ? match.contextDomains.flatMap((domain) => {
          if (!isRecord(domain)) return [];
          return [
            {
              domain: readString(domain.domain),
              status: readString(domain.status),
              summary: readString(domain.summary),
              error: readString(domain.error)
            }
          ];
        })
      : [];
    const externalIntel = isRecord(match.externalIntel) ? match.externalIntel : null;
    const externalIntelSummary = {
      status: readString(externalIntel?.status),
      summary: readString(externalIntel?.summary),
      injuryNews: readStringList(externalIntel?.injuryNews),
      lineupNews: readStringList(externalIntel?.lineupNews),
      motivation: readStringList(externalIntel?.motivation),
      recentFormNews: readStringList(externalIntel?.recentFormNews),
      riskSignals: readStringList(externalIntel?.riskSignals),
      sourceLinks: readSourceLinks(externalIntel?.sourceLinks),
      collectedAt: readString(externalIntel?.collectedAt)
    };
    const optionsCount = sportteryPools.reduce((total, pool) => total + pool.options.length, 0);
    return [
      {
        matchId: readString(match.matchId),
        homeTeamName: readString(match.homeTeamName),
        awayTeamName: readString(match.awayTeamName),
        kickoffAt: readString(match.kickoffAt),
        status: readString(match.status),
        homeScore: readNumber(match.homeScore),
        awayScore: readNumber(match.awayScore),
        poolsCount: sportteryPools.length,
        optionsCount,
        dataGapsCount: dataGaps.length,
        dataGaps: dataGaps.flatMap((item) => {
          const formatted = formatDataGap(item);
          return formatted ? [formatted] : [];
        }),
        homeTeamProfile: formatTeamProfile(match.homeTeamProfile),
        awayTeamProfile: formatTeamProfile(match.awayTeamProfile),
        historicalMatchup: formatHistoricalMatchup(match.historicalMatchup),
        contextDomains,
        externalIntel: externalIntelSummary,
        sourceBreakdown: buildSourceBreakdown({ contextDomains, sportteryPoolsCount: sportteryPools.length, externalIntel: externalIntelSummary }),
        sportteryPools,
        groupStandings: formatGroupStandings(match.groupStandings),
        dongqiudiComparison: formatDongqiudiComparison(match.dongqiudiComparison)
      }
    ];
  });

  return {
    matches: matchRows,
    poolsCount: matchRows.reduce((total, match) => total + match.poolsCount, 0),
    optionsCount: matchRows.reduce((total, match) => total + match.optionsCount, 0),
    dataGapsCount: matchRows.reduce((total, match) => total + match.dataGapsCount, 0)
  };
}

export function getMatchLabel(match: Pick<BattleContextMatchSummary, "homeTeamName" | "awayTeamName">, matchId?: string): string {
  if (!match.homeTeamName && !match.awayTeamName) return matchId ?? "";
  return `${match.homeTeamName || matchId || "主队"} 对 ${match.awayTeamName || "客队"}`;
}
