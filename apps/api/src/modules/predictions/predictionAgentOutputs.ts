import type {
  BettingPlanDto,
  BettingRiskLevel,
  MatchAnalysisAgentOutputDto,
  PredictionResult,
  SingleCombinationAgentOutputDto
} from "@worldcup-ai-pk/shared";

function parseJsonObject(content: string): Record<string, unknown> {
  const fencedMatch = /```json\s*([\s\S]*?)\s*```/.exec(content);
  let jsonText: string;
  if (fencedMatch) {
    jsonText = fencedMatch[1];
  } else {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      throw new Error("AI response JSON parse failed: object braces not found");
    }
    jsonText = content.slice(firstBrace, lastBrace + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`AI response JSON parse failed: ${message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI response JSON must be an object");
  }
  return parsed as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") throw new Error(`AI response field ${fieldName} must be a string`);
  return value;
}

function requireStringOrNull(value: unknown, fieldName: string): string | null {
  if (value === null) return null;
  return requireString(value, fieldName);
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") throw new Error(`AI response field ${fieldName} must be a number`);
  return value;
}

function requireConfidence(value: unknown): number {
  const confidence = requireNumber(value, "confidence");
  if (confidence < 0 || confidence > 1) {
    throw new Error("AI response field confidence must be between 0 and 1");
  }
  return confidence;
}

function requireInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`AI response field ${fieldName} must be an integer`);
  }
  return value;
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`AI response field ${fieldName} must be a string array`);
  }
  return value;
}

function requirePredictionResult(value: unknown): PredictionResult {
  if (value === "home" || value === "draw" || value === "away") return value;
  throw new Error("AI response field predicted_result is invalid");
}

function requireRiskLevel(value: unknown, fieldName: string): BettingRiskLevel {
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error(`AI response field ${fieldName} is invalid`);
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`AI response field ${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parsePlan(value: unknown, fieldName: string): BettingPlanDto {
  const record = requireRecord(value, fieldName);
  const legsValue = record.legs;
  if (!Array.isArray(legsValue)) {
    throw new Error(`AI response field ${fieldName}.legs must be an array`);
  }
  return {
    planName: requireString(record.plan_name, `${fieldName}.plan_name`),
    riskLevel: requireRiskLevel(record.risk_level, `${fieldName}.risk_level`),
    legs: legsValue.map((legValue, index) => {
      const leg = requireRecord(legValue, `${fieldName}.legs[${index}]`);
      return {
        poolCode: requireString(leg.pool_code, `${fieldName}.legs[${index}].pool_code`),
        selectionCode: requireString(leg.selection_code, `${fieldName}.legs[${index}].selection_code`),
        selectionLabel: requireString(leg.selection_label, `${fieldName}.legs[${index}].selection_label`),
        reason: requireString(leg.reason, `${fieldName}.legs[${index}].reason`)
      };
    }),
    stakeUnits: requireInteger(record.stake_units, `${fieldName}.stake_units`),
    expectedScenario: requireString(record.expected_scenario, `${fieldName}.expected_scenario`),
    avoidReason: requireStringOrNull(record.avoid_reason, `${fieldName}.avoid_reason`)
  };
}

export function parseMatchAnalysisOutput(content: string): MatchAnalysisAgentOutputDto {
  const record = parseJsonObject(content);
  return {
    predictedResult: requirePredictionResult(record.predicted_result),
    predictedHomeScore: requireInteger(record.predicted_home_score, "predicted_home_score"),
    predictedAwayScore: requireInteger(record.predicted_away_score, "predicted_away_score"),
    confidence: requireConfidence(record.confidence),
    shortReason: requireString(record.short_reason, "short_reason"),
    keyFactors: requireStringArray(record.key_factors, "key_factors"),
    riskPoints: requireStringArray(record.risk_points, "risk_points"),
    analysisReport: requireString(record.analysis_report, "analysis_report"),
    dataGaps: requireStringArray(record.data_gaps, "data_gaps")
  };
}

export function parseSingleCombinationOutput(content: string): SingleCombinationAgentOutputDto {
  const record = parseJsonObject(content);
  const backupPlansValue = record.backup_plans;
  if (!Array.isArray(backupPlansValue)) {
    throw new Error("AI response field backup_plans must be an array");
  }
  return {
    summary: requireString(record.summary, "summary"),
    primaryPlan: parsePlan(record.primary_plan, "primary_plan"),
    backupPlans: backupPlansValue.map((plan, index) => parsePlan(plan, `backup_plans[${index}]`)),
    passRecommendation: requireString(record.pass_recommendation, "pass_recommendation"),
    riskWarnings: requireStringArray(record.risk_warnings, "risk_warnings"),
    dataGaps: requireStringArray(record.data_gaps, "data_gaps")
  };
}
