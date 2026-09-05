import { all, detachLegacyStoryStateFromControls, get, run, now, transaction } from "./db.js";
import { ARTIFACT_TITLES, canonicalRelationshipSubject, parseArtifact, parseProject, resolveProtagonist } from "./domain.js";
import { buildEpisodeArrangementPrompt, buildEpisodeBoundariesPrompt, buildEpisodeBoundaryPrompt, buildEpisodeNovelPrompt, buildPreviousNovelSummaryPrompt, buildSkillEpisodePrompt, buildPlanningSectionPrompt, buildStagePrompt, buildOutlineSpinePrompt, buildOutlineDramaticBatchPrompt, buildOutlineFinalizePrompt } from "./prompts.js";
import { consolidateEpisodeArrangementScenes, generate, novelSceneTransitionCandidates } from "./llm.js";
import { searchIdeaKnowledge } from "./knowledge.js";
import { templateContext, templateWritingGuide } from "./templates.js";
import { bootstrapCharacterMemory, compileMemoryContext, extractEpisodeMemory } from "./memory.js";
import { embeddingConfigured } from "./embeddings.js";
import { activeProvider } from "./config.js";
import { AsyncLocalStorage } from "node:async_hooks";

const jobControllers=new Map();
const jobContext=new AsyncLocalStorage();
const currentSignal=()=>jobContext.getStore()?.signal||null;
const OUTLINE_SPINE_API_ERROR="OUTLINE_SPINE_API_ERROR::";
const outlineSpineApiFailure=(error,elapsedMs,extra={})=>{
  const provider=activeProvider(),raw=String(error?.message||error||"未知错误"),status=Number(error?.status||error?.statusCode||0)||null;
  let code="long_task_incompatible",title="API 未能完成全剧骨架",message="当前 API 可以处理短文本，但未能完成本次长结构化任务。可能涉及长输出能力、线路稳定性或结构化输出兼容性。";
  if(status===402||/(?:402|insufficient.?balance|余额不足|额度不足|欠费)/i.test(raw)){code="insufficient_balance";title="API 额度不足";message="当前 API 拒绝了长文本请求，可能是余额、套餐额度或可用 Token 不足。请检查服务商额度后重试。";}
  else if(status===429||/(?:429|rate.?limit|too many requests|请求过多|限流|TPM|RPM)/i.test(raw)){code="rate_limit";title="API 触发限流";message="当前请求触发了 API 的频率、Token 或并发限制。请稍后重试，或降低并发、更换额度更高的 API。";}
  else if(status===401||status===403||/(?:401|403|unauthorized|forbidden|鉴权|无权限|API Key)/i.test(raw)){code="permission";title="API 权限不足";message="当前 API Key、模型权限或服务商账户权限不足，无法执行全剧骨架请求。请检查模型设置与服务商权限。";}
  else if(/(?:finish_reason\s*[=:]\s*length|达到.{0,8}(?:输出|长度).{0,8}上限|输出.{0,8}(?:上限|截断)|max(?:imum)?.?tokens?|context length|token.{0,6}(?:limit|超限)|413|too long)/i.test(raw)){code="output_limit";title="API 输出长度不足";message="当前 API 未能完整返回全剧骨架，内容可能达到该模型或接口的单次输出上限。请更换支持更长输出的模型或 API。";}
  else if(/(?:timed out|timeout|超时|504|gateway timeout)/i.test(raw)){code="timeout";title="API 长请求超时";message="模型在规定时间内没有完成返回，可能是 API、中转线路或部署网络提前断开。本次任务已安全停止。";}
  else if(/(?:ECONN|socket|connection|fetch failed|network|连接.*(?:关闭|中断|失败))/i.test(raw)){code="connection";title="API 长连接中断";message="API 或中转线路在返回全剧骨架前断开了连接。本次任务已安全停止，请检查线路或更换 API。";}
  else if(/(?:JSON|结构化|没有找到 JSON|可解析|应返回\d+集|缺少或重复EP)/i.test(raw)){code="structured_output";title="API 结构化输出不稳定";message="当前模型可以完成短文本生成，但未能完整返回可解析的全剧骨架。请更换结构化输出能力更强的模型或 API。";}
  return new Error(OUTLINE_SPINE_API_ERROR+JSON.stringify({code,title,message,provider:provider.label,model:provider.model,status,elapsed_ms:Math.max(0,Number(elapsedMs)||0),raw_error:raw,...extra}));
};
const parseJob = row => row ? { ...row, payload:JSON.parse(row.payload_json||"{}"), result:JSON.parse(row.result_json||"{}"),checkpoint:JSON.parse(row.checkpoint_json||"{}") } : null;
const projectFor = id => parseProject(get("SELECT * FROM projects WHERE id=@id",{id}));
const constraintsFor = id => all("SELECT * FROM constraints WHERE project_id=@id ORDER BY id",{id});
const artifactsFor = id => {detachLegacyStoryStateFromControls(id);return all("SELECT * FROM artifacts WHERE project_id=@id ORDER BY id",{id}).map(parseArtifact);};
const lastScriptScene=(script,maxCharacters=1200)=>{
  const text=String(script||"").trim();if(!text)return "";
  const headings=[...text.matchAll(/^\s*\d+\s+(?:内景?|外景?)\s+.+$/gm)];
  const lastScene=headings.length?text.slice(headings.at(-1).index).trim():text;
  return lastScene.length>maxCharacters?lastScene.slice(-maxCharacters).trim():lastScene;
};

function upsertArtifact(projectId,type,content){
  const existing=get("SELECT id FROM artifacts WHERE project_id=@pid AND type=@type",{pid:projectId,type});
  if(existing) run("UPDATE artifacts SET content_json=@content,status='draft',version=version+1,updated_at=@time WHERE id=@id",{content:JSON.stringify(content),time:now(),id:existing.id});
  else run("INSERT INTO artifacts(project_id,type,title,content_json,status) VALUES(@pid,@type,@title,@content,'draft')",{pid:projectId,type,title:ARTIFACT_TITLES[type]||type,content:JSON.stringify(content)});
}
const outlineText=(value,separator="")=>{
  if(value==null)return "";
  if(Array.isArray(value))return value.map(item=>outlineText(item,separator)).filter(Boolean).join(separator||"；");
  if(typeof value==="object")return Object.values(value).map(item=>outlineText(item,separator)).filter(Boolean).join(separator||"；");
  return String(value).trim();
};
const characterNumber=value=>{
  const digits={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
  const raw=String(value||"").trim();
  if(!raw)return 0;if(/^\d+$/.test(raw))return Number(raw);
  if(raw==="十")return 10;if(raw.startsWith("十"))return 10+(digits[raw[1]]||0);if(raw.endsWith("十"))return (digits[raw[0]]||0)*10;
  return raw.includes("十")?(digits[raw[0]]||0)*10+(digits[raw[2]]||0):(digits[raw]||0);
};
const requestedCharacterSpec=value=>{
  const source=String(value||""),number="(\\d{1,2}|[一二两三四五六七八九十]{1,2})",unit="(?:个|名|位)",role="((?:主要)?(?:人物|角色|人设|男主|女主|男配|女配|反派|配角))";
  const addition=source.match(new RegExp(`(?:少了|缺少|缺|增加|新增|添加|再加|补充|补齐|再来|还要)[^。；，,]{0,8}?${number}\\s*${unit}\\s*${role}`));
  if(addition)return {mode:"add",count:characterNumber(addition[1]),role:addition[2]};
  const total=source.match(new RegExp(`(?:生成|设计|安排|需要|要|希望|共|总共|一共)?\\s*${number}\\s*${unit}\\s*${role}`));
  return total?{mode:"total",count:characterNumber(total[1]),role:total[2]}:{mode:"default",count:0,role:""};
};
const roleMatches=(character,role)=>{
  if(!role||/(?:人物|角色|人设)$/.test(role))return true;
  const value=String(character?.role||"");
  if(role==="男主")return /男.*主|主角/.test(value)&&!/女/.test(value);
  if(role==="女主")return /女.*主|主角/.test(value)&&!/男/.test(value);
  return value.includes(role.replace(/^主要/,""));
};
const characterComplianceSchema={type:"object",properties:{passed:{type:"boolean"},missing_requirements:{type:"array",items:{type:"string"}}},required:["passed","missing_requirements"],additionalProperties:false};
const normalizeOutlineEpisode=ep=>({...ep,episode_no:Number(ep?.episode_no),title:outlineText(ep?.title),summary:outlineText(ep?.summary,"\n"),scene_treatment:outlineText(ep?.scene_treatment,"\n"),hook:outlineText(ep?.hook,"\n"),purpose:outlineText(ep?.purpose,"；"),start_state:outlineText(ep?.start_state,"；"),end_state:outlineText(ep?.end_state,"；"),required_plot:outlineText(ep?.required_plot,"→"),must_reveal:outlineText(ep?.must_reveal,"；"),must_not_reveal:outlineText(ep?.must_not_reveal,"；")||"无",rhythm:outlineText(ep?.rhythm,"→"),emotion:outlineText(ep?.emotion,"→"),card_relation:outlineText(ep?.card_relation,"；"),first_appearance_characters:outlineText(ep?.first_appearance_characters,"；")||"无"});
const appearanceNames=value=>[...new Set(String(value||"").split(/[；;、,，\n]+/).map(item=>item.trim()).filter(item=>item&&!/^(?:无|暂无|没有)$/.test(item)))];
const appearanceMap=episodes=>{const map=new Map();for(const ep of episodes||[])for(const name of appearanceNames(ep.first_appearance_characters))if(!map.has(name))map.set(name,Number(ep.episode_no));return map;};
const escapePattern=value=>String(value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const characterAliases=character=>{const name=String(character?.name||"").trim(),aliases=new Set(name?[name]:[]),source=[character?.biography,character?.personality].filter(Boolean).join("\n");if(/^[\p{Script=Han}]{3}$/u.test(name))aliases.add(name.slice(1));for(const match of source.matchAll(/(?:乳名|原名|本名|艺名|化名|别名|外号|人称)为?[“「"']?([\p{Script=Han}A-Za-z0-9·]{2,10})/gu))aliases.add(match[1]);return [...aliases].filter(alias=>alias.length>=2);};
const quotedAt=(text,index)=>{for(const [open,close] of [["“","”"],["「","」"],["\"","\""]]){const before=text.lastIndexOf(open,index),after=text.indexOf(close,index+1);if(before>=0&&after>index&&(open!==close||text.indexOf(close,before+1)===after))return true;}return false;};
const nonAppearanceMention=(unit,alias,index)=>{
  const before=unit.slice(Math.max(0,index-34),index),after=unit.slice(index+alias.length,index+alias.length+38),window=`${before}${alias}${after}`;
  if(/(?:实时通话|视频通话|实时连线|正在直播|直播连线|电话那头|正在通话)/.test(window))return false;
  const escaped=escapePattern(alias),carrier=`(?:照片|相片|画像|遗像|海报|纸条|纸页|信件|日记|档案|资料|录像|录音|监控|新闻|报道|梦境|梦里|闪回|回忆画面|过去)`;
  if(new RegExp(`${carrier}(?:中|里|上|中的|里的)?.{0,24}${escaped}|${escaped}.{0,10}(?:的照片|的画像|的录像|的录音|出现在屏幕|出现在回忆)`).test(window))return true;
  if(new RegExp(`(?:提到|提及|谈起|说起|听说|得知|获知|明知|打听|调查|查询|寻找|寻访|想起|回忆起|梦见|梦到|写着|写下|记载|显示|看到).{0,14}${escaped}`).test(window))return true;
  if(new RegExp(`${escaped}.{0,8}(?:三字|二字|字眼|的名字|的资料|的档案|的消息|的传闻|的下落|失踪|下落不明)`).test(window))return true;
  return quotedAt(unit,index)&&!new RegExp(`${escaped}.{0,6}(?:说|问|喊|答|命令|威胁|哭道|笑道)`).test(before.slice(-alias.length-8)+alias+after.slice(0,8));
};
const characterParticipatesInEpisode=(episode,aliases)=>{const sources=[String(episode.required_plot||"").split(/→|[\n；;]/),String(episode.summary||"").split(/[\n。！？]/),String(episode.hook||"").split(/[\n。！？]/)];for(const units of sources)for(const raw of units){const unit=raw.trim();if(!unit)continue;for(const alias of aliases){for(const match of unit.matchAll(new RegExp(escapePattern(alias),"g")))if(!nonAppearanceMention(unit,alias,match.index))return true;}}return false;};
function resolveFirstAppearancesProgrammatically(job,project,episodes,characters,lockedThrough=0,baseProgress=1+Math.ceil(Number(project.total_episodes||episodes?.length||0)/5)*2){
  const list=(episodes||[]).sort((a,b)=>Number(a.episode_no)-Number(b.episode_no)),names=(characters||[]).map(item=>String(item.name||"").trim()).filter(Boolean),assigned=new Map();
  for(const ep of list.filter(item=>Number(item.episode_no)<=Number(lockedThrough)))for(const name of appearanceNames(ep.first_appearance_characters))if(names.includes(name)&&!assigned.has(name))assigned.set(name,Number(ep.episode_no));
  for(let index=0;index<characters.length;index++){const character=characters[index],name=String(character?.name||"").trim();if(!name||assigned.has(name))continue;run("UPDATE jobs SET message=@message WHERE id=@id",{message:`正在检查主要人物“${name}”的首次正式出场`,id:job.id});const hit=list.find(ep=>Number(ep.episode_no)>Number(lockedThrough)&&characterParticipatesInEpisode(ep,characterAliases(character)));if(hit)assigned.set(name,Number(hit.episode_no));run("UPDATE jobs SET progress=@progress WHERE id=@id",{progress:baseProgress+index+1,id:job.id});}
  const byEpisode=new Map();for(const [name,no] of assigned){if(!byEpisode.has(no))byEpisode.set(no,[]);byEpisode.get(no).push(name);}for(const ep of list)ep.first_appearance_characters=(byEpisode.get(Number(ep.episode_no))||[]).join("；")||"无";
  return list;
}
async function runFirstAppearanceRefresh(job,project){
  const artifacts=artifactsFor(project.id),characters=artifacts.find(item=>item.type==="characters")?.content?.characters||[],episodes=all("SELECT episode_no,title,summary,scene_treatment,hook,purpose,start_state,end_state,required_plot,must_reveal,must_not_reveal,rhythm,emotion,card_relation,first_appearance_characters FROM episodes WHERE project_id=@pid ORDER BY episode_no",{pid:project.id}).map(normalizeOutlineEpisode);
  if(!episodes.length)throw new Error("还没有可用的分集梗概");
  if(!characters.length)throw new Error("还没有已批准的主要人物");
  run("UPDATE jobs SET total=@total,progress=0,message='正在根据已有梗概逐人物定位首次正式出场' WHERE id=@id",{total:characters.length,id:job.id});
  const derived=resolveFirstAppearancesProgrammatically(job,project,episodes,characters,0,0);
  transaction(()=>{for(const ep of derived)run("UPDATE episodes SET first_appearance_characters=@value,updated_at=@time WHERE project_id=@pid AND episode_no=@no",{value:ep.first_appearance_characters,time:now(),pid:project.id,no:ep.episode_no});upsertArtifact(project.id,"outline",{episodes:derived});});
  run("UPDATE jobs SET progress=@progress,message='主要人物首次正式出场已重新定位' WHERE id=@id",{progress:characters.length,id:job.id});
  return {characters:characters.length,episodes:episodes.length};
}
const outlineStoryWorldEpisodeLeak=value=>{
  const text=String(value||"");if(!text)return "";
  const episodeMeta=/(?:EP\s*0*\d+|第[零〇一二三四五六七八九十百两\d]+集|本集|这一集|上(?:一)?集|下(?:一)?集)/i;
  for(const match of text.matchAll(/[「“]([^」”]{1,160})[」”]/g)){
    const quote=match[1];
    if(episodeMeta.test(quote)&&!/(?:电视剧|连续剧|动画|节目|短剧|剧本|作品)\s*(?:的)?\s*(?:EP\s*0*\d+|第[零〇一二三四五六七八九十百两\d]+集)/i.test(quote))return match[0];
  }
  const carrier=/(?:日记|信件|纸条|短信|消息|记录本|录音|广播|屏幕|弹幕|系统(?:音|提示|播报)?|预言|预告)(?:中|里|上)?(?:写着|写下|记着|记载|显示|出现|提示|播报|宣告|预告|告诉|传来|响起|称|说)[^。！？\n]{0,100}?(?:EP\s*0*\d+|第[零〇一二三四五六七八九十百两\d]+集|本集|这一集|上(?:一)?集|下(?:一)?集)/i;
  return text.match(carrier)?.[0]||"";
};
const characterAppearanceContext=(projectId,episodeNo,characterCards=[])=>{
  const rows=all("SELECT episode_no,first_appearance_characters FROM episodes WHERE project_id=@pid ORDER BY episode_no",{pid:projectId}),planned=appearanceMap(rows);
  if(!planned.size)return {text:"",forbidden:[]};
  const names=characterCards.map(item=>String(item.name||"").trim()).filter(Boolean),current=names.filter(name=>planned.get(name)===Number(episodeNo)),available=names.filter(name=>planned.has(name)&&planned.get(name)<Number(episodeNo)),forbidden=names.filter(name=>planned.has(name)&&planned.get(name)>Number(episodeNo));
  return {forbidden,text:[`本集首次出场：${current.join("、")||"无"}`,`此前已经首登场、但仅在本集事件需要时才可出场：${available.join("、")||"无"}`,`尚未到首次出场集、禁止本人进入现场：${forbidden.map(name=>`${name}（EP${String(planned.get(name)).padStart(2,"0")}）`).join("、")||"无"}`].join("\n")};
};
function saveOutline(projectId,episodes){
  const normalized=(episodes||[]).map(normalizeOutlineEpisode);
  for(const ep of normalized) run(`INSERT INTO episodes(project_id,episode_no,title,summary,scene_treatment,hook,purpose,start_state,end_state,required_plot,must_reveal,must_not_reveal,rhythm,emotion,card_relation,first_appearance_characters)
    VALUES(@pid,@no,@title,@summary,@treatment,@hook,@purpose,@start,@end,@plot,@reveal,@not_reveal,@rhythm,@emotion,@card,@appearances)
    ON CONFLICT(project_id,episode_no) DO UPDATE SET title=excluded.title,summary=excluded.summary,scene_treatment=excluded.scene_treatment,hook=excluded.hook,purpose=excluded.purpose,start_state=excluded.start_state,end_state=excluded.end_state,required_plot=excluded.required_plot,must_reveal=excluded.must_reveal,must_not_reveal=excluded.must_not_reveal,rhythm=excluded.rhythm,emotion=excluded.emotion,card_relation=excluded.card_relation,first_appearance_characters=excluded.first_appearance_characters,updated_at=CURRENT_TIMESTAMP`,{
    pid:projectId,no:ep.episode_no,title:ep.title,summary:ep.summary,treatment:ep.scene_treatment,hook:ep.hook,purpose:ep.purpose,start:ep.start_state,end:ep.end_state,plot:ep.required_plot,reveal:ep.must_reveal,not_reveal:ep.must_not_reveal,rhythm:ep.rhythm,emotion:ep.emotion,card:ep.card_relation,appearances:ep.first_appearance_characters
  });
  return normalized;
}
async function runStage(job,project){
  const stage=job.target,constraints=constraintsFor(project.id),artifacts=artifactsFor(project.id);
  const evidence=stage==="idea"?await searchIdeaKnowledge(project,8):[];
  const prompt=buildStagePrompt(stage,project,constraints,artifacts,evidence);
  const result=await generate({stage,project,prompt,signal:currentSignal()});
  let output=result.output;
  if(stage==="characters"){
    const existing=artifacts.find(x=>x.type==="characters")?.content||{};
    const oldCharacters=Array.isArray(existing.characters)?existing.characters:[];
    const nextCharacters=Array.isArray(output?.characters)?[...output.characters]:[];
    for(const oldCharacter of oldCharacters){
      const sameName=nextCharacters.some(item=>String(item.name||"").trim()&&String(item.name||"").trim()===String(oldCharacter.name||"").trim());
      if(!sameName)nextCharacters.push(oldCharacter);
    }
    output={...output,visual_style:existing.visual_style||output?.visual_style||"",characters:nextCharacters};
  }
  upsertArtifact(project.id,stage,output); if(stage==="outline")saveOutline(project.id,output.episodes);
  run("INSERT INTO generations(project_id,stage,provider,model,prompt,output,status,input_tokens,output_tokens) VALUES(@pid,@stage,@provider,@model,@prompt,@output,'completed',@input,@out)",{pid:project.id,stage,provider:result.provider,model:result.model,prompt,output:JSON.stringify(output),input:result.usage.input_tokens||0,out:result.usage.output_tokens||0});
  return {provider:result.provider,model:result.model};
}
async function runPlanningSection(job,project){
  const section=job.target;
  const allowed=["title","framework","worldbuilding","synopsis","core_expectations"];
  if(!allowed.includes(section))throw new Error("未知的策划字段");
  const constraints=constraintsFor(project.id),artifacts=artifactsFor(project.id);
  const current=artifacts.find(x=>x.type==="planning")?.content||{};
  const prompt=buildPlanningSectionPrompt(section,project,constraints,artifacts);
  const schema={type:"object",properties:{[section]:{type:"string"}},required:[section],additionalProperties:false};
  const result=await generate({stage:"planning_section",project,prompt,schema,extra:{section},signal:currentSignal()});
  const merged={...current,[section]:result.output[section]};
  upsertArtifact(project.id,"planning",merged);
  run("INSERT INTO generations(project_id,stage,provider,model,prompt,output,status,input_tokens,output_tokens) VALUES(@pid,@stage,@provider,@model,@prompt,@output,'completed',@input,@out)",{pid:project.id,stage:`planning.${section}`,provider:result.provider,model:result.model,prompt,output:JSON.stringify(result.output),input:result.usage.input_tokens||0,out:result.usage.output_tokens||0});
  return {section,provider:result.provider,model:result.model};
}
async function runEpisodeBoundaries(job,project){
  const episode=get("SELECT * FROM episodes WHERE project_id=@pid AND episode_no=@no",{pid:project.id,no:Number(job.target)});
  if(!episode)throw new Error("该集不存在，请先生成分集梗概");
  if(!String(episode.summary||"").trim()||!String(episode.hook||"").trim())throw new Error("请先填写本集大概内容和集尾钩子");
  run("UPDATE jobs SET message='正在从本集内容和钩子提炼写作边界' WHERE id=@id",{id:job.id});
  const previous=episode.episode_no>1?get("SELECT required_plot,hook FROM episodes WHERE project_id=@pid AND episode_no=@no",{pid:project.id,no:episode.episode_no-1}):null;
  const prompt=buildEpisodeBoundariesPrompt(episode.summary,episode.hook,episode.episode_no,previous?.required_plot||previous?.hook||"",constraintsFor(project.id));
  const result=await generate({stage:"episode_boundaries_text",project,prompt,signal:currentSignal()});
  const text=String(result.output||"").replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/^```(?:text|plaintext|markdown)?\s*/i,"").replace(/\s*```$/i,"").trim();
  const required=text.match(/【必须发生】\s*([\s\S]*?)(?=\n\s*【不得揭示】|$)/)?.[1]?.trim();
  const forbidden=text.match(/【不得揭示】\s*([\s\S]*)$/)?.[1]?.trim();
  if(!required||forbidden==null)throw new Error("模型未按两行格式返回写作边界，请重试");
  run("UPDATE episodes SET required_plot=@required,must_not_reveal=@forbidden,updated_at=@time WHERE id=@id",{required,forbidden:forbidden||"无",time:now(),id:episode.id});
  run("INSERT INTO generations(project_id,stage,provider,model,prompt,output,status,input_tokens,output_tokens) VALUES(@pid,'episode_boundaries',@provider,@model,@prompt,@output,'completed',@input,@out)",{pid:project.id,provider:result.provider,model:result.model,prompt,output:text,input:result.usage.input_tokens||0,out:result.usage.output_tokens||0});
  return {episode:episode.episode_no};
}
async function runEpisodeBoundary(job,project){
  const [episodeNo,field]=String(job.target).split(":");
  if(!["required_plot","must_not_reveal"].includes(field))throw new Error("未知的写作边界字段");
  const episode=get("SELECT * FROM episodes WHERE project_id=@pid AND episode_no=@no",{pid:project.id,no:Number(episodeNo)});
  if(!episode)throw new Error("该集不存在，请先生成分集梗概");
  if(!String(episode.summary||"").trim()||!String(episode.hook||"").trim())throw new Error("请先填写本集大概内容和集尾钩子");
  if(!["连锁重生成必须发生","逐集重生成不得揭示"].includes(job.type))run("UPDATE jobs SET message=@message WHERE id=@id",{message:`正在单独生成${field==="required_plot"?"必须发生":"不得揭示"}`,id:job.id});
  const previous=field==="required_plot"&&episode.episode_no>1?get("SELECT required_plot,hook FROM episodes WHERE project_id=@pid AND episode_no=@no",{pid:project.id,no:episode.episode_no-1}):null;
  const prompt=buildEpisodeBoundaryPrompt(episode.summary,episode.hook,field,episode.episode_no,previous?.required_plot||previous?.hook||"",constraintsFor(project.id));
  const summaryEventFloor=field==="required_plot"?4:0;
  const result=await generate({stage:"episode_boundary_text",project,prompt,extra:{boundaryField:field,minBoundaryItems:summaryEventFloor,requiresOpeningPayoff:field==="required_plot"&&episode.episode_no>1},signal:currentSignal()});
  let value=String(result.output||"").replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/^```(?:text|plaintext|markdown)?\s*/i,"").replace(/\s*```$/i,"").trim();
  value=value.replace(/^\s*(?:【?(?:必须发生|不得揭示)】?\s*[：:]?\s*|(?:required_plot|must_not_reveal)\s*[：:]\s*)/i,"").trim();
  if(field==="must_not_reveal"){
    if(/^(?:无|暂无|没有|无相关内容|本集无)(?:[。.!！])?$/.test(value))value="无";
    else{
      value=value.replace(/\r/g,"\n").replace(/(?:^|\n)\s*(?:[-*•·]|\d+[.、）)]|[（(]\d+[）)]|[一二三四五六七八九十]+、)\s*/g,"\n").replace(/\s+(?=\d+[.、）)]\s*)/g,"\n");
      const items=value.split(/[\n；;]+/).map(x=>x.replace(/^\s*(?:[-*•·]|\d+[.、）)]|[（(]\d+[）)]|[一二三四五六七八九十]+、)\s*/,"").replace(/[。；;，,、\s]+$/g,"").trim()).filter(x=>x&&!/^(?:无|暂无|没有)$/.test(x));
      value=[...new Set(items)].join("；")||"无";
    }
  }
  if(!value)value=field==="must_not_reveal"?"无":"";
  if(!value)throw new Error("模型没有返回必须发生的内容");
  run(`UPDATE episodes SET ${field}=@value,updated_at=@time WHERE id=@id`,{value,time:now(),id:episode.id});
  run("INSERT INTO generations(project_id,stage,provider,model,prompt,output,status,input_tokens,output_tokens) VALUES(@pid,@stage,@provider,@model,@prompt,@output,'completed',@input,@out)",{pid:project.id,stage:`episode_boundary.${field}`,provider:result.provider,model:result.model,prompt,output:value,input:result.usage.input_tokens||0,out:result.usage.output_tokens||0});
  return {episode:episode.episode_no,field};
}
async function runRequiredPlotChain(job,project){
  const start=Number(job.target),episodes=all("SELECT episode_no FROM episodes WHERE project_id=@id AND episode_no>=@start ORDER BY episode_no",{id:project.id,start});
  if(!episodes.length)throw new Error("没有找到需要重新生成的分集");
  run("UPDATE artifacts SET status='draft',updated_at=@time WHERE project_id=@pid AND type='outline'",{time:now(),pid:project.id});
  run("UPDATE jobs SET total=@total,progress=0,message=@message WHERE id=@id",{total:episodes.length,message:`准备从 EP${String(start).padStart(2,"0")} 连锁重生成必须发生`,id:job.id});
  try{
    for(let i=0;i<episodes.length;i++){
      const no=episodes[i].episode_no;
      let completed=false,lastError=null;
      for(let round=1;round<=3&&!completed;round++){
        run("UPDATE jobs SET progress=@progress,message=@message WHERE id=@id",{progress:i,message:round===1?`正在生成 EP${String(no).padStart(2,"0")} 的必须发生（${i+1}/${episodes.length}）`:`EP${String(no).padStart(2,"0")} 未通过校验，正在重新生成（第${round}轮/3）`,id:job.id});
        try{await runEpisodeBoundary({...job,target:`${no}:required_plot`},project);completed=true;}
        catch(error){
          lastError=error;
          if(currentSignal()?.aborted)throw error;
          const message=String(error?.message||error);
          const cannotRetry=/(?:敏感|拒绝|拦截|API Key|401|403|余额|额度|鉴权|模型不存在)/i.test(message);
          if(cannotRetry||round===3)throw new Error(`EP${String(no).padStart(2,"0")} 连续3轮重新生成仍未通过：${message}`);
        }
      }
      if(!completed)throw lastError||new Error(`EP${String(no).padStart(2,"0")} 生成失败`);
      run("UPDATE jobs SET progress=@progress,message=@message WHERE id=@id",{progress:i+1,message:`已完成 EP${String(no).padStart(2,"0")}（${i+1}/${episodes.length}）`,id:job.id});
    }
  }finally{
    const refreshed=all("SELECT episode_no,title,summary,hook,purpose,start_state,end_state,required_plot,must_reveal,must_not_reveal,rhythm,emotion,card_relation,first_appearance_characters FROM episodes WHERE project_id=@id ORDER BY episode_no",{id:project.id});
    upsertArtifact(project.id,"outline",{episodes:refreshed});
  }
  return {start,episodes:episodes.length};
}
async function runMustNotRevealAll(job,project){
  const start=job.target==="all"?1:Number(job.target||1),episodes=all("SELECT episode_no FROM episodes WHERE project_id=@id AND episode_no>=@start ORDER BY episode_no",{id:project.id,start});
  if(!episodes.length)throw new Error("没有找到需要重新生成的分集");
  run("UPDATE artifacts SET status='draft',updated_at=@time WHERE project_id=@pid AND type='outline'",{time:now(),pid:project.id});
  run("UPDATE jobs SET total=@total,progress=0,message='准备逐集重新生成不得揭示' WHERE id=@id",{total:episodes.length,id:job.id});
  try{
    for(let i=0;i<episodes.length;i++){
      const no=episodes[i].episode_no;
      let completed=false,lastError=null;
      for(let round=1;round<=3&&!completed;round++){
        run("UPDATE jobs SET progress=@progress,message=@message WHERE id=@id",{progress:i,message:round===1?`正在生成 EP${String(no).padStart(2,"0")} 的不得揭示（${i+1}/${episodes.length}）`:`EP${String(no).padStart(2,"0")} 请求未完成，正在重试（第${round}轮/3）`,id:job.id});
        try{await runEpisodeBoundary({...job,target:`${no}:must_not_reveal`},project);completed=true;}
        catch(error){
          lastError=error;
          if(currentSignal()?.aborted)throw error;
          const message=String(error?.message||error),cannotRetry=/(?:敏感|拒绝|拦截|API Key|401|403|余额|额度|鉴权|模型不存在)/i.test(message);
          if(cannotRetry||round===3)throw new Error(`EP${String(no).padStart(2,"0")} 连续3轮仍未完成：${message}`);
        }
      }
      if(!completed)throw lastError||new Error(`EP${String(no).padStart(2,"0")} 生成失败`);
      run("UPDATE jobs SET progress=@progress,message=@message WHERE id=@id",{progress:i+1,message:`已完成 EP${String(no).padStart(2,"0")}（${i+1}/${episodes.length}）`,id:job.id});
    }
  }finally{
    const refreshed=all("SELECT episode_no,title,summary,hook,purpose,start_state,end_state,required_plot,must_reveal,must_not_reveal,rhythm,emotion,card_relation,first_appearance_characters FROM episodes WHERE project_id=@id ORDER BY episode_no",{id:project.id});
    upsertArtifact(project.id,"outline",{episodes:refreshed});
  }
  return {start,episodes:episodes.length};
}
async function runOutlineBatched(job,project){
  const constraints=constraintsFor(project.id),artifacts=artifactsFor(project.id);
  const batchSize=5,totalEpisodes=Number(project.total_episodes),batchCount=Math.ceil(totalEpisodes/batchSize);
  const requestedStart=Math.max(1,Number(job.payload?.start_episode)||1),preservedEnd=requestedStart-1;
  if((requestedStart-1)%batchSize!==0)throw new Error("续写梗概必须从5集窗口的下一集开始，例如 EP06、EP11、EP16");
  const preserved=preservedEnd?all("SELECT episode_no,title,summary,scene_treatment,hook,purpose,start_state,end_state,required_plot,must_reveal,must_not_reveal,rhythm,emotion,card_relation,first_appearance_characters FROM episodes WHERE project_id=@pid AND episode_no<=@end ORDER BY episode_no",{pid:project.id,end:preservedEnd}).map(normalizeOutlineEpisode):[];
  if(preserved.length!==preservedEnd||preserved.some((ep,index)=>ep.episode_no!==index+1||!ep.summary||!ep.hook))throw new Error(`无法从 EP${String(requestedStart).padStart(2,"0")} 续写：此前集数存在缺失或梗概、钩子为空`);
  const openEpisodeSchema={type:"object",additionalProperties:true};
  const episodeListSchema={type:"object",properties:{episodes:{type:"array",items:openEpisodeSchema}},required:["episodes"],additionalProperties:false};
  const checkpoint={...(job.checkpoint||{})};let spine=Array.isArray(checkpoint.spine)?checkpoint.spine:[],generated=Array.isArray(checkpoint.generated)?checkpoint.generated.map(normalizeOutlineEpisode):[];
  const characters=artifacts.find(item=>item.type==="characters")?.content?.characters||[];
  run("UPDATE jobs SET total=@total,message=@message WHERE id=@id",{total:1+batchCount*2+characters.length,message:spine.length?`正在从 EP${String(Number(checkpoint.next_batch||0)*batchSize+1).padStart(2,"0")} 继续生成分集梗概`:`正在建立 ${totalEpisodes} 集全剧因果骨架`,id:job.id});
  if(!checkpoint.spine_complete){
    const basePrompt=buildOutlineSpinePrompt(project,constraints,artifacts),spinePrompt=preserved.length?`${basePrompt}\n\n【已锁定且绝对不可改写的 EP01–EP${String(preservedEnd).padStart(2,"0")}】\n${JSON.stringify(preserved,null,2)}\n\n前述分集只作为既定前史；后续必须承接它们继续发展。仍一次返回 EP01–EP${String(totalEpisodes).padStart(2,"0")} 的完整因果骨架，后续正式分集生成只从 EP${String(requestedStart).padStart(2,"0")} 开始。`:basePrompt;
    let spineResult=null,spineIssues=[];
    for(let round=1;round<=20;round++){
      const prompt=round===1?spinePrompt:`${spinePrompt}\n\n【上一版骨架】\n${JSON.stringify(spine,null,2)}\n\n【定向修订】\n${spineIssues.join("；")}。保持已有因果设计，只补齐或修正集数，重新返回 EP01–EP${String(totalEpisodes).padStart(2,"0")} 的完整骨架。`;
      run("UPDATE jobs SET message=@message WHERE id=@id",{message:round===1?`正在建立 ${totalEpisodes} 集全剧因果骨架`:`全剧因果骨架不完整，正在定向修订（${round}/20）：${spineIssues.join("；")}`,id:job.id});
      const started=Date.now();
      try{spineResult=await generate({stage:"outline_spine",project,prompt,schema:episodeListSchema,extra:{start:1,end:totalEpisodes},signal:currentSignal()});}
      catch(error){if(currentSignal()?.aborted)throw error;throw outlineSpineApiFailure(error,Date.now()-started);}
      spine=(spineResult.output?.episodes||[]).filter(item=>Number(item.episode_no)>=1&&Number(item.episode_no)<=totalEpisodes).sort((a,b)=>Number(a.episode_no)-Number(b.episode_no));spineIssues=[];
      if(spine.length!==totalEpisodes)spineIssues.push(`应返回${totalEpisodes}集，实际${spine.length}集`);
      for(let i=0;i<spine.length;i++)if(Number(spine[i].episode_no)!==i+1)spineIssues.push(`缺少或重复EP${i+1}`);
      if(!spineIssues.length)break;
      throw outlineSpineApiFailure(new Error(spineIssues.join("；")),Date.now()-started,{returned_episodes:spine.length,expected_episodes:totalEpisodes});
    }
    if(spineIssues.length)throw new Error(`全剧因果骨架连续20轮仍不完整：${spineIssues.join("；")}`);
    for(const episode of spine)episode.first_appearance_characters="无";
    run("INSERT INTO generations(project_id,stage,provider,model,prompt,output,status,input_tokens,output_tokens) VALUES(@pid,'outline_spine',@provider,@model,@prompt,@output,'completed',@input,@out)",{pid:project.id,provider:spineResult.provider,model:spineResult.model,prompt:spinePrompt,output:JSON.stringify(spineResult.output),input:spineResult.usage.input_tokens||0,out:spineResult.usage.output_tokens||0});
    checkpoint.spine=spine;checkpoint.spine_complete=true;checkpoint.generated=preserved;checkpoint.next_batch=Math.floor(preservedEnd/batchSize);run("UPDATE jobs SET checkpoint_json=@checkpoint,progress=@progress,message='全剧因果骨架已完成，开始分窗口设计戏剧梗概' WHERE id=@id",{checkpoint:JSON.stringify(checkpoint),progress:1+checkpoint.next_batch*2,id:job.id});
  }
  for(let batch=Math.max(0,Number(checkpoint.next_batch||0));batch<batchCount;batch++){
    const start=batch*batchSize+1,end=Math.min(totalEpisodes,start+batchSize-1);
    const currentSpine=spine.filter(item=>item.episode_no>=start&&item.episode_no<=end),previous=generated.slice(-2),nextSpine=spine.filter(item=>item.episode_no>end&&item.episode_no<=end+3);
    const draftPrompt=buildOutlineDramaticBatchPrompt(project,constraints,artifacts,spine,currentSpine,previous,nextSpine);
    run("UPDATE jobs SET progress=@progress,message=@message WHERE id=@id",{progress:1+batch*2,message:`正在设计 EP${String(start).padStart(2,"0")}–EP${String(end).padStart(2,"0")} 的戏剧处境与升级`,id:job.id});
    const draftResult=await generate({stage:"outline_dramatic",project,prompt:draftPrompt,schema:episodeListSchema,extra:{start,end},signal:currentSignal()});
    const drafts=(draftResult.output?.episodes||[]).filter(ep=>Number(ep.episode_no)>=start&&Number(ep.episode_no)<=end).sort((a,b)=>a.episode_no-b.episode_no);
    if(drafts.length!==end-start+1)throw new Error(`EP${start}–EP${end} 戏剧设计应返回 ${end-start+1} 集，实际返回 ${drafts.length} 集`);
    for(let i=0;i<drafts.length;i++)if(Number(drafts[i].episode_no)!==start+i)throw new Error(`戏剧设计缺少或重复 EP${start+i}`);
    run("INSERT INTO generations(project_id,stage,provider,model,prompt,output,status,input_tokens,output_tokens) VALUES(@pid,'outline_dramatic',@provider,@model,@prompt,@output,'completed',@input,@out)",{pid:project.id,provider:draftResult.provider,model:draftResult.model,prompt:draftPrompt,output:JSON.stringify(draftResult.output),input:draftResult.usage.input_tokens||0,out:draftResult.usage.output_tokens||0});
    const finalPrompt=buildOutlineFinalizePrompt(project,constraints,artifacts,spine,currentSpine,drafts,previous,nextSpine);
    run("UPDATE jobs SET progress=@progress,message=@message WHERE id=@id",{progress:2+batch*2,message:`正在验收 EP${String(start).padStart(2,"0")}–EP${String(end).padStart(2,"0")} 连续性并提炼写作边界`,id:job.id});
    let finalResult,episodes=[],semanticIssues=[];
    for(let round=1;round<=2;round++){
      const repair=round===1?finalPrompt:`${finalPrompt}\n\n上一版验收结果如下，只修这些问题并重新返回当前窗口全部分集：\n${semanticIssues.join("\n")}\n\n上一版：${JSON.stringify(episodes,null,2)}`;
      finalResult=await generate({stage:"outline_finalize",project,prompt:repair,schema:episodeListSchema,extra:{start,end},signal:currentSignal()});
      episodes=(finalResult.output?.episodes||[]).filter(ep=>Number(ep.episode_no)>=start&&Number(ep.episode_no)<=end).sort((a,b)=>a.episode_no-b.episode_no).map(normalizeOutlineEpisode);semanticIssues=[];
      if(episodes.length!==end-start+1)semanticIssues.push(`应返回${end-start+1}集，实际${episodes.length}集`);
      for(let i=0;i<episodes.length;i++){
        const expected=start+i;if(Number(episodes[i].episode_no)!==expected)semanticIssues.push(`缺少或重复EP${expected}`);
        const nodes=String(episodes[i].required_plot||"").split(/→/).map(x=>x.trim()).filter(Boolean);
        if(nodes.length<4)semanticIssues.push(`EP${expected}必须发生至少需要4个事件节点，实际${nodes.length}个`);
        if(!String(episodes[i].summary||"").trim()||!String(episodes[i].hook||"").trim())semanticIssues.push(`EP${expected}梗概或钩子为空`);
        const leaked=outlineStoryWorldEpisodeLeak([episodes[i].summary,episodes[i].hook,episodes[i].required_plot,episodes[i].must_reveal,episodes[i].must_not_reveal].join("\n"));
        if(leaked)semanticIssues.push(`EP${expected}把创作集数泄漏进角色或故事内载体：“${leaked.slice(0,120)}”。保留既定事件，删除故事世界对作品集数的感知；有世界内依据时改为具体日期、约定、证据或威胁，没有依据则删除该预知，不得只换成“不久后”`);
      }
      if(!semanticIssues.length)break;
    }
    if(semanticIssues.length)throw new Error(`EP${start}–EP${end} 连续性验收未通过：${semanticIssues.join("；")}`);
    const saved=saveOutline(project.id,episodes);generated.push(...saved);
    run("INSERT INTO generations(project_id,stage,provider,model,prompt,output,status,input_tokens,output_tokens) VALUES(@pid,'outline_finalize',@provider,@model,@prompt,@output,'completed',@input,@out)",{pid:project.id,provider:finalResult.provider,model:finalResult.model,prompt:finalPrompt,output:JSON.stringify(finalResult.output),input:finalResult.usage.input_tokens||0,out:finalResult.usage.output_tokens||0});
    checkpoint.spine=spine;checkpoint.generated=generated;checkpoint.next_batch=batch+1;run("UPDATE jobs SET progress=@progress,message=@message,checkpoint_json=@checkpoint WHERE id=@id",{progress:1+(batch+1)*2,message:`已完成 EP${String(start).padStart(2,"0")}–EP${String(end).padStart(2,"0")}（${batch+1}/${batchCount}）`,checkpoint:JSON.stringify(checkpoint),id:job.id});
  }
  const derived=resolveFirstAppearancesProgrammatically(job,project,generated,characters,preservedEnd);
  for(const ep of derived)run("UPDATE episodes SET first_appearance_characters=@value,updated_at=@time WHERE project_id=@pid AND episode_no=@no",{value:ep.first_appearance_characters,time:now(),pid:project.id,no:ep.episode_no});
  upsertArtifact(project.id,"outline",{episodes:derived});
  return {episodes:derived.length,batches:batchCount};
}
const episodeContext=(project,episode)=>{
  const constraints=constraintsFor(project.id),artifacts=artifactsFor(project.id);
  const states=[];
  const memory={profiles:"",events:"",chains:"",entityCount:0,eventCount:0};
  const previous=get("SELECT id,episode_no,title,summary,novel,novel_summary,episode_plan,character_identifiers_json,script FROM episodes WHERE project_id=@pid AND episode_no=@no",{pid:project.id,no:episode.episode_no-1});
  const previousEnding=previous?.script?lastScriptScene(previous.script,1200):previous?.summary||"";
  const writingGuide=templateWritingGuide(templateContext(project));
  const previousNovelEnding=(previous?.novel||"").split(/\r?\n/).filter(Boolean).slice(-5).join("\n");
  let previousIdentifiers=[];try{previousIdentifiers=JSON.parse(previous?.character_identifiers_json||"[]");}catch{}if(!previousIdentifiers.length&&previous?.script)previousIdentifiers=extractCharacterIdentifiers(previous.script);
  return {constraints,artifacts,states,memory,previous,previousEnding,writingGuide,previousNovelEnding,previousIdentifiers};
};
const extractCharacterIdentifiers=script=>[...new Set(String(script||"").split(/\r?\n/).map(line=>line.trim().match(/^([^：\n]{1,30}?)(?:\s+V\.O\.|\s+OS)?：/)?.[1]?.trim()).filter(name=>name&&name!=="系统音"))];

async function generateEpisodeNovel(project,episode){
  if(!embeddingConfigured())throw new Error("生成小说需要 Embedding API，请先完成配置");
  let c=episodeContext(project,episode);
  c.memory=await compileMemoryContext(project.id,episode,currentSignal());
  if(!c.memory.entityCount){
    const characterArtifact=get("SELECT * FROM artifacts WHERE project_id=@pid AND type='characters' AND status='approved'",{pid:project.id});
    if(characterArtifact){await bootstrapCharacterMemory(project,characterArtifact,currentSignal());c=episodeContext(project,episode);c.memory=await compileMemoryContext(project.id,episode,currentSignal());}
  }
  if(Number(episode.episode_no)>1&&!String(c.previous?.novel||"").trim())throw new Error(`请先生成并保存 EP${String(episode.episode_no-1).padStart(2,"0")} 小说，才能建立本集连续性`);
  if(Number(episode.episode_no)>1&&!String(c.previous?.script||"").trim())throw new Error(`请先生成并保存 EP${String(episode.episode_no-1).padStart(2,"0")} 最终剧本，才能用正式剧情事件承接本集小说`);
  if(Number(episode.episode_no)>1&&!Number(c.memory.recentCount||0))throw new Error(`EP${String(episode.episode_no-1).padStart(2,"0")} 尚无已提炼的最近事件，请先完成该集剧情记忆提炼`);
  let previousNovelSummary="";
  if(Number(episode.episode_no)>1){
    run("UPDATE jobs SET message=@message WHERE project_id=@pid AND type IN ('episode_novel','episode','full_book') AND status='running'",{pid:project.id,message:`正在整理 EP${String(episode.episode_no-1).padStart(2,"0")} 小说连续性概要`});
    const summaryPrompt=buildPreviousNovelSummaryPrompt(c.previous,{previousEvents:c.memory.previousEvents,previousLastEvent:c.memory.previousLastEvent});
    const summaryResult=await generate({stage:"episode_novel_summary",project,prompt:summaryPrompt,extra:{episode,continuityAnchorSource:c.memory.previousEvents},signal:currentSignal()});
    previousNovelSummary=String(summaryResult.output||"").trim();
    if(!previousNovelSummary)throw new Error(`EP${String(episode.episode_no-1).padStart(2,"0")} 小说连续性概要为空，未继续生成本集小说`);
    run("UPDATE episodes SET novel_summary=@summary,updated_at=@time WHERE id=@id",{summary:previousNovelSummary,time:now(),id:c.previous.id});
    run("INSERT INTO generations(project_id,stage,provider,model,prompt,output,status,input_tokens,output_tokens) VALUES(@pid,'episode_novel_summary',@provider,@model,@prompt,@output,'completed',@input,@out)",{pid:project.id,provider:summaryResult.provider,model:summaryResult.model,prompt:summaryPrompt,output:previousNovelSummary,input:summaryResult.usage.input_tokens||0,out:summaryResult.usage.output_tokens||0});
  }
  const characterCards=c.artifacts.find(item=>item.type==="characters")?.content?.characters||[];
  const appearance=characterAppearanceContext(project.id,episode.episode_no,characterCards);
  const novelPromptWithAppearances=buildEpisodeNovelPrompt(project,c.constraints,c.artifacts,episode,c.states,c.writingGuide,{previousNovelSummary,previousNovelEnding:c.previousNovelEnding,memory:c.memory,characterAppearancePlan:appearance.text});
  const protagonistIdentifier=resolveProtagonist(characterCards).name;
  const secondaryIdentifiers=all("SELECT canonical_name FROM memory_secondary_characters WHERE project_id=@pid AND active=1",{pid:project.id}).map(item=>item.canonical_name);
  const characterIdentifiers=[...new Set([...characterCards.map(item=>item.name),...secondaryIdentifiers].filter(Boolean))];
  const goldenKnowledgeEntries=all("SELECT canonical_name name,kind,owner FROM memory_golden_fingers WHERE project_id=@pid AND active=1",{pid:project.id});
  const novelResult=await generate({stage:"episode_novel",project,prompt:novelPromptWithAppearances,extra:{episode,minEffectiveCharacters:1000,maxEffectiveCharacters:2000,narrativePerson:project.narrative_person==="third"?"third":"first",protagonistIdentifier,characterIdentifiers,forbiddenAppearanceCharacters:appearance.forbidden,goldenKnowledgeEntries,goldenKnowledgeBasis:`${episode.summary||""}\n${episode.required_plot||""}`},signal:currentSignal(),onAttempt:info=>{if(currentSignal()?.aborted)return;const detail=info.retry?`，上一轮未通过：${String(info.lastError).slice(0,90)}`:"";run("UPDATE jobs SET message=@message WHERE project_id=@pid AND type IN ('episode_novel','episode','full_book') AND status='running'",{message:`正在生成 EP${String(episode.episode_no).padStart(2,"0")} 小说（第${info.attempt}/${info.total}轮）${detail}`,pid:project.id});}});
  const novel=String(novelResult.output||"").trim();
  if(!novel)throw new Error("模型没有返回小说中间稿，已保留原有内容，请重试");
  run("UPDATE episodes SET novel=@novel,novel_summary='',episode_plan='',status='novel_drafted',updated_at=@time WHERE id=@id",{novel,time:now(),id:episode.id});
  run("INSERT INTO generations(project_id,stage,provider,model,prompt,output,status,input_tokens,output_tokens) VALUES(@pid,'episode_novel',@provider,@model,@prompt,@output,'completed',@input,@out)",{pid:project.id,provider:novelResult.provider,model:novelResult.model,prompt:novelPromptWithAppearances,output:novel,input:novelResult.usage.input_tokens||0,out:novelResult.usage.output_tokens||0});
  return {novel,provider:novelResult.provider,model:novelResult.model};
}
async function generateEpisodeArrangement(project,episode){
  if(!String(episode.novel||"").trim())throw new Error("请先生成并确认小说中间稿");
  const c=episodeContext(project,episode),sceneTransitionCandidates=novelSceneTransitionCandidates(episode.novel),prompt=buildEpisodeArrangementPrompt(project,c.artifacts,episode,c.states,c.writingGuide,{previousIdentifiers:c.previousIdentifiers,sceneTransitionCandidates});
  const result=await generate({stage:"episode_arrangement",project,prompt,extra:{episode},signal:currentSignal(),onAttempt:info=>{if(currentSignal()?.aborted)return;const detail=info.retry?`，上一轮未通过：${String(info.lastError).slice(0,90)}`:"",round=info.phase==="patch"?`轻量补丁第${info.phaseAttempt}/${info.phaseTotal}轮`:`完整生成第${info.phaseAttempt}/${info.phaseTotal}轮`;run("UPDATE jobs SET message=@message WHERE project_id=@pid AND type IN ('episode_arrangement','episode','full_book') AND status='running'",{message:`正在生成 EP${String(episode.episode_no).padStart(2,"0")} 剧情安排（${round}）${detail}`,pid:project.id});}});
  const plan=consolidateEpisodeArrangementScenes(String(result.output||"").trim()).trim();
  if(!plan)throw new Error("模型没有返回情绪和剧情安排");
  run("UPDATE episodes SET episode_plan=@plan,status='planned_for_script',updated_at=@time WHERE id=@id",{plan,time:now(),id:episode.id});
  run("INSERT INTO generations(project_id,stage,provider,model,prompt,output,status,input_tokens,output_tokens) VALUES(@pid,'episode_arrangement',@provider,@model,@prompt,@output,'completed',@input,@out)",{pid:project.id,provider:result.provider,model:result.model,prompt,output:plan,input:result.usage.input_tokens||0,out:result.usage.output_tokens||0});
  return {plan,provider:result.provider,model:result.model};
}
async function generateEpisodeScript(project,episode){
  if(!embeddingConfigured())throw new Error("生成剧本的完整流程需要 Embedding API，请先完成配置");
  if(!String(episode.novel||"").trim())throw new Error("请先生成并确认小说中间稿");
  if(!String(episode.episode_plan||"").trim())throw new Error("请先生成并确认情绪和剧情安排");
  const c=episodeContext(project,episode);
  const targetCharacters=Number(c.writingGuide?.generationTarget?.characters)||1750;
  const minimumCharacters=1000;
  const characterCards=c.artifacts.find(item=>item.type==="characters")?.content?.characters||[];
  const appearance=characterAppearanceContext(project.id,episode.episode_no,characterCards);
  const protagonistIdentifier=resolveProtagonist(characterCards).name;
  const secondaryIdentifiers=all("SELECT canonical_name FROM memory_secondary_characters WHERE project_id=@pid AND active=1",{pid:project.id}).map(item=>item.canonical_name);
  const characterIdentifiers=[...new Set([...characterCards.map(item=>item.name),...secondaryIdentifiers].filter(Boolean))];
  const goldenKnowledgeEntries=all("SELECT canonical_name name,kind,owner FROM memory_golden_fingers WHERE project_id=@pid AND active=1",{pid:project.id});
  const goldenKnowledgeOwners=goldenKnowledgeEntries.map(item=>`${item.name}｜持有者：${item.owner}`).join("\n");
  const characterIdentityLines=all("SELECT canonical_name,initial_identity FROM memory_entities WHERE project_id=@pid AND kind='character' AND active=1 ORDER BY id",{pid:project.id}).map(item=>`${item.canonical_name}｜${String(item.initial_identity||"").trim()||"身份未明确"}`).join("\n");
  const basePrompt=buildSkillEpisodePrompt(project,c.constraints,c.artifacts,episode,c.states,c.writingGuide,{previousEnding:c.previousEnding,novel:episode.novel,episodePlan:episode.episode_plan,lockedIdentifiers:c.previousIdentifiers,goldenKnowledgeOwners});
  const promptWithOwners=`${basePrompt}\n\n【人物姓名｜身份】\n${characterIdentityLines||"暂无"}${appearance.text?`\n\n【本集人物出场状态｜硬边界】\n${appearance.text}\n未到首次出场集的人物不得进入现场、行动、说话或联系其他人物；仅被提及姓名不算本人出场。`:""}`;
  const novelNarration=String(episode.novel||"").replace(/「[^」]*」/g,"").replace(/“[^”]*”/g,"").replace(/"[^"\n]*"/g,""),sourceNarrativePerson=/我|我们|咱们/.test(novelNarration)?"first":"third";
  const result=await generate({stage:"episode",project,prompt:promptWithOwners,extra:{episode,minEffectiveCharacters:minimumCharacters,maxEffectiveCharacters:2000,shortSceneHeading:String(c.writingGuide?.format?.sceneHeading||"").includes("外/内"),lockedIdentifiers:c.previousIdentifiers,protagonistIdentifier,characterIdentifiers,forbiddenAppearanceCharacters:appearance.forbidden,sourceNarrativePerson,goldenKnowledgeEntries,goldenKnowledgeBasis:`${episode.summary||""}\n${episode.required_plot||""}`},signal:currentSignal(),onAttempt:info=>{if(currentSignal()?.aborted)return;const detail=info.retry?`，上一轮未通过：${String(info.lastError).slice(0,90)}`:"";run("UPDATE jobs SET message=@message WHERE project_id=@pid AND type IN ('episode_script','episode','full_book') AND status='running'",{message:`正在生成或修订 EP${String(episode.episode_no).padStart(2,"0")} 剧本（第${info.attempt}/${info.total}轮）${detail}`,pid:project.id});}});
  if(!String(result.output||"").trim())throw new Error("模型没有返回剧本正文，已保留原有内容，请重试");
  const identifiers=extractCharacterIdentifiers(result.output);
  run("UPDATE episodes SET script=@script,character_identifiers_json=@identifiers,status='drafted',updated_at=@time WHERE id=@id",{script:result.output,identifiers:JSON.stringify(identifiers),time:now(),id:episode.id});
  run("INSERT INTO generations(project_id,stage,provider,model,prompt,output,status,input_tokens,output_tokens) VALUES(@pid,'episode',@provider,@model,@prompt,@output,'completed',@input,@out)",{pid:project.id,provider:result.provider,model:result.model,prompt:promptWithOwners,output:result.output,input:result.usage.input_tokens||0,out:result.usage.output_tokens||0});
  return {episode:episode.episode_no,provider:result.provider,model:result.model,scriptSaved:true,memoryUpdated:false};
}

async function extractSavedEpisodeMemory(project,episodeNo){
  const episode=get("SELECT * FROM episodes WHERE project_id=@pid AND episode_no=@no",{pid:project.id,no:Number(episodeNo)});
  if(!episode||!String(episode.script||"").trim())throw new Error(`EP${String(episodeNo).padStart(2,"0")} 尚无已保存剧本，无法提炼剧情状态`);
  const result=await extractEpisodeMemory(project,episode,currentSignal());
  return {episode:Number(episodeNo),memoryUpdated:true,...result};
}

function normalizedStateText(value){
  return String(value||"").replace(/[\s，。；：！？,.;:!?"'“”‘’]/g,"").toLowerCase();
}

function comparableStateText(item){
  let value=String(item.value||"")
    .replace(/[「」『』“”"']/g,"")
    .replace(new RegExp(`^${String(item.subject||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?:女士|先生|同学)?[，,:\s]*`),"")
    .replace(/^[一-鿿]{2,4}(?:女士|先生|同学)[，,:\s]*/,"");
  return normalizedStateText(value);
}

function stateTextContains(a,b){
  const left=comparableStateText(a),right=comparableStateText(b);
  return left.length>=10&&right.length>=10&&(left.includes(right)||right.includes(left));
}

function stateTextSimilarity(a,b){
  const grams=value=>{const text=normalizedStateText(value),set=new Set();for(let i=0;i<text.length-1;i++)set.add(text.slice(i,i+2));return set;};
  const left=grams(comparableStateText(a)),right=grams(comparableStateText(b));
  if(!left.size||!right.size)return 0;
  let common=0;for(const gram of left)if(right.has(gram))common++;
  return common/(left.size+right.size-common);
}

function sameStateMatter(a,b){
  if(a.category!==b.category)return false;
  const aSubject=normalizedStateText(a.subject),bSubject=normalizedStateText(b.subject);
  if(aSubject&&aSubject===bSubject)return true;
  if(stateTextContains(a,b))return true;
  const aNumbers=new Set(String(a.value||"").match(/\d+(?:\.\d+)?/g)||[]),bNumbers=new Set(String(b.value||"").match(/\d+(?:\.\d+)?/g)||[]);
  if(aNumbers.size&&bNumbers.size&&![...aNumbers].some(value=>bNumbers.has(value)))return false;
  const similarity=stateTextSimilarity(a,b),subjectRelated=aSubject.length>=3&&bSubject.length>=3&&(aSubject.includes(bSubject)||bSubject.includes(aSubject));
  return similarity>=0.72||(subjectRelated&&similarity>=0.42);
}

function precisionEvidenceFromEpisode(episode){
  const source=String(episode.script||"");
  const precisionPattern=/(?:\d{1,3}岁|确诊|患有|病症|病因|肾衰竭|糖尿病|透析|化疗|手术|每(?:天|周|月)|小学|中学|大学|年级|班|学校|医院|病房|公司|单位|职位|住址|地址)/;
  return [...new Set(source.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&precisionPattern.test(line)))].slice(0,24);
}

function deterministicPrecisionFacts(lines){
  const facts=[];
  for(const line of lines){
    const clean=line.replace(/^[^:：\n]{1,16}[:：]\s*/,"").trim();
    const match=clean.match(/([一-鿿]{2,4})(?:女士|先生|同学)?[，,]\s*(\d{1,3})岁/);
    if(!match)continue;
    const stable=clean.split(/(?:。|！|？|最近|但是|不过)/)[0]
      .replace(new RegExp(`^[「『“"]?${match[1]}(?:女士|先生|同学)?[，,\s]*`),"")
      .trim();
    if(stable)facts.push({category:"fact",subject:match[1],value:stable,status:"active"});
  }
  return facts;
}

function hasSupportedPrecisionBinding(item,lines){
  const locators=String(item.value||"").match(/(?:[A-Za-z一-鿿]{0,4}区)?\d+号(?:病房|房|楼|室)?/g)||[];
  if(!locators.length)return true;
  const names=[...String(item.value||"").matchAll(/([一-鿿]{2,4})(?:女士|先生|同学)?[，,]\s*\d{1,3}岁/g)].map(match=>match[1]);
  const subjectAnchors=String(item.subject||"").split(/(?:病情|住院|医疗费|床位|事件|状态)/).filter(part=>part.length>=2);
  const anchors=[...new Set([...names,...subjectAnchors])];
  if(!anchors.length)return true;
  return locators.every(locator=>lines.some(line=>line.includes(locator)&&anchors.some(anchor=>line.includes(anchor))));
}

async function extractEpisodeState(project,episode,signal,manual=false){
  const c=episodeContext(project,episode);
  const currentStates=all("SELECT id,category,subject,value,status,source_episode FROM story_state WHERE project_id=@id AND status='active' AND (source_episode IS NULL OR source_episode<=@episode)",{id:project.id,episode:episode.episode_no});
  const statePrompt=`${buildStagePrompt("state_update",project,c.constraints,c.artifacts)}

当前集之前仍有效的连续性账本（相同事实不要重复添加；同一事项必须沿用已有 category 与 subject）：
${JSON.stringify(currentStates,null,2)}

第${episode.episode_no}集最终剧本（这是本次提炼唯一允许使用的剧情事实来源）：
${episode.script||"无"}`;
  const stateResult=await generate({stage:"state_update",project,prompt:statePrompt,extra:{episode},signal});
  const evidence=precisionEvidenceFromEpisode(episode);
  let precisionItems=[];
  if(evidence.length){
    const precisionPrompt=`${buildStagePrompt("state_update",project,c.constraints,c.artifacts)}

这是一次独立的“精确连续性事实”扫描，不要总结剧情，不要处理旧词条的失效。
必须从下列原文证据中提取有长期连续性价值的精确属性：姓名、年龄、病因、病症、治疗方式与频率、学校年级班级、单位职位、精确地点和固定周期。每个数字、区域、房号和编号只能绑定到与它在同一行原文中明确共现的人物、机构或物品。不得跨行拼接；不得把“翡翠交易市场C区17号”改成医院病房。
稳定属性使用 fact；欠费、期限、床位紧张等待解决压力使用 unresolved，两者分开。
只返回 active。同一人的互不冲突稳定属性合并成一条，value 不要重复 subject 中的姓名或“女士/先生”称谓，不能遗漏原文明示的数字和频率。本轮只扫描人物与机构的稳定精确信息，不提取任何 prop。

原文证据：
${evidence.join("\n")}`;
    const precisionResult=await generate({stage:"state_update",project,prompt:precisionPrompt,extra:{episode},signal});
    precisionItems=(precisionResult.output?.items||[]).filter(item=>hasSupportedPrecisionBinding(item,evidence));
  }
  const episodeLabel=`EP${String(episode.episode_no).padStart(2,"0")}`;
  const rawItems=[...(stateResult.output?.items||[]),...precisionItems,...deterministicPrecisionFacts(evidence)].map(item=>{
    const normalized={...item,subject:String(item.subject||"").replace(/本集/g,episodeLabel).trim(),value:String(item.value||"").replace(/本集/g,episodeLabel).replace(/\s+([，。；：])/g,"$1").trim()};
    return normalized.category==="relationship"?{...normalized,subject:canonicalRelationshipSubject(normalized.subject)}:normalized;
  }).filter(item=>item.subject&&item.value);
  const items=[];
  for(const item of rawItems.sort((a,b)=>comparableStateText(b).length-comparableStateText(a).length)){
    const versionedCategory=["system","character","relationship"].includes(item.category);
    const duplicate=items.some(saved=>(versionedCategory&&saved.category===item.category&&saved.subject===item.subject)||sameStateMatter(saved,item));
    if(!duplicate)items.push(item);
  }
  const seen=new Set();
  let changed=0;
  transaction(()=>{
    for(const item of items){
      if(manual&&item.status==="replaced")continue;
      if(manual&&item.status==="resolved"&&item.category!=="unresolved")continue;
      let nextItem={...item};
      const signature=`${nextItem.category}|${nextItem.subject}|${normalizedStateText(nextItem.value)}`;
      if(seen.has(signature))continue;
      seen.add(signature);
      if(nextItem.status==="resolved"&&nextItem.category==="unresolved"){
        const openItems=all("SELECT id,category,subject,value,source_episode FROM story_state WHERE project_id=@pid AND category='unresolved' AND status='active' AND source_episode IS NOT NULL AND source_episode<@episode",{pid:project.id,episode:episode.episode_no});
        for(const open of openItems.filter(saved=>sameStateMatter(saved,nextItem)))run("UPDATE story_state SET status='resolved',updated_at=@time WHERE id=@id",{time:now(),id:open.id});
        continue;
      }
      if(["resolved","replaced"].includes(nextItem.status))run("UPDATE story_state SET status=@status WHERE project_id=@pid AND category=@category AND subject=@subject AND status='active' AND source_episode IS NOT NULL AND source_episode<@episode",{status:nextItem.status,pid:project.id,category:nextItem.category,subject:nextItem.subject,episode:episode.episode_no});
      if(nextItem.status!=="active")continue;
      const candidates=all("SELECT id,category,subject,value,source_episode FROM story_state WHERE project_id=@pid AND category=@category AND status='active' AND (source_episode IS NULL OR source_episode<=@episode) ORDER BY id",{pid:project.id,category:nextItem.category,episode:episode.episode_no});
      const matches=candidates.filter(saved=>sameStateMatter(saved,nextItem));
      const manualMatch=matches.find(saved=>saved.source_episode==null);
      if(manualMatch)continue;
      const exact=matches.find(saved=>comparableStateText(saved)===comparableStateText(nextItem));
      if(exact){for(const duplicate of matches)if(duplicate.id!==exact.id&&duplicate.source_episode!=null)run("UPDATE story_state SET status='replaced',updated_at=@time WHERE id=@id",{time:now(),id:duplicate.id});continue;}
      const autoMatches=matches.filter(saved=>saved.source_episode!=null);
      if(autoMatches.length){nextItem.subject=autoMatches[0].subject;for(const saved of autoMatches)run("UPDATE story_state SET status='replaced',updated_at=@time WHERE id=@id",{time:now(),id:saved.id});}
      run("INSERT INTO story_state(project_id,category,subject,value,status,source_episode) VALUES(@pid,@category,@subject,@value,'active',@episode)",{pid:project.id,category:nextItem.category,subject:nextItem.subject,value:nextItem.value,episode:episode.episode_no});
      changed++;
    }
  });
  return {episode:episode.episode_no,items:items.length,changed};
}
export async function writeEpisode(project,episode,job=null){
  if(!job){
    const novel=await generateEpisodeNovel(project,episode);
    episode={...episode,novel:novel.novel};const arranged=await generateEpisodeArrangement(project,episode);
    const scripted=await generateEpisodeScript(project,{...episode,episode_plan:arranged.plan});
    await extractSavedEpisodeMemory(project,episode.episode_no);return {...scripted,memoryUpdated:true};
  }
  const checkpoint={...(job.checkpoint||{})},no=episode.episode_no;
  if(Number(checkpoint.current_episode)!==no){checkpoint.current_episode=no;checkpoint.stage="novel";saveCheckpoint(job.id,checkpoint,`正在生成 EP${String(no).padStart(2,"0")} 小说`,0);}
  run("UPDATE jobs SET total=4 WHERE id=@id",{id:job.id});
  if(checkpoint.stage==="novel"){await generateEpisodeNovel(project,get("SELECT * FROM episodes WHERE id=@id",{id:episode.id}));checkpoint.stage="arrangement";saveCheckpoint(job.id,checkpoint,"小说已保存，正在生成情绪与剧情安排",1);}
  if(checkpoint.stage==="arrangement"){await generateEpisodeArrangement(project,get("SELECT * FROM episodes WHERE id=@id",{id:episode.id}));checkpoint.stage="script";saveCheckpoint(job.id,checkpoint,"剧情安排已保存，正在转换剧本",2);}
  if(checkpoint.stage==="script"){await generateEpisodeScript(project,get("SELECT * FROM episodes WHERE id=@id",{id:episode.id}));checkpoint.stage="memory";saveCheckpoint(job.id,checkpoint,"剧本已保存，正在提炼剧情状态",3);}
  if(checkpoint.stage==="memory"){const result=await extractSavedEpisodeMemory(project,no);checkpoint.stage="done";saveCheckpoint(job.id,checkpoint,"剧本与剧情状态已保存",4);return result;}
  return {episode:no,memoryUpdated:checkpoint.stage==="done"};
}
const stageLabel=stage=>({novel:"小说",arrangement:"剧情安排",script:"剧本",memory:"故事状态"}[stage]||stage||"任务");
function clearGeneratedMemory(projectId){
  transaction(()=>{
    for(const table of ["memory_vectors","memory_relationship_changes","memory_relationships","memory_secondary_characters","memory_golden_ability_changes","memory_golden_abilities","memory_golden_changes","memory_golden_fingers","memory_prop_changes","memory_important_props","memory_resource_changes","memory_resources","memory_chains","memory_temporal_relations","memory_links","memory_events","memory_extractions"])run(`DELETE FROM ${table} WHERE project_id=@pid`,{pid:projectId});
  });
}
function errorType(message){const value=String(message||"");if(/Connection error|ECONN|网络|fetch failed/i.test(value))return "连接错误";if(/timed out|timeout|超时/i.test(value))return "请求超时";if(/敏感|拒绝|拦截/i.test(value))return "平台拒绝";if(/字符|字数|过长|过短|最低|最高/i.test(value))return "篇幅不合格";if(/场次|换行|排版|括号|对白|动作|不可拍摄|禁/.test(value))return "格式或内容验收";if(/概要为空|为空/.test(value))return "输出为空";if(/Embedding|向量/i.test(value))return "向量接口";return "其他错误";}
function writeStepLog(jobRow,{outcome,message,finishedAt=now()}){if(!jobRow)return;const checkpoint=JSON.parse(jobRow.checkpoint_json||"{}"),startedAt=jobRow.step_started_at||jobRow.attempt_started_at||finishedAt,startMs=Date.parse(startedAt),finishMs=Date.parse(finishedAt),round=String(jobRow.message||"").match(/第(\d+)\/(?:\d+)轮/);run(`INSERT INTO job_step_logs(job_id,project_id,episode_no,stage,round_no,outcome,error_type,message,duration_ms,started_at,finished_at) VALUES(@job,@pid,@episode,@stage,@round,@outcome,@type,@message,@duration,@started,@finished)`,{job:jobRow.id,pid:jobRow.project_id,episode:Number(checkpoint.current_episode)||null,stage:checkpoint.stage||jobRow.type,round:round?Number(round[1]):null,outcome,type:outcome==="failed"?errorType(message):"",message:String(message||""),duration:Number.isFinite(startMs)&&Number.isFinite(finishMs)?Math.max(0,finishMs-startMs):0,started:startedAt,finished:finishedAt});}
function saveCheckpoint(jobId,checkpoint,message,progress){const previous=get("SELECT * FROM jobs WHERE id=@id",{id:jobId}),before=JSON.parse(previous?.checkpoint_json||"{}"),stamp=now(),changed=Number(before.current_episode)!==Number(checkpoint.current_episode)||before.stage!==checkpoint.stage;if(changed&&before.current_episode&&before.stage&&before.stage!=="done")writeStepLog(previous,{outcome:"completed",message:`${stageLabel(before.stage)}已完成`,finishedAt:stamp});run("UPDATE jobs SET checkpoint_json=@checkpoint,message=@message,progress=COALESCE(@progress,progress),step_started_at=CASE WHEN @changed=1 THEN @time ELSE COALESCE(step_started_at,@time) END WHERE id=@id",{checkpoint:JSON.stringify(checkpoint),message,progress:progress==null?null:Number(progress),changed:changed?1:0,time:stamp,id:jobId});}
async function writeFullBookEpisode(project,episode,job,checkpoint,overwrite){
  const no=episode.episode_no;
  if(Number(checkpoint.current_episode)!==no){checkpoint.current_episode=no;checkpoint.stage="novel";if(overwrite)run("UPDATE episodes SET novel='',novel_summary='',episode_plan='',script='',status='planned',updated_at=@time WHERE id=@id",{time:now(),id:episode.id});saveCheckpoint(job.id,checkpoint,`正在生成 EP${String(no).padStart(2,"0")} 小说`,job.progress);}
  let fresh=get("SELECT * FROM episodes WHERE id=@id",{id:episode.id});
  if(checkpoint.stage==="novel"){
    const result=await generateEpisodeNovel(project,fresh);checkpoint.stage="arrangement";saveCheckpoint(job.id,checkpoint,`EP${String(no).padStart(2,"0")} 小说已保存，正在生成剧情安排`,job.progress);fresh={...fresh,novel:result.novel};
  }
  if(checkpoint.stage==="arrangement"){
    fresh=get("SELECT * FROM episodes WHERE id=@id",{id:episode.id});await generateEpisodeArrangement(project,fresh);checkpoint.stage="script";saveCheckpoint(job.id,checkpoint,`EP${String(no).padStart(2,"0")} 剧情安排已保存，正在生成剧本`,job.progress);
  }
  if(checkpoint.stage==="script"){
    fresh=get("SELECT * FROM episodes WHERE id=@id",{id:episode.id});await generateEpisodeScript(project,fresh);checkpoint.stage="memory";saveCheckpoint(job.id,checkpoint,`EP${String(no).padStart(2,"0")} 剧本已保存，正在提炼剧情状态`,job.progress);
  }
  if(checkpoint.stage==="memory"){
    await extractSavedEpisodeMemory(project,no);checkpoint.stage="done";saveCheckpoint(job.id,checkpoint,`EP${String(no).padStart(2,"0")} 剧本与剧情状态已保存`,Number(job.progress)+1);
  }
}
async function execute(job){
  const project=projectFor(job.project_id); if(!project)throw new Error("项目不存在");
  if(job.type==="memory_characters"){
    const artifact=get("SELECT * FROM artifacts WHERE project_id=@pid AND type='characters'",{pid:project.id});if(!artifact)throw new Error("请先保存人物人设");
    run("UPDATE jobs SET total=1,message='正在从已批准人设建立初始剧情记忆库' WHERE id=@id",{id:job.id});const result=await bootstrapCharacterMemory(project,artifact,currentSignal());run("UPDATE jobs SET progress=1,message=@message WHERE id=@id",{message:`已建立 ${result.characters} 个人物初始档案`,id:job.id});return result;
  }
  if(job.type==="stage"&&job.target==="outline")return runOutlineBatched(job,project);
  if(job.type==="outline_first_appearances")return runFirstAppearanceRefresh(job,project);
  if(job.type==="stage")return runStage(job,project);
  if(job.type==="planning_section")return runPlanningSection(job,project);
  if(job.type==="episode_boundaries")return runEpisodeBoundaries(job,project);
  if(job.type==="episode_boundary")return runEpisodeBoundary(job,project);
  if(job.type==="连锁重生成必须发生")return runRequiredPlotChain(job,project);
  if(job.type==="逐集重生成不得揭示")return runMustNotRevealAll(job,project);
  if(["episode_novel","episode_arrangement","episode_script"].includes(job.type)){
    const episode=get("SELECT * FROM episodes WHERE project_id=@pid AND episode_no=@no",{pid:project.id,no:Number(job.target)});if(!episode)throw new Error("该集不存在，请先生成逐集框架");
    if(job.type!=="episode_script"){
      run("UPDATE jobs SET total=1,message=@message WHERE id=@id",{message:job.type==="episode_novel"?"正在生成小说中间稿":"正在生成情绪与剧情安排",id:job.id});
      const result=job.type==="episode_novel"?await generateEpisodeNovel(project,episode):await generateEpisodeArrangement(project,episode);run("UPDATE jobs SET progress=1 WHERE id=@id",{id:job.id});return result;
    }
    const checkpoint={...(job.checkpoint||{})};if(Number(checkpoint.current_episode)!==episode.episode_no){checkpoint.current_episode=episode.episode_no;checkpoint.stage="script";saveCheckpoint(job.id,checkpoint,"正在转换并校验剧本",0);}
    run("UPDATE jobs SET total=2 WHERE id=@id",{id:job.id});
    if(checkpoint.stage==="script"){await generateEpisodeScript(project,get("SELECT * FROM episodes WHERE id=@id",{id:episode.id}));checkpoint.stage="memory";saveCheckpoint(job.id,checkpoint,"剧本已保存，正在提炼剧情状态",1);}
    if(checkpoint.stage==="memory"){const result=await extractSavedEpisodeMemory(project,episode.episode_no);checkpoint.stage="done";saveCheckpoint(job.id,checkpoint,"剧本与剧情状态已保存",2);return result;}
    return {episode:episode.episode_no,memoryUpdated:checkpoint.stage==="done"};
  }
  if(job.type==="episode_state_extract"){
    if(!embeddingConfigured())throw new Error("未配置 Embedding API，无法提炼剧情事件");const episode=get("SELECT * FROM episodes WHERE project_id=@pid AND episode_no=@no",{pid:project.id,no:Number(job.target)});if(!episode)throw new Error("该集不存在");if(!String(episode.script||"").trim())throw new Error("当前集还没有可提炼的剧本文本");run("UPDATE jobs SET total=1,message='正在从当前集剧本重建剧情事件' WHERE id=@id",{id:job.id});const result=await extractEpisodeMemory(project,episode,currentSignal());run("UPDATE jobs SET progress=1,message=@message WHERE id=@id",{message:`已重建 EP${String(episode.episode_no).padStart(2,"0")} 剧情记忆`,id:job.id});return result;
  }
  if(job.type==="memory_rebuild"){
    if(!embeddingConfigured())throw new Error("未配置 Embedding API，无法重建向量与剧情链");const requestedCutoff=Math.max(0,Number(job.payload?.cutoff)||0),rows=all("SELECT * FROM episodes WHERE project_id=@pid ORDER BY episode_no",{pid:project.id});let liveCutoff=0;for(const episode of rows){if(Number(episode.episode_no)!==liveCutoff+1||!String(episode.script||"").trim())break;liveCutoff++;}const cutoff=requestedCutoff?Math.min(requestedCutoff,liveCutoff):liveCutoff,episodes=rows.filter(item=>item.episode_no<=cutoff&&String(item.script||"").trim());if(!episodes.length)throw new Error("EP01没有剧本，无法建立链式剧情记忆");run("UPDATE jobs SET total=@total WHERE id=@id",{total:episodes.length,id:job.id});
    if(Number(job.progress||0)===0)transaction(()=>{run("DELETE FROM memory_vectors WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_relationship_changes WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_relationships WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_secondary_characters WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_golden_ability_changes WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_golden_abilities WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_golden_changes WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_golden_fingers WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_prop_changes WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_important_props WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_resource_changes WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_resources WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_chains WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_temporal_relations WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_events WHERE project_id=@pid",{pid:project.id});run("DELETE FROM memory_extractions WHERE project_id=@pid",{pid:project.id});});
    for(let index=Math.max(0,Number(job.progress)||0);index<episodes.length;index++){const episode=episodes[index];run("UPDATE jobs SET message=@message WHERE id=@id",{message:`正在重建 EP${String(episode.episode_no).padStart(2,"0")} 向量与剧情链（${index+1}/${episodes.length}）`,id:job.id});await extractEpisodeMemory(project,episode,currentSignal());run("UPDATE jobs SET progress=@progress WHERE id=@id",{progress:index+1,id:job.id});}
    return {episodes:episodes.length};
  }
  if(job.type==="episode"){const episode=get("SELECT * FROM episodes WHERE project_id=@pid AND episode_no=@no",{pid:project.id,no:Number(job.target)});if(!episode)throw new Error("该集不存在，请先生成逐集框架");return writeEpisode(project,episode,job);}
  if(job.type==="full_book"){
    const payload=job.payload,overwrite=Boolean(payload.overwrite),startEpisode=Math.max(1,Number(payload.start_episode)||1),endEpisode=Math.max(startEpisode,Number(payload.end_episode)||Number(project.total_episodes));
    const checkpoint={...(job.checkpoint||{})};if(!Array.isArray(checkpoint.episode_numbers)){const initial=all(`SELECT episode_no FROM episodes WHERE project_id=@id AND episode_no>=@start AND episode_no<=@end ${overwrite?"":"AND (script IS NULL OR script='')"} ORDER BY episode_no`,{id:project.id,start:startEpisode,end:endEpisode});if(overwrite&&startEpisode===1&&!checkpoint.memory_reset_done){run("UPDATE jobs SET message='正在清理旧剧情记忆，保留03初始人物档案' WHERE id=@id",{id:job.id});clearGeneratedMemory(project.id);checkpoint.memory_reset_done=true;}checkpoint.episode_numbers=initial.map(x=>x.episode_no);checkpoint.current_episode=null;checkpoint.stage="novel";saveCheckpoint(job.id,checkpoint,`准备生成 ${initial.length} 集`,0);job.progress=0;}
    if(!checkpoint.episode_numbers.length)throw new Error(overwrite?"没有可写的逐集框架":"所有集都已有剧本；如需重写请选择覆盖模式");
    run("UPDATE jobs SET total=@total WHERE id=@id",{total:checkpoint.episode_numbers.length,id:job.id});
    for(let i=Math.max(0,Number(job.progress)||0);i<checkpoint.episode_numbers.length;i++){const episode=get("SELECT * FROM episodes WHERE project_id=@pid AND episode_no=@no",{pid:project.id,no:checkpoint.episode_numbers[i]});if(!episode)throw new Error(`EP${String(checkpoint.episode_numbers[i]).padStart(2,"0")} 不存在`);job.progress=i;await writeFullBookEpisode(project,episode,job,checkpoint,overwrite);checkpoint.current_episode=null;checkpoint.stage="novel";job.progress=i+1;saveCheckpoint(job.id,checkpoint,`已完成 EP${String(episode.episode_no).padStart(2,"0")}（${i+1}/${checkpoint.episode_numbers.length}）`,i+1);}
    return {episodes:checkpoint.episode_numbers};
  }
  throw new Error("未知任务类型");
}
const workbenchSettings=()=>get("SELECT * FROM workbench_settings WHERE id=1")||{parallel_enabled:0,session_id:"",concurrency_mode:"auto",concurrency_limit:5,adaptive_limit:5,recover_at:null};
const clampConcurrency=value=>Math.max(1,Math.min(5,Number(value)||1));
const freshWorkbenchSession=()=>`wb-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
let schedulerPending=false;
function maybeRecoverConcurrency(){const settings=workbenchSettings();if(!settings.parallel_enabled||settings.concurrency_mode!=="auto"||!settings.recover_at||Date.now()<Date.parse(settings.recover_at))return settings;const next=Math.min(5,clampConcurrency(settings.adaptive_limit)+1),recoverAt=next<5?new Date(Date.now()+10*60*1000).toISOString():null;run("UPDATE workbench_settings SET adaptive_limit=@limit,recover_at=@recover,updated_at=@time WHERE id=1",{limit:next,recover:recoverAt,time:now()});scheduleWork();return workbenchSettings();}
function noteConcurrencyPressure(message){if(!/(?:429|rate.?limit|请求过多|限流|平台繁忙|server busy|request timed out|connection error)/i.test(String(message||"")))return;const settings=workbenchSettings();if(!settings.parallel_enabled||settings.concurrency_mode!=="auto")return;run("UPDATE workbench_settings SET adaptive_limit=@limit,recover_at=@recover,updated_at=@time WHERE id=1",{limit:Math.max(1,clampConcurrency(settings.adaptive_limit)-1),recover:new Date(Date.now()+10*60*1000).toISOString(),time:now()});}
const effectiveConcurrency=settings=>settings.parallel_enabled?(settings.concurrency_mode==="auto"?clampConcurrency(settings.adaptive_limit):clampConcurrency(settings.concurrency_limit)):1;
function scheduleWork(){if(schedulerPending)return;schedulerPending=true;setImmediate(()=>{schedulerPending=false;work();});}
function nextRunnableJob(settings){const rows=all("SELECT * FROM jobs WHERE status='queued' ORDER BY id");if(!settings.parallel_enabled)return rows[0]||null;const runningProjects=new Set([...jobControllers.values()].map(item=>Number(item.projectId)));return rows.find(row=>row.workbench_session_id===settings.session_id&&!runningProjects.has(Number(row.project_id)))||null;}
async function runJob(row){let job=parseJob(row);const controller=new AbortController();jobControllers.set(job.id,{controller,projectId:job.project_id,sessionId:job.workbench_session_id||""});const start=now();run("UPDATE jobs SET status='running',started_at=COALESCE(started_at,@time),attempt_started_at=@time,step_started_at=COALESCE(step_started_at,@time),message=CASE WHEN progress>0 THEN '正在继续未完成任务' ELSE '任务已开始' END WHERE id=@id AND status='queued'",{time:start,id:job.id});const heartbeat=setInterval(()=>flushElapsed(job.id),5000);
  try{await jobContext.run({signal:controller.signal,jobId:job.id,projectId:job.project_id},async()=>{let result;while(true){job=parseJob(get("SELECT * FROM jobs WHERE id=@id",{id:job.id}));try{result=await execute(job);break}catch(error){const current=get("SELECT * FROM jobs WHERE id=@id",{id:job.id});if(current?.status!=="running")throw error;const count=Number(current?.auto_retry_count||0),limit=Math.max(0,Number(current?.auto_retry_limit??5)),message=String(error?.message||error),blocked=message.startsWith(OUTLINE_SPINE_API_ERROR)||/(?:敏感|拒绝|拦截|API Key|401|403|余额|额度|鉴权|模型不存在)/i.test(message),autoContinuable=job.type==="full_book"||job.type==="outline_first_appearances"||(job.type==="stage"&&job.target==="outline");noteConcurrencyPressure(message);writeStepLog(current,{outcome:"failed",message});run("UPDATE jobs SET step_started_at=@time WHERE id=@id",{time:now(),id:job.id});if(!autoContinuable||blocked||count>=limit)throw error;flushElapsed(job.id);const next=count+1,restart=now();run("UPDATE jobs SET auto_retry_count=@count,error=@error,message=@message,attempt_started_at=@time WHERE id=@id",{count:next,error:message,message:`任务中断，正在自动继续（${next}/${limit}）`,time:restart,id:job.id});await new Promise(resolve=>setTimeout(resolve,Math.min(5000,next*750)));}}
    if(get("SELECT status FROM jobs WHERE id=@id",{id:job.id})?.status==="running"){flushElapsed(job.id);run("UPDATE jobs SET status='completed',progress=total,message='已完成',error='',result_json=@result,finished_at=@time,attempt_started_at=NULL WHERE id=@id",{result:JSON.stringify(result),time:now(),id:job.id});}});}
  catch(error){if(get("SELECT status FROM jobs WHERE id=@id",{id:job.id})?.status==="running"){flushElapsed(job.id);const message=error?.message||String(error);noteConcurrencyPressure(message);run("UPDATE jobs SET status='failed',message='执行失败',error=@error,finished_at=@time,attempt_started_at=NULL WHERE id=@id",{error:message,time:now(),id:job.id});}}
  finally{clearInterval(heartbeat);jobControllers.delete(job.id);scheduleWork();}
}
function work(){const settings=maybeRecoverConcurrency(),limit=effectiveConcurrency(settings);while(jobControllers.size<limit){const row=nextRunnableJob(settings);if(!row)break;runJob(row);}}
function flushElapsed(jobId){const row=get("SELECT elapsed_ms,attempt_started_at FROM jobs WHERE id=@id",{id:jobId});if(!row?.attempt_started_at)return;const stamp=Date.parse(row.attempt_started_at),current=Date.now();if(!Number.isFinite(stamp)||current<=stamp)return;run("UPDATE jobs SET elapsed_ms=@elapsed,attempt_started_at=@time WHERE id=@id",{elapsed:Number(row.elapsed_ms||0)+(current-stamp),time:new Date(current).toISOString(),id:jobId});}
export function enqueueJob(projectId,type,target="",payload={}){const duplicate=get("SELECT * FROM jobs WHERE project_id=@pid AND type=@type AND target=@target AND status IN ('queued','running')",{pid:projectId,type,target});if(duplicate)return parseJob(duplicate);const settings=workbenchSettings();let session="";if(settings.parallel_enabled){const activeCount=get("SELECT COUNT(*) count FROM jobs WHERE workbench_session_id=@session AND status IN ('queued','running')",{session:settings.session_id})?.count||0;if(activeCount>=10)throw new Error("工作台已有10个活动任务，请等待或取消一个任务后再提交");if(get("SELECT id FROM jobs WHERE project_id=@pid AND status IN ('queued','running') LIMIT 1",{pid:projectId}))throw new Error("并行模式下，同一个项目一次只能有一个运行中或排队任务");session=settings.session_id;}const requested=Number(payload.auto_retry_limit??5),supportsAutoRetry=type==="full_book"||type==="outline_first_appearances"||(type==="stage"&&target==="outline"),limit=supportsAutoRetry&&Number.isSafeInteger(requested)&&requested>=0?requested:5,result=run("INSERT INTO jobs(project_id,type,target,payload_json,auto_retry_limit,workbench_session_id) VALUES(@pid,@type,@target,@payload,@limit,@session)",{pid:projectId,type,target,payload:JSON.stringify(payload),limit,session});scheduleWork();return parseJob(get("SELECT * FROM jobs WHERE id=@id",{id:Number(result.lastInsertRowid)}));}
export function listJobs(projectId){return all("SELECT * FROM jobs WHERE project_id=@id ORDER BY id DESC LIMIT 30",{id:projectId}).map(parseJob);}
export function cancelJob(projectId,jobId){const job=get("SELECT * FROM jobs WHERE id=@id AND project_id=@pid",{id:Number(jobId),pid:Number(projectId)});if(!job)throw new Error("任务不存在");if(!["queued","running"].includes(job.status))return parseJob(job);flushElapsed(job.id);run("UPDATE jobs SET status='cancelled',message='已取消',error='',finished_at=@time,attempt_started_at=NULL WHERE id=@id",{time:now(),id:job.id});jobControllers.get(job.id)?.controller.abort();scheduleWork();return parseJob(get("SELECT * FROM jobs WHERE id=@id",{id:job.id}));}
export function continueJob(projectId,jobId){const job=get("SELECT * FROM jobs WHERE id=@id AND project_id=@pid",{id:Number(jobId),pid:Number(projectId)});if(!job)throw new Error("任务不存在");const resumable=["full_book","episode","episode_script"].includes(job.type)||(job.type==="stage"&&job.target==="outline");if(!resumable||!["failed","cancelled"].includes(job.status))throw new Error("该任务不能继续");if(get("SELECT id FROM jobs WHERE project_id=@pid AND status IN ('queued','running') AND id<>@id",{pid:Number(projectId),id:job.id}))throw new Error("已有另一个生成任务正在进行");const settings=workbenchSettings();let session="";if(settings.parallel_enabled){const activeCount=get("SELECT COUNT(*) count FROM jobs WHERE workbench_session_id=@session AND status IN ('queued','running')",{session:settings.session_id})?.count||0;if(activeCount>=10)throw new Error("工作台已有10个活动任务");session=settings.session_id;}const outline=job.type==="stage"&&job.target==="outline";run("UPDATE jobs SET status='queued',message=@message,error='',finished_at=NULL,attempt_started_at=NULL,auto_retry_count=0,auto_retry_limit=CASE WHEN @outline=1 THEN 100 ELSE auto_retry_limit END,workbench_session_id=@session,interruption_reason='' WHERE id=@id",{id:job.id,session,outline:outline?1:0,message:outline?"已手动继续梗概生成，将从安全检查点开始":"已手动继续，将从上次检查点开始"});scheduleWork();return parseJob(get("SELECT * FROM jobs WHERE id=@id",{id:job.id}));}
export function getWorkbenchState(){const settings=maybeRecoverConcurrency(),session=settings.session_id||"",jobs=session?all(`SELECT j.*,p.title project_title FROM jobs j JOIN projects p ON p.id=j.project_id WHERE j.workbench_session_id=@session AND j.status IN ('queued','running') ORDER BY j.id`,{session}).map(parseJob):[];return {parallelEnabled:Boolean(settings.parallel_enabled),sessionId:session,concurrencyMode:settings.concurrency_mode,concurrencyLimit:clampConcurrency(settings.concurrency_limit),adaptiveLimit:clampConcurrency(settings.adaptive_limit),effectiveConcurrency:effectiveConcurrency(settings),recoverAt:settings.recover_at||null,maxTasks:10,running:jobs.filter(job=>job.status==="running").length,queued:jobs.filter(job=>job.status==="queued").length,jobs};}
export function configureWorkbench(input={}){const current=workbenchSettings(),enabled=input.parallel_enabled==null?Boolean(current.parallel_enabled):Boolean(input.parallel_enabled),mode=input.concurrency_mode==="manual"?"manual":input.concurrency_mode==="auto"?"auto":current.concurrency_mode||"auto",limit=clampConcurrency(input.concurrency_limit??current.concurrency_limit??3);if(enabled&&!current.parallel_enabled){const active=all("SELECT id,project_id FROM jobs WHERE status IN ('queued','running') ORDER BY id");if(active.length>10)throw new Error("当前串行队列超过10个任务，请先处理部分任务再开启并行");if(new Set(active.map(item=>item.project_id)).size!==active.length)throw new Error("当前队列中同一项目有多个任务，请先完成或取消到每个项目只剩一个任务");const session=freshWorkbenchSession();transaction(()=>{run("UPDATE workbench_settings SET parallel_enabled=1,session_id=@session,concurrency_mode=@mode,concurrency_limit=@limit,adaptive_limit=@limit,recover_at=NULL,updated_at=@time WHERE id=1",{session,mode,limit,time:now()});run("UPDATE jobs SET workbench_session_id=@session WHERE status IN ('queued','running')",{session});});for(const row of active){const entry=jobControllers.get(row.id);if(entry)entry.sessionId=session;}scheduleWork();return getWorkbenchState();}if(!enabled&&current.parallel_enabled){const session=current.session_id,active=all("SELECT id,status FROM jobs WHERE workbench_session_id=@session AND status IN ('queued','running')",{session});for(const row of active)if(row.status==="running")flushElapsed(row.id);transaction(()=>{run("UPDATE jobs SET status='failed',message='并行模式已关闭',error='任务因用户关闭并行模式而中断，可返回项目任务列表继续',interruption_reason='parallel_disabled',finished_at=@time,attempt_started_at=NULL WHERE workbench_session_id=@session AND status IN ('queued','running')",{session,time:now()});run("UPDATE workbench_settings SET parallel_enabled=0,session_id='',concurrency_mode=@mode,concurrency_limit=@limit,adaptive_limit=@limit,recover_at=NULL,updated_at=@time WHERE id=1",{mode,limit,time:now()});});for(const row of active)jobControllers.get(row.id)?.controller.abort();scheduleWork();return getWorkbenchState();}run("UPDATE workbench_settings SET concurrency_mode=@mode,concurrency_limit=@limit,adaptive_limit=CASE WHEN @mode='manual' THEN adaptive_limit ELSE MIN(adaptive_limit,@limit) END,updated_at=@time WHERE id=1",{mode,limit,time:now()});scheduleWork();return getWorkbenchState();}
export function resumeJobs(){run("UPDATE jobs SET status=CASE WHEN type='full_book' AND auto_retry_count>=auto_retry_limit THEN 'failed' ELSE 'queued' END,message=CASE WHEN type='full_book' AND auto_retry_count>=auto_retry_limit THEN '应用中断后已用尽' || auto_retry_limit || '次自动继续' WHEN type='full_book' THEN '应用重启，正在从上次检查点自动继续（' || (auto_retry_count+1) || '/' || auto_retry_limit || '）' ELSE '应用重启后将从上次检查点继续' END,auto_retry_count=CASE WHEN type='full_book' AND auto_retry_count<auto_retry_limit THEN auto_retry_count+1 ELSE auto_retry_count END,error=CASE WHEN type='full_book' AND auto_retry_count>=auto_retry_limit THEN '自动继续次数已用尽' ELSE error END,finished_at=CASE WHEN type='full_book' AND auto_retry_count>=auto_retry_limit THEN @time ELSE NULL END,attempt_started_at=NULL WHERE status='running'",{time:now()});scheduleWork();}
