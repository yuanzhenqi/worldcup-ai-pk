import type { FastifyInstance, FastifyRequest } from "fastify";

function isLocalRequest(request: FastifyRequest): boolean {
  const ip = request.ip;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    if (!isLocalRequest(request)) {
      return reply.code(403).send({ error: "Admin API is local-only" });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "worldcup-ai-pk-admin"
  }));
}
