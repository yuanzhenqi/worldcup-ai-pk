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
      new Response(JSON.stringify({ response: [{ fixture: { id: 1001 } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/sync/api-football/fixtures/raw",
      remoteAddress: "127.0.0.1"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ captured: true });
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
    expect(JSON.parse(row.details_json)).toEqual({ response: [{ fixture: { id: 1001 } }] });

    await app.close();
  });
});
