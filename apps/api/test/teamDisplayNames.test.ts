import { describe, expect, it } from "vitest";
import { importApiFootballFixturesResponse } from "../src/modules/football/fixtureImport.service";
import { listTeamDisplayNames, updateTeamDisplayName } from "../src/modules/teams/teamDisplayName.repository";
import { createTestDatabase } from "./support/testDatabase";

describe("team display names", () => {
  it("upserts Chinese display names while importing fixtures", () => {
    const { db } = createTestDatabase();

    importApiFootballFixturesResponse(
      db,
      {
        response: [
          {
            fixture: { id: 1489369, date: "2026-06-11T19:00:00+00:00", status: { short: "FT" } },
            league: { round: "Group Stage - 1" },
            teams: {
              home: { id: 16, name: "Mexico", logo: "https://media.api-sports.io/football/teams/16.png" },
              away: { id: 1531, name: "South Africa", logo: "https://media.api-sports.io/football/teams/1531.png" }
            },
            goals: { home: 2, away: 0 }
          }
        ]
      },
      new Date("2026-06-12T13:45:00.000Z")
    );

    expect(listTeamDisplayNames(db, "")).toEqual([
      {
        apiFootballTeamId: "16",
        originalName: "Mexico",
        displayNameZh: "墨西哥",
        logoUrl: "https://media.api-sports.io/football/teams/16.png",
        source: "seed"
      },
      {
        apiFootballTeamId: "1531",
        originalName: "South Africa",
        displayNameZh: "南非",
        logoUrl: "https://media.api-sports.io/football/teams/1531.png",
        source: "seed"
      }
    ]);

    db.close();
  });

  it("does not overwrite admin-edited Chinese display names during import", () => {
    const { db } = createTestDatabase();

    importApiFootballFixturesResponse(db, {
      response: [
        {
          fixture: { id: 1, date: "2026-06-11T19:00:00+00:00", status: { short: "NS" } },
          league: { round: "Group Stage - 1" },
          teams: {
            home: { id: 16, name: "Mexico", logo: null },
            away: { id: 1531, name: "South Africa", logo: null }
          },
          goals: { home: null, away: null }
        }
      ]
    });

    updateTeamDisplayName(db, "16", "墨西哥队");

    importApiFootballFixturesResponse(db, {
      response: [
        {
          fixture: { id: 2, date: "2026-06-12T19:00:00+00:00", status: { short: "NS" } },
          league: { round: "Group Stage - 1" },
          teams: {
            home: { id: 16, name: "Mexico", logo: "https://media.api-sports.io/football/teams/16.png" },
            away: { id: 1531, name: "South Africa", logo: null }
          },
          goals: { home: null, away: null }
        }
      ]
    });

    expect(listTeamDisplayNames(db, "墨西哥队")[0]).toMatchObject({
      apiFootballTeamId: "16",
      originalName: "Mexico",
      displayNameZh: "墨西哥队",
      logoUrl: "https://media.api-sports.io/football/teams/16.png",
      source: "admin"
    });

    db.close();
  });
});
