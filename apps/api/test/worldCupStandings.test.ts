import { describe, expect, it } from "vitest";
import { parseWorldCupStandings, saveWorldCupStandings, loadWorldCupStandings } from "../src/modules/context/worldCupStandings";
import { createTestDatabase } from "./support/testDatabase";

const sampleResponse = {
  response: [
    {
      league: {
        id: 1,
        name: "World Cup",
        standings: [
          [
            { rank: 1, team: { id: 16, name: "Mexico" }, points: 9, goalsDiff: 6, group: "Group A", description: "Round of 32", all: { played: 3, win: 3, draw: 0, lose: 0, goals: { for: 6, against: 0 } } },
            { rank: 2, team: { id: 17, name: "Canada" }, points: 4, goalsDiff: -1, group: "Group A", description: null, all: { played: 3, win: 1, draw: 1, lose: 1, goals: { for: 3, against: 4 } } }
          ],
          [
            { rank: 1, team: { id: 25, name: "Germany" }, points: 7, goalsDiff: 4, group: "Group B", description: "Round of 32", all: { played: 3, win: 2, draw: 1, lose: 0, goals: { for: 5, against: 1 } } }
          ]
        ]
      }
    }
  ]
};

describe("world cup standings", () => {
  it("parses standings into a teamId -> group lookup", () => {
    const standings = parseWorldCupStandings(sampleResponse);
    const groupA = standings.byTeamId.get("16");
    expect(groupA).toHaveLength(2);
    expect(groupA?.[0]).toMatchObject({ teamId: "16", teamName: "Mexico", points: 9, played: 3, description: "Round of 32" });
    expect(groupA?.[1]).toMatchObject({ teamId: "17", teamName: "Canada", points: 4 });
    // 同组另一队反查到同一份榜
    expect(standings.byTeamId.get("17")).toBe(groupA);
    expect(standings.byTeamId.get("25")?.[0]).toMatchObject({ teamId: "25", group: "Group B" });
  });

  it("returns empty standings for malformed response", () => {
    expect(parseWorldCupStandings({}).byTeamId.size).toBe(0);
    expect(parseWorldCupStandings({ response: [] }).byTeamId.size).toBe(0);
  });

  it("persists and reloads standings via app_settings", () => {
    const { db } = createTestDatabase();
    const standings = parseWorldCupStandings(sampleResponse);
    saveWorldCupStandings(db, standings, new Date("2026-06-27T00:00:00.000Z"));

    const reloaded = loadWorldCupStandings(db);
    expect(reloaded.collectedAt).toBe("2026-06-27T00:00:00.000Z");
    const groupA = reloaded.byTeamId.get("16");
    expect(groupA).toHaveLength(2);
    expect(groupA?.[0]).toMatchObject({ teamId: "16", points: 9 });
    // 重载后按 rank 排序
    expect(groupA?.map((r) => r.teamName)).toEqual(["Mexico", "Canada"]);
  });

  it("returns empty when no standings saved", () => {
    const { db } = createTestDatabase();
    const reloaded = loadWorldCupStandings(db);
    expect(reloaded.byTeamId.size).toBe(0);
    expect(reloaded.collectedAt).toBeNull();
  });
});
