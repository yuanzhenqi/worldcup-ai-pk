import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createTestDatabase } from "./support/testDatabase";

describe("admin settings API", () => {
  it("saves API-Football key locally and only returns configuration status", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();

    const app = buildApp({ databasePath, logger: false });

    const saveResponse = await app.inject({
      method: "PUT",
      url: "/api/admin/settings/api-football",
      remoteAddress: "127.0.0.1",
      payload: { apiKey: "secret-api-football-key" }
    });
    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json()).toEqual({ configured: true });

    const getResponse = await app.inject({
      method: "GET",
      url: "/api/admin/settings/api-football",
      remoteAddress: "127.0.0.1"
    });
    const body = getResponse.json();

    expect(getResponse.statusCode).toBe(200);
    expect(body).toEqual({ configured: true });
    expect(JSON.stringify(body)).not.toContain("secret-api-football-key");

    await app.close();
  });
});
