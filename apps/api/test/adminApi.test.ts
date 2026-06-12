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
});
