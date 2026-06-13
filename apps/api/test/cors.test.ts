import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createTestDatabase } from "./support/testDatabase";

describe("CORS", () => {
  it("allows Vite dev server ports when the default port is occupied", async () => {
    const { db, databasePath } = createTestDatabase();
    db.close();

    const app = buildApp({ databasePath, logger: false });
    const response = await app.inject({
      method: "GET",
      url: "/api/public/health",
      headers: {
        origin: "http://127.0.0.1:5174"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5174");

    await app.close();
  });
});
