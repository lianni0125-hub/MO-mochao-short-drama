import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(new URL("../data/short-drama.db", import.meta.url));
const result = db.prepare("UPDATE jobs SET status='cancelled',message='已取消',finished_at=? WHERE status IN ('running','queued')").run(new Date().toISOString());
console.log(`cancelled ${result.changes} job(s)`);
