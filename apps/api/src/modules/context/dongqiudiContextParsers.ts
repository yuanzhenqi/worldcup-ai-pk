import type { FixtureContextDomainStatus } from "@worldcup-ai-pk/shared";

export interface DongqiudiContrastPair {
  home: string;
  away: string;
}

export interface DongqiudiComparison {
  comprehensive: DongqiudiContrastPair | null;
  h2h: DongqiudiContrastPair | null;
  recentForm: DongqiudiContrastPair | null;
  avgGoals: DongqiudiContrastPair | null;
  avgConceded: DongqiudiContrastPair | null;
  marketValue: DongqiudiContrastPair | null;
  cards: DongqiudiContrastPair | null;
}

interface ParsedContextDomain {
  status: FixtureContextDomainStatus;
  summary: string;
  structured: DongqiudiComparison | null;
  raw: unknown;
}

interface ContrastItem {
  title?: unknown;
  team_A?: { match_info?: unknown };
  team_B?: { match_info?: unknown };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getDataArray(response: unknown, sectionKey: string): ContrastItem[] {
  const data = (response as { data?: Record<string, unknown> })?.data;
  const section = data?.[sectionKey];
  if (!section || typeof section !== "object") {
    return [];
  }
  const arr = (section as { data?: unknown }).data;
  return Array.isArray(arr) ? (arr as ContrastItem[]) : [];
}

function findItem(items: ContrastItem[], title: string): ContrastItem | undefined {
  return items.find((item) => typeof item.title === "string" && (item as { title: string }).title === title);
}

function pickPair(item: ContrastItem | undefined): { home: string | null; away: string | null } {
  return {
    home: str(item?.team_A?.match_info),
    away: str(item?.team_B?.match_info)
  };
}

function formatPair(label: string, pair: { home: string | null; away: string | null }): string {
  if (!pair.home && !pair.away) {
    return `${label} 未给出`;
  }
  return `${label} 主${pair.home ?? "-"} / 客${pair.away ?? "-"}`;
}

function toContrastPair(pair: { home: string | null; away: string | null }): DongqiudiContrastPair | null {
  if (!pair.home && !pair.away) return null;
  return { home: pair.home ?? "", away: pair.away ?? "" };
}

/**
 * 解析懂球帝 pre_analyze_data_contrast 响应，产出赛前情报摘要：
 * 综合实力、近6场交锋、近10场战绩、场均进球/失球、身价、近10场场均红黄牌。
 * structured 字段提供主客对比的结构化字段，便于前端展示和模型消费（含身价）。
 */
export function parseDongqiudiIntelSummary(response: unknown): ParsedContextDomain {
  const data = (response as { data?: Record<string, unknown> })?.data;
  const comprehensive = data?.comprehensive;
  const compScoreHome = str((comprehensive as { team_A_score?: unknown })?.team_A_score);
  const compScoreAway = str((comprehensive as { team_B_score?: unknown })?.team_B_score);

  const comprehensiveItems = getDataArray(response, "comprehensive");
  const statisticsItems = getDataArray(response, "statistics");

  const hasData = Boolean(comprehensive) || comprehensiveItems.length > 0 || statisticsItems.length > 0;
  if (!hasData) {
    return { status: "unavailable", summary: "未获取懂球帝情报", structured: null, raw: response };
  }

  const structured: DongqiudiComparison = {
    comprehensive: compScoreHome || compScoreAway ? { home: compScoreHome ?? "", away: compScoreAway ?? "" } : null,
    h2h: toContrastPair(pickPair(findItem(comprehensiveItems, "近6场交锋"))),
    recentForm: toContrastPair(pickPair(findItem(comprehensiveItems, "近10场战绩"))),
    avgGoals: toContrastPair(pickPair(findItem(comprehensiveItems, "场均进球"))),
    avgConceded: toContrastPair(pickPair(findItem(comprehensiveItems, "场均失球"))),
    marketValue: toContrastPair(pickPair(findItem(comprehensiveItems, "身价"))),
    cards: toContrastPair(pickPair(findItem(statisticsItems, "红黄牌")))
  };

  const parts: string[] = [];
  if (structured.comprehensive) {
    parts.push(`综合实力 主${structured.comprehensive.home || "-"} : 客${structured.comprehensive.away || "-"}`);
  }
  parts.push(formatPair("近6场交锋", pickPair(findItem(comprehensiveItems, "近6场交锋"))));
  parts.push(formatPair("近10场战绩", pickPair(findItem(comprehensiveItems, "近10场战绩"))));
  parts.push(formatPair("场均进球", pickPair(findItem(comprehensiveItems, "场均进球"))));
  parts.push(formatPair("场均失球", pickPair(findItem(comprehensiveItems, "场均失球"))));
  parts.push(formatPair("身价", pickPair(findItem(comprehensiveItems, "身价"))));
  parts.push(formatPair("近10场场均红黄牌", pickPair(findItem(statisticsItems, "红黄牌"))));

  return {
    status: "cached",
    summary: parts.join("；"),
    structured,
    raw: response
  };
}
