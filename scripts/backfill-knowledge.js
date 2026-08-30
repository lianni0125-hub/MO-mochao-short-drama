import { get } from "../src/db.js";
import { seedAutomaticSources, updateSource } from "../src/knowledge.js";

seedAutomaticSources();
const source = get("SELECT * FROM sources WHERE kind='weibo_archive'");
if (!source) throw new Error("微博历史快照源未初始化");
console.log(JSON.stringify(await updateSource(source)));
