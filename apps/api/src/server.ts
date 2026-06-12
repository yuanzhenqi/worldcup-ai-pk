import { buildApp } from "./app";
import { loadEnv } from "./config/env";

const env = loadEnv();
const app = buildApp();

await app.listen({
  host: env.API_HOST,
  port: env.API_PORT
});
