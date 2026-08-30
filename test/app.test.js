import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mammoth from "mammoth";

process.env.APP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mochao-test-"));
process.env.LLM_PROVIDER = "mock";
process.env.EMBEDDING_PROVIDER = "mock";
process.env.ALLOW_MOCK_WORKFLOWS = "1";
const { app } = await import("../src/app.js");
const { run } = await import("../src/db.js");
const { searchIdeaKnowledge, cleanupAutomaticKnowledge, seedAutomaticSources } = await import("../src/knowledge.js");
const { novelDescriptionIssues, novelPerspectiveIssue, splitNovelLongParagraphs } = await import("../src/llm.js");
const { buildEpisodeNovelPrompt, buildOutlineDramaticBatchPrompt } = await import("../src/prompts.js");
const { createWorkspaceBackup, restoreWorkspaceBackup, validateWorkspaceBackup } = await import("../src/backup.js");
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const request = async (url, options={}) => { const r=await fetch(base+url,{headers:{"content-type":"application/json"},...options}); const body=r.status===204?null:await r.json(); return {r,body}; };

test("健康检查和完整创作主链", async () => {
  const scopedConstraints=[
    {kind:"hard",category:"ending",description:"主角最终必须回家",episode_start:null,episode_end:null},
    {kind:"hard",category:"character",description:"苏婉清发现录音",episode_start:6,episode_end:6},
    {kind:"hard",category:"reveal",description:"反派身份不得揭晓",episode_start:7,episode_end:9}
  ];
  const scopedNovel=buildEpisodeNovelPrompt({narrative_person:"first",emotion_intensity:"strong"},scopedConstraints,[],{episode_no:6},[],{generationTarget:{}},{});assert.match(scopedNovel,/主角最终必须回家/);assert.match(scopedNovel,/苏婉清发现录音/);assert.doesNotMatch(scopedNovel,/反派身份不得揭晓/);assert.match(scopedNovel,/适用EP06/);
  const scopedBatch=buildOutlineDramaticBatchPrompt({total_episodes:10,tags:[]},scopedConstraints,[],[],[{episode_no:6}],[],[]);assert.match(scopedBatch,/苏婉清发现录音/);assert.doesNotMatch(scopedBatch,/反派身份不得揭晓/);
  const sinkingBatch=buildOutlineDramaticBatchPrompt({total_episodes:10,tags:[],story_mode:"miniprogram"},[],[],[],[{episode_no:1}],[],[]);assert.match(sinkingBatch,/软肋/);assert.match(sinkingBatch,/反常配合/);assert.match(sinkingBatch,/荒谬私利/);assert.match(sinkingBatch,/同等级、立即生效/);
  const normalBatch=buildOutlineDramaticBatchPrompt({total_episodes:10,tags:[],story_mode:"normal"},[],[],[],[{episode_no:1}],[],[]);assert.doesNotMatch(normalBatch,/反常配合/);
  assert.equal(novelPerspectiveIssue(`我推开门。\n\n「他怎么还没来？」`,"first"),"");
  assert.match(novelPerspectiveIssue(`方野推开门。\n\n「我来晚了。」`,"first"),/第一人称/);
  assert.equal(novelPerspectiveIssue(`方野推开门。\n\n「我来晚了。」`,"third"),"");
  assert.match(novelPerspectiveIssue(`我推开门。\n\n「你找谁？」`,"third"),/第三人称/);
  const safelySplit=splitNovelLongParagraphs("我推开院门，母亲从里屋走出来。她把缴费单递给我。门外突然响起急促的敲门声。刘麻子带着两个人堵住出口。");
  assert.match(safelySplit,/走出来。\n\n她把/);assert.equal(novelDescriptionIssues(safelySplit).length,0);
  const indivisible="「你不知道还敢收我两千块的卦金，还敢保证这趟出行有惊无险，现在出了这么大的事你准备怎么负责？」";
  assert.equal(splitNovelLongParagraphs(indivisible),indivisible);assert.equal(novelDescriptionIssues(indivisible).length,1);
  assert.equal(novelDescriptionIssues("齐夏终于站起身，从乔家劲手中拿过羊皮面具，仔细看了看上面最后一句话。").length,0);
  assert.equal(novelDescriptionIssues(`我把面具拿到眼前，反复观察上面每一道已经干裂的纹路，又沿着边缘慢慢摸索，试图从那些细小痕迹里找出隐藏的信息和制造者留下的线索。`).length,1);
  assert.equal(novelDescriptionIssues(`王志远端起茶杯：「这只算见面礼，你敢不敢跟我去市场走一趟，把剩下那批原石全看完，再替我把所有鉴定结果逐件写清楚？」`).length,1);
  assert.equal(novelDescriptionIssues(`王志远端起茶杯：「这只算见面礼，敢不敢跟我去市场？」`).length,0);
  assert.equal((await request("/api/health")).body.ok, true);
  const connection=await request("/api/settings/llm/test",{method:"POST",body:JSON.stringify({provider:"mock"})});assert.equal(connection.body.ok,true);
  const embeddingConnection=await request("/api/settings/embedding/test",{method:"POST",body:JSON.stringify({provider:"mock"})});assert.equal(embeddingConnection.body.ok,true);assert.ok(embeddingConnection.body.dimensions>0);
  const created=await request("/api/projects",{method:"POST",body:JSON.stringify({title:"测试短剧",total_episodes:6,tags:["悬疑"],seed:"失忆的女主每天收到未来的短信"})});
  assert.equal(created.r.status,201); const id=created.body.id;
  assert.deepEqual((await request(`/api/projects/${id}`)).body.idea_libraries,[]);
  const selectedIdeaLibraries=await request(`/api/projects/${id}/idea-libraries`,{method:"PUT",body:JSON.stringify({libraries:["reality","market","invalid","reality"]})});assert.deepEqual(selectedIdeaLibraries.body.libraries,["reality","market"]);assert.deepEqual((await request(`/api/projects/${id}`)).body.idea_libraries,["reality","market"]);
  const today=new Date().toISOString().slice(0,10),future=new Date(Date.now()+86400000).toISOString();run(`INSERT INTO knowledge_items(library,external_id,title,summary,snapshot_date,source_url,narrative_json,item_type,confidence,expires_at,auto_generated) VALUES('market','test-work','摆摊鉴宝逆袭','底层摊主获得鉴别古董真伪的能力',@date,'test://work',@narrative,'work_card',0.9,@expires,1)`,{date:today,expires:future,narrative:JSON.stringify({one_sentence_premise:"底层摊主依靠鉴宝能力进入古玩圈",core_mechanism:"鉴别古董真伪"})});const ragEvidence=await searchIdeaKnowledge({seed:"摆摊鉴宝",tags:["逆袭"],idea_libraries:["market"]},8);assert.ok(ragEvidence.some(item=>item.title==="摆摊鉴宝逆袭"));
  run(`INSERT INTO knowledge_items(library,external_id,title,summary,snapshot_date,source_url,narrative_json,item_type,confidence,expires_at,auto_generated) VALUES('reality','test-signal','特殊测试热搜标题','只是原始热搜证据',@date,'test://signal','{}','reality_signal',0.9,@expires,1),('reality','test-reality-trend','特殊测试现实趋势','多日多标题聚合得出的现实矛盾趋势',@date,'test://reality-trend',@trend,'reality_trend',0.9,@expires,1)`,{date:today,expires:future,trend:JSON.stringify({summary:"现实趋势摘要",transferable_mechanism:"冲突机制"})});const realityEvidence=await searchIdeaKnowledge({seed:"特殊测试",tags:["现实趋势"],idea_libraries:["reality"]},8);assert.ok(realityEvidence.some(item=>item.item_type==="reality_trend"));assert.ok(!realityEvidence.some(item=>item.item_type==="reality_signal"));
  run(`INSERT INTO knowledge_items(library,title,snapshot_date,source_url,item_type,expires_at,auto_generated) VALUES('market','过期资料',@date,'test://expired','work_card','2000-01-01T00:00:00.000Z',1)`,{date:today});assert.ok(cleanupAutomaticKnowledge()>=1);seedAutomaticSources();const knowledgeStatus=await request("/api/knowledge/status");assert.equal(knowledgeStatus.body.retentionDays,30);assert.ok(knowledgeStatus.body.sources.some(item=>item.name==="番茄小说官方榜单"));assert.ok(knowledgeStatus.body.sources.some(item=>item.name==="红果短剧官方榜单"&&item.enabled===0));
  await request(`/api/projects/${id}/idea-libraries`,{method:"PUT",body:JSON.stringify({libraries:[]})});assert.deepEqual((await request(`/api/projects/${id}`)).body.idea_libraries,[]);
  const builtinTemplate=(await request(`/api/projects/${id}`)).body.templates.find(item=>item.id==="default");
  const zhihuTemplate=(await request(`/api/projects/${id}`)).body.templates.find(item=>item.id==="zhihu-yanxuan-manju");
  assert.equal(zhihuTemplate?.source,"builtin");
  assert.deepEqual(zhihuTemplate?.analysis?.inferredScriptFormat?.novelCharacters,{min:700,ideal:1000,max:1300});
  assert.deepEqual(zhihuTemplate?.analysis?.inferredScriptFormat?.targetCharacters,{min:500,ideal:700,max:900});
  assert.equal((await request(`/api/projects/${id}/template`,{method:"PUT",body:JSON.stringify({template_id:"zhihu-yanxuan-manju"})})).r.status,200);
  assert.equal((await request(`/api/projects/${id}`)).body.template_id,"zhihu-yanxuan-manju");
  assert.equal((await request(`/api/templates/zhihu-yanxuan-manju`,{method:"DELETE"})).r.status,400);
  await request(`/api/projects/${id}/template`,{method:"PUT",body:JSON.stringify({template_id:"default"})});
  const customFormat=structuredClone(builtinTemplate.analysis);customFormat.inferredScriptFormat.novelCharacters={min:1801,ideal:1999,max:2800};customFormat.inferredScriptFormat.novelAcceptance={min:1600,max:3200};customFormat.inferredScriptFormat.scriptAcceptance={min:1200,max:2200};customFormat.inferredScriptFormat.targetScenes={min:2,ideal:3,max:4};
  const createdFormatTemplate=await request("/api/templates",{method:"POST",body:JSON.stringify({source_mode:"default",project_id:id,name:"自定义篇幅格式",analysis:customFormat})});assert.equal(createdFormatTemplate.r.status,201);assert.equal(createdFormatTemplate.body.analysis.inferredScriptFormat.novelCharacters.ideal,2301);assert.equal(createdFormatTemplate.body.analysis.inferredScriptFormat.novelAcceptance.min,1600);assert.equal(createdFormatTemplate.body.analysis.inferredScriptFormat.novelAcceptance.max,3200);assert.equal(createdFormatTemplate.body.analysis.inferredScriptFormat.scriptAcceptance.min,1200);assert.equal(createdFormatTemplate.body.analysis.inferredScriptFormat.targetScenes.ideal,3);assert.equal(createdFormatTemplate.body.analysis.inferredScriptFormat.targetScenes.max,4);
  const afterFormatTemplate=(await request(`/api/projects/${id}`)).body;assert.ok(afterFormatTemplate.templates.some(item=>item.name==="自定义篇幅格式"));
  const scopedConstraint=await request(`/api/projects/${id}/constraints`,{method:"POST",body:JSON.stringify({category:"reveal",description:"只在第三至第五集生效",episode_start:3,episode_end:5})});assert.equal(scopedConstraint.r.status,201);assert.equal(scopedConstraint.body.episode_start,3);assert.equal(scopedConstraint.body.episode_end,5);
  const invalidConstraint=await request(`/api/projects/${id}/constraints`,{method:"POST",body:JSON.stringify({category:"reveal",description:"非法范围",episode_start:5,episode_end:3})});assert.equal(invalidConstraint.r.status,400);
  const thirdPerson=await request(`/api/projects/${id}/narrative-person`,{method:"PUT",body:JSON.stringify({narrative_person:"third"})});assert.equal(thirdPerson.body.narrative_person,"third");
  assert.equal((await request(`/api/projects/${id}`)).body.narrative_person,"third");
  const firstPerson=await request(`/api/projects/${id}/narrative-person`,{method:"PUT",body:JSON.stringify({narrative_person:"first"})});assert.equal(firstPerson.body.narrative_person,"first");
  await request(`/api/projects/${id}/constraints`,{method:"POST",body:JSON.stringify({category:"ending",description:"结局必须 HE"})});
  for(const stage of ["idea","planning","characters","cards","outline"]){
    const generated=await request(`/api/projects/${id}/generate/${stage}`,{method:"POST",body:"{}"}); assert.equal(generated.r.status,200); assert.equal(generated.body.generation.provider,"mock");
    const approved=await request(`/api/projects/${id}/artifacts/${stage}/approve`,{method:"POST",body:"{}"}); assert.equal(approved.r.status,200);
  }
  const project=(await request(`/api/projects/${id}`)).body; assert.equal(project.episodes.length,6); assert.equal(project.current_stage,"writing");
  const episode=await request(`/api/projects/${id}/episodes/1/generate`,{method:"POST",body:"{}"}); assert.match(episode.body.script,/EP01/);assert.ok(episode.body.novel);assert.match(episode.body.episode_plan,/【逻辑推理】/);assert.match(episode.body.character_identifiers_json,/主角/);
  const quality=await request(`/api/projects/${id}/episodes/1/quality`,{method:"POST",body:"{}"}); assert.equal(quality.body.modelReview.passed,true);assert.equal(typeof quality.body.metrics.characters,"number");
  const background=await request(`/api/projects/${id}/jobs/full-book`,{method:"POST",body:JSON.stringify({overwrite:false,auto_retry_limit:7})});assert.equal(background.r.status,202);assert.equal(background.body.auto_retry_limit,7);
  let job;for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,20));job=(await request(`/api/projects/${id}/jobs`)).body.find(x=>x.id===background.body.id);if(["completed","failed"].includes(job.status))break;}
  assert.equal(job.status,"completed",JSON.stringify({status:job.status,progress:job.progress,message:job.message,error:job.error,auto_retry_count:job.auto_retry_count,checkpoint:job.checkpoint}));assert.equal(job.progress,5);
  const fullBookHistory=(await request(`/api/projects/${id}/jobs/history`)).body.find(item=>item.id===background.body.id);assert.ok(fullBookHistory.recent_step_logs.some(item=>item.stage==="memory"&&item.outcome==="completed"),JSON.stringify(fullBookHistory.recent_step_logs));
  const completedProject=(await request(`/api/projects/${id}`)).body;assert.equal(completedProject.episodes.filter(x=>x.script).length,6);
  const memoryPreview=await request(`/api/projects/${id}/memory-rebuild-preview`);assert.equal(memoryPreview.body.cutoff,6);assert.equal(memoryPreview.body.gap,null);
  const episode3=completedProject.episodes.find(item=>item.episode_no===3);await request(`/api/projects/${id}/episodes/3`,{method:"PUT",body:JSON.stringify({script:""})});const gapPreview=await request(`/api/projects/${id}/memory-rebuild-preview`);assert.equal(gapPreview.body.cutoff,2);assert.equal(gapPreview.body.gap,3);assert.equal(gapPreview.body.ignoredWritten,3);await request(`/api/projects/${id}/episodes/3`,{method:"PUT",body:JSON.stringify({script:episode3.script})});
  assert.equal(completedProject.storyMemory.stats.status,"ready");assert.ok(completedProject.storyMemory.stats.entities>=1);assert.equal(completedProject.storyMemory.stats.syncedEpisode,6);
  const exported=await request(`/api/projects/${id}/export`,{method:"POST",body:"{}"}); assert.match(exported.body.filename,/\.docx$/);
  const selectedScript=await request(`/api/projects/${id}/export`,{method:"POST",body:JSON.stringify({type:"script",episode_numbers:[1]})});assert.deepEqual(selectedScript.body.episodes,[1]);
  const scriptText=(await mammoth.extractRawText({path:path.join(process.env.APP_DATA_DIR,"exports",selectedScript.body.filename)})).value;assert.equal((scriptText.match(/EP01/g)||[]).length,1);
  const selectedNovel=await request(`/api/projects/${id}/export`,{method:"POST",body:JSON.stringify({type:"novel",episode_numbers:[1,2]})});assert.deepEqual(selectedNovel.body.episodes,[1,2]);
  const novelText=(await mammoth.extractRawText({path:path.join(process.env.APP_DATA_DIR,"exports",selectedNovel.body.filename)})).value;assert.doesNotMatch(novelText,/EP0[12]/);assert.match(novelText,/\n1\n/);assert.match(novelText,/\n2\n/);
  const selectedOutline=await request(`/api/projects/${id}/export`,{method:"POST",body:JSON.stringify({type:"outline",episode_numbers:[1,2]})});assert.deepEqual(selectedOutline.body.episodes,[1,2]);
  const outlineText=(await mammoth.extractRawText({path:path.join(process.env.APP_DATA_DIR,"exports",selectedOutline.body.filename)})).value;assert.match(outlineText,/分集梗概/);assert.match(outlineText,/EP01/);assert.match(outlineText,/本集大概内容/);assert.match(outlineText,/集尾钩子 \/ 悬念/);assert.match(outlineText,/必须发生/);
  const refusedClear=await request(`/api/projects/${id}/story-memory`,{method:"DELETE",body:JSON.stringify({confirm:false})});assert.equal(refusedClear.r.status,400);
  const cleared=await request(`/api/projects/${id}/story-memory`,{method:"DELETE",body:JSON.stringify({confirm:true})});assert.equal(cleared.r.status,200);assert.equal(cleared.body.cleared,true);assert.ok(cleared.body.records>0);
  const afterClear=(await request(`/api/projects/${id}`)).body;assert.equal(afterClear.storyMemory.stats.status,"empty");assert.equal(afterClear.storyMemory.stats.events,0);assert.equal(afterClear.storyMemory.stats.entities,0);assert.equal(afterClear.episodes.filter(item=>item.script).length,6);assert.ok(afterClear.artifacts.some(item=>item.type==="characters"));
  const workspaceBackup=createWorkspaceBackup("test");assert.equal(validateWorkspaceBackup(workspaceBackup).format,"mochao-workspace-backup");assert.equal(workspaceBackup.tables.projects.length,1);assert.equal(workspaceBackup.tables.episodes.length,6);assert.equal("jobs" in workspaceBackup.tables,false);assert.equal("generations" in workspaceBackup.tables,false);assert.doesNotMatch(JSON.stringify(workspaceBackup),/API_KEY/);run("UPDATE projects SET title='临时改名' WHERE id=@id",{id});const restoredWorkspace=restoreWorkspaceBackup(workspaceBackup);assert.equal(restoredWorkspace.projects,1);assert.equal((await request(`/api/projects/${id}`)).body.title,afterClear.title);assert.equal(restoredWorkspace.needsVectorRebuild,true);
  const workbenchOff=await request("/api/workbench");assert.equal(workbenchOff.body.parallelEnabled,false);assert.equal(workbenchOff.body.maxTasks,10);assert.equal(workbenchOff.body.effectiveConcurrency,1);
  const workbenchOn=await request("/api/workbench",{method:"PUT",body:JSON.stringify({parallel_enabled:true,concurrency_mode:"manual",concurrency_limit:2})});assert.equal(workbenchOn.body.parallelEnabled,true);assert.equal(workbenchOn.body.effectiveConcurrency,2);assert.match(workbenchOn.body.sessionId,/^wb-/);
  const workbenchAuto=await request("/api/workbench",{method:"PUT",body:JSON.stringify({concurrency_mode:"auto"})});assert.equal(workbenchAuto.body.concurrencyMode,"auto");
  const workbenchDisabled=await request("/api/workbench",{method:"PUT",body:JSON.stringify({parallel_enabled:false})});assert.equal(workbenchDisabled.body.parallelEnabled,false);assert.equal(workbenchDisabled.body.sessionId,"");assert.deepEqual(workbenchDisabled.body.jobs,[]);
});

test.after(()=>server.close());
