import { afterEach, describe, expect, it, vi } from "vitest";
import { captureApiFootballFixturesRaw, getAdminApiFootballSettings, saveAdminApiFootballKey } from "../src/api/client";

describe("web API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads API-Football configuration status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ configured: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(getAdminApiFootballSettings()).resolves.toEqual({ configured: true });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/admin/settings/api-football");
  });

  it("saves API-Football key through local admin API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ configured: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(saveAdminApiFootballKey("secret-api-football-key")).resolves.toEqual({ configured: true });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/admin/settings/api-football", {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ apiKey: "secret-api-football-key" })
    });
  });

  it("triggers raw API-Football fixtures capture", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ captured: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(captureApiFootballFixturesRaw()).resolves.toEqual({ captured: true });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4000/api/admin/sync/api-football/fixtures/raw", {
      method: "POST"
    });
  });
});
