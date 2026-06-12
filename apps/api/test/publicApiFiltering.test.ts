import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("public API filtering", () => {
  it("does not expose keys, full prompts, or raw responses in health payload", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/api/public/health" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(body)).not.toContain("api_key");
    expect(JSON.stringify(body)).not.toContain("full_prompt");
    expect(JSON.stringify(body)).not.toContain("raw_response");

    await app.close();
  });
});
