import fs from "node:fs";
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) { const match=line.match(/^([^#=]+)=(.*)$/); if(match&&!process.env[match[1].trim()])process.env[match[1].trim()]=match[2].trim(); }
const { all, get, run } = await import("../src/db.js");
const { seedAutomaticSources, updateDueSources, updateSource } = await import("../src/knowledge.js");

seedAutomaticSources();
const source = get("SELECT * FROM sources WHERE kind='fanqie_rank'");
if (!source) throw new Error("番茄榜单源未初始化");
const refreshed = await updateSource(source);
const rows = all("SELECT id,title,summary FROM knowledge_items WHERE source_id=@id AND auto_generated=1", { id: source.id });
const polluted = rows.filter(item => /[\uE000-\uF8FF]/u.test(`${item.title}${item.summary}`));
if (polluted.length) throw new Error(`仍有 ${polluted.length} 条字体混淆资料，已保留旧趋势卡并停止重建`);
run("DELETE FROM knowledge_items WHERE library='market' AND auto_generated=1 AND item_type='trend_card'");
for (let round = 0; round < 3; round++) await updateDueSources();
run("DELETE FROM knowledge_items WHERE library='market' AND auto_generated=1 AND item_type='trend_card'");
await updateDueSources();
console.log(JSON.stringify({ refreshed, readable: rows.length, polluted: 0 }));
