import type { FastifyInstance } from "fastify";

export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    service: "worldcup-ai-pk-api"
  }));
}
