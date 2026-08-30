import fs from "node:fs";
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) { const match=line.match(/^([^#=]+)=(.*)$/); if(match&&!process.env[match[1].trim()])process.env[match[1].trim()]=match[2].trim(); }
const { all, get, run } = await import("../src/db.js");
const { updateDueSources, updateSource } = await import("../src/knowledge.js");
const source=get("SELECT * FROM sources WHERE kind='baidu_hot'");
if(!source)throw new Error("百度热搜源未初始化");
const cards=all("SELECT id,title,narrative_json FROM knowledge_items WHERE source_id=@id AND item_type='reality_card'",{id:source.id});
const invalid=cards.filter(row=>{try{return JSON.parse(row.narrative_json||"{}").source_title!==row.title}catch{return true}});
for(const row of invalid)run("UPDATE knowledge_items SET item_type='quarantined',confidence=0,embedding_json='[]' WHERE id=@id",{id:row.id});
const refreshed=await updateSource(source),processed=await updateDueSources();
const remaining=all("SELECT id,title,narrative_json FROM knowledge_items WHERE source_id=@id AND item_type='reality_card'",{id:source.id}).filter(row=>{try{return JSON.parse(row.narrative_json||"{}").source_title!==row.title}catch{return true}});
for(const row of remaining)run("UPDATE knowledge_items SET item_type='quarantined',confidence=0,embedding_json='[]' WHERE id=@id",{id:row.id});
console.log(JSON.stringify({isolated:invalid.length,refreshed,processed,cards:get("SELECT COUNT(*) count FROM knowledge_items WHERE source_id=@id AND item_type='reality_card'",{id:source.id}).count,remainingIsolated:remaining.length}));
