import fs from "node:fs";
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) { const match=line.match(/^([^#=]+)=(.*)$/); if(match&&!process.env[match[1].trim()])process.env[match[1].trim()]=match[2].trim(); }
const { all, get, run } = await import("../src/db.js");
const { updateDueSources, updateSource } = await import("../src/knowledge.js");

const source=get("SELECT * FROM sources WHERE kind='baidu_hot'");
if(!source)throw new Error("百度热搜源未初始化");
const quarantined=run("UPDATE knowledge_items SET item_type='quarantined',confidence=0,embedding_json='[]' WHERE source_id=@id AND auto_generated=1",{id:source.id}).changes;
const refreshed=await updateSource(source);
const rounds=[];for(let round=0;round<4;round++)rounds.push(await updateDueSources());
const badBindings=all("SELECT id,title,narrative_json FROM knowledge_items WHERE source_id=@id AND item_type='reality_card'",{id:source.id}).filter(row=>{try{return JSON.parse(row.narrative_json||"{}").source_title!==row.title}catch{return true}}).length;
if(badBindings)throw new Error(`重建后仍有 ${badBindings} 张标题绑定异常的卡，已保持隔离`);
console.log(JSON.stringify({quarantined,refreshed,rounds,cards:get("SELECT COUNT(*) count FROM knowledge_items WHERE source_id=@id AND item_type='reality_card'",{id:source.id}).count,badBindings}));
