import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { all, get, run, transaction } from "./db.js";
import { config } from "./config.js";

export const BACKUP_FORMAT="mochao-workspace-backup";
export const BACKUP_VERSION=1;
const projectTables=["projects","constraints","artifacts","episodes","story_state","deleted_story_state","memory_entities","memory_events","memory_links","memory_chains","memory_chain_events","memory_relationship_changes","memory_relationships","memory_secondary_characters","memory_golden_fingers","memory_golden_changes","memory_important_props","memory_prop_changes","memory_resources","memory_resource_changes","memory_golden_abilities","memory_golden_ability_changes","memory_extractions","memory_temporal_relations","character_images"];

const safeFile=filePath=>{if(!filePath)return null;const resolved=path.resolve(String(filePath)),root=path.resolve(config.uploadsDir)+path.sep;if(!resolved.startsWith(root)||!fs.existsSync(resolved))return null;const stat=fs.statSync(resolved);if(!stat.isFile()||stat.size>30*1024*1024)return null;return {name:path.basename(resolved),extension:path.extname(resolved).toLowerCase(),data:fs.readFileSync(resolved).toString("base64")};};
const cleanEmbeddingFields=row=>{const next={...row};for(const key of ["embedding_json","embedding_model","embedded_at"]){if(key in next)next[key]=key==="embedded_at"?null:"";}return next;};

export function createWorkspaceBackup(appVersion=""){
  const tables={};
  for(const table of projectTables){tables[table]=(table==="memory_chain_events"?all("SELECT mce.* FROM memory_chain_events mce JOIN memory_chains mc ON mc.id=mce.chain_id ORDER BY mce.chain_id,mce.event_id"):all(`SELECT * FROM ${table} ORDER BY id`)).map(cleanEmbeddingFields);}
  tables.templates=all("SELECT * FROM templates ORDER BY id");
  const assets=[];for(const table of ["character_images","templates"]){for(const row of tables[table]||[]){const file=safeFile(row.file_path);if(file)assets.push({table,rowId:row.id,...file});}}
  return {format:BACKUP_FORMAT,formatVersion:BACKUP_VERSION,appVersion,createdAt:new Date().toISOString(),notice:"不包含 API Key、模型连接、任务记录、日志和向量值",tables,assets};
}

const tableColumns=table=>new Set(all(`PRAGMA table_info(${table})`).map(column=>column.name));
const insertRow=(table,row)=>{const allowed=tableColumns(table),entries=Object.entries(row||{}).filter(([key])=>allowed.has(key));if(!entries.length)return;const columns=entries.map(([key])=>`"${key}"`).join(","),bindings=Object.fromEntries(entries.map(([,value],index)=>[`v${index}`,value])),values=entries.map((_,index)=>`@v${index}`).join(",");run(`INSERT INTO ${table}(${columns}) VALUES(${values})`,bindings);};
const restoreAsset=asset=>{if(!asset?.data||!["character_images","templates"].includes(asset.table))return null;const extension=/^\.[a-z0-9]{1,8}$/i.test(asset.extension||"")?asset.extension:".bin",target=path.join(config.uploadsDir,`restored-${asset.table}-${asset.rowId}-${crypto.randomUUID()}${extension}`);fs.writeFileSync(target,Buffer.from(String(asset.data),"base64"),{flag:"wx"});return target;};

export function validateWorkspaceBackup(value){if(!value||value.format!==BACKUP_FORMAT||Number(value.formatVersion)!==BACKUP_VERSION)throw new Error("这不是可识别的墨潮工作区备份，或备份版本暂不受支持");if(!value.tables||!Array.isArray(value.tables.projects))throw new Error("备份文件缺少项目数据");for(const table of [...projectTables,"templates"]){if(value.tables[table]!=null&&!Array.isArray(value.tables[table]))throw new Error(`备份中的 ${table} 数据格式不正确`);}return value;}

export function restoreWorkspaceBackup(input){
  const backup=validateWorkspaceBackup(input),assetPaths=new Map();for(const asset of backup.assets||[]){const restored=restoreAsset(asset);if(restored)assetPaths.set(`${asset.table}:${asset.rowId}`,restored);}
  const rows=Object.fromEntries([...projectTables,"templates"].map(table=>[table,(backup.tables[table]||[]).map(row=>{const next={...row},asset=assetPaths.get(`${table}:${row.id}`);if(asset)next.file_path=asset;else if(table==="character_images"||table==="templates")next.file_path="";return next;})]));
  transaction(()=>{run("DELETE FROM projects");run("DELETE FROM templates");for(const table of [...projectTables,"templates"]){for(const row of rows[table])insertRow(table,row);}});
  return {projects:rows.projects.length,episodes:rows.episodes.length,images:rows.character_images.filter(row=>row.file_path).length,templates:rows.templates.length,needsVectorRebuild:true};
}
