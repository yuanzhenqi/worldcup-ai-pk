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

/** 送给总结模型的搜索结果条数上限，避免输入/输出过大导致 JSON 被截断。 */
const MAX_SUMMARIZER_INPUT_RESULTS = 12;
/** 单条搜索结果摘要送给总结模型时的字符上限。 */
const MAX_SUMMARIZER_SNIPPET_CHARS = 200;
/** 总结模型未显式配置 max_output_tokens 时使用的输出预算。 */
const DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS = 8000;

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
    `${input.homeTeamName} ${input.awayTeamName} motivation rotation World Cup`,
    `${input.homeTeamName} ${input.awayTeamName} predicted lineup`,
    `${input.homeTeamName} ${input.awayTeamName} recent form last matches`,
    `${input.homeTeamName} ${input.awayTeamName} key players availability`,
    `${input.homeTeamName} ${input.awayTeamName} squad market value`
  ].slice(0, Math.max(1, input.maxQueries));
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];
}

/**
 * 从模型返回文本中提取第一个完整 JSON 对象。
 * 容错模型常见的 markdown 代码块包裹（```json ... ```）、前导说明文字和尾随补充。
 */
function extractFirstJsonObject(content: string): unknown {
  const start = content.indexOf("{");
  if (start < 0) {
    throw new Error("summary JSON object not found");
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
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
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(content.slice(start, index + 1));
      }
    }
  }
  throw new Error("summary JSON object not terminated");
}

function parseSummary(value: string, fallback: ExternalIntelSummaryDto): ExternalIntelSummaryDto {
  try {
    const parsed = extractFirstJsonObject(value) as Partial<ExternalIntelSummaryDto>;
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }
    return {
      // 只要模型返回的 JSON 能解析出来，总结流程就算成功（cached）。模型可能返回 no_search_results 等内部状态，
      // 那代表"搜索无数据"而非"总结失败"，不应降级为 summary_failed。
      status: "cached",
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

  // 限制传给模型的搜索结果条数与每条长度，避免输入过大、输出 JSON 被截断（finish_reason=length）。
  // fallback 的 sourceLinks 仍保留全部结果，只压缩送给总结模型的输入。
  const trimmedResults = input.results.slice(0, MAX_SUMMARIZER_INPUT_RESULTS).map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.snippet.length > MAX_SUMMARIZER_SNIPPET_CHARS ? `${result.snippet.slice(0, MAX_SUMMARIZER_SNIPPET_CHARS)}…` : result.snippet,
    sourceDomain: result.sourceDomain,
    publishedAt: result.publishedAt
  }));

  const prompt = [
    "你是世界杯赛前情报整理员。只根据 search_results 总结，不得编造。",
    "输出紧凑 JSON，字段：status,summary,injuryNews,lineupNews,motivation,recentFormNews,riskSignals,sourceLinks,confidence,dataGaps。",
    "summary 控制在 200 字以内；每个数组最多 5 条、每条不超过 40 字；sourceLinks 只保留最相关的 5 条。",
    `match=${input.homeTeamName} vs ${input.awayTeamName}`,
    `collectedAt=${input.collectedAt}`,
    `search_results=${JSON.stringify(trimmedResults)}`
  ].join("\n");

  const fallback = buildFallbackSummary({
    status: "summary_failed",
    results: input.results,
    collectedAt: input.collectedAt,
    reason: "外部情报总结解析失败"
  });

  try {
    // 总结输出是结构化 JSON，需要足够大的输出预算；尊重模型显式配置，否则用默认上限避免被截断。
    const summarizerConfig = {
      ...model,
      maxOutputTokens: typeof model.maxOutputTokens === "number" && model.maxOutputTokens > 0 ? model.maxOutputTokens : DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS
    };
    const response = await runOpenAiCompatiblePrediction(summarizerConfig, prompt);
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
