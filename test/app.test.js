import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mammoth from "mammoth";

process.env.APP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mochao-test-"));
process.env.LLM_PROVIDER = "mock";
const { app } = await import("../src/app.js");
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const request = async (url, options={}) => { const r=await fetch(base+url,{headers:{"content-type":"application/json"},...options}); const body=r.status===204?null:await r.json(); return {r,body}; };

test("健康检查和完整创作主链", async () => {
  assert.equal((await request("/api/health")).body.ok, true);
  const connection=await request("/api/settings/llm/test",{method:"POST",body:JSON.stringify({provider:"mock"})});assert.equal(connection.body.ok,true);
  const created=await request("/api/projects",{method:"POST",body:JSON.stringify({title:"测试短剧",total_episodes:6,tags:["悬疑"],seed:"失忆的女主每天收到未来的短信"})});
  assert.equal(created.r.status,201); const id=created.body.id;
  await request(`/api/projects/${id}/constraints`,{method:"POST",body:JSON.stringify({category:"ending",description:"结局必须 HE"})});
  for(const stage of ["idea","planning","characters","cards","outline"]){
    const generated=await request(`/api/projects/${id}/generate/${stage}`,{method:"POST",body:"{}"}); assert.equal(generated.r.status,200); assert.equal(generated.body.generation.provider,"mock");
    const approved=await request(`/api/projects/${id}/artifacts/${stage}/approve`,{method:"POST",body:"{}"}); assert.equal(approved.r.status,200);
  }
  const project=(await request(`/api/projects/${id}`)).body; assert.equal(project.episodes.length,6); assert.equal(project.current_stage,"writing");
  const episode=await request(`/api/projects/${id}/episodes/1/generate`,{method:"POST",body:"{}"}); assert.match(episode.body.script,/EP01/);assert.ok(episode.body.novel);assert.match(episode.body.episode_plan,/【逻辑推理】/);assert.match(episode.body.character_identifiers_json,/主角/);
  const quality=await request(`/api/projects/${id}/episodes/1/quality`,{method:"POST",body:"{}"}); assert.equal(quality.body.modelReview.passed,true);assert.equal(typeof quality.body.metrics.characters,"number");
  const background=await request(`/api/projects/${id}/jobs/full-book`,{method:"POST",body:JSON.stringify({overwrite:false})});assert.equal(background.r.status,202);
  let job;for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,20));job=(await request(`/api/projects/${id}/jobs`)).body.find(x=>x.id===background.body.id);if(["completed","failed"].includes(job.status))break;}
  assert.equal(job.status,"completed");assert.equal(job.progress,5);
  const completedProject=(await request(`/api/projects/${id}`)).body;assert.equal(completedProject.episodes.filter(x=>x.script).length,6);
  const exported=await request(`/api/projects/${id}/export`,{method:"POST",body:"{}"}); assert.match(exported.body.filename,/\.docx$/);
  const selectedScript=await request(`/api/projects/${id}/export`,{method:"POST",body:JSON.stringify({type:"script",episode_numbers:[1]})});assert.deepEqual(selectedScript.body.episodes,[1]);
  const scriptText=(await mammoth.extractRawText({path:path.join(process.env.APP_DATA_DIR,"exports",selectedScript.body.filename)})).value;assert.equal((scriptText.match(/EP01/g)||[]).length,1);
  const selectedNovel=await request(`/api/projects/${id}/export`,{method:"POST",body:JSON.stringify({type:"novel",episode_numbers:[1,2]})});assert.deepEqual(selectedNovel.body.episodes,[1,2]);
  const novelText=(await mammoth.extractRawText({path:path.join(process.env.APP_DATA_DIR,"exports",selectedNovel.body.filename)})).value;assert.doesNotMatch(novelText,/EP0[12]/);assert.match(novelText,/\n1\n/);assert.match(novelText,/\n2\n/);
});

test.after(()=>server.close());
