import fs from "node:fs";
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) { const match=line.match(/^([^#=]+)=(.*)$/); if(match&&!process.env[match[1].trim()])process.env[match[1].trim()]=match[2].trim(); }
const { updateDueSources } = await import("../src/knowledge.js");
const { all, now } = await import("../src/db.js");

console.log(JSON.stringify(all(`SELECT id,title,item_type,auto_generated,length(summary) summary_length,narrative_json,expires_at FROM knowledge_items WHERE auto_generated=1 AND item_type='source' AND length(summary)>=30 AND (narrative_json IS NULL OR narrative_json='{}') AND (expires_at IS NULL OR expires_at>@time) ORDER BY id DESC LIMIT 3`, { time: now() })));
for (let round = 1; round <= 4; round++) {
  console.log(JSON.stringify({ round, result: await updateDueSources() }));
}
console.log(JSON.stringify(all("SELECT id,stage,status,substr(output,1,500) output FROM generations WHERE stage IN ('knowledge_cards','knowledge_trends') ORDER BY id DESC LIMIT 3")));
