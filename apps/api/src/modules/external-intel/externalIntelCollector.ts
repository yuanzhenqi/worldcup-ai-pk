import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { ExternalIntelSummaryDto } from "@worldcup-ai-pk/shared";
import { getAiModelConnectionConfig } from "../admin/adminConfig.repository";
import { runOpenAiCompatiblePrediction } from "../ai/openAiCompatibleClient";
import {
  getExternalIntelSettings,
  getFreshExternalIntelSnapshot,
  insertExternalIntelSnapshot
} from "./externalIntel.repository";
import type { ExternalIntelCollectionResult, ExternalIntelSearchResult } from "./externalIntel.types";
import type { WebSearchProvider } from "./webSearchProvider";

export interface ExternalIntelQueryInput {
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: string;
  maxQueries: number;
}

export interface CollectExternalIntelInput {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: string;
  maxQueries?: number;
  webSearchProvider: WebSearchProvider;
  now: Date;
  forceRefresh: boolean;
}

export function buildExternalIntelQueries(input: ExternalIntelQueryInput): string[] {
  return [
    `${input.homeTeamName} ${input.awayTeamName} 伤停 首发 世界杯`,
    `${input.homeTeamName} ${input.awayTeamName} injury lineup World Cup`,
    `${input.homeTeamName} ${input.awayTeamName} press conference team news`,
    `${input.homeTeamName} ${input.awayTeamName} motivation rotation World Cup`
  ].slice(0, Math.max(1, input.maxQueries));
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];
}

function parseSummary(value: string, fallback: ExternalIntelSummaryDto): ExternalIntelSummaryDto {
  try {
    const parsed = JSON.parse(value) as Partial<ExternalIntelSummaryDto>;
    return {
      status: parsed.status === "cached" ? "cached" : fallback.status,
      summary: typeof parsed.summary === "string" ? parsed.summary : fallback.summary,
      injuryNews: readStringArray(parsed.injuryNews),
      lineupNews: readStringArray(parsed.lineupNews),
      motivation: readStringArray(parsed.motivation),
      recentFormNews: readStringArray(parsed.recentFormNews),
      riskSignals: readStringArray(parsed.riskSignals),
      sourceLinks: Array.isArray(parsed.sourceLinks) ? parsed.sourceLinks : fallback.sourceLinks,
      confidence: parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low" ? parsed.confidence : "low",
      dataGaps: Array.isArray(parsed.dataGaps) ? parsed.dataGaps : fallback.dataGaps,
      collectedAt: fallback.collectedAt
    };
  } catch {
    return fallback;
  }
}

function buildFallbackSummary(input: {
  status: ExternalIntelSummaryDto["status"];
  results: ExternalIntelSearchResult[];
  collectedAt: string;
  reason: string;
  extraDataGaps?: ExternalIntelSummaryDto["dataGaps"];
}): ExternalIntelSummaryDto {
  return {
    status: input.status,
    summary: input.results.length > 0 ? input.results.map((result) => `${result.title}：${result.snippet}`).join("；") : "",
    injuryNews: [],
    lineupNews: [],
    motivation: [],
    recentFormNews: [],
    riskSignals: [],
    sourceLinks: input.results.map((result) => ({
      title: result.title,
      url: result.url,
      sourceDomain: result.sourceDomain,
      publishedAt: result.publishedAt
    })),
    confidence: "low",
    dataGaps: [{ source: "external_intel", code: input.status, message: input.reason }, ...(input.extraDataGaps ?? [])],
    collectedAt: input.collectedAt
  };
}

async function summarizeWithModel(
  db: Database,
  input: {
    modelId: string;
    homeTeamName: string;
    awayTeamName: string;
    results: ExternalIntelSearchResult[];
    collectedAt: string;
  }
): Promise<ExternalIntelSummaryDto> {
  if (!input.modelId) {
    return buildFallbackSummary({
      status: "summary_failed",
      results: input.results,
      collectedAt: input.collectedAt,
      reason: "未配置外部情报总结模型"
    });
  }

  let model: ReturnType<typeof getAiModelConnectionConfig>;
  try {
    model = getAiModelConnectionConfig(db, input.modelId);
  } catch {
    return buildFallbackSummary({
      status: "summary_failed",
      results: input.results,
      collectedAt: input.collectedAt,
      reason: "外部情报总结模型不存在或未启用"
    });
  }

  const prompt = [
    "你是世界杯赛前情报整理员。只根据 search_results 总结，不得编造。",
    "输出 JSON，字段：status,summary,injuryNews,lineupNews,motivation,recentFormNews,riskSignals,sourceLinks,confidence,dataGaps。",
    `match=${input.homeTeamName} vs ${input.awayTeamName}`,
    `collectedAt=${input.collectedAt}`,
    `search_results=${JSON.stringify(input.results)}`
  ].join("\n");

  const fallback = buildFallbackSummary({
    status: "summary_failed",
    results: input.results,
    collectedAt: input.collectedAt,
    reason: "外部情报总结解析失败"
  });

  try {
    const response = await runOpenAiCompatiblePrediction(model, prompt);
    return parseSummary(response.content, fallback);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildFallbackSummary({
      status: "summary_failed",
      results: input.results,
      collectedAt: input.collectedAt,
      reason: `外部情报总结失败：${message}`
    });
  }
}

export async function collectExternalIntelForMatch(db: Database, input: CollectExternalIntelInput): Promise<ExternalIntelCollectionResult> {
  const settings = getExternalIntelSettings(db);
  const collectedAt = input.now.toISOString();
  const expiresAt = new Date(input.now.getTime() + settings.cacheMinutes * 60_000).toISOString();

  if (!settings.enabled) {
    const summary = buildFallbackSummary({
      status: "not_configured",
      results: [],
      collectedAt,
      reason: "统一外部情报采集未启用"
    });
    return { matchId: input.matchId, status: "not_configured", queries: [], searchResults: [], summary, dataGaps: summary.dataGaps };
  }

  if (!input.forceRefresh) {
    const fresh = getFreshExternalIntelSnapshot(db, { matchId: input.matchId, now: input.now });
    if (fresh) {
      const summary = JSON.parse(fresh.summary_json) as ExternalIntelSummaryDto;
      const results = JSON.parse(fresh.search_results_json) as ExternalIntelSearchResult[];
      return {
        matchId: input.matchId,
        status: fresh.status,
        queries: JSON.parse(fresh.query_json) as string[],
        searchResults: results,
        summary,
        dataGaps: summary.dataGaps
      };
    }
  }

  const queries = buildExternalIntelQueries({ ...input, maxQueries: input.maxQueries ?? settings.maxQueriesPerMatch });

  try {
    const settledResults = await Promise.allSettled(
      queries.map((query) => input.webSearchProvider.search({ query, maxResults: settings.maxResultsPerQuery }))
    );
    const failedSearchMessages = settledResults.flatMap((result) => {
      if (result.status === "fulfilled") return [];
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      return [message];
    });
    const byUrl = new Map<string, ExternalIntelSearchResult>();
    for (const result of settledResults.flatMap((item) => (item.status === "fulfilled" ? item.value : []))) {
      if (result.url && !byUrl.has(result.url)) {
        byUrl.set(result.url, result);
      }
    }

    const searchResults = [...byUrl.values()].slice(0, settings.maxResultsPerQuery * settings.maxQueriesPerMatch);
    const summary = await summarizeWithModel(db, {
      modelId: settings.summarizerModelId,
      homeTeamName: input.homeTeamName,
      awayTeamName: input.awayTeamName,
      results: searchResults,
      collectedAt
    });
    if (failedSearchMessages.length > 0) {
      summary.dataGaps = [
        ...summary.dataGaps,
        ...failedSearchMessages.map((message) => ({
          source: "external_intel",
          code: "search_partial_failed",
          message: `部分外部情报搜索失败：${message}`
        }))
      ];
    }
    const status = summary.status;

    insertExternalIntelSnapshot(db, {
      id: randomUUID(),
      matchId: input.matchId,
      provider: settings.provider,
      queryJson: JSON.stringify(queries),
      searchResultsJson: JSON.stringify(searchResults),
      summaryJson: JSON.stringify(summary),
      status,
      error: null,
      collectedAt,
      expiresAt,
      createdAt: collectedAt
    });

    return { matchId: input.matchId, status, queries, searchResults, summary, dataGaps: summary.dataGaps };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const summary = buildFallbackSummary({
      status: "failed",
      results: [],
      collectedAt,
      reason: `外部情报采集失败：${message}`
    });

    insertExternalIntelSnapshot(db, {
      id: randomUUID(),
      matchId: input.matchId,
      provider: settings.provider,
      queryJson: JSON.stringify(queries),
      searchResultsJson: "[]",
      summaryJson: JSON.stringify(summary),
      status: "failed",
      error: message,
      collectedAt,
      expiresAt,
      createdAt: collectedAt
    });

    return { matchId: input.matchId, status: "failed", queries, searchResults: [], summary, dataGaps: summary.dataGaps };
  }
}
