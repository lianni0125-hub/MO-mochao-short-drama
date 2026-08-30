import fs from "node:fs";
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) { const match=line.match(/^([^#=]+)=(.*)$/); if(match&&!process.env[match[1].trim()])process.env[match[1].trim()]=match[2].trim(); }
const { get } = await import("../src/db.js");
const { generate } = await import("../src/llm.js");

const row = get("SELECT id,title,summary FROM knowledge_items WHERE library='market' AND item_type='source' ORDER BY id DESC LIMIT 1");
const schema = { type: "object", properties: { cards: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, premise: { type: "string" } }, required: ["id", "premise"], additionalProperties: false } } }, required: ["cards"], additionalProperties: false };
console.log(JSON.stringify(await generate({ stage: "knowledge_cards", project: { id: 0, title: "资料测试", tags: [] }, prompt: `根据这条作品简介返回一句话前提：${JSON.stringify(row)}`, schema })));
