import type { Database } from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface SystemLogInput {
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  details: unknown;
  createdAt?: Date;
}

export function writeSystemLog(db: Database, input: SystemLogInput): void {
  db.prepare(
    `
      INSERT INTO system_logs (id, level, source, message, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(
    randomUUID(),
    input.level,
    input.source,
    input.message,
    JSON.stringify(input.details),
    (input.createdAt ?? new Date()).toISOString()
  );
}
