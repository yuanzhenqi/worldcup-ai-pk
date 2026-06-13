export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";

export type PredictionResult = "home" | "draw" | "away";

export interface TeamDto {
  id: string;
  name: string;
  displayNameZh: string;
  logoUrl: string | null;
}

export interface MatchDto {
  id: string;
  apiFootballFixtureId: number;
  stage: string;
  kickoffAt: string;
  status: MatchStatus;
  statusLabelZh: string;
  venue: string | null;
  homeTeam: TeamDto;
  awayTeam: TeamDto;
  homeScore: number | null;
  awayScore: number | null;
  hasAiPrediction: boolean;
  canRequestPrediction: boolean;
}

export interface OddsSummaryDto {
  matchId: string;
  capturedAt: string;
  bookmaker: string;
  homeWin: number | null;
  draw: number | null;
  awayWin: number | null;
  handicap: string | null;
  overUnder: string | null;
}

export interface ApiFootballPredictionDto {
  matchId: string;
  predictedWinner: string | null;
  advice: string | null;
  homePercent: string | null;
  drawPercent: string | null;
  awayPercent: string | null;
}

export interface AiPredictionDto {
  id: string;
  matchId: string;
  modelDisplayName: string;
  predictedResult: PredictionResult;
  predictedHomeScore: number;
  predictedAwayScore: number;
  confidence: number;
  shortReason: string;
  keyFactors: string[];
  oddsInterpretation: string;
  riskPoints: string[];
  promptSummary: string;
  createdAt: string;
  score: number | null;
}

export interface LeaderboardRowDto {
  modelId: string;
  modelDisplayName: string;
  totalScore: number;
  finishedMatchesCounted: number;
  resultHits: number;
  resultAccuracy: number;
  exactScoreHits: number;
  recentScores: number[];
}

export type PredictionTaskType =
  | "result_1x2"
  | "scoreline"
  | "odds_interpretation"
  | "player_lineup_impact"
  | "head_to_head"
  | "upset_risk";

export type PredictionOutputStyle = "concise" | "detailed";

export interface PredictionDataOptionsDto {
  useOdds: boolean;
  useApiFootballPrediction: boolean;
  useHeadToHead: boolean;
  usePlayerLineupInjuries: boolean;
}

export type FixtureContextDomain = "odds" | "api_prediction" | "head_to_head" | "squad";

export type FixtureContextDomainStatus = "cached" | "unavailable" | "refresh_failed" | "not_requested";

export interface FixtureContextDomainSummaryDto {
  domain: FixtureContextDomain;
  status: FixtureContextDomainStatus;
  summary: string;
  lastSyncedAt: string | null;
  error: string | null;
}

export interface FixtureContextSummaryDto {
  matchId: string;
  completeness: "full" | "partial" | "base_only";
  domains: FixtureContextDomainSummaryDto[];
  createdAt: string | null;
}

export interface PredictionRequestInputDto {
  taskTypes: PredictionTaskType[];
  dataOptions: PredictionDataOptionsDto;
  promptTemplateId: string | null;
  customPrompt: string;
  outputStyle: PredictionOutputStyle;
  refreshContext: boolean;
}

export interface PredictionRunLogDto {
  level: "info" | "error";
  message: string;
  modelDisplayName: string | null;
  createdAt: string;
}

export interface PredictionRequestResponseDto {
  matchId: string;
  status: "scheduled" | "running" | "completed" | "failed" | "rejected" | "rate_limited";
  message: string;
  scheduledFor: string | null;
  context: FixtureContextSummaryDto | null;
  runId: string | null;
  predictionsCount: number;
  logs: PredictionRunLogDto[];
}

export interface TeamDisplayNameDto {
  apiFootballTeamId: string;
  originalName: string;
  displayNameZh: string;
  logoUrl: string | null;
  source: "seed" | "admin" | "api-football";
}

export interface AdminSummaryDto {
  matchCount: number;
  scheduledCount: number;
  liveCount: number;
  finishedCount: number;
  latestSyncLog: {
    level: string;
    source: string;
    message: string;
    createdAt: string;
  } | null;
}

export interface AiProviderConfigDto {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  enabled: boolean;
  apiKeyConfigured: boolean;
}

export interface AiModelConfigDto {
  id: string;
  providerId: string;
  modelName: string;
  displayName: string;
  enabled: boolean;
}

export interface PromptTemplateConfigDto {
  id: string;
  name: string;
  description: string;
  fullPrompt: string;
  promptSummary: string;
  scope: string;
  enabled: boolean;
  isDefault: boolean;
}
