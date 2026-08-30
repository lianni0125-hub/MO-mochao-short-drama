import OpenAI from "openai";
import { jsonrepair } from "jsonrepair";
import { activeProvider } from "./config.js";
import { templateContext, templateWritingGuide } from "./templates.js";

const objectSchema = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const string = { type: "string" };
const stringArray = { type: "array", items: string };
const schemas = {
  idea: objectSchema({ diagnosis:string, market_fit:string, differentiation:string, core_hook:string, protagonist_goal:string, sustained_conflict:string, relationship_engine:string, story_promise:string, approved_idea:string }),
  planning: objectSchema({ title:string, framework:string, worldbuilding:string, synopsis:string, core_expectations:string }),
  benchmark: {type:"object",additionalProperties:true},
  synopsis: {type:"object",additionalProperties:true},
  cards: {type:"object",additionalProperties:true},
  expectations: {type:"object",additionalProperties:true},
  characters: {type:"object",additionalProperties:true},
  skeleton: objectSchema({ main_plot:string, core_conflict:string, key_secrets:stringArray, ending:string, cards:{type:"array",items:{type:"object",additionalProperties:true}}, phases:stringArray }),
  outline: objectSchema({ episodes:{type:"array",items:objectSchema({ episode_no:{type:"integer"},title:string,summary:string,hook:string,purpose:string,start_state:string,end_state:string,required_plot:string,must_reveal:string,must_not_reveal:string,rhythm:string,emotion:string,card_relation:string,first_appearance_characters:string })} }),
  state_update: objectSchema({items:{type:"array",items:objectSchema({category:{type:"string",enum:["fact","knowledge","relationship","capability","system","character","prop","unresolved"]},subject:string,value:string,status:{type:"string",enum:["active","resolved","replaced"]}})}}),
  quality: objectSchema({passed:{type:"boolean"},issues:{type:"array",items:objectSchema({severity:string,category:string,message:string})},suggestions:stringArray})
  ,scene_treatment: objectSchema({scene_treatment:string})
};
const hanCount=value=>(String(value||"").match(/\p{Script=Han}/gu)||[]).length;
export function novelDescriptionIssues(value,limit=40){
  return String(value||"").split(/\r?\n+/).map((paragraph,index)=>({paragraph:index+1,text:paragraph.trim()})).filter(item=>item.text).map(item=>({...item,count:hanCount(item.text)})).filter(item=>item.count>limit);
}
export function splitNovelLongParagraphs(value,limit=40){
  return String(value||"").split(/\r?\n+/).map(raw=>{
    const paragraph=raw.trim();
    if(!paragraph||hanCount(paragraph)<=limit)return paragraph;
    const sentences=[];
    let start=0;
    for(let index=0;index<paragraph.length;index++){
      if(!/[。！？；]/.test(paragraph[index]))continue;
      let end=index+1;
      while(end<paragraph.length&&/[」』】]/.test(paragraph[end]))end++;
      const sentence=paragraph.slice(start,end).trim();
      if(sentence)sentences.push(sentence);
      start=end;
      index=end-1;
    }
    const tail=paragraph.slice(start).trim();if(tail)sentences.push(tail);
    // 只有确实存在两个以上完整句界时才分段；超长单句留给模型定向缩写。
    return sentences.length>1?sentences.join("\n\n"):paragraph;
  }).filter(Boolean).join("\n\n");
}
const novelNarration=value=>String(value||"").replace(/「[^」]*」/gs,"");
export function novelPerspectiveIssue(value,narrativePerson="first"){
  const narration=novelNarration(value).replace(/自我|忘我|无我/g,"");
  if(narrativePerson==="third"){
    const hit=narration.match(/我(?:们)?|咱(?:们)?/);
    return hit?`小说锁定为第三人称，但叙述段出现第一人称自称“${hit[0]}”`:"";
  }
  return /我/.test(narration)?"":"小说锁定为第一人称，但叙述正文没有使用“我”作为主角叙述视角";
}
const normalizeNovelText=value=>String(value||"")
  .replace(/“([^”\n]+)”/g,"「$1」")
  .replace(/"([^"\n]+)"/g,"「$1」")
  .replace(/[（）()]/g,"")
  .trim();

export function cleanEpisodeText(content){
  let text=String(content||"").replace(/<think>[\s\S]*?<\/think>/gi,"").trim();
  text=text.replace(/^```(?:text|plaintext|markdown)?\s*/i,"").replace(/\s*```$/i,"").trim();
  text=text.replace(/\\r\\n|\\n|\\r/g,"\n");
  const episodeStart=text.search(/(?:^|\n)\s*EP\s*0*\d+\b/i);
  if(episodeStart>0)text=text.slice(episodeStart).trim();
  text=text.replace(/\n?\s*【?EP\s*0*\d+\s*(?:完|结束)】?\s*$/i,"").trim();
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const isDialogue=line=>/^[^：\n]{1,30}(?:\s+V\.O\.|\s+OS)?\s*：/.test(line);
  const isHeading=line=>/^EP\s*\d+/i.test(line)||/^\d+\s+(?:内景?|外景?)\s+.+/.test(line);
  for(let i=0;i<lines.length-1;i++){
    const spoken=lines[i+1].match(/^([^：\n]{1,30})：(.+)$/);
    const speaker=spoken?.[1]?.trim()||"";
    const inner= speaker&&lines[i].startsWith(speaker)&&/(?:在心里说|在心中说|心里说道|心中说道|内心说道|心中默念)[。！？]?$/.test(lines[i]);
    if(inner&&spoken){
      lines[i+1]=`${speaker} V.O.：${spoken[2].trim()}`;
      lines.splice(i,1);i--;
    }
  }
  const result=[];
  for(let i=0;i<lines.length;){
    if(isDialogue(lines[i])||isHeading(lines[i])){result.push(lines[i]);i++;continue;}
    let end=i+1;
    while(end<lines.length&&!isDialogue(lines[end])&&!isHeading(lines[end]))end++;
    const previous=result.at(-1)||"",next=lines[end]||"",run=lines.slice(i,end);
    if(isDialogue(previous)&&isDialogue(next)&&run.length>1){
      result.push(run.reduce((merged,line)=>!merged?line:/[。！？!?；;]$/.test(merged)?merged+line:`${merged}；${line}`,""));
    }else result.push(...run);
    i=end;
  }
  return result.join("\n");
}

function plannedCompositeScenes(value){
  const block=String(value||"").match(/【剧情安排】([\s\S]*?)(?=\n【逻辑推理】|$)/)?.[1]||"",groups=new Map();
  for(const raw of block.split(/\r?\n/)){const match=raw.trim().match(/^(\d+)\s+(内\/外|外\/内|内景?|外景?)\s+(.+)$/);if(!match)continue;const number=Number(match[1]),tail=match[3].trim(),routeText=tail.replace(/\s+(?:凌晨|清晨|早晨|上午|中午|下午|傍晚|黄昏|深夜|夜|日|白天|夜晚|当天)(?:至(?:凌晨|清晨|早晨|上午|中午|下午|傍晚|黄昏|深夜|夜|日|白天|夜晚))?\s*$/,""),locations=routeText.split("→").map(item=>item.trim()).filter(Boolean),group=groups.get(number)||{number,locations:[],composite:false};for(const location of locations)if(!group.locations.includes(location))group.locations.push(location);group.composite=group.composite||locations.length>1||groups.has(number);groups.set(number,group)}
  return [...groups.values()].filter(group=>group.composite&&group.locations.length>1);
}

function episodePerformanceIssues(text,extra={}){
  const scenePattern=/^\d+\s+(?:内\/外|外\/内|内景?|外景?)\s+.+/,lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean),sceneLines=lines.filter(line=>scenePattern.test(line));
  const actionLines=lines.filter(line=>!/^EP\s*\d+/i.test(line)&&!scenePattern.test(line)&&!/^.{1,30}(?:\s+V\.O\.|\s+OS)?\s*：/.test(line));
  const actionSentences=actionLines.flatMap(line=>line.split(/(?<=[。！？!?])/).map(x=>x.trim()).filter(Boolean));
  const issues=[];
  const silentEpisode=/(?:全程无声|不能出声|禁止说话|不得说话|无台词)/.test([extra.episode?.summary,extra.episode?.required_plot,extra.episode?.must_not_reveal].filter(Boolean).join("\n"));
  const spokenLines=lines.filter(line=>/^[^：\n]{1,30}(?:\s+V\.O\.|\s+OS)?：\S+/.test(line));
  if(!silentEpisode&&!spokenLines.length)issues.push("整集没有任何台词或主角V.O.；单人场景也必须用有行动目的的外说、自言自语或必要主角V.O.形成语言节奏，不得凭空新增人物、电话、广播、系统激活或未知事实");
  const premature=(extra.forbiddenAppearanceCharacters||[]).find(name=>{const escaped=String(name).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");return lines.some(line=>new RegExp(`^${escaped}(?:\s+(?:V\\.O\\.|OS))?：|^${escaped}.{0,12}(?:走|跑|冲|站|坐|跪|推|拉|抓|抬|看|盯|笑|问|喊|说|开口|出现|进来|离开)`).test(line));});
  if(premature)issues.push(`主要人物“${premature}”尚未到规划的首次出场集，却已在本集现场行动或说话`);
  if(/[（）()]/.test(String(text)))issues.push("出现任何圆括号或小括号");
  if(extra.sourceNarrativePerson==="third"){const quotedDialogue=lines.find(line=>/[「」“”]/.test(line));if(quotedDialogue)issues.push(`排版未正确换行，残留第三人称小说的对白引号或嵌入式对白：“${quotedDialogue.slice(0,100)}”；识别实际说话人，去掉引号，拆成独立动作行与“人物：台词”行`);}
  if(sceneLines.length<1||sceneLines.length>3)issues.push(`场次数为${sceneLines.length}，必须严格为1–3场`);
  for(const group of plannedCompositeScenes(extra.episode?.episode_plan)){
    const heading=sceneLines.find(line=>Number(line.match(/^(\d+)/)?.[1])===group.number)||"",markers=lines.filter(line=>/^【(?:内\/外|外\/内|内景?|外景?)\s+.+】$/.test(line)),headingMissing=group.locations.filter(location=>!heading.includes(location)),markerIndexes=group.locations.map(location=>markers.findIndex(line=>line.includes(location)));
    if(!heading||headingMissing.length||markerIndexes.some(index=>index<0)||markerIndexes.some((index,i)=>i>0&&index<=markerIndexes[i-1]))issues.push(`未忠实执行剧情安排的复合场次${group.number}：总标题必须保留“${group.locations.join("→")}”，并按此顺序使用独立方括号转场标记；转场不另编号，也不得与正文混排`);
  }
  if(extra.shortSceneHeading){const wrong=sceneLines.find(line=>/^\d+\s+(?:内景|外景)\s+|\s+(?:白天|夜晚)$/.test(line));if(wrong)issues.push(`默认模板场次标题格式错误：“${wrong}”；应使用“序号 外/内 地点 日/夜”`);}
  const crowdedLine=lines.find(line=>{
    if(/^EP\s*\d+/i.test(line)||scenePattern.test(line))return false;
    const startsWithDialogue=/^[\p{Script=Han}A-Za-z0-9·]{1,20}(?:\s+V\.O\.|\s+OS)?：/u.test(line);
    const prefixes=[...line.matchAll(/(?:^|[。！？!?]\s*)([\p{Script=Han}A-Za-z0-9·]{1,20})(?:\s+V\.O\.|\s+OS)?：/gu)];
    if(!startsWithDialogue){
      const narrativeColon=/^(?:那|这)?.*(?:意思很清楚|写着|显示|内容如下|结果如下|提示如下)$/;
      return prefixes.some(match=>!narrativeColon.test(match[1]||""));
    }
    if(/^系统音：/.test(line))return false;
    const metadata=/^(?:当前|剩余|累计|获得|消耗|任务|事件|状态|奖励|积分|余额|好感度|倒计时|等级|体力|战力|生命值|完成度)/;
    return prefixes.slice(1).some(match=>!metadata.test(match[1]||""));
  });
  if(crowdedLine)issues.push(`排版未正确换行，同一行出现多个人物台词或动作与台词混排：“${crowdedLine.slice(0,100)}”`);
  for(let i=1;i<sceneLines.length;i++){const a=sceneLines[i-1].replace(/^\d+\s+/,""),b=sceneLines[i].replace(/^\d+\s+/,"");if(a===b){issues.push(`同一地点和时间被重复拆场：“${b}”`);break;}}
  const mentalPattern=/(?:心里一沉|心中一沉|心里一凛|心中一凛|心里[^。！？]{0,8}咯噔(?:一下)?|心中[^。！？]{0,8}咯噔(?:一下)?|咯噔(?:一下)?|心里[^。！？]{0,12}刺痛|暗自|内心|误以为|以为|意识到|明白(?:了)?|觉得|认为|(?:眼神|表情|动作)[^。！？]{0,16}(?:意思|表明|说明)|意思很清楚)/;
  const mental=actionSentences.find(line=>mentalPattern.test(line));
  if(mental){const hit=mental.match(mentalPattern)?.[0]||"";issues.push(`存在不可拍摄的心理判断或作者解释：“${mental.slice(0,100)}”（命中：${hit}）${/咯噔/.test(hit)?"；‘咯噔’直接删除，不得改成 V.O./OS，也不得补写其他心理反应":""}`);}
  const reportedSpeechPattern=/(?:说是|表示(?:道)?|解释(?:道)?|告诉|声称|问道|回答(?:道)?|回应(?:道)?)/;
  const reportedSpeech=actionSentences.find(line=>reportedSpeechPattern.test(line));
  if(reportedSpeech)issues.push(`动作段转述了本应展开的对白：“${reportedSpeech.slice(0,100)}”（命中：${reportedSpeech.match(reportedSpeechPattern)?.[0]}）`);
  const innerSpeechAction=actionSentences.find(line=>/(?:在心里说|在心中说|心里说道|心中说道|内心说道|心中默念)/.test(line));
  if(innerSpeechAction)issues.push(`把内心独白错误写成了动作说明：“${innerSpeechAction.slice(0,100)}”；删除该动作说明，并把对应台词直接改成“主角名 V.O.：台词”`);
  const expositionPattern=/(?:看起来像|期限(?:正在)?逼近|期限将至|在医院(?:里)?等着[^。！？]{0,12}(?:钱|救命)|(?:逼着|催着)[^。！？]{0,12}(?:要|交|赔|还)|(?:口袋里?|身上)只剩|声音[^。！？]{0,8}卡在(?:喉咙|嗓子)里|话[^。！？]{0,8}(?:堵|卡)在(?:喉咙|嗓子)里|张(?:开|了)?嘴[^。！？]{0,10}(?:说不出话|没说出话))/;
  const exposition=actionSentences.find(line=>expositionPattern.test(line));
  if(exposition)issues.push(`动作段写成了作者交代、矛盾摘要或无效迟疑：“${exposition.slice(0,100)}”（命中：${exposition.match(expositionPattern)?.[0]}）；前五类必要信息应优先改成现场对白、点数实物或明确道具，无法自然外化时可用一句主角 V.O.，不必要则删除；无效迟疑不能改成 V.O.`);
  const forbiddenPattern=/(?:瞳孔骤缩|眼睛一亮|眼中闪过|眼神一沉|眼神一凛|眼里闪着[^。！？]{0,16}光|眼里[^。！？]{0,12}看热[闹鬧闘]|嘴角(?:微微)?上扬|眉头一皱|脸(?:色)?一阵青一阵白|脸(?:色)?青一阵白一阵|脸色(?:骤然|猛地)?一变|倒吸凉气|攥紧拳头|手指[^。！？]{0,12}泛白|指甲[^。！？]{0,16}掐进掌心|掌心[^。！？]{0,12}血丝|咬牙|打颤|沉默|不说话|盯着看|显得|似乎|好像|仿佛|闻到|听得|看得|得像[^。！？]{1,24}|像.+一样|夕阳|余晖|夜幕降临|天色渐暗|太阳落山|路灯亮|风像|寒气逼人)/;
  const forbidden=actionSentences.find(line=>forbiddenPattern.test(line));
  if(forbidden)issues.push(`出现Skill禁止的情绪、状态、环境、感官或套路描写：“${forbidden.slice(0,100)}”（命中：${forbidden.match(forbiddenPattern)?.[0]}）`);
  const summaryAction=actionLines.find(line=>{
    if(!/(?:走了|来了|离开了|离去了)[。！!]?$/.test(line))return false;
    const visibleEntranceOrExit=/(?:头也不回|转身|回头|推开|拨开|穿过|越过|挤开|冲|跑|快步|大步|拖|架|押|扶|抬|抱|扛|拉着|拽着|带着|跟着|钻进|跳下|退到|逃出|走进|走出|走向|走回|来到|回到|进入|退出|上车|下车|进门|出门|向\S{1,12}|往\S{1,12})/;
    return !visibleEntranceOrExit.test(line);
  });
  if(summaryAction)issues.push(`出现没有表演过程的空泛进出场结果句：“${summaryAction.slice(0,60)}”；请补充可拍摄的动作方式、方向或对象`);
  const voSpeakers=lines.map(line=>line.match(/^([^：\n]{1,30})\s+(?:V\.O\.|OS)：/)?.[1]).filter(Boolean);
  const protagonist=String(extra.protagonistIdentifier||"").trim();
  const invalidVo=protagonist?voSpeakers.find(name=>name!==protagonist):new Set(voSpeakers).size>1?voSpeakers[0]:"";
  if(invalidVo)issues.push(`非主角使用V.O./OS：“${invalidVo}”；只有${protagonist||"主角"}可以使用`);
  if(protagonist){
    const borrowedThreat=lines.find(line=>line.startsWith(`${protagonist} V.O.：`)&&/(?:你敢|你要是|否则|不然|给我|别想|你妈|你爸|你家人)/.test(line));
    if(borrowedThreat)issues.push(`主角V.O.替其他人物转述或脑补威胁：“${borrowedThreat.slice(0,100)}”；应删除该脑补内容，不得改成V.O.或新增现场对白`);
  }
  const dialogue=lines.map(line=>line.match(/^[^：\n]{1,30}(?:\s+V\.O\.|\s+OS)?：(.+)$/)?.[1]?.trim()).filter(Boolean);
  const isFragment=value=>(value.match(/[\p{L}\p{N}]/gu)||[]).length<=2;
  const fragments=dialogue.filter(isFragment);let fragmentRun=0,maxFragmentRun=0;
  for(const value of dialogue){fragmentRun=isFragment(value)?fragmentRun+1:0;maxFragmentRun=Math.max(maxFragmentRun,fragmentRun);}
  if(maxFragmentRun>=5||(dialogue.length>=16&&fragments.length>=8&&fragments.length/dialogue.length>=0.5))issues.push(`台词整体过度碎片化，连续短台词最多 ${maxFragmentRun} 句：“${fragments.slice(0,5).join(" / ")}”`);
  return issues;
}

function cleanBoundaryText(content,field){
  let text=String(content||"").replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/^```(?:text|plaintext|markdown)?\s*/i,"").replace(/\s*```$/i,"").trim();
  if(field!=="required_plot")return text;
  const lines=text.split(/\r?\n/).map(line=>line.replace(/^\s*(?:答案|最终答案|必须发生|输出)\s*[：:]\s*/i,"").trim()).filter(Boolean);
  const arrowLines=lines.filter(line=>(line.match(/→/g)||[]).length>=3);
  if(arrowLines.length)text=arrowLines.at(-1);
  text=text.replace(/^\s*【?必须发生】?\s*[：:]?\s*/i,"").replace(/[。；;]\s*$/,"").trim();
  return text;
}

function unauthorizedGoldenKnowledgeIssue(text,extra={},stage="episode"){
  const entries=(extra.goldenKnowledgeEntries||[]).map(item=>({name:String(item.name||"").trim(),kind:String(item.kind||"").trim(),owner:String(item.owner||"").trim()})).filter(item=>item.name&&item.owner);
  if(!entries.length)return "";
  const owners=new Set(entries.map(item=>item.owner));
  const characters=[...new Set((extra.characterIdentifiers||[]).map(value=>String(value||"").trim()).filter(Boolean))]
    .filter(name=>name!=="系统音");
  if(!characters.length)return "";
  const basis=String(extra.goldenKnowledgeBasis||"");
  const secret=/(?:系统|弹幕|金手指|异能|血统|宿主|系统任务|系统提示|系统积分)/;
  const sourceProbe=/(?:怎么突然会|以前明明不会|什么时候学会|哪来的(?:能力|本事)|身上.{0,8}秘密)/;
  const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const implicatedEntries=value=>entries.filter(item=>value.includes(item.name)||(value.includes("系统")&&(item.name.includes("系统")||item.kind.includes("系统")))||(value.includes("弹幕")&&(item.name.includes("弹幕")||item.kind.includes("弹幕")))||/(?:异能|血统|金手指|宿主|系统任务|系统提示|系统积分)/.test(value));
  const explicitlyAllowed=(person,item)=>basis.split(/[\n；。→]/).some(part=>part.includes(person)&&(part.includes(item.name)||secret.test(part)));
  const unauthorized=(person,value)=>{
    const implicated=implicatedEntries(value);
    if(sourceProbe.test(value)&&!implicated.length)return !owners.has(person);
    return implicated.some(item=>item.owner!==person&&!explicitlyAllowed(person,item));
  };
  for(const name of characters){
    if(stage==="episode"){
      const dialogue=String(text).split(/\r?\n/).map(line=>line.trim()).filter(line=>new RegExp(`^${escaped(name)}(?:\\s+(?:V\\.O\\.|OS))?：`).test(line));
      const hit=dialogue.find(line=>(secret.test(line)||sourceProbe.test(line))&&unauthorized(name,line));
      if(hit)return `人物“${name}”不是对应金手指的持有者，且本集大概内容和必须发生均无获知依据，却表现为知道或追查金手指：“${hit.slice(0,100)}”`;
    }else{
      const attributed=new RegExp(`${escaped(name)}[^\\n「」]{0,40}：「([^」]+)」`,"g");
      for(const match of String(text).matchAll(attributed)){
        if((secret.test(match[1])||sourceProbe.test(match[1]))&&unauthorized(name,match[1]))return `人物“${name}”不是对应金手指的持有者，且本集大概内容和必须发生均无获知依据，却表现为知道或追查金手指：“${match[1].slice(0,80)}”`;
      }
    }
  }
  return "";
}

function validatePlainOutput(stage,output,extra={}){
  const text=String(output||"").trim(),count=hanCount(text);
  if(!text)return `${stage==="episode_novel"?"小说":stage==="episode_arrangement"?"剧情安排":"剧本"}正文为空`;
  if(Number(extra.minEffectiveCharacters)>0&&count<Number(extra.minEffectiveCharacters))return `有效字符 ${count}，少于最低要求 ${extra.minEffectiveCharacters}`;
  if(Number(extra.maxEffectiveCharacters)>0&&count>Number(extra.maxEffectiveCharacters))return `有效字符 ${count}，超过最高要求 ${extra.maxEffectiveCharacters}`;
  if(stage==="episode_novel"){
    const perspectiveIssue=novelPerspectiveIssue(text,extra.narrativePerson==="third"?"third":"first");if(perspectiveIssue)return perspectiveIssue;
    if(/[（）()]/.test(text))return "小说出现了禁止使用的圆括号";
    if(/["“”]/.test(text))return "小说对白出现了双引号，必须统一使用「」";
    const silentEpisode=/(?:全程无声|不能出声|禁止说话|不得说话|无台词)/.test([extra.episode?.summary,extra.episode?.required_plot,extra.episode?.must_not_reveal].filter(Boolean).join("\n"));
    if(!silentEpisode&&!/「[^」\n]+」/.test(text))return "整章没有任何直接语言；单人场景也应使用有行动目的的外说、自言自语或必要的直接内心语言，不得凭空新增人物、电话、广播、系统激活或未知事实";
    const labelledSpeech=(text.match(/(?:说|问)\s*[：:]\s*「/g)||[]).length;
    // “人物+真实动作：「台词」”是 Skill 允许的小说格式，不能误判为人物名冒号。
    if(labelledSpeech>=5)return `小说反复使用了刻板的“说/问：台词”格式（共 ${labelledSpeech} 处）`;
    const descriptionIssues=novelDescriptionIssues(text);if(descriptionIssues.length)return `小说段落超过40个汉字：${descriptionIssues.slice(0,12).map(item=>`第${item.paragraph}段${item.count}字“${item.text.slice(0,55)}”`).join("；")}`;
    const knowledgeIssue=unauthorizedGoldenKnowledgeIssue(text,extra,stage);if(knowledgeIssue)return knowledgeIssue;
    const escapeRegex=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),premature=(extra.forbiddenAppearanceCharacters||[]).find(name=>new RegExp(`${escapeRegex(name)}(?:[^\n「」]{0,16}：「|[^\n，。！？；]{0,10}(?:走|跑|冲|站|坐|跪|推|拉|抓|抬|看|盯|笑|问|喊|说|开口|出现|进来|离开))`).test(text));
    if(premature)return `主要人物“${premature}”尚未到规划的首次出场集，却已在本集现场行动或说话`;
  }
  if(stage==="episode_novel_summary"){
    const required=["关键事件：","人物与状态：","精确锚点：","结尾局面："];
    const missing=required.filter(label=>!text.split(/\r?\n/).some(line=>line.trim().startsWith(label)));
    if(missing.length)return `小说连续性概要缺少固定字段：${missing.join("、")}`;
    if(count<100||count>600)return `小说连续性概要有效字符 ${count}，应保持在 100–600 字`;
    const anchorLine=text.split(/\r?\n/).find(line=>line.trim().startsWith("精确锚点："))||"",anchorSource=String(extra.continuityAnchorSource||"");
    const explicitTokens=anchorLine.match(/(?:上上周|上周|本周|下周|前天|昨天|今天|明天|后天|大后天|次日|翌日|前年|去年|今年|明年|后年|\d+(?:\.\d+)?%?|[一二两三四五六七八九十百千万]+(?:分钟|小时|天|日|周|个月|月|年)(?:前|后|内)?)/g)||[];
    const unsupported=[...new Set(explicitTokens.filter(token=>!anchorSource.includes(token)))];
    if(unsupported.length)return `小说连续性概要的精确锚点擅自增加了最终事件账本不支持的时间或数值：${unsupported.join("、")}`;
  }
  if(stage==="episode_arrangement"){
    const required=["情绪走向","情绪节点","剧情安排","逻辑推理"];
    const missing=required.filter(x=>!text.includes(`【${x}】`));if(missing.length)return `剧情安排缺少区块：${missing.join("、")}`;
    const scenes=[...text.matchAll(/^\s*\d+\s+(?:内|外|内景|外景)\s+.+/gm)];if(scenes.length<1||scenes.length>3)return `剧情安排场次数为${scenes.length}，必须严格为1–3场`;
    if(!/逻辑检查\s*[：:]\s*✓\s*无问题/.test(text))return "剧情安排缺少最终逻辑检查结论";
  }
  if(stage==="episode"){
    const issues=episodePerformanceIssues(text,extra);if(issues.length)return issues.join("；");
    const knowledgeIssue=unauthorizedGoldenKnowledgeIssue(text,extra,stage);if(knowledgeIssue)return knowledgeIssue;
    const speakers=new Set(text.split(/\r?\n/).map(line=>line.trim().match(/^([^：\n]{1,30}?)(?:\s+V\.O\.|\s+OS)?：/)?.[1]?.trim()).filter(Boolean));
    const missing=(extra.expectedIdentifiers||[]).filter(name=>!speakers.has(name));if(missing.length)return `未沿用上一集锁定的人物标识符：${missing.join("、")}`;
  }
  return "";
}
function repairInstruction(stage,error,extra={}){
  const reason=String(error||"格式错误");
  if(stage==="episode"&&/复合场次/.test(reason))return `上一版只需修正分场结构：${reason}。剧情安排中的编号是权威场次分组，不得改变剧情、对白、事件顺序或钩子。每个复合场次只保留一个编号总标题；按标题路线依次加入独立成行的“【内 地点 时间】”或“【外 地点 时间】”转场标记，标记不另编号，不与动作或对白混排。将原有内容移动到对应地点下，不得删减、扩写或新增场次。只输出修订后的完整剧本。`;
  if(["episode_novel","episode"].includes(stage)&&/整(?:章|集)没有任何/.test(reason))return `上一版的问题是：${reason}。保留全部既有事件、顺序、因果、人物、能力、道具和钩子，只在现有行动节点中补入少量有行动目的的直接语言。优先使用已经在场或已有依据的说话者；若只有主角，可让主角对眼前目标或危险外说、自言自语，或用一句必要的主角${stage==="episode"?"V.O.":"直接内心语言"}表达会改变下一步行动的判断。不得新增人物、联系人、广播事实、系统激活、人物知情或新事件，不得让无语言能力的对象突然说话，也不得用语言复述已写清的动作和背景。只输出修订后的完整${stage==="episode"?"剧本":"小说"}。`;
  if(stage==="episode_novel"&&/小说锁定为(?:第一|第三)人称/.test(reason)){
    return extra.narrativePerson==="third"
      ? `错误：${reason}。只修正叙述段的人称，把主角叙述统一为第三人称限知视角，使用主角固定姓名以及与其性别一致的“他”或“她”；删除叙述中的“我、我们、咱们”自称。不得修改「」内的任何对白，因为对白中的“我”是人物正常说话。不得进入其他人物内心，不改事件、顺序、因果、人物认知和钩子。只输出修订后的完整小说。`
      : `错误：${reason}。只修正叙述段的人称，把主角叙述统一为第一人称限知视角并以“我”自称；不得用主角姓名或“他、她”替代叙述者。不得修改「」内的任何对白。不得进入其他人物内心，不改事件、顺序、因果、人物认知和钩子。只输出修订后的完整小说。`;
  }
  if(["episode_novel","episode"].includes(stage)&&/不是对应金手指的持有者.*无获知依据/.test(reason))return `错误：${reason}。只修这一处越权知情，不改其他剧情、事件顺序和钩子。该人物既不是对应金手指的当前持有者，也没有获知依据：删除其对系统、弹幕、异能、血统、任务、积分、规则或能力来源的提及、判断和追问；只允许其根据现场亲眼可见的行为、现实证据与结果作出中性反应。不得改成暗示其仍然知情的同义句，也不得新增一场解释。只输出修订后的完整正文。`;
  if(stage==="episode"&&/残留第三人称小说的对白引号或嵌入式对白/.test(reason))return `错误：${reason}。只做第三人称小说对白的剧本格式拆解，不改剧情、事件顺序、人物、台词原意和钩子。逐句识别小说中真正说出口的内容：去掉「」、“”及英文双引号，把“人物动作接台词”“台词后接人物说话或动作”“多个说话人与动作挤在同段”等结构拆开；动作独立成行，每句对白统一写成“人物：台词”并独立成行。不得遗漏原有对白，不得把旁白或未说出口的心理改成对白。只输出修订后的完整剧本。`;
  if(stage==="episode"&&/(?:场次标题格式|排版未正确换行)/.test(reason)&&/(?:不可拍摄|心理判断|作者解释|作者交代|矛盾摘要|无效迟疑|内心独白错误|动作段转述|Skill禁止|环境|感官|套路描写|非主角使用V\.O|主角V\.O\.替其他人物)/.test(reason))return `错误：${reason}。本轮同时修正命中的语义违规和排版，不得只换行后原样保留违规文字。一，删除摄影机无法证明的心理判断和作者解释；“某人看了主角一眼，那眼神的意思是：你敢……/你要是……/否则……”属于未说出口的脑补意图，整段及冒号后的内容直接删除，既不能改成主角V.O.，也不能新增为对方对白，因为这会改变是否说出口的事件状态。二，“得像……”等比喻直接删除，不用另一种比喻替换；“心里一凛/心中一凛”本身删除，若该人物是主角且紧随其后有观众必须知道的主角自身认知或疑问，只把该信息改成一句主角V.O.，不得写“我心里一凛”；若不是主角，禁止转成V.O.，必要信息改为该人物现场对白或改变局面的可见动作，否则删除。三，任何非主角V.O./OS都改成现场对白、可见动作或删除，不得转交给主角；主角V.O.也不得替别人复述或脑补台词。四，把动作段中原本明确说出口的语言展开成现场对白；其他环境、感官、套路动作和无效迟疑按错误提示删除。五，EP标题、场次标题、每句人物台词各自单独一行，动作与台词拆行，同一行不得出现两个人物台词；前后两句台词之间的连续动作合并为一个动作段。不得改变事件顺序、人物、已有合格对白和钩子，不得新增情节。只输出修订后的完整剧本。`;
  if(stage==="episode"&&/(?:场次标题格式|排版未正确换行)/.test(reason))return `错误：${reason}。只修排版与场次标题，不改任何文字内容、事件、人物或钩子。默认模板场次标题统一改为“序号 外/内 地点 日/夜”；EP标题、每个场次标题、每句人物台词必须各自单独一行，动作与台词必须拆行；但夹在前后两句台词之间的连续动作必须合并成一个动作段、只占一行。同一行的多个人物台词必须拆行。只输出重新排版后的完整剧本。`;
  if(stage==="episode"&&/(?:不可拍摄|心理判断|作者解释|作者交代|矛盾摘要|无效迟疑|内心独白错误|动作段转述|Skill禁止|环境|感官|套路描写|非主角使用V\.O|主角V\.O\.替其他人物)/.test(reason))return `错误：${reason}。只修命中的违规句，不重写其他内容。具体修法：一，“在心里说、心中默念、内心说道”等不是动作；删除动作说明，只在人物确为主角且紧随其后有观众必须知道的主角自身认知、疑问或选择时，把该信息改成一句“主角名 V.O.：台词”。二，“某人看了主角一眼，那眼神的意思是：你敢……/你要是……/否则……”属于旁白脑补他人未说出口的意图，整段及其脑补内容直接删除；不得改成主角V.O.，也不得新增为对方现场对白。只有待修改全文中本来就明确说出口的内容，才保留为人物对白。三，“心里一凛/心中一凛”本身直接删除，不得写成“主角 V.O.：我心里一凛”；若后续必要认知属于主角，可只把认知改成一句主角V.O.；若人物不是主角，禁止使用V.O.，必要内容改为该人物现场对白或改变局面的可见动作，否则删除。四，任何非主角V.O./OS都改为其现场对白、可见动作或删除，不能转交给主角；主角V.O.也不能替他人复述或脑补台词。五，“得像……”及其他比喻直接删除，不用新比喻替换；“以为、知道、觉得、意识到、看起来像”等判断，删掉不影响事件就删除，必要时优先外化。六，期限、余额、医院需求和场外处境不能作为动作旁白交代；只有原本明确说出口的语言才能从动作转述改成现场对白；无效迟疑、环境和感官渲染直接删除。不得改动事件顺序、人物、已有合格对白和钩子，不得新增情节。只输出修订后的完整剧本。`;
  if(stage==="episode_novel"&&/双引号/.test(reason))return `上一版剧情、篇幅和事件链均保留，只修正小说对白标点：把所有英文双引号及中文弯双引号中的台词改为成对的「台词」，非对白处用于强调的双引号直接删除。不得改写台词内容、事件、人物和钩子。完成后确认正文只用「」表示对白。只输出修订后的完整小说。`;
  if(stage==="episode_novel"&&/人物名冒号|剧本式.*冒号/.test(reason))return `上一版剧情、篇幅和事件链均保留，只修正小说对白格式：去掉“人物名：”或“说/问：”标签，把台词自然嵌入当前锁定的人称叙述并统一使用「」。不得改变叙事人称，不得改写事件、删减对白、增加支线或改变钩子。只输出修订后的完整小说。`;
  if(stage==="episode_novel"&&/小说段落超过40个汉字/.test(reason))return `上一版经程序按完整句安全分段后，以下段落仍超过40个汉字：${reason}。只修正列出的超长单句或不可直接分割段，每段全部汉字合计必须不超过40个。按内容选择修法：一，长对白保持人物原本的说话目的，按质问、回应、加码、条件、威胁或决定等自然语义拆成两至三个各自完整的「对白」段，不添加动作凑分段；二，叙述中包含多项行动或事实时，按行动与结果、事实项目或时间先后分别写成完整短段；三，环境与外貌只保留会参与当前剧情的部分，删除连续装饰；四，连续回忆只保留真正迫使人物作出当前选择的压力；五，系统播报可按检测、结果、价值或风险拆成数条完整播报。戏剧内容完整度高于文字精简：不得删除事件、对手手段、现实损失、人物感受、关键反应、对白攻防、反扑、选择和钩子，也不得改变顺序、因果、人物认知或说话目的。不得把同一句话、同一个动作或同一信息机械切成残句。完成后逐段重新统计，只输出修订后的完整小说。`;
  if(/括号/.test(reason))return `上一版只因括号不合格：${reason}。只处理“（”“）”“(”“)”四种字符，保持事件、顺序、人物、对白、篇幅和钩子不变。若是“人物（动作）：「台词」”，改成“人物完成动作：「台词」”；其他括号内信息必要就直接融入所在句，不必要就删除。完成后逐字搜索这四种字符，确认数量全部为零。禁止重新构思、扩写或省略原有事件。只输出修订后的完整正文。`;
  if(/超过|超出|过长/.test(reason)){
    const targetMin=Number(extra.creativeMinCharacters)||Math.max(Number(extra.minEffectiveCharacters)||1000,(Number(extra.maxEffectiveCharacters)||2000)-300);
    const targetMax=Number(extra.creativeMaxCharacters)||Math.max(targetMin,(Number(extra.maxEffectiveCharacters)||2000)-100);
    return `上一版篇幅过长：${reason}。这是删冗余，不是重新创作。严格沿用上一版的事件顺序、人物、因果和钩子；删除重复解释、重复情绪、无效环境、同义动作，合并表达同一信息的对白，只保留每个关键事件成立所需的最短有效内容。按纯汉字统计，必须压缩到 ${targetMin}–${targetMax} 字。不得新增情节，不得用改写后的长句补回删掉的字数。只输出压缩后的完整正文。`;
  }
  if(/少于|不足|过短/.test(reason))return `上一版篇幅不足：${reason}。只扩充关键冲突回合、因果和必要细节，不增加新支线，严格落在 ${extra.minEffectiveCharacters||1500}–${extra.maxEffectiveCharacters||2000} 个纯汉字。只输出修订后的完整正文。`;
  return `上一版未通过校验：${reason}。只针对该问题修订上一版，保持已经正确的剧情、顺序、人物和钩子不变；不要从头另写。只输出修订后的完整正文。`;
}
function compactRevisionPrompt(stage,previousOutput,revision,extra={}){
  const episode=extra.episode||{};
  const kind=stage==="episode_novel"?"小说中间稿":"剧本";
  const perspectiveLock=stage==="episode_novel"?`\n【叙事人称｜修订时不得改变】${extra.narrativePerson==="third"?"第三人称限知；叙述使用主角姓名及他/她，对白中的我不改":"第一人称限知；主角叙述使用我，对白不改"}`:"";
  const descriptionLock=stage==="episode_novel"?`\n【40字硬限制｜不得削减剧情】每个自然段不得超过40个汉字。优先缩短句式或按自然戏剧节拍换段，不得删掉有效事件、冲突升级、人物感受、对白回合、现实后果、反扑和选择；环境、外貌、感官和心理可以简短服务剧情，但不连续铺陈或重复证明同一状态。`:"";
  const localConsistencyLock=stage==="episode_novel"?`\n【本章事实一致性】后文不得为了升级冲突，临时改写前文已建立的身份、能力、知情、物品归属、事件原因、损失对象、关系、数字或动机；只有本集大概内容或必须发生明确安排、且正文给出获知证据时才允许揭露新真相。`:"";
  return `你是${kind}定向修订器。不要重新创作，只修改明确指出的问题。
${perspectiveLock}${descriptionLock}${localConsistencyLock}

【必须发生】${episode.required_plot||"按上一版完整保留"}
【不得揭示】${episode.must_not_reveal||"无"}

【本轮唯一修改意见】
${revision}

【已生成的待修改全文】
${previousOutput}`;
}

function mock(stage, project, extra = {}) {
  if (stage === "idea") return {
    diagnosis: "当前创意需要明确持续冲突、关系发动机、阶段升级和结局承诺。",
    market_fit: `以${project.tags?.join("、") || "强情节"}为类型入口，通过明确的阶段目标保持连续追看。`,
    differentiation: "不照搬市场作品，将现实议题或独特职业机制转化为冲突结构。",
    core_hook: project.seed || "一个普通人被迫进入极端处境，并发现改变命运的特殊机制。",
    protagonist_goal: "先解决迫在眉睫的危机，再追查其背后的真相。",
    sustained_conflict: "外部威胁逐级升级，同时内部关系和信息差不断改变行动选择。",
    relationship_engine: "合作、怀疑、利益交换与情感选择交替推动剧情。",
    story_promise: `用 ${project.total_episodes} 集完成从生存困局到主动反击的升级。`,
    approved_idea: project.seed || "请补充初始灵感后重新生成。"
  };
  if(stage==="benchmark")return {benchmark_works:[],adaptation_direction:"在保留核心钩子的基础上强化短剧节奏与差异化",framework:"建立困境→获得行动机制→冲突升级→发现真相→主动反击→结局兑现",worldbuilding:{era_region:"待确定",spaces:[],rules:[],dangers:[],factions:[],hidden_truth:"待确定"},character_direction:"人物关系随阶段目标变化",ai_spectacles:[]};
  if(stage==="planning")return {title:"开局觉醒，我一路逆袭",framework:"主角陷入困境→获得特殊机制→解决危机并结成同盟→发现幕后真相→反击并兑现结局",worldbuilding:"时代地域：待确定\n核心场域：待确定\n运行规则：待确定",synopsis:"主角被动卷入危机，借助特殊机制建立同盟并不断解决升级的危险。\n\n随着探索深入，主角识破幕后真相，联合同伴完成反击并兑现结局。",core_expectations:"主角依靠核心机制，自身获得实力成长，逐步完成核心目标。"};
  if(stage==="planning_section")return {[extra.section]:extra.section==="title"?"开局觉醒，我一路逆袭":extra.section==="core_expectations"?"主角依靠核心机制，自身获得实力成长，逐步完成核心目标。":"已单独优化该策划字段。"};
  if(stage==="synopsis")return {opening_state:"主角处于失衡状态",inciting_incident:"突发事件迫使主角行动",core_mechanism:"以核心钩子持续改变局面",development:"危机、关系与秘密逐级升级",conspiracy_or_reversal:"初始事件背后存在更大真相",ending_direction:"兑现核心承诺",synopsis:"主角从被动卷入危机，到建立同盟、识破真相并完成最终选择。"};
  if(stage==="cards")return {total_episodes:project.total_episodes,card_1:{position:Math.max(3,Math.round(project.total_episodes*.2)),paywall:"卡后付费",event:"首次重大揭露"},card_2:{position:Math.round(project.total_episodes*.6),paywall:"卡后付费",event:"重大失败或关系破裂"},card_3:null};
  if(stage==="expectations")return {core_expectations:["高频状态变化","阶段性反转","强集尾钩子"],visual_references:[]};
  if(stage==="characters")return {visual_style:"当代中国真人微短剧写实质感，造型与场景遵循项目世界观，统一自然光影、克制电影色彩与真实皮肤纹理",characters:[{role:"主角",name:"待定",age:"待定",personality:"冷静但存在内在弱点",biography:"从被动求生到主动承担责任，推动主线并完成价值选择。",image_prompt:"成年男性，清瘦匀称，轮廓分明的窄脸，黑色短发；穿符合其职业和经济状况的简洁服装与完整鞋履，自然站立，神情警觉，携带一个身份相关的小型道具"}]};
  if(stage==="character_image_prompt")return {visual_style:"当代中国真人微短剧写实质感，造型与场景遵循项目世界观，统一自然光影、克制电影色彩与真实皮肤纹理",image_prompt:"成年人物，身形比例自然，五官和发型清晰具体；穿符合其职业、身份和经济状况的分层服装与完整鞋履，自然站立，表情克制，携带一个身份相关的小型道具"};
  if (stage === "skeleton") return {
    main_plot: "主角解决初始危机后发现更大的幕后冲突，逐步集结力量并在结局完成反击。",
    core_conflict: "主角目标与幕后势力控制局面的目标不可调和。",
    key_secrets: ["初始事件并非偶然", "关键人物掌握幕后真相"], ending: "兑现核心承诺并完成主要人物弧光。",
    cards: [{ name: "一卡", position: Math.max(3, Math.round(project.total_episodes * .2)), buildup: "建立危机与关系", event: "首次重大揭露", state_change: "主角由求生转为调查", promise: "幕后真相", next_phase: "主动探索" }, { name: "二卡", position: Math.round(project.total_episodes * .6), buildup: "同盟与秘密积累", event: "关系破裂或重大失败", state_change: "优势归零", promise: "绝地反击", next_phase: "终局准备" }],
    phases: ["建立规则与人物", "冲突升级与调查", "重大失败与重组", "终局反击"]
  };
  if (stage === "outline") return { episodes: Array.from({ length: project.total_episodes }, (_, i) => ({ episode_no: i + 1, title: `第${i + 1}集`, summary: `推进第 ${i + 1} 集的阶段目标，并产生新的状态变化。`, scene_treatment: "人物因明确需求进入核心场景，当前行动直接招致阻力，各方连续交锋并造成状态变化，最后由新危险打断本轮冲突。", hook: "一个迫近的新危险在结尾出现，并由下一集直接承接。", purpose: i === 0 ? "建立主角困境与核心钩子" : "推进主线并改变人物关系或信息状态", start_state: "承接上一集悬念", end_state: "形成新的行动压力", required_plot: "至少发生一次有效剧情推进", must_reveal: "", must_not_reveal: "未到计划节点的核心秘密", rhythm: "快速承接冲突，压缩解释，在中后段发生明确状态变化，结尾不完全释放", emotion: "不安逐渐升高→短暂缓解→新证据触发警觉→悬置", card_relation: "按故事阶段蓄力或兑现", first_appearance_characters:i===0?"待定":"无" })) };
  if(stage==="outline_chunk")return {episodes:Array.from({length:extra.end-extra.start+1},(_,i)=>{const no=extra.start+i;return {episode_no:no,title:`第${no}集`,summary:`推进第 ${no} 集的阶段目标并产生新的状态变化。`,scene_treatment:"人物因明确需求进入场景，行动招致阻力，冲突连续升级并以新危险收尾。",hook:"结尾出现下一集必须直接承接的新危险。",purpose:"推进主线",start_state:"承接上一集",end_state:"形成新压力",required_plot:"发生有效剧情推进",must_reveal:"",must_not_reveal:"未到节点的秘密",rhythm:"快速推进",emotion:"压力升高→悬置",card_relation:"按阶段蓄力或兑现"}})};
  if(stage==="outline_spine")return {episodes:Array.from({length:extra.end-extra.start+1},(_,i)=>{const no=extra.start+i;return {episode_no:no,phase:"主线阶段",inherited_state:no===1?"核心困境正在发生":`承接EP${no-1}结尾行动`,dramatic_task:"人物为现实目标面对具体阻力",state_change:"冲突造成新的局势变化",ending_action:`一个必须由EP${no+1}承接的具体行动出现`,future_boundary:"后续秘密不得提前揭示",first_appearance_characters:no===1?"待定":"无"}})};
  if(stage==="outline_dramatic")return {episodes:Array.from({length:extra.end-extra.start+1},(_,i)=>{const no=extra.start+i;return {episode_no:no,title:`第${no}集`,dramatic_design:"人物从已经发生的危机直接行动，对手基于利益采取具体施压，现实后果迫使人物作出选择，新的行动在结尾出现。",summary:"人物为解决现实危机采取行动，对手以具体行为加压并造成可见后果，人物被迫选择后迎来新的危险。",hook:"新的危险或行动在结尾发生。",purpose:"推进主线并改变局势",start_state:"承接上一集",end_state:"形成新的行动压力",rhythm:"危机切入→升级→选择→钩子",emotion:"受压→加剧→转机→悬置",card_relation:"按阶段蓄力或兑现",first_appearance_characters:no===1?"待定":"无"}})};
  if(stage==="outline_finalize")return {episodes:Array.from({length:extra.end-extra.start+1},(_,i)=>{const no=extra.start+i;return {episode_no:no,title:`第${no}集`,summary:"人物从已经发生的危机直接行动，对手以现实利益施压并造成可见后果，人物应对后被迫作出选择，新的危险随即出现。",hook:"新的危险或行动在结尾发生。",purpose:"推进主线并改变局势",start_state:"承接上一集结尾",end_state:"形成新的行动压力",required_plot:"人物直接应对开场危机→对手采取具体施压行为→现实后果迫使人物改变选择→人物获得转机并采取行动→新的危险在结尾出现",must_reveal:"",must_not_reveal:"无",rhythm:"危机切入→升级→选择→钩子",emotion:"受压→加剧→转机→悬置",card_relation:"按阶段蓄力或兑现",first_appearance_characters:no===1?"待定":"无"}})};
  if(stage==="scene_treatment_text")return "人物因明确需求进入核心场景，当前行动直接招致阻力；冲突双方在同一空间连续交锋，上一事件造成的后果立即触发下一事件，最终准确落到既定钩子。";
  if(stage==="episode_boundaries_text")return "【必须发生】完成本集梗概中的关键行动、冲突与状态变化；准确抵达既定钩子\n【不得揭示】无";
  if(stage==="episode_boundary_text")return "完成本集梗概中的关键行动、冲突与状态变化；准确抵达既定钩子";
  if(stage==="episode_plan_text")return "【场景1】核心场景｜人物面对迫近问题\n必要动作：用最少环境与道具建立处境。\n对白回合：提出要求，对方拒绝，压力升级并作出选择。\n【覆盖检查】必须发生均落入节拍，不提前揭示。\n【钩子落点】既定危险或信息出现后立刻停。";
  if(stage==="episode_novel_summary")return "关键事件：上一章的核心冲突已经发生并造成明确结果。\n人物与状态：人物关系、认知、能力与关键道具保持上一章结尾状态。\n精确锚点：无。\n结尾局面：主角正面对尚未结束的现场局面，并准备执行已经启动的即时行动。";
  if(stage==="episode_novel")return project.narrative_person==="third"?`主角被逼到核心场景的角落，眼前的问题已经没有退路。对手步步紧逼，他只能抓住最后的机会。\n\n「这件事还没结束。」主角迎着对手走过去，「你欠下的结果，现在该兑现了。」`:`我被逼到核心场景的角落，眼前的问题已经没有退路。对手步步紧逼，我只能抓住最后的机会。\n\n「这件事还没结束。」我迎着他走过去，「你欠下的结果，现在该兑现了。」`;
  if(stage==="episode_arrangement")return `【情绪走向】\n本集情绪曲线：压抑（危机逼近）→ 转机（获得行动机会）→ cliffhanger（决定行动）\n节奏比例：约7:3，前段压透，后段出现转机并决定行动\n\n【情绪节点】\n压透阶段：危机被推到无法回避\n转机：主角获得明确破局机会\ncliffhanger：主角决定立即行动\n\n【剧情安排】\n1 外 核心场景 日\n（承接既定事件+冲突升级+获得转机+主角决定行动，cliffhanger）\n\n【逻辑推理】\n1. 前一事件如何引发下一事件？→ 前一事件的结果直接迫使主角采取行动。\n2. 主角为什么决定行动？→ 现实危机使其没有退路。\n逻辑检查：✓ 无问题`;
  if (stage === "episode") return `EP${String(extra.episode?.episode_no || 1).padStart(2, "0")}\n\n1 外 核心场景 日\n\n承接上一集的危机，人物立即采取行动。\n\n主角：事情没有我们想的那么简单。\n\n远处传来异响，所有人同时停下动作。\n\n一个本不该出现在这里的人，缓缓走进众人的视线。`;
  if (stage === "state_update") return { items: [] };
  if(stage==="memory_characters")return {characters:[{name:"待定",aliases:[],initial_identity:"故事开始时的核心人物",personality:"面对现实压力会先判断局势，再作出明确行动",backstory:""}]};
  if(stage==="memory_events"){const quote="承接上一集的危机，人物立即采取行动。";return String(extra.episode?.script||"").includes(quote)?{events:[{order:1,event_type:"event",subject:"主角",action:"采取行动",object_text:"应对上一集遗留危机",qualifier_text:"",result_text:"开始处理眼前问题",location:"核心场景",time_text:"日",summary:"主角开始采取行动处理上一集遗留危机",participants:["主角"],source_quote:quote,follows_candidate_id:null,relation:"无"}]}:{events:[]};}
  if (stage === "quality") return { passed: true, issues: [], suggestions: ["当前为离线演示结果；配置真实模型后可执行语义质检。"] };
  return {};
}

export async function generate({ stage, project, prompt, extra = {}, schema = null, signal = null, onAttempt = null }) {
  if(["episode_novel","episode"].includes(stage)){
    const guide=templateWritingGuide(templateContext(project));
    const acceptance=stage==="episode_novel"?guide.novelAcceptance:guide.scriptAcceptance;
    const creative=stage==="episode_novel"?guide.novelTarget:guide.generationTarget;
    extra={...extra,minEffectiveCharacters:acceptance.min,maxEffectiveCharacters:acceptance.max,creativeMinCharacters:creative.minCharacters,creativeMaxCharacters:creative.maxCharacters};
  }
  const provider = activeProvider();
  if (provider.id === "mock" || !provider.apiKey) {
    return { provider: "mock", model: "local-demo", output: mock(stage, project, extra), usage: {} };
  }
  schema ||= schemas[stage];
  const timeoutMs=stage==="outline"?480000:stage==="outline_spine"?300000:["outline_dramatic","outline_finalize","outline_chunk"].includes(stage)?240000:stage==="episode"?180000:stage==="episode_novel"?180000:stage==="episode_plan_text"?90000:stage==="episode_boundary_text"?90000:["state_update","memory_characters","memory_events"].includes(stage)?90000:["scene_treatment_text","episode_boundaries_text","character_image_prompt","episode_novel_summary"].includes(stage)?60000:180000;
  const client = new OpenAI({ apiKey:provider.apiKey, ...(provider.baseUrl ? { baseURL:provider.baseUrl } : {}), timeout:timeoutMs, maxRetries:0 });
  if (provider.protocol === "responses") {
    let lastError,previousOutput="";
    const responseAttempts=stage==="episode"?5:stage==="episode_novel"?5:2;
    for(let attempt=0;attempt<responseAttempts;attempt++){
      await onAttempt?.({attempt:attempt+1,total:responseAttempts,retry:attempt>0,lastError:lastError?.message||""});
      const revision=attempt?repairInstruction(stage,lastError?.message,extra):"";
      const input=attempt&&previousOutput?(["episode_novel","episode"].includes(stage)?compactRevisionPrompt(stage,previousOutput,revision,extra):`${prompt}\n\n【上一版待修正文】\n${previousOutput}\n\n【本次定向修订】\n${revision}`):prompt;
      const request = { model:provider.model, input };
      if(schema)request.text={format:{type:"json_schema",name:`${stage}_result`,strict:false,schema}};
      try{
        const response=await client.responses.create(request,signal?{signal}:undefined),content=response.output_text||"";
        const plain=["episode_novel","episode_arrangement","episode_novel_summary"].includes(stage)?content.replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/^```(?:text|plaintext|markdown)?\s*/i,"").replace(/\s*```$/i,"").trim():content.trim();
        const output=schema?JSON.parse(content):stage==="episode"?cleanEpisodeText(content):stage==="episode_novel"?normalizeNovelText(plain):plain;previousOutput=typeof output==="string"?output:content;
        if(!schema){const error=validatePlainOutput(stage,output,extra);if(error)throw new Error(error);}
        return {provider:provider.id,model:provider.model,output,usage:response.usage||{}};
      }catch(error){lastError=error;if(signal?.aborted)throw error;}
    }
    throw new Error(`${provider.label} 连续${responseAttempts}次未生成合格内容：${lastError?.message||"未知错误"}`);
  }
  const jsonInstruction = schema ? `\n\n必须只输出一个有效 JSON 对象，不要输出 Markdown 代码块或解释。JSON Schema：\n${JSON.stringify(schema)}` : "";
  let response,output,lastError;
  const maxAttempts=stage==="episode"?5:stage==="episode_novel"?5:2;
  for(let attempt=0;attempt<maxAttempts;attempt++){
    await onAttempt?.({attempt:attempt+1,total:maxAttempts,retry:attempt>0,lastError:lastError?.message||""});
    const outputLimit=stage==="outline"?32000:stage==="outline_spine"?18000:["outline_dramatic","outline_finalize","outline_chunk"].includes(stage)?9000:stage==="planning"?2500:stage==="planning_section"?1200:stage==="episode_boundaries_text"?1200:stage==="episode_boundary_text"?(extra.boundaryField==="required_plot"?5000:1200):stage==="episode_plan_text"?2500:stage==="scene_treatment_text"?1200:stage==="state_update"?2000:stage==="character_image_prompt"?1600:stage==="episode_novel_summary"?1200:stage==="memory_links"?2500:stage==="memory_dimensions"?4500:stage==="memory_events"?6000:stage==="memory_characters"?4500:stage==="characters"?6000:stage==="episode_novel"?5000:stage==="episode"?6000:8000;
    const retryInstruction=attempt?(schema?(/timed out|timeout|超时/i.test(lastError?.message||"")?"上一次请求超时且没有取得可用输出。本次继续执行同一任务，保持范围不变，直接完整返回要求的 JSON。":"上一次输出无法解析。这一次请特别检查所有引号、逗号、数组和对象是否完整闭合。\n上一轮问题："+(lastError?.message||"未知")):repairInstruction(stage,lastError?.message,extra)):"";
    const messages=attempt&&typeof output==="string"&&output.trim()?(["episode_novel","episode"].includes(stage)?[{role:"user",content:compactRevisionPrompt(stage,output,retryInstruction,extra)}]:[{role:"user",content:prompt+jsonInstruction},{role:"assistant",content:output},{role:"user",content:retryInstruction}]):[{role:"user",content:prompt+jsonInstruction+(retryInstruction?`\n\n${retryInstruction}`:"")}];
    const request={model:provider.model,messages};
    if(["scene_treatment_text","episode_boundaries_text","episode_boundary_text"].includes(stage))request.temperature=0.4;
    if(stage==="character_image_prompt")request.temperature=0.35;
    if(["episode_plan_text","episode_arrangement"].includes(stage))request.temperature=0.5;
    if(provider.id==="minimax")request.max_completion_tokens=outputLimit;else request.max_tokens=outputLimit;
    try{response=await client.chat.completions.create(request,signal?{signal}:undefined);}
    catch(error){
      if(["outline_spine","outline_dramatic","outline_finalize","scene_treatment_text","episode_boundaries_text","episode_boundary_text","episode_plan_text","episode_novel","episode","memory_events","memory_dimensions","memory_links","memory_characters"].includes(stage)&&attempt<maxAttempts-1&&!signal?.aborted){lastError=error;continue;}
      throw error;
    }
    const choice=response.choices?.[0],content=choice?.message?.content||"";
    if(response.input_sensitive)throw new Error(`${provider.label} 拒绝了输入内容（敏感类型 ${response.input_sensitive_type||"未知"}），请检查本集内容或平台规则`);
    if(response.output_sensitive)throw new Error(`${provider.label} 拦截了生成结果（敏感类型 ${response.output_sensitive_type||"未知"}），未覆盖原有剧本`);
    const plainText=["episode_novel","episode_arrangement","episode_novel_summary"].includes(stage)?String(content||"").replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/^```(?:text|plaintext|markdown)?\s*/i,"").replace(/\s*```$/i,"").trim():content;
    output=stage==="episode"?cleanEpisodeText(content):stage==="episode_novel"?splitNovelLongParagraphs(normalizeNovelText(plainText)):["episode_arrangement","episode_novel_summary"].includes(stage)?plainText:stage==="episode_boundary_text"?cleanBoundaryText(content,extra.boundaryField):content;
    if(!schema){
      if(stage==="episode_boundary_text"&&extra.boundaryField==="required_plot"&&extra.requiresOpeningPayoff){
        const firstNode=String(output||"").split(/→|[；;\n]+/).map(x=>x.trim()).filter(Boolean)[0]||"";
        const hasPreparation=/(?:准备|正要|即将|试图|打算|来到|赶到|走进|亮出|拿出|掏出|发动|启动|开始|对峙|等待|盯着|看见|听见|众人震惊|对手震惊)/.test(firstNode);
        const hasVisiblePayoff=/(?:反击|打脸|揭露|揭穿|证明|赢|击败|制服|救出|夺回|保住|迫使|逼|认输|道歉|退让|退款|退钱|退货|赔偿|丢脸|尴尬|受损|失去|翻转|扭转|解除|赶走|震住|哑口无言|无话可说|改口|被抓|被打|被赶|被撤|被夺|被罚|当场.+(?:承认|退|败|输|倒|停|改口))/.test(firstNode);
        if(hasPreparation&&!hasVisiblePayoff){lastError=new Error(`首节点仍停在准备动作，没有写出上一集钩子的兑现结果：${firstNode||"空"}`);if(attempt<maxAttempts-1)continue;throw lastError;}
      }
      if(stage==="episode_boundary_text"&&extra.boundaryField==="required_plot"&&Number(extra.minBoundaryItems)>0&&String(output||"").split(/→|[；;\n]+/).filter(Boolean).length<Number(extra.minBoundaryItems)){
        const actual=String(output||"").split(/→|[；;\n]+/).filter(Boolean).length;
        lastError=new Error(`只提炼出 ${actual} 项，至少需要覆盖 ${extra.minBoundaryItems} 项关键事件`);
        if(attempt<maxAttempts-1)continue;
      }else if(stage==="episode_boundary_text"&&extra.boundaryField==="required_plot"&&String(output||"").length>420){
        lastError=new Error(`提炼结果 ${String(output).length} 字，仍在复述梗概；请压缩为 4–7 个关键事件簇`);
        if(attempt<maxAttempts-1)continue;
      }else if(stage==="episode"&&!String(output||"").trim()){
        lastError=new Error(`${provider.label} 返回了空剧本正文（finish_reason=${choice?.finish_reason||"未知"}，completion_tokens=${response.usage?.completion_tokens||0}）`);
        if(attempt<maxAttempts-1)continue;
      }else if(stage==="episode_novel"&&!String(output||"").trim()){
        lastError=new Error(`${provider.label} 返回了空小说中间稿`);if(attempt<maxAttempts-1)continue;
      }else if(stage==="episode_novel"&&/[（）()]/.test(String(output))){
        lastError=new Error("小说中间稿出现了禁止使用的圆括号");if(attempt<maxAttempts-1)continue;
      }else if(["episode","episode_novel"].includes(stage)&&Number(extra.minEffectiveCharacters)>0&&hanCount(output)<Number(extra.minEffectiveCharacters)){
        const actual=hanCount(output);
        lastError=new Error(`${stage==="episode_novel"?"小说":"剧本"}有效字符 ${actual}，少于最低要求 ${extra.minEffectiveCharacters}`);
        if(attempt<maxAttempts-1)continue;
      }else if(["episode","episode_novel","episode_arrangement"].includes(stage)&&validatePlainOutput(stage,output,extra)){
        lastError=new Error(`${stage==="episode"?"剧本":stage==="episode_novel"?"小说":"剧情安排"}不合格：${validatePlainOutput(stage,output,extra)}`);
        if(attempt<maxAttempts-1)continue;
      }else if(["episode","episode_novel"].includes(stage)&&Number(extra.maxEffectiveCharacters)>0&&hanCount(output)>Number(extra.maxEffectiveCharacters)){
        const actual=hanCount(output);
        lastError=new Error(`${stage==="episode_novel"?"小说":"剧本"}有效字符 ${actual}，超过模板上限 ${extra.maxEffectiveCharacters}`);
        if(attempt<maxAttempts-1)continue;
      }else lastError=null;
      break;
    }
    try{
      const cleaned=content.replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
      const start=cleaned.indexOf("{"),end=cleaned.lastIndexOf("}");
      if(start<0)throw new Error("没有找到 JSON 对象");
      const candidate=cleaned.slice(start,end>=start?end+1:undefined);
      try{output=JSON.parse(candidate);}catch{output=JSON.parse(jsonrepair(candidate));}
      lastError=null;break;
    }catch(error){lastError=error;}
  }
  if(lastError)throw new Error(schema?`${provider.label} 连续${maxAttempts}次未返回可解析的结构化结果：${lastError.message}`:`${provider.label} 连续${maxAttempts}次未生成合格内容：${lastError.message}`);
  return {provider:provider.id,model:provider.model,output,usage:{input_tokens:response.usage?.prompt_tokens||0,output_tokens:response.usage?.completion_tokens||0,total_tokens:response.usage?.total_tokens||0}};
}

export async function testConnection({ providerId, apiKey, baseUrl, model }) {
  const configured=activeProvider();
  const provider=providerId===configured.id?{...configured,apiKey:apiKey||configured.apiKey,baseUrl:baseUrl||configured.baseUrl,model:model||configured.model}:{id:providerId,label:providerId,protocol:providerId==="openai"?"responses":"chat_completions",apiKey,baseUrl,model};
  if(provider.id==="mock")return {ok:true,latencyMs:0,reply:"离线界面演示无需连接"};
  if(!provider.apiKey)throw new Error("请先填写或保存该供应商的 API Key");
  if(!provider.baseUrl)throw new Error("请填写 API Base URL");
  if(!provider.model)throw new Error("请填写模型名称");
  const client=new OpenAI({apiKey:provider.apiKey,baseURL:provider.baseUrl,timeout:20000,maxRetries:0});
  const started=Date.now();let reply="";
  if(provider.protocol==="responses"){const response=await client.responses.create({model:provider.model,input:"连接测试：只回复 OK",max_output_tokens:16});reply=response.output_text||"";}
  else{const response=await client.chat.completions.create({model:provider.model,messages:[{role:"user",content:"连接测试：只回复 OK"}],stream:false});reply=response.choices?.[0]?.message?.content||"";}
  return {ok:true,latencyMs:Date.now()-started,reply:String(reply).replace(/<think>[\s\S]*?<\/think>/gi,"").trim().slice(0,80)||"已收到空文本响应"};
}
