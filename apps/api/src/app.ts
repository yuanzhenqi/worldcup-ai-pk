import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./config/env";
import { registerPublicRoutes } from "./modules/public/public.routes";

export function buildApp() {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: env.PUBLIC_WEB_ORIGIN
  });

  app.register(registerPublicRoutes, { prefix: "/api/public" });

  return app;
}
