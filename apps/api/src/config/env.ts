import { z } from "zod";

const envSchema = z.object({
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_PATH: z.string().default("./data/app.sqlite"),
  PUBLIC_WEB_ORIGIN: z.string().url().default("http://127.0.0.1:5173")
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(input);
}
