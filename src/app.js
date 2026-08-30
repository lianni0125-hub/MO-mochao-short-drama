import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import { activeEmbeddingProvider, activeProvider, config, embeddingProviderDefaults, providerDefaults } from "./config.js";
import { all, detachLegacyStoryStateFromControls, get, run, now, transaction } from "./db.js";
import { ARTIFACT_TITLES, STAGES, canonicalRelationshipSubject, parseArtifact, parseProject } from "./domain.js";
import { buildCharacterImagePromptPrompt, buildStagePrompt } from "./prompts.js";
import { generate, testConnection } from "./llm.js";
import { analyzeDocx, exportProjectDocx } from "./documents.js";
import { enrichManualKnowledge, processKnowledgeBacklog, searchIdeaKnowledge, searchKnowledge, updateAllSources, updateSource, validateRssSource } from "./knowledge.js";
import { cancelJob, configureWorkbench, continueJob, enqueueJob, getWorkbenchState, listJobs, writeEpisode } from "./jobs.js";
import { listTemplates, templateContext, templateWritingGuide } from "./templates.js";
import { memorySnapshot } from "./memory.js";
import { embeddingConfigured, testEmbeddingConnection } from "./embeddings.js";

const upload = multer({ dest: config.uploadsDir, limits: { fileSize: 30 * 1024 * 1024 } });
export const app = express();
app.use(express.json({ limit: "5mb" }));

const localVersionPath=path.join(config.root,"version.json");
const remoteVersionUrl="https://raw.githubusercontent.com/lianni0125-hub/MO-mochao-short-drama/main/version.json";
const readLocalVersion=()=>JSON.parse(fs.readFileSync(localVersionPath,"utf8"));
const compareVersions=(left,right)=>{
  const a=String(left||"0").split(".").map(part=>Number(part)||0),b=String(right||"0").split(".").map(part=>Number(part)||0);
  for(let index=0;index<Math.max(a.length,b.length);index++){if((a[index]||0)!==(b[index]||0))return (a[index]||0)-(b[index]||0);}
  return 0;
};

const projectRow = id => parseProject(get("SELECT * FROM projects WHERE id=@id AND deleted_at IS NULL", { id: Number(id) }));
const artifactsFor = id => {detachLegacyStoryStateFromControls(id);return all("SELECT * FROM artifacts WHERE project_id=@id ORDER BY id", { id: Number(id) }).map(parseArtifact);};
const constraintsFor = id => all("SELECT * FROM constraints WHERE project_id=@id ORDER BY id", { id: Number(id) });

function requireProject(req, res, next) {
  req.project = projectRow(req.params.id);
  if (!req.project) return res.status(404).json({ error: "项目不存在" });
  next();
}
const mockWorkflowsAllowed=()=>process.env.ALLOW_MOCK_WORKFLOWS==="1";
function requireRealGeneration(req,res,next){return activeProvider().id!=="mock"||mockWorkflowsAllowed()?next():res.status(428).json({error:"离线界面演示只用于查看01–05流程，不能生成正式小说、剧本、质量检查或故事记忆。请配置正文生成 API。",code:"REAL_LLM_REQUIRED"})}
function requireRealEmbedding(req,res,next){return activeEmbeddingProvider().id!=="mock"&&embeddingConfigured()||mockWorkflowsAllowed()?next():res.status(428).json({error:"离线向量测试没有语义能力，不能用于正式RAG、小说剧本或故事记忆。请配置真实 Embedding API。",code:"REAL_EMBEDDING_REQUIRED"})}

function upsertArtifact(projectId, type, content, status = "draft") {
  const existing = get("SELECT * FROM artifacts WHERE project_id=@project_id AND type=@type", { project_id: projectId, type });
  if (existing) {
    run("UPDATE artifacts SET content_json=@content,status=@status,version=version+1,updated_at=@time WHERE id=@id", { content: JSON.stringify(content), status, time: now(), id: existing.id });
    return parseArtifact(get("SELECT * FROM artifacts WHERE id=@id", { id: existing.id }));
  }
  const result = run("INSERT INTO artifacts(project_id,type,title,content_json,status) VALUES(@project_id,@type,@title,@content,@status)", { project_id: projectId, type, title: ARTIFACT_TITLES[type] || type, content: JSON.stringify(content), status });
  return parseArtifact(get("SELECT * FROM artifacts WHERE id=@id", { id: Number(result.lastInsertRowid) }));
}

app.get("/api/health", (_req, res) => { const p=activeProvider(); res.json({ ok:true,provider:p.id,providerLabel:p.label,model:p.model,apiKeyConfigured:Boolean(p.apiKey) }); });
app.get("/api/version",async(_req,res)=>{
  const current=readLocalVersion();
  try{
    const response=await fetch(`${remoteVersionUrl}?t=${Date.now()}`,{headers:{"User-Agent":"MO-mochao-short-drama-version-check"},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error(`GitHub ${response.status}`);
    const latest=await response.json();
    res.json({current,latest,updateAvailable:compareVersions(latest.version,current.version)>0,checkedAt:new Date().toISOString()});
  }catch(error){res.json({current,latest:null,updateAvailable:false,checkError:"暂时无法连接 GitHub 检查更新",checkedAt:new Date().toISOString()});}
});
app.get("/api/workbench", (_req,res) => res.json(getWorkbenchState()));
app.put("/api/workbench", (req,res) => { try { res.json(configureWorkbench(req.body||{})); } catch(error) { res.status(409).json({error:error.message}); } });
app.get("/api/settings/llm", (_req, res) => res.json({
  provider: activeProvider().id, model: activeProvider().model, baseUrl:activeProvider().baseUrl,
  apiKeyConfigured: Boolean(activeProvider().apiKey), apiKeyHint: activeProvider().apiKey ? `••••••••${activeProvider().apiKey.slice(-4)}` : "",
  providers:Object.entries(providerDefaults).map(([id,p])=>({id,label:p.label,baseUrl:p.baseUrl,model:p.model})),
  embedding:(()=>{const p=activeEmbeddingProvider();return {provider:p.id,baseUrl:p.baseUrl,model:p.model,groupId:p.groupId||"",apiKeyConfigured:Boolean(p.apiKey),apiKeyHint:p.apiKey?`••••••••${p.apiKey.slice(-4)}`:""}})(),
  embeddingProviders:Object.entries(embeddingProviderDefaults).map(([id,p])=>{const key=config.embeddingProviderKeys?.[id]||"";return {id,label:p.label,baseUrl:p.baseUrl,model:p.model,needsGroupId:id==="minimax",groupId:id==="minimax"?config.embeddingGroupId||"":"",apiKeyConfigured:Boolean(key),apiKeyHint:key?`••••••••${key.slice(-4)}`:""};})
}));
app.put("/api/settings/llm", (req, res) => {
  const provider = providerDefaults[req.body.provider] ? req.body.provider : "custom";
  const preset = providerDefaults[provider];
  const model = String(req.body.model || preset.model).trim();
  const baseUrl = String(req.body.base_url || preset.baseUrl).trim().replace(/\/$/,"");
  const suppliedKey = String(req.body.api_key || "").trim();
  const key = suppliedKey || config.providerKeys[provider] || "";
  if (provider !== "mock" && !key) return res.status(400).json({ error: "使用在线模型时必须填写 API Key" });
  if (provider === "custom" && !baseUrl) return res.status(400).json({ error: "自定义接口必须填写 Base URL" });
  const envPath = path.join(config.root, ".env");
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const values = new Map(existing.filter(Boolean).map(line => { const i=line.indexOf("="); return i>0?[line.slice(0,i),line.slice(i+1)]:[line,""]; }));
  const keyName={openai:"OPENAI_API_KEY",minimax:"MINIMAX_API_KEY",zhipu:"ZHIPU_API_KEY",deepseek:"DEEPSEEK_API_KEY",qwen:"DASHSCOPE_API_KEY",moonshot:"MOONSHOT_API_KEY",custom:"CUSTOM_API_KEY"}[provider];
  values.set("LLM_PROVIDER", provider); values.set("OPENAI_MODEL", model); values.set("LLM_BASE_URL", baseUrl); if (keyName&&key) values.set(keyName,key);
  fs.writeFileSync(envPath, [...values].map(([k,v]) => `${k}=${v}`).join("\n") + "\n", { encoding:"utf8", mode:0o600 });
  config.llmProvider=provider; config.openaiModel=model; config.baseUrl=baseUrl; if(key) config.providerKeys[provider]=key;
  res.json({ provider, providerLabel:preset.label, model, baseUrl, apiKeyConfigured:Boolean(key), apiKeyHint:key?`••••••••${key.slice(-4)}`:"" });
});
app.post("/api/settings/llm/test", async(req,res)=>{
  const providerId=providerDefaults[req.body.provider]?req.body.provider:"custom";
  const preset=providerDefaults[providerId];
  const apiKey=String(req.body.api_key||"").trim()||config.providerKeys[providerId]||"";
  try{const result=await testConnection({providerId,apiKey,baseUrl:String(req.body.base_url||preset.baseUrl).trim().replace(/\/$/,""),model:String(req.body.model||preset.model).trim()});res.json({...result,providerLabel:preset.label});}
  catch(error){res.status(400).json({ok:false,error:error.message||String(error)});}
});
app.put("/api/settings/embedding",(req,res)=>{
  const provider=embeddingProviderDefaults[req.body.provider]?req.body.provider:"custom",preset=embeddingProviderDefaults[provider];
  const model=String(req.body.model||preset.model).trim(),baseUrl=String(req.body.base_url||preset.baseUrl).trim().replace(/\/$/,""),supplied=String(req.body.api_key||"").trim(),key=supplied||config.embeddingProviderKeys?.[provider]||"",groupId=provider==="minimax"?String(req.body.group_id||"").trim():"";
  if(provider!=="mock"&&!key)return res.status(400).json({error:"请填写 Embedding API Key"});
  if(provider==="custom"&&!baseUrl)return res.status(400).json({error:"请填写 Embedding Base URL"});
  if(!model)return res.status(400).json({error:"请填写 Embedding 模型名称"});
  const envPath=path.join(config.root,".env"),existing=fs.existsSync(envPath)?fs.readFileSync(envPath,"utf8").split(/\r?\n/):[],values=new Map(existing.filter(Boolean).map(line=>{const i=line.indexOf("=");return i>0?[line.slice(0,i),line.slice(i+1)]:[line,""];}));
  const embeddingKeyNames={openai:"OPENAI_EMBEDDING_API_KEY",google:"GOOGLE_EMBEDDING_API_KEY",minimax:"MINIMAX_EMBEDDING_API_KEY",zhipu:"ZHIPU_EMBEDDING_API_KEY",qwen:"QWEN_EMBEDDING_API_KEY",custom:"CUSTOM_EMBEDDING_API_KEY"},keyName=embeddingKeyNames[provider];values.set("EMBEDDING_PROVIDER",provider);values.set("EMBEDDING_BASE_URL",baseUrl);values.set("EMBEDDING_MODEL",model);if(keyName&&key)values.set(keyName,key);for(const [savedProvider,envName] of Object.entries(embeddingKeyNames)){const savedKey=savedProvider===provider?key:config.embeddingProviderKeys?.[savedProvider];if(savedKey)values.set(envName,savedKey);}if(provider==="minimax")values.set("MINIMAX_EMBEDDING_GROUP_ID",groupId);
  fs.writeFileSync(envPath,[...values].map(([k,v])=>`${k}=${v}`).join("\n")+"\n",{encoding:"utf8",mode:0o600});
  config.embeddingProvider=provider;config.embeddingBaseUrl=baseUrl;config.embeddingModel=model;if(key)config.embeddingProviderKeys[provider]=key;if(provider==="minimax")config.embeddingGroupId=groupId;
  res.json({provider,providerLabel:preset.label,model,baseUrl,groupId,apiKeyConfigured:Boolean(key),apiKeyHint:key?`••••••••${key.slice(-4)}`:""});
});
app.post("/api/settings/embedding/test",async(req,res)=>{try{res.json(await testEmbeddingConnection(req.body));}catch(error){res.status(400).json({ok:false,error:error.message||String(error)});}});
app.get("/api/meta", (_req, res) => res.json({ stages: STAGES }));

function purgeExpiredProjects(){
  const cutoff=new Date(Date.now()-7*24*60*60*1000).toISOString();
  const expired=all("SELECT id FROM projects WHERE deleted_at IS NOT NULL AND deleted_at<=@cutoff",{cutoff});
  for(const project of expired){
    const files=[...all("SELECT file_path FROM character_images WHERE project_id=@id",{id:project.id}),...all("SELECT file_path FROM templates WHERE project_id=@id",{id:project.id})].map(row=>row.file_path).filter(Boolean);
    transaction(()=>{run("DELETE FROM templates WHERE project_id=@id",{id:project.id});run("DELETE FROM projects WHERE id=@id",{id:project.id});});
    for(const file of files){try{const resolved=path.resolve(file),allowed=[config.uploadsDir,config.exportsDir].some(root=>{const base=path.resolve(root);return resolved===base||resolved.startsWith(base+path.sep)});if(allowed&&fs.existsSync(resolved))fs.unlinkSync(resolved);}catch{}}
  }
}
purgeExpiredProjects();
const trashCleanupTimer=setInterval(purgeExpiredProjects,60*60*1000);trashCleanupTimer.unref?.();

app.get("/api/projects", (_req, res) => res.json(all("SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY sort_order ASC,id ASC").map(parseProject)));
app.get("/api/trash/projects", (_req,res)=>{purgeExpiredProjects();res.json(all("SELECT *,datetime(deleted_at,'+7 days') AS purge_at FROM projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").map(parseProject));});
app.post("/api/projects", (req, res) => {
  const b = req.body;
  if (!String(b.title || "").trim()) return res.status(400).json({ error: "请输入项目名称" });
  const result = run(`INSERT INTO projects(title,logline,tags_json,total_episodes,audience,platform,restrictions,seed,sort_order)
    VALUES(@title,@logline,@tags,@episodes,@audience,@platform,@restrictions,@seed,@sortOrder)`, {
    title: b.title.trim(), logline: b.logline || "", tags: JSON.stringify(b.tags || []), episodes: Math.max(1, Number(b.total_episodes || 60)),
    audience: b.audience || "", platform: b.platform || "", restrictions: b.restrictions || "", seed: b.seed || "",
    sortOrder:Number(get("SELECT COALESCE(MAX(sort_order),0)+1 next FROM projects WHERE deleted_at IS NULL")?.next||1)
  });
  res.status(201).json(projectRow(Number(result.lastInsertRowid)));
});
app.put("/api/projects-order",(req,res)=>{
  const ids=(Array.isArray(req.body?.project_ids)?req.body.project_ids:[]).map(Number);
  const existing=all("SELECT id FROM projects WHERE deleted_at IS NULL ORDER BY id").map(row=>Number(row.id));
  const submitted=[...new Set(ids)].sort((a,b)=>a-b);
  if(ids.length!==existing.length||submitted.length!==ids.length||submitted.some((id,index)=>id!==existing[index]))return res.status(400).json({error:"项目排序数据不完整，请刷新后重试"});
  transaction(()=>ids.forEach((id,index)=>run("UPDATE projects SET sort_order=@order WHERE id=@id",{order:index+1,id})));
  res.json({project_ids:ids});
});
app.delete("/api/projects/:id",requireProject,(req,res)=>{
  const active=all("SELECT id FROM jobs WHERE project_id=@id AND status IN ('queued','running')",{id:req.project.id});
  for(const job of active){try{cancelJob(req.project.id,job.id);}catch{}}
  const deletedAt=now();
  run("UPDATE projects SET deleted_at=@deletedAt,updated_at=@deletedAt WHERE id=@id",{deletedAt,id:req.project.id});
  res.json({id:req.project.id,deleted_at:deletedAt,purge_at:new Date(Date.parse(deletedAt)+7*24*60*60*1000).toISOString()});
});
app.post("/api/trash/projects/:id/restore",(req,res)=>{
  const row=get("SELECT * FROM projects WHERE id=@id AND deleted_at IS NOT NULL",{id:Number(req.params.id)});
  if(!row)return res.status(404).json({error:"回收站中没有这个项目，可能已过期清理"});
  const sortOrder=Number(get("SELECT COALESCE(MAX(sort_order),0)+1 next FROM projects WHERE deleted_at IS NULL")?.next||1);
  run("UPDATE projects SET deleted_at=NULL,sort_order=@sortOrder,updated_at=@time WHERE id=@id",{sortOrder,time:now(),id:row.id});
  res.json(projectRow(row.id));
});
app.get("/api/trash/story-states",(_req,res)=>res.json(all(`SELECT d.*,p.title AS project_title,p.deleted_at AS project_deleted_at
  FROM deleted_story_state d JOIN projects p ON p.id=d.project_id ORDER BY d.deleted_at DESC,d.id DESC`)));
app.post("/api/trash/story-states/:id/restore",(req,res)=>{
  const item=get(`SELECT d.*,p.deleted_at AS project_deleted_at FROM deleted_story_state d
    JOIN projects p ON p.id=d.project_id WHERE d.id=@id`,{id:Number(req.params.id)});
  if(!item)return res.status(404).json({error:"故事状态回收站中没有这张卡片"});
  if(item.project_deleted_at)return res.status(409).json({error:"来源项目仍在项目回收站，请先恢复该项目"});
  const duplicate=get(`SELECT id FROM story_state WHERE project_id=@projectId AND category=@category AND subject=@subject
    AND value=@value AND status=@status`,{projectId:item.project_id,category:item.category,subject:item.subject,value:item.value,status:item.status});
  if(duplicate){run("DELETE FROM deleted_story_state WHERE id=@id",{id:item.id});return res.json({restored:false,already_present:true,project_id:item.project_id});}
  transaction(()=>{
    run(`INSERT INTO story_state(project_id,category,subject,value,status,source_episode,updated_at)
      VALUES(@projectId,@category,@subject,@value,@status,@sourceEpisode,@updatedAt)`,{projectId:item.project_id,category:item.category,subject:item.subject,value:item.value,status:item.status,sourceEpisode:item.source_episode,updatedAt:item.original_updated_at||now()});
    run("DELETE FROM deleted_story_state WHERE id=@id",{id:item.id});
  });
  res.json({restored:true,project_id:item.project_id});
});
app.delete("/api/trash/story-states",(_req,res)=>{const result=run("DELETE FROM deleted_story_state");res.json({cleared:Number(result.changes||0)});});
app.get("/api/projects/:id", requireProject, (req, res) => res.json({
  ...req.project,
  constraints: constraintsFor(req.project.id), artifacts: artifactsFor(req.project.id),
  episodes: all("SELECT * FROM episodes WHERE project_id=@id ORDER BY episode_no", { id: req.project.id }),
  storyState: all("SELECT * FROM story_state WHERE project_id=@id ORDER BY category,subject", { id: req.project.id }),
  storyMemory: memorySnapshot(req.project.id),
  templates:listTemplates(req.project.id),
  characterImages:all("SELECT id,character_index,character_name,source,prompt,created_at FROM character_images WHERE project_id=@id ORDER BY character_index",{id:req.project.id}).map(x=>({...x,url:`/character-images/${x.id}`}))
}));
app.delete("/api/projects/:id/story-memory", requireProject, (req, res) => {
  if(req.body?.confirm!==true)return res.status(400).json({error:"请在确认弹窗中明确确认清空故事状态"});
  const active=get("SELECT id FROM jobs WHERE project_id=@id AND status IN ('queued','running') LIMIT 1",{id:req.project.id});
  if(active)return res.status(409).json({error:"当前项目仍有进行中的任务，请先等待完成或取消任务，再清空故事状态"});
  const tables=["memory_entities","memory_events","memory_links","memory_chains","memory_relationship_changes","memory_relationships","memory_secondary_characters","memory_golden_fingers","memory_golden_changes","memory_golden_abilities","memory_golden_ability_changes","memory_important_props","memory_prop_changes","memory_resources","memory_resource_changes","memory_vectors","memory_extractions","memory_temporal_relations","story_state"];
  const counts=Object.fromEntries(tables.map(table=>[table,Number(get(`SELECT COUNT(*) count FROM ${table} WHERE project_id=@id`,{id:req.project.id})?.count||0)]));
  transaction(()=>{
    run("DELETE FROM memory_chain_events WHERE chain_id IN (SELECT id FROM memory_chains WHERE project_id=@id)",{id:req.project.id});
    for(const table of ["memory_vectors","memory_temporal_relations","memory_links","memory_relationship_changes","memory_relationships","memory_secondary_characters","memory_golden_ability_changes","memory_golden_abilities","memory_golden_changes","memory_golden_fingers","memory_prop_changes","memory_important_props","memory_resource_changes","memory_resources","memory_chains","memory_events","memory_extractions","memory_entities","story_state"]){
      run(`DELETE FROM ${table} WHERE project_id=@id`,{id:req.project.id});
    }
  });
  res.json({cleared:true,records:Object.values(counts).reduce((sum,value)=>sum+value,0),storyMemory:memorySnapshot(req.project.id)});
});
app.patch("/api/projects/:id", requireProject, (req, res) => {
  const p = { ...req.project, ...req.body };
  run(`UPDATE projects SET title=@title,logline=@logline,tags_json=@tags,total_episodes=@episodes,audience=@audience,platform=@platform,restrictions=@restrictions,seed=@seed,updated_at=@time WHERE id=@id`, {
    id: req.project.id, title: p.title, logline: p.logline || "", tags: JSON.stringify(p.tags || []), episodes: Number(p.total_episodes), audience: p.audience || "", platform: p.platform || "", restrictions: p.restrictions || "", seed: p.seed || "", time: now()
  });
  res.json(projectRow(req.project.id));
});
app.put("/api/projects/:id/template",requireProject,(req,res)=>{const templateId=String(req.body.template_id||"default");if(templateId!=="default"&&!get("SELECT id FROM templates WHERE id=@id AND (project_id IS NULL OR project_id=@pid)",{id:Number(templateId),pid:req.project.id}))return res.status(404).json({error:"模板不存在"});run("UPDATE projects SET template_id=@template,updated_at=@time WHERE id=@id",{template:templateId,time:now(),id:req.project.id});res.json({template_id:templateId});});
app.put("/api/projects/:id/emotion-intensity",requireProject,(req,res)=>{const value=req.body.emotion_intensity==="extreme"?"extreme":"strong";run("UPDATE projects SET emotion_intensity=@value,updated_at=@time WHERE id=@id",{value,time:now(),id:req.project.id});res.json({emotion_intensity:value});});
app.put("/api/projects/:id/story-mode",requireProject,(req,res)=>{const value=req.body.story_mode==="miniprogram"?"miniprogram":"normal";run("UPDATE projects SET story_mode=@value,updated_at=@time WHERE id=@id",{value,time:now(),id:req.project.id});res.json({story_mode:value});});
app.put("/api/projects/:id/narrative-person",requireProject,(req,res)=>{const value=req.body.narrative_person==="third"?"third":"first";run("UPDATE projects SET narrative_person=@value,updated_at=@time WHERE id=@id",{value,time:now(),id:req.project.id});res.json({narrative_person:value});});
app.put("/api/projects/:id/idea-libraries",requireProject,(req,res)=>{const libraries=[...new Set((Array.isArray(req.body.libraries)?req.body.libraries:[]).filter(item=>["reality","market"].includes(item)))];run("UPDATE projects SET idea_libraries_json=@libraries,updated_at=@time WHERE id=@id",{libraries:JSON.stringify(libraries),time:now(),id:req.project.id});res.json({libraries});});
app.get("/api/projects/:id/jobs", requireProject, (req,res)=>res.json(listJobs(req.project.id)));
app.get("/api/projects/:id/jobs/history",requireProject,(req,res)=>{const jobs=all("SELECT id,type,target,status,progress,total,message,error,created_at,started_at,finished_at,elapsed_ms,attempt_started_at,auto_retry_count,auto_retry_limit FROM jobs WHERE project_id=@id ORDER BY id DESC",{id:req.project.id}),logs=all(`SELECT l.job_id,l.episode_no,l.stage,l.round_no,l.outcome,l.error_type,l.message,l.duration_ms,l.started_at,l.finished_at FROM job_step_logs l JOIN jobs j ON j.id=l.job_id WHERE j.project_id=@id ORDER BY l.id DESC`,{id:req.project.id}),byJob=new Map();for(const log of logs){if(!byJob.has(log.job_id))byJob.set(log.job_id,[]);byJob.get(log.job_id).push(log);}res.json(jobs.map(job=>{const own=byJob.get(job.id)||[],counts=new Map();for(const item of own.filter(x=>x.outcome==="failed")){const previous=counts.get(item.error_type)||{error_type:item.error_type,count:0,duration_ms:0};previous.count++;previous.duration_ms+=Number(item.duration_ms)||0;counts.set(item.error_type,previous);}return {...job,step_log_count:own.length,error_summary:[...counts.values()].sort((a,b)=>b.count-a.count),slowest_steps:[...own].sort((a,b)=>Number(b.duration_ms)-Number(a.duration_ms)).slice(0,3),recent_step_logs:own.slice(0,12)};}));});
app.delete("/api/projects/:id/jobs/history",requireProject,(req,res)=>{const result=run("DELETE FROM jobs WHERE project_id=@id AND status IN ('completed','failed','cancelled')",{id:req.project.id});res.json({cleared:Number(result.changes||0)});});
app.post("/api/projects/:id/jobs/:jobId/retry",requireProject,(req,res)=>{try{
  const old=get("SELECT * FROM jobs WHERE id=@jobId AND project_id=@projectId",{jobId:Number(req.params.jobId),projectId:req.project.id});
  if(!old)return res.status(404).json({error:"原任务不存在或已被清空"});
  if(!["failed","cancelled"].includes(old.status))return res.status(400).json({error:"只有失败或已取消的任务可以继续/重试"});
  const formalTypes=new Set(["full_book","episode","episode_novel","episode_arrangement","episode_script","episode_state_extract","memory_rebuild"]),vectorTypes=new Set(["full_book","episode","episode_novel","episode_script","episode_state_extract","memory_rebuild"]);
  if(formalTypes.has(old.type)&&activeProvider().id==="mock"&&!mockWorkflowsAllowed())return res.status(428).json({error:"离线界面演示不能继续正式写作或故事记忆任务，请先配置正文生成 API。",code:"REAL_LLM_REQUIRED"});
  if(vectorTypes.has(old.type)&&activeEmbeddingProvider().id==="mock"&&!mockWorkflowsAllowed())return res.status(428).json({error:"离线向量测试不能继续正式写作或故事记忆任务，请先配置真实 Embedding API。",code:"REAL_EMBEDDING_REQUIRED"});
  if(["full_book","episode","episode_script"].includes(old.type)||(old.type==="stage"&&old.target==="outline"))return res.status(202).json({mode:"继续",job:continueJob(req.project.id,old.id),from_job_id:old.id,same_job:true});
  let type=old.type,target=old.target,mode="重试";
  if(type==="连锁重生成必须发生"){
    const next=Number(old.target)+Number(old.progress||0),last=get("SELECT MAX(episode_no) last FROM episodes WHERE project_id=@id",{id:req.project.id})?.last||0;
    if(next>last)return res.status(400).json({error:"该任务已没有未完成的分集"});
    target=String(next);mode="继续";
  }else if(type==="逐集重生成不得揭示"){
    const originalStart=old.target==="all"?1:Number(old.target),next=originalStart+Number(old.progress||0),last=get("SELECT MAX(episode_no) last FROM episodes WHERE project_id=@id",{id:req.project.id})?.last||0;
    if(next>last)return res.status(400).json({error:"该任务已没有未完成的分集"});
    target=String(next);mode="继续";
  }else if(!["stage","planning_section","episode_boundaries","episode_boundary","episode","episode_novel","episode_arrangement","episode_script","episode_state_extract","memory_rebuild"].includes(type))return res.status(400).json({error:"该任务类型暂不支持继续或重试"});
  const job=enqueueJob(req.project.id,type,target,JSON.parse(old.payload_json||"{}"));
  res.status(202).json({mode,job,from_job_id:old.id});
}catch(error){res.status(400).json({error:error.message||String(error)});}});
app.post("/api/projects/:id/jobs/:jobId/cancel",requireProject,(req,res)=>{try{res.json(cancelJob(req.project.id,req.params.jobId));}catch(error){res.status(404).json({error:error.message});}});
app.post("/api/projects/:id/jobs/stage/:stage", requireProject, (req,res)=>{
  if(!["idea","planning","cards","characters","outline"].includes(req.params.stage))return res.status(400).json({error:"未知生成阶段"});
  res.status(202).json(enqueueJob(req.project.id,"stage",req.params.stage,req.params.stage==="outline"?{auto_retry_limit:100}:{}));
});
app.post("/api/projects/:id/jobs/outline-continue",requireProject,(req,res)=>{const startEpisode=Number(req.body?.start_episode);if(!Number.isInteger(startEpisode)||startEpisode<2||startEpisode>Number(req.project.total_episodes)||(startEpisode-1)%5!==0)return res.status(400).json({error:"续写起点必须是5集窗口后的下一集，例如 EP06、EP11、EP16"});const previous=all("SELECT episode_no,summary,hook FROM episodes WHERE project_id=@pid AND episode_no<@start ORDER BY episode_no",{pid:req.project.id,start:startEpisode});if(previous.length!==startEpisode-1||previous.some((ep,index)=>Number(ep.episode_no)!==index+1||!String(ep.summary||"").trim()||!String(ep.hook||"").trim()))return res.status(400).json({error:"续写起点之前存在缺失分集，或本集大概内容、钩子为空"});res.status(202).json(enqueueJob(req.project.id,"stage","outline",{preserve_existing:true,start_episode:startEpisode,auto_retry_limit:100}));});
app.post("/api/projects/:id/jobs/planning/:section",requireProject,(req,res)=>{
  if(!["title","framework","worldbuilding","synopsis","core_expectations"].includes(req.params.section))return res.status(400).json({error:"未知的策划字段"});
  res.status(202).json(enqueueJob(req.project.id,"planning_section",req.params.section));
});
app.post("/api/projects/:id/jobs/episode-boundaries/:no",requireProject,(req,res)=>res.status(202).json(enqueueJob(req.project.id,"episode_boundaries",String(Number(req.params.no)))));
app.post("/api/projects/:id/jobs/episode-boundary/:no/:field",requireProject,(req,res)=>{if(!["required_plot","must_not_reveal"].includes(req.params.field))return res.status(400).json({error:"未知写作边界字段"});res.status(202).json(enqueueJob(req.project.id,"episode_boundary",`${Number(req.params.no)}:${req.params.field}`));});
app.post("/api/projects/:id/jobs/required-plot-chain/:start",requireProject,(req,res)=>{const start=Number(req.params.start),last=get("SELECT MAX(episode_no) last FROM episodes WHERE project_id=@id",{id:req.project.id})?.last||0;if(!Number.isInteger(start)||start<1||start>last)return res.status(400).json({error:"起始集数无效"});res.status(202).json(enqueueJob(req.project.id,"连锁重生成必须发生",String(start)));});
app.post("/api/projects/:id/jobs/must-not-reveal-all",requireProject,(req,res)=>{const count=get("SELECT COUNT(*) count FROM episodes WHERE project_id=@id",{id:req.project.id})?.count||0;if(!count)return res.status(400).json({error:"请先生成分集梗概"});res.status(202).json(enqueueJob(req.project.id,"逐集重生成不得揭示","all"));});
const requireEmbedding=requireRealEmbedding;
app.post("/api/projects/:id/jobs/episode/:no", requireProject,requireRealGeneration,requireEmbedding,(req,res)=>res.status(202).json(enqueueJob(req.project.id,"episode",String(Number(req.params.no)))));
app.post("/api/projects/:id/jobs/episode-novel/:no", requireProject,requireRealGeneration,requireEmbedding,(req,res)=>res.status(202).json(enqueueJob(req.project.id,"episode_novel",String(Number(req.params.no)))));
app.post("/api/projects/:id/jobs/episode-arrangement/:no", requireProject,requireRealGeneration, (req,res)=>res.status(202).json(enqueueJob(req.project.id,"episode_arrangement",String(Number(req.params.no)))));
app.post("/api/projects/:id/jobs/episode-script/:no", requireProject,requireRealGeneration,requireEmbedding,(req,res)=>res.status(202).json(enqueueJob(req.project.id,"episode_script",String(Number(req.params.no)))));
app.post("/api/projects/:id/jobs/episode-state/:no", requireProject,requireRealGeneration,requireEmbedding,(req,res)=>{const no=Number(req.params.no),episode=get("SELECT script FROM episodes WHERE project_id=@pid AND episode_no=@no",{pid:req.project.id,no});if(!episode)return res.status(404).json({error:"该集不存在"});if(!String(episode.script||"").trim())return res.status(400).json({error:"当前集还没有可提炼的剧本文本"});res.status(202).json(enqueueJob(req.project.id,"episode_state_extract",String(no)))});
function memoryRebuildRange(projectId){const episodes=all("SELECT episode_no,script FROM episodes WHERE project_id=@id ORDER BY episode_no",{id:projectId}),written=new Set(episodes.filter(item=>String(item.script||"").trim()).map(item=>Number(item.episode_no))),maxWritten=Math.max(0,...written);let cutoff=0;while(written.has(cutoff+1))cutoff++;const gap=maxWritten>cutoff?cutoff+1:null,ignoredWritten=gap?[...written].filter(no=>no>=gap).length:0;return {cutoff,gap,maxWritten,ignoredWritten,totalPlanned:episodes.length};}
app.get("/api/projects/:id/memory-rebuild-preview",requireProject,requireEmbedding,(req,res)=>res.json(memoryRebuildRange(req.project.id)));
app.post("/api/projects/:id/jobs/memory-rebuild",requireProject,requireRealGeneration,requireEmbedding,(req,res)=>{const range=memoryRebuildRange(req.project.id);if(!range.cutoff)return res.status(400).json({error:range.gap?`EP01没有剧本，无法建立链式剧情记忆`:"还没有可提炼的剧本"});if(range.gap&&!req.body.confirm_gap)return res.status(409).json({error:`检测到 EP${String(range.gap).padStart(2,"0")} 剧本缺失，只能重建至 EP${String(range.cutoff).padStart(2,"0")}`,code:"MEMORY_GAP_CONFIRMATION_REQUIRED",...range});res.status(202).json(enqueueJob(req.project.id,"memory_rebuild","all",{cutoff:range.cutoff,gap:range.gap}));});
app.post("/api/projects/:id/jobs/full-book", requireProject,requireRealGeneration,requireEmbedding, (req,res)=>{
  const count=get("SELECT COUNT(*) count FROM episodes WHERE project_id=@id",{id:req.project.id})?.count||0;
  if(!count)return res.status(400).json({error:"请先生成完整逐集框架"});
  const startEpisode=req.body.start_episode==null?1:Number(req.body.start_episode);
  if(!Number.isInteger(startEpisode)||startEpisode<1||!get("SELECT id FROM episodes WHERE project_id=@id AND episode_no=@episode",{id:req.project.id,episode:startEpisode}))return res.status(400).json({error:"重写起始集数无效"});
  const autoRetryLimit=Number(req.body.auto_retry_limit??5);
  if(!Number.isSafeInteger(autoRetryLimit)||autoRetryLimit<0)return res.status(400).json({error:"自动继续次数必须是非负整数"});
  const existing=get("SELECT id FROM jobs WHERE project_id=@id AND type='full_book' AND status IN ('queued','running')",{id:req.project.id});
  if(existing)return res.status(409).json({error:"已有全本或连锁重写任务正在进行，请等待完成或先取消"});
  res.status(202).json(enqueueJob(req.project.id,"full_book",startEpisode===1?"all":String(startEpisode),{overwrite:Boolean(req.body.overwrite),start_episode:startEpisode,auto_retry_limit:autoRetryLimit}));
});

app.post("/api/projects/:id/constraints", requireProject, (req, res) => {
  const b = req.body;
  const start=b.episode_start==null||b.episode_start===""?null:Number(b.episode_start),end=b.episode_end==null||b.episode_end===""?start:Number(b.episode_end);
  if(start!=null&&(!Number.isInteger(start)||start<1||start>Number(req.project.total_episodes)))return res.status(400).json({error:"硬约束起始集数无效"});
  if(end!=null&&(!Number.isInteger(end)||end<start||end>Number(req.project.total_episodes)))return res.status(400).json({error:"硬约束结束集数无效"});
  const result = run(`INSERT INTO constraints(project_id,kind,category,description,episode_start,episode_end,locked) VALUES(@project_id,@kind,@category,@description,@start,@end,@locked)`, {
    project_id: req.project.id, kind: b.kind || "hard", category: b.category || "other", description: b.description || "", start, end, locked: b.locked === false ? 0 : 1
  });
  res.status(201).json(get("SELECT * FROM constraints WHERE id=@id", { id: Number(result.lastInsertRowid) }));
});
app.delete("/api/projects/:id/constraints/:constraintId", requireProject, (req, res) => { run("DELETE FROM constraints WHERE id=@cid AND project_id=@pid", { cid: Number(req.params.constraintId), pid: req.project.id }); res.status(204).end(); });

app.put("/api/projects/:id/artifacts/:type", requireProject, (req, res) => res.json(upsertArtifact(req.project.id, req.params.type, req.body.content, req.body.status || "draft")));
app.post("/api/projects/:id/artifacts/:type/approve", requireProject, (req, res) => {
  const artifact = get("SELECT * FROM artifacts WHERE project_id=@id AND type=@type", { id: req.project.id, type: req.params.type });
  if (!artifact) return res.status(404).json({ error: "请先生成或保存本阶段内容" });
  run("UPDATE artifacts SET status='approved',updated_at=@time WHERE id=@id", { time: now(), id: artifact.id });
  if(req.params.type==="planning"){
    const planning=JSON.parse(artifact.content_json||"{}"),approvedTitle=String(planning.title||"").trim();
    if(approvedTitle)run("UPDATE projects SET title=@title,updated_at=@time WHERE id=@id",{title:approvedTitle,time:now(),id:req.project.id});
  }
  if(req.params.type==="characters")enqueueJob(req.project.id,"memory_characters","approved");
  const idx = STAGES.findIndex(x => x.artifact === req.params.type);
  const next = STAGES[Math.min(idx + 1, STAGES.length - 1)]?.id || "writing";
  run("UPDATE projects SET current_stage=@stage,updated_at=@time WHERE id=@id", { stage: next, time: now(), id: req.project.id });
  res.json({ artifact: parseArtifact(get("SELECT * FROM artifacts WHERE id=@id", { id: artifact.id })), nextStage: next });
});

app.post("/api/projects/:id/generate/:stage", requireProject, async (req, res, next) => {
  try {
    const stage = req.params.stage;
    if (!["idea","planning","cards","characters","outline"].includes(stage)) return res.status(400).json({ error: "未知生成阶段" });
    if(stage==="idea"&&(req.project.idea_libraries||[]).length&&activeEmbeddingProvider().id==="mock"&&!mockWorkflowsAllowed())return res.status(428).json({error:"已选择灵感资料库，但离线向量测试不能执行正式RAG。请配置真实 Embedding API，或取消01中的资料库勾选。",code:"REAL_EMBEDDING_REQUIRED"});
    const constraints = constraintsFor(req.project.id), artifacts = artifactsFor(req.project.id);
    const evidence = stage === "idea" ? await searchIdeaKnowledge(req.project,8) : [];
    const prompt = buildStagePrompt(stage, req.project, constraints, artifacts, evidence);
    const result = await generate({ stage, project: req.project, prompt });
    const artifact = upsertArtifact(req.project.id, stage, result.output, "draft");
    run(`INSERT INTO generations(project_id,stage,provider,model,prompt,output,status,input_tokens,output_tokens) VALUES(@pid,@stage,@provider,@model,@prompt,@output,'completed',@input,@output_tokens)`, {
      pid: req.project.id, stage, provider: result.provider, model: result.model, prompt, output: JSON.stringify(result.output), input: result.usage.input_tokens || 0, output_tokens: result.usage.output_tokens || 0
    });
    if (stage === "outline" && Array.isArray(result.output.episodes)) {
      for (const ep of result.output.episodes) {
        run(`INSERT INTO episodes(project_id,episode_no,title,summary,scene_treatment,hook,purpose,start_state,end_state,required_plot,must_reveal,must_not_reveal,rhythm,emotion,card_relation,first_appearance_characters)
          VALUES(@pid,@no,@title,@summary,@treatment,@hook,@purpose,@start,@end,@plot,@reveal,@not_reveal,@rhythm,@emotion,@card,@appearances)
          ON CONFLICT(project_id,episode_no) DO UPDATE SET title=excluded.title,summary=excluded.summary,scene_treatment=excluded.scene_treatment,hook=excluded.hook,purpose=excluded.purpose,start_state=excluded.start_state,end_state=excluded.end_state,required_plot=excluded.required_plot,must_reveal=excluded.must_reveal,must_not_reveal=excluded.must_not_reveal,rhythm=excluded.rhythm,emotion=excluded.emotion,card_relation=excluded.card_relation,first_appearance_characters=excluded.first_appearance_characters,updated_at=CURRENT_TIMESTAMP`, {
          pid: req.project.id, no: ep.episode_no, title: ep.title || "", summary: ep.summary || "", treatment:ep.scene_treatment || "", hook: ep.hook || "", purpose: ep.purpose || "", start: ep.start_state || "", end: ep.end_state || "", plot: ep.required_plot || "", reveal: ep.must_reveal || "", not_reveal: ep.must_not_reveal || "", rhythm: ep.rhythm || "", emotion: ep.emotion || "", card: ep.card_relation || "", appearances:ep.first_appearance_characters||""
        });
      }
    }
    res.json({ artifact, generation: { provider: result.provider, model: result.model }, evidence });
  } catch (error) { next(error); }
});

app.put("/api/projects/:id/episodes", requireProject, (req, res) => {
  const items=Array.isArray(req.body?.episodes)?req.body.episodes:[];
  if(!items.length)return res.status(400).json({error:"没有可保存的06内容"});
  const existing=new Set(all("SELECT episode_no FROM episodes WHERE project_id=@pid",{pid:req.project.id}).map(x=>Number(x.episode_no)));
  const invalid=items.find(item=>!existing.has(Number(item.episode_no)));
  if(invalid)return res.status(404).json({error:`EP${String(invalid.episode_no).padStart(2,"0")} 不存在`});
  for(const item of items){
    run("UPDATE episodes SET novel_summary=CASE WHEN novel<>@novel THEN '' ELSE novel_summary END,novel=@novel,episode_plan=@episode_plan,script=@script,updated_at=@time WHERE project_id=@pid AND episode_no=@no",{
      novel:String(item.novel??""),episode_plan:String(item.episode_plan??""),script:String(item.script??""),time:now(),pid:req.project.id,no:Number(item.episode_no)
    });
  }
  res.json({saved:items.length});
});

app.put("/api/projects/:id/episodes/:no", requireProject, (req, res) => {
  const allowed = ["title","summary","scene_treatment","hook","purpose","start_state","end_state","required_plot","must_reveal","must_not_reveal","rhythm","emotion","card_relation","first_appearance_characters","novel","episode_plan","script","status"];
  const current = get("SELECT * FROM episodes WHERE project_id=@pid AND episode_no=@no", { pid: req.project.id, no: Number(req.params.no) });
  if (!current) return res.status(404).json({ error: "该集不存在，请先生成逐集框架" });
  if("first_appearance_characters" in req.body){
    const content=characterArtifactContent(req.project.id),mainNames=(content?.characters||[]).map(item=>String(item.name||"").trim()).filter(Boolean),names=[...new Set(String(req.body.first_appearance_characters||"").split(/[；;、,，\n]+/).map(item=>item.trim()).filter(item=>item&&!/^(?:无|暂无|没有)$/.test(item)))],invalid=names.filter(name=>!mainNames.includes(name));
    if(invalid.length)return res.status(400).json({error:`首次出场人物不在03主要人物中：${invalid.join("、")}`});
    req.body.first_appearance_characters=names.join("；")||"无";
  }
  const merged = { ...current, ...Object.fromEntries(allowed.filter(k => k in req.body).map(k => [k, req.body[k]])) };
  run(`UPDATE episodes SET ${allowed.map(k => `${k}=@${k}`).join(",")},updated_at=@time WHERE id=@id`, { ...Object.fromEntries(allowed.map(k => [k, merged[k] ?? ""])), time: now(), id: current.id });
  if("novel" in req.body&&String(req.body.novel??"")!==String(current.novel||""))run("UPDATE episodes SET novel_summary='' WHERE id=@id",{id:current.id});
  res.json(get("SELECT * FROM episodes WHERE id=@id", { id: current.id }));
});
app.post("/api/projects/:id/episodes/:no/generate", requireProject,requireRealGeneration,requireRealEmbedding, async (req, res, next) => {
  try {
    const episode=get("SELECT * FROM episodes WHERE project_id=@pid AND episode_no=@no",{pid:req.project.id,no:Number(req.params.no)});
    if(!episode)return res.status(404).json({error:"该集不存在，请先生成逐集框架"});
    await writeEpisode(req.project,episode);
    return res.json(get("SELECT * FROM episodes WHERE id=@id",{id:episode.id}));
  } catch (error) { next(error); }
});
app.post("/api/projects/:id/episodes/:no/quality", requireProject,requireRealGeneration, async (req, res, next) => {
  try {
    const episode = get("SELECT * FROM episodes WHERE project_id=@pid AND episode_no=@no", { pid: req.project.id, no: Number(req.params.no) });
    const guide=templateWritingGuide(templateContext(req.project)),format=guide.format||{};
    // 创作提示与成稿验收均跟随当前模板；默认模板单独放宽到 1000—2000 字。
    format.targetCharacters=guide.scriptAcceptance;
    const prompt = `${buildStagePrompt("quality", req.project, constraintsFor(req.project.id), artifactsFor(req.project.id), [], {start:Number(episode?.episode_no),end:Number(episode?.episode_no)})}\n\n本集已锁定的写作任务：\n${JSON.stringify(episode||{},null,2)}\n\n当前模板格式指南：\n${JSON.stringify(format,null,2)}\n\n待检查剧本：\n${episode?.script || ""}`;
    const script=episode?.script||"",lines=script.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const metrics={characters:(script.match(/[\p{L}\p{N}]/gu)||[]).length,scenes:lines.filter(x=>/^\d+\s+(内景|外景)\s+.+/.test(x)).length,parentheticals:(script.match(/（(?!V\.O\.|OS)[^）]+）|\((?!V\.O\.|OS)[^\)]+\)/gi)||[]).length,bracketNotes:(script.match(/【[^】]+】|\[[^\]]+\]/g)||[]).length,directingTerms:(script.match(/(?:镜头|特写|运镜|摄像机|画面切至|推镜头|拉镜头|演员需|时长\s*\d+)/g)||[]).length,unfilmableTerms:(script.match(/(?:内心想着|心里暗想|他意识到|她意识到|他不知道的是|她不知道的是)/g)||[]).length,clicheReactions:(script.match(/(?:瞳孔骤缩|眼睛一亮|眼中闪过|眼神一沉|眼神一凛|嘴角(?:微微)?上扬|眉头一皱|脸色(?:骤然|猛地)?一变|倒吸一口凉气|(?:攅紧|握紧)拳头)/g)||[]).length};
    const charRange=format.targetCharacters||{},sceneRange=format.targetScenes||{},formatIssues=[];if(format.episodeHeading&&!/^EP\s*0*\d+/i.test(lines[0]||""))formatIssues.push(`缺少当前模板要求的集标题：${format.episodeHeading}`);if(sceneRange.min!=null&&metrics.scenes<sceneRange.min)formatIssues.push(`低于当前模板观测到的最少 ${sceneRange.min} 场`);if(sceneRange.max!=null&&metrics.scenes>sceneRange.max)formatIssues.push(`高于当前模板观测到的最多 ${sceneRange.max} 场`);if(charRange.min!=null&&metrics.characters<charRange.min)formatIssues.push(`低于当前模板样本的篇幅下界 ${charRange.min} 字符`);if(charRange.max!=null&&metrics.characters>charRange.max)formatIssues.push(`高于当前模板样本的篇幅上界 ${charRange.max} 字符`);if(format.writingRules?.some(x=>x.includes("括号"))&&metrics.parentheticals>2)formatIssues.push("非声音来源的括号说明不符合当前模板");if(format.writingRules?.some(x=>x.includes("方括号"))&&metrics.bracketNotes>1)formatIssues.push("制作提示数量不符合当前模板");if(metrics.directingTerms)formatIssues.push("出现镜头、摄影或演员指令，这些不属于剧本成稿");if(metrics.unfilmableTerms)formatIssues.push("出现无法直接拍摄的心理或全知解释");
    if(metrics.clicheReactions)formatIssues.push(`出现 ${metrics.clicheReactions} 处套路化微反应，如瞳孔骤缩、眼睛一亮或眼中闪过等`);
    metrics.characters=(script.match(/\p{Script=Han}/gu)||[]).length;
    const result = await generate({ stage: "quality", project: req.project, prompt, extra: { episode } });
    res.json({metrics,formatIssues,modelReview:result.output});
  } catch (error) { next(error); }
});

app.post("/api/projects/:id/state", requireProject, (req, res) => {
  const b = req.body;
  const category=String(b.category||"fact"),rawSubject=String(b.subject||"").trim(),subject=category==="relationship"?canonicalRelationshipSubject(rawSubject):rawSubject,value=String(b.value||"").trim();
  if(!subject||!value)return res.status(400).json({error:"主体和当前状态不能为空"});
  const exact=get("SELECT * FROM story_state WHERE project_id=@pid AND category=@category AND subject=@subject AND value=@value AND status='active' ORDER BY id DESC LIMIT 1",{pid:req.project.id,category,subject,value});
  if(exact)return res.status(200).json(exact);
  const result=transaction(()=>{
    if(["system","character","relationship"].includes(category))run("UPDATE story_state SET status='replaced' WHERE project_id=@pid AND category=@category AND subject=@subject AND status='active'",{pid:req.project.id,category,subject});
    return run("INSERT INTO story_state(project_id,category,subject,value,status,source_episode) VALUES(@pid,@category,@subject,@value,@status,@episode)", { pid: req.project.id, category, subject, value, status: b.status || "active", episode: b.source_episode || null });
  });
  res.status(201).json(get("SELECT * FROM story_state WHERE id=@id", { id: Number(result.lastInsertRowid) }));
});
app.delete("/api/projects/:id/state/:stateId", requireProject, (req, res) => {
  const item=get("SELECT * FROM story_state WHERE id=@sid AND project_id=@pid",{sid:Number(req.params.stateId),pid:req.project.id});
  if(!item)return res.status(404).json({error:"故事状态不存在"});
  transaction(()=>{
    run(`INSERT INTO deleted_story_state(original_id,project_id,category,subject,value,status,source_episode,original_updated_at,deleted_at)
      VALUES(@originalId,@projectId,@category,@subject,@value,@status,@sourceEpisode,@updatedAt,@deletedAt)`,{originalId:item.id,projectId:item.project_id,category:item.category,subject:item.subject,value:item.value,status:item.status,sourceEpisode:item.source_episode,updatedAt:item.updated_at,deletedAt:now()});
    run("DELETE FROM story_state WHERE id=@sid AND project_id=@pid",{sid:item.id,pid:req.project.id});
  });
  res.status(204).end();
});

const pendingTemplatePath=token=>{
  if(!/^pending-template-[a-f0-9]{16}\.docx$/i.test(String(token||"")))return null;
  const target=path.resolve(config.uploadsDir,String(token)),root=path.resolve(config.uploadsDir)+path.sep;
  return target.startsWith(root)?target:null;
};
const numberRange=(value,fallback,{automaticIdeal=false}={})=>{const min=Math.max(1,Number(value?.min)||fallback.min),max=Math.max(min,Number(value?.max)||fallback.max),ideal=automaticIdeal?Math.round((min+max)/2):Math.min(max,Math.max(min,Number(value?.ideal??value?.average)||Math.round((min+max)/2)));return {min,ideal,max};};
function reviewedTemplateAnalysis(input,base){
  const defaults=templateWritingGuide({id:"default",analysis:{inferredScriptFormat:base?.inferredScriptFormat}}).format;
  const raw=input?.inferredScriptFormat||{};
  const cleanText=(value,fallback,max=500)=>String(value||fallback||"").trim().slice(0,max);
  return {...base,
    planningSections:Array.isArray(input?.planningSections)&&input.planningSections.length?input.planningSections:base.planningSections,
    inferredScriptFormat:{
      episodeHeading:cleanText(raw.episodeHeading,defaults.episodeHeading,80),sceneHeading:cleanText(raw.sceneHeading,defaults.sceneHeading,160),dialogue:cleanText(raw.dialogue,defaults.dialogue,160),voiceOver:cleanText(raw.voiceOver,defaults.voiceOver,240),specialSpeaker:cleanText(raw.specialSpeaker,defaults.specialSpeaker,160),action:cleanText(raw.action,defaults.action,300),notes:cleanText(raw.notes,defaults.notes,300),
      novelCharacters:numberRange(raw.novelCharacters,{min:1000,ideal:1250,max:1500},{automaticIdeal:true}),targetCharacters:numberRange(raw.targetCharacters,{min:1500,ideal:1750,max:2000},{automaticIdeal:true}),novelAcceptance:numberRange(raw.novelAcceptance||raw.novelCharacters,{min:1000,ideal:1250,max:1500}),scriptAcceptance:numberRange(raw.scriptAcceptance||raw.targetCharacters,{min:1500,ideal:1750,max:2000}),targetScenes:numberRange(raw.targetScenes,{min:1,ideal:2,max:3}),
      writingRules:(Array.isArray(raw.writingRules)?raw.writingRules:String(raw.writingRules||"").split(/\r?\n/)).map(x=>String(x).trim()).filter(Boolean).slice(0,40).map(x=>x.slice(0,500)),normalization:Array.isArray(base?.inferredScriptFormat?.normalization)?base.inferredScriptFormat.normalization:[],sampleExcerpt:cleanText(raw.sampleExcerpt,"",12000)
    },sourceAnalysis:base.sourceAnalysis,detected:base.detected,episodeStats:base.episodeStats,lineCount:base.lineCount,characterCount:base.characterCount
  };
}

app.post("/api/templates/analyze", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "请选择 DOCX 文件" });
    if (path.extname(req.file.originalname).toLowerCase() !== ".docx") { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "目前模板分析支持 DOCX" }); }
    const token=`pending-template-${crypto.randomUUID().replace(/-/g,"").slice(0,16)}.docx`,finalPath=path.join(config.uploadsDir,token);fs.renameSync(req.file.path,finalPath);
    const { text, analysis } = await analyzeDocx(finalPath);
    res.json({token,original_name:req.file.originalname,name:req.body.name||req.file.originalname.replace(/\.docx$/i,""),analysis,preview:text.slice(0,1200)});
  } catch (error) { next(error); }
});

app.post("/api/templates", async (req, res, next) => {
  try {
    const finalPath=pendingTemplatePath(req.body.token);
    const fromDefault=req.body.source_mode==="default";
    if(!fromDefault&&(!finalPath||!fs.existsSync(finalPath)))return res.status(400).json({error:"待确认的模板文件已失效，请重新上传"});
    const analyzed=fromDefault?{text:"",analysis:templateContext({template_id:"default"}).analysis}:await analyzeDocx(finalPath);
    const {text,analysis:base}=analyzed,analysis=reviewedTemplateAnalysis(req.body.analysis||{},base);
    const result = run("INSERT INTO templates(project_id,name,original_name,file_path,kind,extracted_text,analysis_json) VALUES(@pid,@name,@original,@path,@kind,@text,@analysis)", {
      pid: null, name: String(req.body.name||req.body.original_name||"格式模板").trim().slice(0,120), original: String(req.body.original_name||(fromDefault?"基于默认模板":"导入模板.docx")).slice(0,260), path: fromDefault?"":finalPath,
      kind: fromDefault?"format":analysis.detected?.hasScriptSample?"script-format":"format", text, analysis: JSON.stringify(analysis)
    });
    res.status(201).json({ id: Number(result.lastInsertRowid), name:req.body.name, analysis });
  } catch (error) { next(error); }
});

app.delete("/api/templates/pending/:token",(req,res)=>{const target=pendingTemplatePath(req.params.token);if(target&&fs.existsSync(target))fs.unlinkSync(target);res.status(204).end();});

app.delete("/api/templates/:templateId",async(req,res,next)=>{try{
  const id=Number(req.params.templateId);
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"默认模板不能删除"});
  const row=get("SELECT * FROM templates WHERE id=@id",{id});
  if(!row)return res.status(404).json({error:"模板不存在或已被删除"});
  run("UPDATE projects SET template_id='default',updated_at=@time WHERE template_id=@template",{time:now(),template:String(id)});
  run("DELETE FROM templates WHERE id=@id",{id});
  const filePath=path.resolve(String(row.file_path||"")),uploadRoot=path.resolve(config.uploadsDir)+path.sep;
  if(row.file_path&&filePath.startsWith(uploadRoot)&&fs.existsSync(filePath)){try{fs.unlinkSync(filePath);}catch{}}
  res.status(204).end();
}catch(error){next(error);}});

function characterArtifactContent(projectId){const artifact=get("SELECT content_json FROM artifacts WHERE project_id=@id AND type='characters'",{id:projectId});return artifact?JSON.parse(artifact.content_json||"{}"):null;}
function characterAt(projectId,index){return characterArtifactContent(projectId)?.characters?.[index]||null;}
function completeCharacterImagePrompt(content,character){
  const style=String(content?.visual_style||"真人微短剧写实质感，人物造型符合故事时代与地域，统一自然光影与电影级色彩，真实皮肤纹理").trim();
  const individual=String(character.image_prompt||`${character.name||"人物"}，${character.age||"成年"}，外形与服装符合其身份和故事场域`).trim();
  return `${style}。${individual}。单人，竖版2:3，全身人物设定照，正面或轻微侧身自然站立，眼平机位，头顶与双脚完整入画，简洁的故事场域背景，无文字，无水印，无标志，无拼图，无分屏，无其他人物，避免裁切头脚、重复肢体、畸形手指、过度磨皮、夸张网红脸。`.slice(0,2000);
}
function saveCharacterImage(projectId,index,name,filePath,source,prompt=""){run(`INSERT INTO character_images(project_id,character_index,character_name,file_path,source,prompt) VALUES(@pid,@idx,@name,@path,@source,@prompt)
  ON CONFLICT(project_id,character_index) DO UPDATE SET character_name=excluded.character_name,file_path=excluded.file_path,source=excluded.source,prompt=excluded.prompt,created_at=CURRENT_TIMESTAMP`,{pid:projectId,idx:index,name,path:filePath,source,prompt});return get("SELECT id,character_index,character_name,source,prompt,created_at FROM character_images WHERE project_id=@pid AND character_index=@idx",{pid:projectId,idx:index});}
app.post("/api/projects/:id/characters/:index/image/generate",requireProject,async(req,res)=>{
  const index=Number(req.params.index),content=characterArtifactContent(req.project.id),character=content?.characters?.[index];if(!character)return res.status(404).json({error:"请先生成人物人设"});
  if(activeProvider().id!=="minimax")return res.status(400).json({error:"目前只支持使用 MiniMax 生图；当前使用其他模型时，可以手动上传人物图片。"});
  const key=config.providerKeys.minimax;if(!key)return res.status(400).json({error:"生成形象图需要先在模型设置中保存 MiniMax API Key。"});
  const prompt=completeCharacterImagePrompt(content,character);
  const response=await fetch("https://api.minimaxi.com/v1/image_generation",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:"image-01",prompt,aspect_ratio:"2:3",response_format:"base64",n:1,prompt_optimizer:true})});
  const data=await response.json().catch(()=>({}));if(!response.ok||data.base_resp?.status_code) return res.status(400).json({error:data.base_resp?.status_msg||data.error?.message||`MiniMax 图片接口错误 ${response.status}`});
  const encoded=data.data?.image_base64?.[0];if(!encoded)return res.status(400).json({error:"MiniMax 未返回图片数据"});
  const target=path.join(config.uploadsDir,`character-${req.project.id}-${index}-${Date.now()}.jpeg`);fs.writeFileSync(target,Buffer.from(encoded,"base64"));const saved=saveCharacterImage(req.project.id,index,character.name||`人物${index+1}`,target,"minimax",prompt);res.json({...saved,url:`/character-images/${saved.id}`});
});
app.post("/api/projects/:id/characters/:index/image-prompt/regenerate",requireProject,async(req,res,next)=>{try{
  const index=Number(req.params.index),content=characterArtifactContent(req.project.id),character=content?.characters?.[index];
  if(!character)return res.status(404).json({error:"请先生成人物人设"});
  const artifacts=artifactsFor(req.project.id),prompt=buildCharacterImagePromptPrompt(req.project,artifacts,character,index,content.visual_style||"");
  const schema={type:"object",properties:{visual_style:{type:"string"},image_prompt:{type:"string"}},required:["visual_style","image_prompt"],additionalProperties:false};
  const result=await generate({stage:"character_image_prompt",project:req.project,prompt,schema});
  const visualStyle=String(content.visual_style||result.output?.visual_style||"").trim(),imagePrompt=String(result.output?.image_prompt||"").trim();
  if(!visualStyle||!imagePrompt)throw new Error("模型没有返回完整的人物图片提示词");
  content.visual_style=visualStyle;content.characters[index]={...character,image_prompt:imagePrompt};
  const artifact=upsertArtifact(req.project.id,"characters",content,"draft");
  run(`INSERT INTO generations(project_id,stage,provider,model,prompt,output,status) VALUES(@pid,'character_image_prompt',@provider,@model,@prompt,@output,'completed')`,{pid:req.project.id,provider:result.provider,model:result.model,prompt,output:JSON.stringify(result.output)});
  res.json({visual_style:visualStyle,image_prompt:imagePrompt,artifact});
}catch(error){next(error);}});
app.post("/api/projects/:id/characters/:index/image/upload",requireProject,upload.single("file"),(req,res)=>{const index=Number(req.params.index),character=characterAt(req.project.id,index);if(!character){if(req.file)fs.unlinkSync(req.file.path);return res.status(404).json({error:"请先生成人物人设"});}if(!req.file?.mimetype?.startsWith("image/")){if(req.file)fs.unlinkSync(req.file.path);return res.status(400).json({error:"请选择图片文件"});}const ext=path.extname(req.file.originalname)||".jpg",target=`${req.file.path}${ext}`;fs.renameSync(req.file.path,target);const saved=saveCharacterImage(req.project.id,index,character.name||`人物${index+1}`,target,"upload","");res.json({...saved,url:`/character-images/${saved.id}`});});
app.get("/character-images/:imageId",(req,res)=>{const row=get("SELECT file_path FROM character_images WHERE id=@id",{id:Number(req.params.imageId)});if(!row||!fs.existsSync(row.file_path))return res.status(404).end();res.sendFile(path.resolve(row.file_path));});

app.get("/api/knowledge", (req, res) => res.json(searchKnowledge(req.query.q || "", req.query.library || "", req.query.limit || 30, req.query.item_type || "")));
app.get("/api/knowledge/status",(_req,res)=>{const time=now(),counts=all(`SELECT library,item_type,COUNT(*) count FROM knowledge_items WHERE (expires_at IS NULL OR expires_at>@time) GROUP BY library,item_type`,{time}),sources=all("SELECT name,kind,library,enabled,last_run_at,last_status,update_interval_minutes FROM sources WHERE kind <> 'weibo_hot' ORDER BY id"),pendingAutomatic=Number(get(`SELECT COUNT(*) count FROM knowledge_items WHERE auto_generated=1 AND item_type='source' AND length(summary)>=30 AND (narrative_json IS NULL OR narrative_json='{}') AND (expires_at IS NULL OR expires_at>@time)`,{time})?.count||0),pendingManual=Number(get(`SELECT COUNT(*) count FROM knowledge_items k WHERE k.auto_generated=0 AND k.item_type='source' AND length(CASE WHEN length(k.content)>0 THEN k.content ELSE k.summary END)>=30 AND NOT EXISTS (SELECT 1 FROM knowledge_items d WHERE d.source_url=('manual-card://' || k.id))`)?.count||0),pendingEmbedding=Number(get(`SELECT COUNT(*) count FROM knowledge_items WHERE item_type IN ('reality_trend','work_card','reality_card','trend_card') AND (embedding_json IS NULL OR embedding_json='[]') AND (expires_at IS NULL OR expires_at>@time)`,{time})?.count||0);res.json({retentionDays:30,counts,sources,backlog:{pendingExtraction:pendingAutomatic+pendingManual,pendingEmbedding,embeddingConfigured:embeddingConfigured()}});});
app.post("/api/knowledge", async (req, res) => {
  const b = req.body, snapshot = b.snapshot_date || new Date().toISOString().slice(0, 10);
  const manualUrl = b.source_url || `manual://${crypto.randomUUID()}`;
  const result = run(`INSERT INTO knowledge_items(library,title,summary,content,tags_json,platform,rank_value,published_at,snapshot_date,source_url,narrative_json)
    VALUES(@library,@title,@summary,@content,@tags,@platform,@rank,@published,@snapshot,@url,@narrative)`, { library: b.library || "reality", title: b.title || "未命名", summary: b.summary || "", content: b.content || b.summary || "", tags: JSON.stringify(b.tags || []), platform: b.platform || "", rank: b.rank_value || null, published: b.published_at || null, snapshot, url: manualUrl, narrative: JSON.stringify(b.narrative || {}) });
  const sourceId = Number(result.lastInsertRowid);
  try {
    const derived = await enrichManualKnowledge(sourceId);
    res.status(201).json({ item: get("SELECT * FROM knowledge_items WHERE id=@id", { id: sourceId }), derived });
  } catch (error) {
    res.status(201).json({ item: get("SELECT * FROM knowledge_items WHERE id=@id", { id: sourceId }), derived: null, warning: `原文已保存，但自动提炼暂未完成：${error.message}` });
  }
});
app.get("/api/sources", (_req, res) => res.json(all("SELECT * FROM sources ORDER BY id DESC")));
app.post("/api/sources", async (req, res) => {
  const b=req.body,kind=b.kind||"rss";
  if(kind!=="rss")return res.status(400).json({error:"当前仅支持手动添加RSS/Atom订阅来源"});
  if(get("SELECT id FROM sources WHERE kind='rss' AND url=@url",{url:String(b.url||"").trim()}))return res.status(409).json({error:"该RSS地址已经添加过"});
  let validation;try{validation=await validateRssSource(b.url)}catch(error){return res.status(400).json({error:error.message})}
  const result=run("INSERT INTO sources(name,kind,library,url,update_interval_minutes) VALUES(@name,@kind,@library,@url,@interval)", { name:b.name||validation.title||"未命名来源", kind, library:b.library||"reality", url:validation.url, interval:Number(b.update_interval_minutes||1440) });
  const source=get("SELECT * FROM sources WHERE id=@id", { id:Number(result.lastInsertRowid) });
  try{const firstUpdate=await updateSource(source);let processing=null,warning="";try{processing=await processKnowledgeBacklog()}catch(error){warning=`首次抓取成功，后续提炼暂未完成：${error.message}`}return res.status(201).json({source,validation,firstUpdate,processing,warning})}catch(error){run("UPDATE sources SET last_run_at=@time,last_status=@status WHERE id=@id",{time:now(),status:`error:${error.message}`,id:source.id});return res.status(201).json({source,validation,firstUpdate:null,warning:`RSS验证成功并已保存，但首次抓取遇到临时错误：${error.message}`})}
});
app.post("/api/sources/update", async (_req, res) => res.json(await updateAllSources()));
app.post("/api/sources/:sourceId/update", async (req, res) => { const source=get("SELECT * FROM sources WHERE id=@id", {id:Number(req.params.sourceId)}); if(!source) return res.status(404).json({error:"来源不存在"}); res.json(await updateSource(source)); });

app.post("/api/projects/:id/export", requireProject, async (req, res, next) => { try {
  const type=["outline","novel","script"].includes(req.body?.type)?req.body.type:"script",requested=Array.isArray(req.body?.episode_numbers)?[...new Set(req.body.episode_numbers.map(Number).filter(Number.isInteger))]:null;
  let episodes=all("SELECT * FROM episodes WHERE project_id=@id ORDER BY episode_no",{id:req.project.id});if(requested)episodes=episodes.filter(ep=>requested.includes(ep.episode_no));
  const label=type==="outline"?"梗概":type==="novel"?"小说":"剧本";episodes=episodes.filter(ep=>String(type==="outline"?[ep.title,ep.summary,ep.hook,ep.required_plot].join(""):type==="novel"?ep.novel:ep.script).trim());if(!episodes.length)return res.status(400).json({error:`所选集数中没有可导出的${label}内容`});
  const output=await exportProjectDocx(req.project,artifactsFor(req.project.id),episodes,all("SELECT * FROM character_images WHERE project_id=@id",{id:req.project.id}),{type,novelBracketsToQuotes:type==="novel"&&req.body?.novel_brackets_to_quotes===true});res.json({filename:output.filename,url:`/exports/${encodeURIComponent(output.filename)}`,episodes:episodes.map(x=>x.episode_no),type});
} catch(error){next(error);} });
app.use("/exports", express.static(config.exportsDir));
app.use(express.static(config.publicDir));
app.get("/{*splat}", (_req, res) => res.sendFile(path.join(config.publicDir, "index.html")));
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: error.message || "服务器错误" }); });
