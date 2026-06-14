import type { FixtureContextDomainStatus } from "@worldcup-ai-pk/shared";

interface ParsedContextDomain {
  status: FixtureContextDomainStatus;
  summary: string;
  raw: unknown;
}

interface SportterySummaryInput {
  odds: unknown;
  history: unknown;
  tables: unknown;
  result: unknown;
  feature: unknown;
  injuries: unknown;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type Obj = Record<string, unknown>;

/** 从 getMatchList 响应里按 sportteryMatchId 提取单场 oddsList。 */
export function extractOddsForMatch(matchListResponse: unknown, sportteryMatchId: number): unknown | null {
  const value = (matchListResponse as Obj)?.value as Obj | undefined;
  const lists = value?.matchInfoList;
  if (!Array.isArray(lists)) return null;
  for (const day of lists) {
    const subs = (day as Obj)?.subMatchList;
    if (!Array.isArray(subs)) continue;
    const match = subs.find((m) => (m as Obj)?.matchId === sportteryMatchId);
    if (match) return (match as Obj)?.oddsList ?? null;
  }
  return null;
}

function pickOdds(oddsList: unknown, poolCode: string): { h: string | null; d: string | null; a: string | null; goalLine: string | null } {
  const arr = Array.isArray(oddsList) ? (oddsList as Obj[]) : [];
  const item = arr.find((o) => o?.poolCode === poolCode) ?? {};
  return { h: str(item.h), d: str(item.d), a: str(item.a), goalLine: str(item.goalLine) };
}

/**
 * 解析体彩 6 维度数据为赛前情报摘要：
 * 官方胜平负/让球赔率、历史交锋、积分榜、近期战绩、特征胜率、伤停。
 */
export function parseSportterySummary(input: SportterySummaryInput): ParsedContextDomain {
  const parts: string[] = [];

  // 赔率
  const had = pickOdds(input.odds, "HAD");
  const hhad = pickOdds(input.odds, "HHAD");
  if (had.h && had.d && had.a) parts.push(`胜平负赔率 主${had.h}/平${had.d}/客${had.a}`);
  if (hhad.h && hhad.d && hhad.a) parts.push(`让球胜平负 主${hhad.h}/平${hhad.d}/客${hhad.a}${hhad.goalLine ? `(让${hhad.goalLine})` : ""}`);

  // 历史交锋
  const stats = ((input.history as Obj)?.value as Obj)?.statistics as Obj | undefined;
  if (stats && (str(stats.totalLegCnt) || str(stats.winProbability))) {
    parts.push(`历史交锋 ${str(stats.totalLegCnt) ?? "?"}场 胜${str(stats.winProbability) ?? "-"}/平${str(stats.drawProbability) ?? "-"}/负${str(stats.lossProbability) ?? "-"}`);
  }

  // 积分榜
  const tablesVal = ((input.tables as Obj)?.value) as Obj | undefined;
  const fmtTable = (side: unknown): string | null => {
    const total = (side as Obj)?.total ?? side;
    const ranking = str((total as Obj)?.ranking);
    const points = str((total as Obj)?.points);
    return ranking || points ? `排名${ranking ?? "-"}积${points ?? "-"}` : null;
  };
  const homeT = fmtTable(tablesVal?.homeTables);
  const awayT = fmtTable(tablesVal?.awayTables);
  if (homeT || awayT) parts.push(`积分榜 主${homeT ?? "无"} 客${awayT ?? "无"}`);

  // 近期战绩（近3场比分）
  const resultVal = ((input.result as Obj)?.value) as Obj | undefined;
  const fmtRecent = (side: unknown): string | null => {
    const list = (side as Obj)?.matchList;
    if (!Array.isArray(list) || list.length === 0) return null;
    return (list as Obj[])
      .slice(0, 3)
      .map((m) => `${str(m.homeTeamShortName) ?? "?"}${str(m.homeTeamFullCourtGoalCnt) ?? "-"}:${str(m.awayTeamFullCourtGoalCnt) ?? "-"}${str(m.awayTeamShortName) ?? "?"}`)
      .join("、");
  };
  const homeR = fmtRecent(resultVal?.home);
  const awayR = fmtRecent(resultVal?.away);
  if (homeR || awayR) parts.push(`近期 主${homeR ?? "无"} 客${awayR ?? "无"}`);

  // 特征（主客胜率）
  const featVal = ((input.feature as Obj)?.value) as Obj | undefined;
  const ea = featVal?.eachHomeAway as Obj | undefined;
  if (str(ea?.homeScoreRatio) || str(ea?.awayScoreRatio)) {
    parts.push(`近${str(ea?.totalLegCnt) ?? "?"}场胜率 主${str(ea?.homeScoreRatio) ?? "-"}% 客${str(ea?.awayScoreRatio) ?? "-"}%`);
  }

  // 伤停
  const injVal = ((input.injuries as Obj)?.value) as Obj | undefined;
  const fmtInj = (side: unknown): string | null => {
    const list = (side as Obj)?.injuriesAndSuspensionsList;
    if (!Array.isArray(list) || list.length === 0) return null;
    return (list as Obj[])
      .slice(0, 5)
      .map((p) => `${str(p.personName) ?? "?"}${str(p.playerPositionDesc) ? `·${str(p.playerPositionDesc)}` : ""}`)
      .join("、");
  };
  const homeI = fmtInj(injVal?.home);
  const awayI = fmtInj(injVal?.away);
  if (homeI || awayI) parts.push(`伤停 主[${homeI || "无"}] 客[${awayI || "无"}]`);

  if (parts.length === 0) {
    return { status: "unavailable", summary: "未获取体彩数据", raw: input };
  }
  return { status: "cached", summary: parts.join("；"), raw: input };
}
