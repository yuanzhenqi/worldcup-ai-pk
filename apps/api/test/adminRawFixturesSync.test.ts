import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { saveApiFootballKey } from "../src/modules/settings/settings.repository";
import { createTestDatabase } from "./support/testDatabase";

describe("admin raw API-Football fixtures sync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("captures raw fixtures response in system logs", async () => {
    const { db, databasePath } = createTestDatabase();
    saveApiFootballKey(db, "secret-api-football-key");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: [
            {
              fixture: {
                id: 1001,
                date: "2026-06-12T19:00:00+00:00",
                venue: { name: "BMO Field" },
                status: { short: "NS" }
              },
              league: { round: "Group Stage - 1" },
              teams: {
                home: { id: 5529, name: "Canada", logo: null },
                away: { id: 1113, name: "Bosnia & Herzegovina", logo: null }
              },
              goals: { home: null, away: null }
            }
          ]
        }),
        {
        status: 200,
        headers: { "content-type": "application/json" }
        }
      )
    );

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/sync/api-football/fixtures/raw",
      remoteAddress: "127.0.0.1"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ captured: true, imported: 1 });
    expect(fetchMock).toHaveBeenCalledWith("https://v3.football.api-sports.io/fixtures?league=1&season=2026", {
      headers: {
        "x-apisports-key": "secret-api-football-key"
      }
    });

    const row = db
      .prepare("SELECT source, message, details_json FROM system_logs WHERE source = ?")
      .get("api-football") as { source: string; message: string; details_json: string };

    expect(row.source).toBe("api-football");
    expect(row.message).toBe("Captured raw World Cup fixtures response");
    expect(JSON.parse(row.details_json)).toEqual({
      response: [
        {
          fixture: {
            id: 1001,
            date: "2026-06-12T19:00:00+00:00",
            venue: { name: "BMO Field" },
            status: { short: "NS" }
          },
          league: { round: "Group Stage - 1" },
          teams: {
            home: { id: 5529, name: "Canada", logo: null },
            away: { id: 1113, name: "Bosnia & Herzegovina", logo: null }
          },
          goals: { home: null, away: null }
        }
      ]
    });

    await app.close();
  });

  it("syncs fixtures through the normal admin sync endpoint", async () => {
    const { db, databasePath } = createTestDatabase();
    saveApiFootballKey(db, "secret-api-football-key");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          response: [
            {
              fixture: {
                id: 1001,
                date: "2026-06-12T19:00:00+00:00",
                venue: { name: "BMO Field" },
                status: { short: "NS" }
              },
              league: { round: "Group Stage - 1" },
              teams: {
                home: { id: 5529, name: "Canada", logo: null },
                away: { id: 1113, name: "Bosnia & Herzegovina", logo: null }
              },
              goals: { home: null, away: null }
            },
            {
              fixture: {
                id: 1002,
                date: "2026-06-13T19:00:00+00:00",
                venue: { name: "Estadio Azteca" },
                status: { short: "FT" }
              },
              league: { round: "Group Stage - 1" },
              teams: {
                home: { id: 16, name: "Mexico", logo: null },
                away: { id: 1531, name: "South Africa", logo: null }
              },
              goals: { home: 2, away: 0 }
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/sync/api-football/fixtures",
      remoteAddress: "127.0.0.1"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ synced: true, imported: 2 });

    await app.close();
  });

  it("returns API-Football errors without marking capture successful", async () => {
    const { db, databasePath } = createTestDatabase();
    saveApiFootballKey(db, "secret-api-football-key");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: {
            plan: "Free plans do not have access to this season, try from 2022 to 2024."
          },
          results: 0,
          response: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/sync/api-football/fixtures/raw",
      remoteAddress: "127.0.0.1"
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      captured: false,
      error: "API-Football returned errors",
      errors: {
        plan: "Free plans do not have access to this season, try from 2022 to 2024."
      }
    });

    await app.close();
  });
});
