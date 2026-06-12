import type { FastifyInstance } from "fastify";
import type { Database } from "better-sqlite3";
import { listMatches } from "../matches/match.repository";

export interface PublicRoutesOptions {
  db: Database;
}

export async function registerPublicRoutes(app: FastifyInstance, options: PublicRoutesOptions): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "worldcup-ai-pk-api"
  }));

  app.get("/matches", async () => ({
    matches: listMatches(options.db)
  }));
}
