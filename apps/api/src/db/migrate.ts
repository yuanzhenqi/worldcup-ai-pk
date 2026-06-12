import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDatabase } from "./connection";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(currentDir, "schema.sql");
const schema = readFileSync(schemaPath, "utf8");

const db = createDatabase();
db.exec(schema);
db.close();
console.log("SQLite schema migrated");
