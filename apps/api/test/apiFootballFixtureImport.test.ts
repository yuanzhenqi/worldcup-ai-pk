import { describe, expect, it } from "vitest";
import { importApiFootballFixturesResponse } from "../src/modules/football/fixtureImport.service";
import { listMatches } from "../src/modules/matches/match.repository";
import { createTestDatabase } from "./support/testDatabase";

describe("importApiFootballFixturesResponse", () => {
  it("imports API-Football fixtures into matches table", () => {
    const { db } = createTestDatabase();

    const imported = importApiFootballFixturesResponse(
      db,
      {
        response: [
          {
            fixture: {
              id: 1489369,
              date: "2026-06-11T19:00:00+00:00",
              venue: {
                name: "Estadio Azteca"
              },
              status: {
                short: "FT"
              }
            },
            league: {
              round: "Group Stage - 1"
            },
            teams: {
              home: {
                id: 16,
                name: "Mexico",
                logo: "https://media.api-sports.io/football/teams/16.png"
              },
              away: {
                id: 1531,
                name: "South Africa",
                logo: "https://media.api-sports.io/football/teams/1531.png"
              }
            },
            goals: {
              home: 2,
              away: 0
            }
          },
          {
            fixture: {
              id: 1539000,
              date: "2026-06-12T19:00:00+00:00",
              venue: {
                name: "BMO Field"
              },
              status: {
                short: "NS"
              }
            },
            league: {
              round: "Group Stage - 1"
            },
            teams: {
              home: {
                id: 5529,
                name: "Canada",
                logo: "https://media.api-sports.io/football/teams/5529.png"
              },
              away: {
                id: 1113,
                name: "Bosnia & Herzegovina",
                logo: "https://media.api-sports.io/football/teams/1113.png"
              }
            },
            goals: {
              home: null,
              away: null
            }
          }
        ]
      },
      new Date("2026-06-12T13:45:00.000Z")
    );

    expect(imported).toEqual({ imported: 2 });
    expect(listMatches(db)).toEqual([
      {
        id: "api-football-1489369",
        apiFootballFixtureId: 1489369,
        stage: "Group Stage - 1",
        kickoffAt: "2026-06-11T19:00:00.000Z",
        status: "finished",
        venue: "Estadio Azteca",
        homeTeam: {
          id: "16",
          name: "Mexico",
          logoUrl: "https://media.api-sports.io/football/teams/16.png"
        },
        awayTeam: {
          id: "1531",
          name: "South Africa",
          logoUrl: "https://media.api-sports.io/football/teams/1531.png"
        },
        homeScore: 2,
        awayScore: 0,
        hasAiPrediction: false,
        canRequestPrediction: false
      },
      {
        id: "api-football-1539000",
        apiFootballFixtureId: 1539000,
        stage: "Group Stage - 1",
        kickoffAt: "2026-06-12T19:00:00.000Z",
        status: "scheduled",
        venue: "BMO Field",
        homeTeam: {
          id: "5529",
          name: "Canada",
          logoUrl: "https://media.api-sports.io/football/teams/5529.png"
        },
        awayTeam: {
          id: "1113",
          name: "Bosnia & Herzegovina",
          logoUrl: "https://media.api-sports.io/football/teams/1113.png"
        },
        homeScore: null,
        awayScore: null,
        hasAiPrediction: false,
        canRequestPrediction: true
      }
    ]);

    db.close();
  });
});
