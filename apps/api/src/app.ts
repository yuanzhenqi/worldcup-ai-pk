import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./config/env";
import { createDatabase } from "./db/connection";
import { applySchema } from "./db/schema";
import { seedBuiltInPromptTemplates } from "./modules/admin/builtInPromptTemplates";
import { registerAdminRoutes } from "./modules/admin/admin.routes";
import { registerPublicRoutes } from "./modules/public/public.routes";

export interface BuildAppOptions {
  databasePath?: string;
  logger?: boolean;
}

const localViteOrigins = [/^http:\/\/127\.0\.0\.1:517\d$/, /^http:\/\/localhost:517\d$/];

export function buildApp(options: BuildAppOptions = {}) {
  const env = loadEnv();
  const app = Fastify({ logger: options.logger ?? true });
  const db = createDatabase(options.databasePath ?? env.DATABASE_PATH);
  applySchema(db);
  seedBuiltInPromptTemplates(db);

  app.register(cors, {
    origin: [env.PUBLIC_WEB_ORIGIN, ...localViteOrigins]
  });

  app.addHook("onClose", async () => {
    db.close();
  });

  app.register(registerPublicRoutes, { prefix: "/api/public", db });
  app.register(registerAdminRoutes, { prefix: "/api/admin", db });

  return app;
}
