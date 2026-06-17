import type { FixtureContextDomainStatus } from "@worldcup-ai-pk/shared";
import { getWc26Injuries, getWc26Matchup, getWc26TeamProfile, resolveWc26TeamId } from "../../data/wc26";

interface ParsedContextDomain {
  status: FixtureContextDomainStatus;
  summary: string;
  raw: unknown;
}

function fmtProfile(teamId: string | null): string | null {
  if (!teamId) return null;
  const profile = getWc26TeamProfile(teamId);
  if (!profile) return null;
  const keyPlayers = profile.key_players.slice(0, 3).map((k) => `${k.name}(${k.position})`).join("、");
  return `教练${profile.coach}，打法：${profile.playing_style}${keyPlayers ? `，核心：${keyPlayers}` : ""}`;
}

function fmtInjuries(teamId: string | null): string | null {
  if (!teamId) return null;
  const list = getWc26Injuries(teamId);
  if (list.length === 0) return null;
  return list.slice(0, 5).map((i) => `${i.player}·${i.status}`).join("、");
}

/**
 * 基于 wc26-mcp bundled 静态数据构建球队深度资料摘要：
 * 教练/打法/核心球员/伤停/世界杯交锋。离线数据，无需 API 调用。
 */
export function buildTeamProfileSummary(homeTeamName: string, awayTeamName: string): ParsedContextDomain {
  const homeId = resolveWc26TeamId(homeTeamName);
  const awayId = resolveWc26TeamId(awayTeamName);
  const homeProfile = fmtProfile(homeId);
  const awayProfile = fmtProfile(awayId);
  const homeInj = fmtInjuries(homeId);
  const awayInj = fmtInjuries(awayId);
  const matchup = homeId && awayId ? getWc26Matchup(homeId, awayId) : null;

  if (!homeProfile && !awayProfile && !matchup) {
    return { status: "unavailable", summary: "未获取球队资料", raw: null };
  }

  const parts: string[] = [];
  if (homeProfile) parts.push(`主队：${homeProfile}`);
  if (awayProfile) parts.push(`客队：${awayProfile}`);
  if (homeInj || awayInj) parts.push(`伤停：主[${homeInj || "无"}] 客[${awayInj || "无"}]`);
  if (matchup) {
    const homeIsA = matchup.team_a === homeId;
    const homeWins = homeIsA ? matchup.team_a_wins : matchup.team_b_wins;
    const awayWins = homeIsA ? matchup.team_b_wins : matchup.team_a_wins;
    parts.push(`世界杯交锋：${matchup.total_matches}场 主${homeWins}胜${matchup.draws}平${awayWins}负（${matchup.summary.slice(0, 80)}）`);
  }

  return { status: "cached", summary: parts.join("；"), raw: { homeId, awayId } };
}
