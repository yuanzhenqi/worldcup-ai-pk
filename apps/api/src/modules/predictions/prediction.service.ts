import type { MatchStatus } from "@worldcup-ai-pk/shared";

export interface PredictionPlanInput {
  now: Date;
  kickoffAt: Date;
  matchStatus: MatchStatus;
  latestSuccessfulRunAt: Date | null;
}

export interface PredictionPlan {
  status: "scheduled" | "running" | "rejected" | "rate_limited";
  scheduledFor: Date | null;
  message: string;
}

const twoHoursMs = 2 * 60 * 60 * 1000;
const thirtyMinutesMs = 30 * 60 * 1000;

export function planPredictionRequest(input: PredictionPlanInput): PredictionPlan {
  if (input.matchStatus !== "scheduled" || input.now >= input.kickoffAt) {
    return {
      status: "rejected",
      scheduledFor: null,
      message: "Prediction requests are closed after kickoff"
    };
  }

  if (input.latestSuccessfulRunAt && input.now.getTime() - input.latestSuccessfulRunAt.getTime() < thirtyMinutesMs) {
    return {
      status: "rate_limited",
      scheduledFor: null,
      message: "Prediction was already generated within the last 30 minutes"
    };
  }

  const twoHoursBeforeKickoff = new Date(input.kickoffAt.getTime() - twoHoursMs);

  if (input.now < twoHoursBeforeKickoff) {
    return {
      status: "scheduled",
      scheduledFor: twoHoursBeforeKickoff,
      message: "Prediction scheduled for two hours before kickoff"
    };
  }

  return {
    status: "running",
    scheduledFor: input.now,
    message: "Prediction will run immediately"
  };
}
