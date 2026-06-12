import { describe, expect, it } from "vitest";
import { planPredictionRequest } from "../src/modules/predictions/prediction.service";

describe("planPredictionRequest", () => {
  it("schedules at two hours before kickoff when kickoff is more than two hours away", () => {
    const result = planPredictionRequest({
      now: new Date("2026-06-12T10:00:00.000Z"),
      kickoffAt: new Date("2026-06-12T15:00:00.000Z"),
      matchStatus: "scheduled",
      latestSuccessfulRunAt: null
    });

    expect(result).toEqual({
      status: "scheduled",
      scheduledFor: new Date("2026-06-12T13:00:00.000Z"),
      message: "Prediction scheduled for two hours before kickoff"
    });
  });

  it("runs immediately when kickoff is less than two hours away", () => {
    const result = planPredictionRequest({
      now: new Date("2026-06-12T13:30:00.000Z"),
      kickoffAt: new Date("2026-06-12T15:00:00.000Z"),
      matchStatus: "scheduled",
      latestSuccessfulRunAt: null
    });

    expect(result).toEqual({
      status: "running",
      scheduledFor: new Date("2026-06-12T13:30:00.000Z"),
      message: "Prediction will run immediately"
    });
  });

  it("rejects requests after kickoff", () => {
    const result = planPredictionRequest({
      now: new Date("2026-06-12T15:01:00.000Z"),
      kickoffAt: new Date("2026-06-12T15:00:00.000Z"),
      matchStatus: "live",
      latestSuccessfulRunAt: null
    });

    expect(result.status).toBe("rejected");
  });

  it("rate limits reruns within 30 minutes", () => {
    const result = planPredictionRequest({
      now: new Date("2026-06-12T13:20:00.000Z"),
      kickoffAt: new Date("2026-06-12T15:00:00.000Z"),
      matchStatus: "scheduled",
      latestSuccessfulRunAt: new Date("2026-06-12T13:00:00.000Z")
    });

    expect(result.status).toBe("rate_limited");
  });
});
