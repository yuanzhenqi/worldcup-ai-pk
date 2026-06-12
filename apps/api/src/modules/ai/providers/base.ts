import type { PredictionResult } from "@worldcup-ai-pk/shared";

export interface AiPredictionInput {
  matchTitle: string;
  kickoffAt: string;
  stage: string;
  oddsSummary: string;
  apiFootballBaseline: string;
  prompt: string;
}

export interface ParsedAiPrediction {
  predictedResult: PredictionResult;
  predictedHomeScore: number;
  predictedAwayScore: number;
  confidence: number;
  shortReason: string;
  keyFactors: string[];
  oddsInterpretation: string;
  riskPoints: string[];
  rawResponse: string;
}

export interface AiProviderAdapter {
  name: string;
  predict(input: AiPredictionInput): Promise<ParsedAiPrediction>;
}
