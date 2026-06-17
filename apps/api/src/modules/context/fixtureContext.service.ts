import type { Database } from "better-sqlite3";
import type { FixtureContextSummaryDto, PredictionDataOptionsDto } from "@worldcup-ai-pk/shared";
import { FootballService } from "../football/football.service";
import { parseApiFootballFixturePrediction, parseFixtureHeadToHeadSummary, parseFixtureOddsSummary, parseFixtureSquadSummary } from "./apiFootballContextParsers";
import { parseDongqiudiIntelSummary } from "./dongqiudiContextParsers";
import type { DongqiudiClient } from "../football/dongqiudiClient";
import { extractOddsForMatch, parseSportteryOddsPools, parseSportterySummary } from "./sportteryContextParsers";
import type { SportteryClient } from "../football/sportteryClient";
import { buildTeamProfileSummary } from "./teamProfileContext";
import { ensureSportteryMappingForFixture } from "../football/sportteryMapping.repository";
import { getLatestFixtureContextSummary, saveFixtureContextSnapshot, writeFixtureDataSyncLog } from "./fixtureContext.repository";

interface RefreshFixtureContextInput {
  db: Database;
  matchId: string;
  apiFootballFixtureId: number;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  footballService: FootballService | null;
  dongqiudiClient: DongqiudiClient | null;
  dongqiudiMatchId: number | null;
  sportteryClient: SportteryClient | null;
  sportteryMatchId: number | null;
  dataOptions: PredictionDataOptionsDto;
  now?: Date;
}

function getCompleteness(domains: FixtureContextSummaryDto["domains"]): FixtureContextSummaryDto["completeness"] {
  const requestedDomains = domains.filter((domain) => domain.status !== "not_requested");
  if (requestedDomains.length === 0) {
    return "base_only";
  }

  return requestedDomains.every((domain) => domain.status === "cached") ? "full" : "partial";
}

function unavailableSummary(domain: FixtureContextSummaryDto["domains"][number]["domain"], summary: string): FixtureContextSummaryDto["domains"][number] {
  return {
    domain,
    status: "unavailable",
    summary,
    lastSyncedAt: null,
    error: null
  };
}

function notRequestedSummary(domain: FixtureContextSummaryDto["domains"][number]["domain"]): FixtureContextSummaryDto["domains"][number] {
  return {
    domain,
    status: "not_requested",
    summary: "未请求",
    lastSyncedAt: null,
    error: null
  };
}

export function getFixtureContextSummary(db: Database, matchId: string): FixtureContextSummaryDto {
  return (
    getLatestFixtureContextSummary(db, matchId) ?? {
      matchId,
      completeness: "base_only",
      createdAt: null,
      domains: [
        notRequestedSummary("odds"),
        notRequestedSummary("api_prediction"),
        notRequestedSummary("head_to_head"),
        notRequestedSummary("squad"),
        notRequestedSummary("dongqiudi_intel"),
        notRequestedSummary("sporttery"),
        notRequestedSummary("team_profile")
      ]
    }
  );
}

export async function refreshFixtureContext(input: RefreshFixtureContextInput): Promise<FixtureContextSummaryDto> {
  const now = input.now ?? new Date();
  const domains: FixtureContextSummaryDto["domains"] = [];
  const raw: Record<string, unknown> = {};

  if (input.dataOptions.useOdds && input.footballService) {
    try {
      const oddsResponse = await input.footballService.getFixtureOdds(input.apiFootballFixtureId);
      const parsed = parseFixtureOddsSummary(oddsResponse);
      raw.odds = parsed.raw;
      domains.push({ domain: "odds", status: parsed.status, summary: parsed.summary, lastSyncedAt: now.toISOString(), error: null });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "odds", status: parsed.status, error: null, now });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fixture odds refresh failed";
      domains.push({ domain: "odds", status: "refresh_failed", summary: "未获取赔率", lastSyncedAt: now.toISOString(), error: message });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "odds", status: "refresh_failed", error: message, now });
    }
  } else {
    domains.push(notRequestedSummary("odds"));
  }

  if (input.dataOptions.useApiFootballPrediction && input.footballService) {
    try {
      const predictionResponse = await input.footballService.getFixturePrediction(input.apiFootballFixtureId);
      const parsed = parseApiFootballFixturePrediction(predictionResponse);
      raw.apiPrediction = parsed.raw;
      domains.push({ domain: "api_prediction", status: parsed.status, summary: parsed.summary, lastSyncedAt: now.toISOString(), error: null });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "api_prediction", status: parsed.status, error: null, now });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fixture prediction refresh failed";
      domains.push({ domain: "api_prediction", status: "refresh_failed", summary: "未获取 API-Football 官方预测", lastSyncedAt: now.toISOString(), error: message });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "api_prediction", status: "refresh_failed", error: message, now });
    }
  } else {
    domains.push(notRequestedSummary("api_prediction"));
  }

  if (input.dataOptions.useHeadToHead && input.footballService) {
    try {
      const headToHeadResponse = await input.footballService.getHeadToHead(input.homeTeamId, input.awayTeamId);
      const parsed = parseFixtureHeadToHeadSummary(headToHeadResponse);
      raw.headToHead = parsed.raw;
      domains.push({ domain: "head_to_head", status: parsed.status, summary: parsed.summary, lastSyncedAt: now.toISOString(), error: null });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "head_to_head", status: parsed.status, error: null, now });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fixture head-to-head refresh failed";
      domains.push({ domain: "head_to_head", status: "refresh_failed", summary: "未获取历史交锋", lastSyncedAt: now.toISOString(), error: message });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "head_to_head", status: "refresh_failed", error: message, now });
    }
  } else {
    domains.push(notRequestedSummary("head_to_head"));
  }

  if (input.dataOptions.usePlayerLineupInjuries && input.footballService) {
    try {
      const [injuriesResponse, lineupsResponse, homeSquadResponse, awaySquadResponse] = await Promise.all([
        input.footballService.getFixtureInjuries(input.apiFootballFixtureId),
        input.footballService.getFixtureLineups(input.apiFootballFixtureId),
        input.footballService.getTeamSquad(input.homeTeamId),
        input.footballService.getTeamSquad(input.awayTeamId)
      ]);
      const parsed = parseFixtureSquadSummary({
        injuries: injuriesResponse,
        lineups: lineupsResponse,
        homeSquad: homeSquadResponse,
        awaySquad: awaySquadResponse
      });
      raw.squad = parsed.raw;
      domains.push({ domain: "squad", status: parsed.status, summary: parsed.summary, lastSyncedAt: now.toISOString(), error: null });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "squad", status: parsed.status, error: null, now });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fixture squad refresh failed";
      domains.push({ domain: "squad", status: "refresh_failed", summary: "未获取球员、阵容、伤停信息", lastSyncedAt: now.toISOString(), error: message });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "squad", status: "refresh_failed", error: message, now });
    }
  } else {
    domains.push(notRequestedSummary("squad"));
  }

  if (input.dataOptions.useDongqiudiIntel && input.dongqiudiClient && input.dongqiudiMatchId) {
    try {
      const dongqiudiResponse = await input.dongqiudiClient.getPreAnalyzeContrast(input.dongqiudiMatchId);
      const parsed = parseDongqiudiIntelSummary(dongqiudiResponse);
      raw.dongqiudiIntel = parsed.raw;
      domains.push({ domain: "dongqiudi_intel", status: parsed.status, summary: parsed.summary, lastSyncedAt: now.toISOString(), error: null });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "dongqiudi_intel", status: parsed.status, error: null, now });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dongqiudi intel refresh failed";
      domains.push({ domain: "dongqiudi_intel", status: "refresh_failed", summary: "未获取懂球帝情报", lastSyncedAt: now.toISOString(), error: message });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "dongqiudi_intel", status: "refresh_failed", error: message, now });
    }
  } else {
    domains.push(notRequestedSummary("dongqiudi_intel"));
  }

  if (input.dataOptions.useSporttery && input.sportteryClient) {
    try {
      const matchList = await input.sportteryClient.getMatchList();
      const ensuredMapping = input.sportteryMatchId
        ? { sportteryMatchId: input.sportteryMatchId }
        : ensureSportteryMappingForFixture(input.db, {
            apiFootballFixtureId: input.apiFootballFixtureId,
            homeTeamName: input.homeTeamName,
            awayTeamName: input.awayTeamName,
            sportteryMatchList: matchList,
            now
          });

      if (!ensuredMapping) {
        domains.push({ domain: "sporttery", status: "unavailable", summary: "体彩暂未覆盖该场比赛", lastSyncedAt: now.toISOString(), error: null });
        writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "sporttery", status: "unavailable", error: null, now });
      } else {
        const [history, tables, result, feature, injuries] = await Promise.all([
          input.sportteryClient.getResultHistory(ensuredMapping.sportteryMatchId),
          input.sportteryClient.getMatchTables(ensuredMapping.sportteryMatchId),
          input.sportteryClient.getMatchResult(ensuredMapping.sportteryMatchId),
          input.sportteryClient.getMatchFeature(ensuredMapping.sportteryMatchId),
          input.sportteryClient.getInjurySuspension(ensuredMapping.sportteryMatchId)
        ]);
        const odds = extractOddsForMatch(matchList, ensuredMapping.sportteryMatchId);
        const parsed = parseSportterySummary({ odds, history, tables, result, feature, injuries });
        raw.sporttery = {
          ...parsed.raw,
          oddsPools: parseSportteryOddsPools(odds)
        };
        domains.push({ domain: "sporttery", status: parsed.status, summary: parsed.summary, lastSyncedAt: now.toISOString(), error: null });
        writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "sporttery", status: parsed.status, error: null, now });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sporttery refresh failed";
      domains.push({ domain: "sporttery", status: "refresh_failed", summary: "未获取体彩数据", lastSyncedAt: now.toISOString(), error: message });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "sporttery", status: "refresh_failed", error: message, now });
    }
  } else {
    domains.push(notRequestedSummary("sporttery"));
  }

  if (input.dataOptions.useTeamProfile) {
    try {
      const homeOriginal = input.db.prepare("SELECT original_name FROM team_display_names WHERE api_football_team_id = ?").get(input.homeTeamId) as { original_name: string } | undefined;
      const awayOriginal = input.db.prepare("SELECT original_name FROM team_display_names WHERE api_football_team_id = ?").get(input.awayTeamId) as { original_name: string } | undefined;
      const parsed = buildTeamProfileSummary(homeOriginal?.original_name ?? input.homeTeamName, awayOriginal?.original_name ?? input.awayTeamName);
      raw.teamProfile = parsed.raw;
      domains.push({ domain: "team_profile", status: parsed.status, summary: parsed.summary, lastSyncedAt: now.toISOString(), error: null });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "team_profile", status: parsed.status, error: null, now });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Team profile refresh failed";
      domains.push({ domain: "team_profile", status: "refresh_failed", summary: "未获取球队资料", lastSyncedAt: now.toISOString(), error: message });
      writeFixtureDataSyncLog(input.db, { matchId: input.matchId, domain: "team_profile", status: "refresh_failed", error: message, now });
    }
  } else {
    domains.push(notRequestedSummary("team_profile"));
  }

  const completeness = getCompleteness(domains);
  saveFixtureContextSnapshot(input.db, { matchId: input.matchId, completeness, domains, raw, now });

  return getFixtureContextSummary(input.db, input.matchId);
}
