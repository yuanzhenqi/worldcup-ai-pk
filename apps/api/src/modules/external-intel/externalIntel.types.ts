import type {
  ExternalIntelSettingsDto,
  ExternalIntelStatus,
  ExternalIntelSummaryDto,
  StructuredDataGapDto
} from "@worldcup-ai-pk/shared";

export type ExternalIntelSettings = ExternalIntelSettingsDto;

export interface SaveExternalIntelSettingsInput {
  enabled: boolean;
  provider: "duckduckgo_html";
  summarizerModelId: string;
  cacheMinutes: number;
  maxResultsPerQuery: number;
  maxQueriesPerMatch: number;
}

export interface ExternalIntelSearchResult {
  title: string;
  url: string;
  snippet: string;
  sourceDomain: string;
  publishedAt: string | null;
}

export interface ExternalIntelSnapshotRow {
  id: string;
  match_id: string;
  provider: string;
  query_json: string;
  search_results_json: string;
  summary_json: string;
  status: ExternalIntelStatus;
  error: string | null;
  collected_at: string;
  expires_at: string;
  created_at: string;
}

export interface InsertExternalIntelSnapshotInput {
  id: string;
  matchId: string;
  provider: string;
  queryJson: string;
  searchResultsJson: string;
  summaryJson: string;
  status: ExternalIntelStatus;
  error: string | null;
  collectedAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface ExternalIntelCollectionResult {
  matchId: string;
  status: ExternalIntelStatus;
  queries: string[];
  searchResults: ExternalIntelSearchResult[];
  summary: ExternalIntelSummaryDto;
  dataGaps: Array<string | StructuredDataGapDto>;
}
