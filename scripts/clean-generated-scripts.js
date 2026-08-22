import { DatabaseSync } from "node:sqlite";
import { cleanEpisodeText } from "../src/llm.js";

const db=new DatabaseSync(new URL("../data/short-drama.db",import.meta.url));
const rows=db.prepare("SELECT id,script FROM episodes WHERE script<>''").all();
const update=db.prepare("UPDATE episodes SET script=?,updated_at=CURRENT_TIMESTAMP WHERE id=?");
for(const row of rows)update.run(cleanEpisodeText(row.script),row.id);
console.log(`cleaned ${rows.length} episode script(s)`);
