import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("admin API", () => {
  it("allows local health checks", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/api/admin/health", remoteAddress: "127.0.0.1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "worldcup-ai-pk-admin"
    });

    await app.close();
  });

  it("allows private LAN callers and rejects public remote callers", async () => {
    const app = buildApp();

    const lanResponse = await app.inject({ method: "GET", url: "/api/admin/health", remoteAddress: "192.168.1.23" });
    expect(lanResponse.statusCode).toBe(200);

    const publicResponse = await app.inject({ method: "GET", url: "/api/admin/health", remoteAddress: "8.8.8.8" });
    expect(publicResponse.statusCode).toBe(403);

    await app.close();
  });
});
