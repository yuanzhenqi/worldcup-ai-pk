import Database from "better-sqlite3";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { loadEnv } from "../config/env";

export function createDatabase(path = loadEnv().DATABASE_PATH): Database.Database {
  const resolvedPath = resolve(path);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const db = new Database(resolvedPath);
  db.pragma("foreign_keys = ON");
  return db;
}
