import type { Database } from "better-sqlite3";
import type { FixtureContextSummaryDto, PredictionDataOptionsDto } from "@worldcup-ai-pk/shared";
import { FootballService } from "../football/football.service";
import { parseApiFootballFixturePrediction, parseFixtureOddsSummary } from "./apiFootballContextParsers";
import { getLatestFixtureContextSummary, saveFixtureContextSnapshot, writeFixtureDataSyncLog } from "./fixtureContext.repository";

interface RefreshFixtureContextInput {
  db: Database;
  matchId: string;
  apiFootballFixtureId: number;
  footballService: FootballService | null;
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
        notRequestedSummary("squad")
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

  domains.push(input.dataOptions.useHeadToHead ? unavailableSummary("head_to_head", "历史交锋接口响应尚未捕获") : notRequestedSummary("head_to_head"));
  domains.push(input.dataOptions.usePlayerLineupInjuries ? unavailableSummary("squad", "球员、阵容、伤停接口响应尚未捕获") : notRequestedSummary("squad"));

  const completeness = getCompleteness(domains);
  saveFixtureContextSnapshot(input.db, { matchId: input.matchId, completeness, domains, raw, now });

  return getFixtureContextSummary(input.db, input.matchId);
}
