import { createDatabase } from "./connection";
import { applySchema } from "./schema";

const db = createDatabase();
applySchema(db);
db.close();
console.log("SQLite schema migrated");
