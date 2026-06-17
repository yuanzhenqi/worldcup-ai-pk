import { describe, expect, it } from "vitest";
import { buildTeamProfileSummary } from "../src/modules/context/teamProfileContext";

describe("team profile (wc26 bundled data)", () => {
  it("builds a cached summary with coach and playing style for mapped teams", () => {
    const r = buildTeamProfileSummary("Germany", "Curaçao");
    expect(r.status).toBe("cached");
    expect(r.summary).toContain("主队");
    expect(r.summary).toContain("打法");
    expect(r.summary).toContain("教练");
  });

  it("maps alias names (Cape Verde Islands, USA)", () => {
    const r = buildTeamProfileSummary("USA", "Cape Verde Islands");
    expect(r.status).toBe("cached");
    expect(r.summary).toContain("主队");
    expect(r.summary).toContain("客队");
  });

  it("returns unavailable when both teams are not mapped in wc26 data", () => {
    const r = buildTeamProfileSummary("Bosnia & Herzegovina", "Czechia");
    expect(r.status).toBe("unavailable");
  });
});
