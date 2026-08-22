import fs from "node:fs";
import path from "node:path";
import { analyzeDocx } from "../src/documents.js";
import { config } from "../src/config.js";
import { get, run } from "../src/db.js";

const input = process.argv[2];
if (!input || !fs.existsSync(input)) throw new Error("用法：node scripts/import-template.js <模板.docx>");
const original = path.basename(input);
const target = path.join(config.uploadsDir, `${Date.now()}-${original.replace(/[<>:\"/\\|?*]/g, "_")}`);
fs.copyFileSync(input, target);
const { text, analysis } = await analyzeDocx(target);
const existing = get("SELECT id FROM templates WHERE original_name=@name", { name: original });
if (existing) {
  run("UPDATE templates SET file_path=@path,extracted_text=@text,analysis_json=@analysis WHERE id=@id", { path:target,text,analysis:JSON.stringify(analysis),id:existing.id });
  console.log(JSON.stringify({ id:existing.id, updated:true, analysis:analysis.detected }, null, 2));
} else {
  const result=run("INSERT INTO templates(name,original_name,file_path,kind,extracted_text,analysis_json) VALUES(@name,@original,@path,'mixed',@text,@analysis)", { name:original.replace(/\.docx$/i,""),original,path:target,text,analysis:JSON.stringify(analysis) });
  console.log(JSON.stringify({ id:Number(result.lastInsertRowid), imported:true, analysis:analysis.detected }, null, 2));
}

