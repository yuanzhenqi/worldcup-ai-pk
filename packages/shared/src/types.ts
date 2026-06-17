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

export interface LeaderboardActiveRowDto {
  modelId: string;
  modelDisplayName: string;
  predictionsCount: number;
  parsedPredictionsCount: number;
  matchesCovered: number;
  homeWinVotes: number;
  drawVotes: number;
  awayWinVotes: number;
  averageConfidence: number | null;
  latestPredictionAt: string | null;
}

export interface LeaderboardDto {
  settledRows: LeaderboardRowDto[];
  activeRows: LeaderboardActiveRowDto[];
}

export type PredictionTaskType =
  | "result_1x2"
  | "scoreline"
  | "odds_interpretation"
  | "player_lineup_impact"
  | "head_to_head"
  | "upset_risk"
  | "match_analysis"
  | "handicap"
  | "total_goals"
  | "scoreline_combo"
  | "half_full"
  | "single_bet_combo"
  | "parlay_combo";

export type PredictionOutputStyle = "concise" | "detailed";

export interface PredictionDataOptionsDto {
  useOdds: boolean;
  useApiFootballPrediction: boolean;
  useHeadToHead: boolean;
  usePlayerLineupInjuries: boolean;
  useDongqiudiIntel: boolean;
  useSporttery: boolean;
  useTeamProfile: boolean;
}

export type FixtureContextDomain = "odds" | "api_prediction" | "head_to_head" | "squad" | "dongqiudi_intel" | "sporttery" | "team_profile";

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

export type SportteryOddsPoolStatus = "available" | "unavailable";

export interface SportteryOddsOptionDto {
  code: string;
  label: string;
  value: string;
}

export interface SportteryOddsPoolDto {
  poolCode: string;
  status: SportteryOddsPoolStatus;
  goalLine: string | null;
  updateDate: string | null;
  updateTime: string | null;
  options: SportteryOddsOptionDto[];
  raw: unknown;
}

export type AgentRole = "match_analysis" | "single_combo" | "parlay_combo";

export interface MatchAnalysisAgentOutputDto {
  predictedResult: PredictionResult;
  predictedHomeScore: number;
  predictedAwayScore: number;
  confidence: number;
  shortReason: string;
  keyFactors: string[];
  riskPoints: string[];
  analysisReport: string;
  dataGaps: string[];
}

export type BettingRiskLevel = "low" | "medium" | "high";

export interface BettingPlanLegDto {
  poolCode: string;
  selectionCode: string;
  selectionLabel: string;
  reason: string;
}

export interface BettingPlanDto {
  planName: string;
  riskLevel: BettingRiskLevel;
  legs: BettingPlanLegDto[];
  stakeUnits: number;
  expectedScenario: string;
  avoidReason: string | null;
}

export interface SingleCombinationAgentOutputDto {
  summary: string;
  primaryPlan: BettingPlanDto;
  backupPlans: BettingPlanDto[];
  passRecommendation: string;
  riskWarnings: string[];
  dataGaps: string[];
}

export interface ParlayCombinationInputDto {
  matchIds: string[];
  riskLevel: BettingRiskLevel;
  stakeUnits: number;
}

export interface ParlayCombinationRunDto {
  id: string;
  matchIds: string[];
  riskLevel: BettingRiskLevel;
  stakeUnits: number;
  summary: string;
  plans: BettingPlanDto[];
  riskWarnings: string[];
  createdAt: string;
}

export type BettingArenaRoundStatus = "draft" | "generating" | "locked" | "settling" | "settled" | "failed";
export type BettingArenaSlipAction = "bet" | "hold";
export type BettingArenaSlipStatus = "pending" | "accepted" | "invalid" | "generation_failed" | "settled" | "void";
export type BettingArenaRiskLevel = "low" | "medium" | "high";

export interface BettingArenaAccountDto {
  modelId: string;
  modelDisplayName: string;
  initialBankroll: number;
  availableBankroll: number;
  frozenStake: number;
  totalAssetValue: number;
  totalStaked: number;
  totalReturned: number;
  returnRate: number;
  orderCount: number;
  settledOrderCount: number;
  hitCount: number;
  hitRate: number;
  failedGenerationCount: number;
  orderRate: number;
  failureRate: number;
  rank: number;
  lastReview: string;
}

export interface BettingArenaLegDto {
  matchId: string;
  poolCode: string;
  selectionCode: string;
  selectionLabel: string;
  lockedOdds: number;
}

export interface BettingArenaSingleDto extends BettingArenaLegDto {
  stake: number;
  confidence: number;
  rationale: string;
}

export interface BettingArenaParlayDto {
  parlayName: string;
  stake: number;
  legs: BettingArenaLegDto[];
  combinedOdds: number;
  confidence: number;
  rationale: string;
}

export interface BettingArenaSlipDto {
  id: string;
  roundId: string;
  modelId: string;
  modelDisplayName: string;
  action: BettingArenaSlipAction;
  status: BettingArenaSlipStatus;
  totalStake: number;
  potentialReturn: number;
  riskLevel: BettingArenaRiskLevel;
  strategySummary: string;
  bankrollPlan: string;
  singles: BettingArenaSingleDto[];
  parlays: BettingArenaParlayDto[];
  skipReasons: string[];
  dataGaps: string[];
  validationError: string | null;
  settlementSummary: string | null;
  createdAt: string;
}

export interface BettingArenaRoundDto {
  id: string;
  roundDate: string;
  status: BettingArenaRoundStatus;
  lockTime: string;
  eligibleMatchCount: number;
  modelsCount: number;
  totalStaked: number;
  potentialReturn: number;
  settledReturn: number;
  createdAt: string;
  updatedAt: string;
}

export interface BettingArenaDailySummaryDto {
  roundId: string;
  roundDate: string;
  status: BettingArenaRoundStatus;
  totalStaked: number;
  totalReturned: number;
  bestModelDisplayName: string | null;
  worstModelDisplayName: string | null;
}

export interface BettingArenaDto {
  accounts: BettingArenaAccountDto[];
  currentRound: BettingArenaRoundDto | null;
  slips: BettingArenaSlipDto[];
  history: BettingArenaDailySummaryDto[];
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

export interface PredictionRunPredictionDto {
  id: string;
  modelDisplayName: string;
  predictedResult: PredictionResult;
  predictedHomeScore: number;
  predictedAwayScore: number;
  confidence: number;
  shortReason: string;
  keyFactors: string[];
  oddsInterpretation: string;
  riskPoints: string[];
  analysisReport: string;
  matchAnalysis?: MatchAnalysisAgentOutputDto | null;
  singleCombination?: SingleCombinationAgentOutputDto | null;
  sportteryOddsPools?: SportteryOddsPoolDto[];
}

export interface PredictionRunStatusDto {
  runId: string;
  matchId: string;
  status: "running" | "completed" | "failed";
  message: string;
  predictionsCount: number;
  logs: PredictionRunLogDto[];
  predictions: PredictionRunPredictionDto[];
}

export interface PredictionRunHistoryDto {
  matchId: string;
  runs: PredictionRunStatusDto[];
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
  predictions: PredictionRunPredictionDto[];
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
