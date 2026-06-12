export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";

export type PredictionResult = "home" | "draw" | "away";

export interface TeamDto {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface MatchDto {
  id: string;
  apiFootballFixtureId: number;
  stage: string;
  kickoffAt: string;
  status: MatchStatus;
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

export interface PredictionRequestResponseDto {
  matchId: string;
  status: "scheduled" | "running" | "rejected" | "rate_limited";
  message: string;
  scheduledFor: string | null;
}
