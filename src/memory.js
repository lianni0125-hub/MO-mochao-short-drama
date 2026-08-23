import crypto from "node:crypto";
import { all, get, run, now, transaction } from "./db.js";
import { generate } from "./llm.js";
import { cosineSimilarity, embedTexts, embeddingConfigured } from "./embeddings.js";
import { activeEmbeddingProvider } from "./config.js";

const text=value=>String(value||"").trim();
const cleanStoredTime=value=>/^(?:片段中|当前片段|本片段|本场|当前场景|剧本中|当前|此时|随后|之后|未知|日|夜|白天|夜晚|凌晨|清晨|上午|中午|下午|傍晚)$/.test(text(value))?"":text(value);
const cnNumber="一二两三四五六七八九十百千两〇零0-9",dayPart="凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜",season="春天|春季|夏天|夏季|秋天|秋季|冬天|冬季",festival="春节|元宵节|元宵|清明节|清明|端午节|端午|中秋节|中秋|国庆节|国庆|除夕|元旦";
const temporalPatterns=[
  {kind:"calendar",precision:"exact",regex:new RegExp(`(?:\\d{4}|[${cnNumber}]{4})年(?:[${cnNumber}]{1,3}月(?:[${cnNumber}]{1,3}(?:日|号))?)?(?:${dayPart})?(?:[${cnNumber}]{1,3}(?:点|时)(?:半|[${cnNumber}]{1,3}分)?)?`,"g")},
  {kind:"calendar",precision:"relative",regex:new RegExp(`(?:大前年|前年|去年|今年|明年|后年)(?:的)?(?:(?:${season})|年初|年中|年底|年末|[${cnNumber}]{1,3}月(?:[${cnNumber}]{1,3}(?:日|号))?)?`,"g")},
  {kind:"calendar",precision:"relative",regex:new RegExp(`(?:大前天|前天|昨天|今天|明天|后天|大后天|次日|翌日|当日|当天)(?:的)?(?:${dayPart})?(?:[${cnNumber}]{1,3}(?:点|时)(?:半|[${cnNumber}]{1,3}分)?)?`,"g")},
  {kind:"calendar",precision:"exact",regex:new RegExp(`[${cnNumber}]{1,3}月[${cnNumber}]{1,3}(?:日|号)(?:${dayPart})?(?:[${cnNumber}]{1,3}(?:点|时)(?:半|[${cnNumber}]{1,3}分)?)?`,"g")},
  {kind:"calendar",precision:"exact",regex:/(?:周|星期|礼拜)[一二三四五六日天](?:凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)?/g},
  {kind:"festival",precision:"relative",regex:new RegExp(`(?:去年|前年|今年|明年)?(?:${festival})(?:以前|之前|前|以后|之后|后|期间|当天|当晚)?`,"g")},
  {kind:"period",precision:"relative",regex:new RegExp(`(?:上上个|上个|这个|本|下个|下下个)(?:月|周|星期)(?:初|中|末|底)?`,"g")},
  {kind:"period",precision:"relative",regex:new RegExp(`(?:${season})(?:前|后|初|中|末)?`,"g")},
  {kind:"offset",precision:"relative",regex:new RegExp(`(?:第[${cnNumber}]+天|[${cnNumber}]+\\s*(?:分钟|小时|天|日|周|星期|个月|月|年)(?:以内|之内|内|以后|之后|后|以前|之前|前)|几(?:分钟|小时|天|日|周|星期|个月|月|年)(?:以内|之内|内|以后|之后|后|以前|之前|前)?|数(?:日|天|周|月|年)(?:以后|之后|后|以前|之前|前)?|半(?:小时|天|个月|年)(?:以后|之后|后|以前|之前|前)?)(?:的)?(?:${dayPart})?(?:[${cnNumber}]{1,3}(?:点|时)(?:半|[${cnNumber}]{1,3}分)?)?`,"g")},
  {kind:"parallel",precision:"relative",regex:/(?:与此同时|同一时间|同一时刻)/g},
  {kind:"sequence",precision:"vague",regex:new RegExp(`(?:那一年|那年|当年)(?:的)?(?:${season}|年初|年中|年底|年末)?|不久前|早些年|后来|没过多久|过了一阵|一段时间后|片刻后|片刻前|不一会儿|转眼间|多年以后|多年之后|许多年后`,"g")}
];
const explicitTimesFrom=value=>{const source=text(value),found=[];for(const group of temporalPatterns){group.regex.lastIndex=0;for(const match of source.matchAll(group.regex))found.push({text:match[0],index:match.index||0,end:(match.index||0)+match[0].length,kind:group.kind,precision:group.precision});}found.sort((a,b)=>a.index-b.index||(b.end-b.index)-(a.end-a.index));const selected=[];for(const item of found){if(selected.some(saved=>item.index<saved.end&&item.end>saved.index))continue;selected.push(item);}return selected.sort((a,b)=>a.index-b.index).map(item=>item.text);};
const temporalMetaFor=marker=>{const matched=temporalPatterns.find(group=>{group.regex.lastIndex=0;const found=group.regex.exec(marker);return found?.[0]===marker;});return {kind:matched?.kind||"relative",precision:matched?.precision||"relative"};};
export const detectTemporalExpressions=value=>explicitTimesFrom(value).map(marker_text=>({marker_text,relation:temporalRelationFor(marker_text),...temporalMetaFor(marker_text)}));
const explicitTimeFrom=value=>explicitTimesFrom(value)[0]||"";
const temporalRelationFor=marker=>/(?:与此同时|同一时间|同一时刻)/.test(marker)?"same_time":/(?:以内|之内|内)(?:的)?(?:凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)?$/.test(marker)?"within":/(?:大前年|前年|去年|大前天|前天|昨天|不久前|早些年|那一年|那年|当年|片刻前|上上个|上个|以前|之前|前(?:的)?(?:凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)?$|十年前|多年前|小时候|童年)/.test(marker)?"before":/(?:明年|后年|明天|后天|大后天|次日|翌日|后来|没过多久|过了一阵|一段时间后|片刻后|不一会儿|转眼间|多年以后|多年之后|许多年后|下个|下下个|以后|之后|后(?:的)?(?:凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)?$)/.test(marker)?"after":"at";
const temporalMarkersFor=row=>{
  const stored=cleanStoredTime(row?.time_text),evidence=[row?.source_quote,row?.result_text,row?.qualifier_text].map(text).filter(Boolean),markers=[];
  if(stored)markers.push(stored);
  for(const value of evidence)for(const marker of explicitTimesFrom(value))if(!markers.includes(marker))markers.push(marker);
  if(!markers.length)for(const marker of explicitTimesFrom(row?.summary))if(!markers.includes(marker))markers.push(marker);
  return markers.map((marker,index)=>({marker_text:marker,marker_order:index+1,relation:temporalRelationFor(marker),...temporalMetaFor(marker)}));
};
const eventDisplayTime=row=>temporalMarkersFor(row).map(item=>item.marker_text).join("；");
const transientCharacterPattern=/(?:现在|此刻|当下|本集|当前|正在|刚刚|随后|此时|蹲在|站在|坐在|躺在|走到|来到|离开|返回|赶往|前往|盯梢|跟踪|监视|埋伏|抽烟|打电话|执行任务|准备(?:去|要)?|等待(?:在|着)?)/;
function cleanCharacterProfile(value){
  return text(value).split(/[；。\n]+/).map(part=>part.trim()).filter(part=>part&&!transientCharacterPattern.test(part)).join("；");
}
function normalizeGoldenSnapshot(item){
  const stateParts=text(item.current_state).split(/[；\n]+/).map(part=>part.trim()).filter(Boolean),ruleParts=text(item.fixed_rules).split(/[；\n]+/).map(part=>part.trim()).filter(Boolean),performance=ruleParts.filter(part=>/(?:可靠度|准确率|正确率|成功率|精度|当前等级|当前积分|当前数值)/.test(part)),fixed=ruleParts.filter(part=>!performance.includes(part));
  for(const part of performance)if(!stateParts.some(existing=>compact(existing)===compact(part)))stateParts.push(part);
  return {...item,fixed_rules:fixed.join("；"),current_state:stateParts.join("；")};
}
function attachProvenGoldenAbilities(items,events){
  return items.map(rawItem=>{
    const item=normalizeGoldenSnapshot(rawItem),name=text(item.name),owner=text(item.owner),related=events.filter(event=>[event.subject,event.qualifier_text,event.summary,event.source_quote].some(value=>text(value).includes(name))||text(event.subject)===owner||/(?:系统|弹幕|血统|异能|技能|空间)/.test([event.subject,event.qualifier_text,event.summary,event.source_quote].map(text).join(""))),rules=text(item.fixed_rules).split(/[；\n]+/).map(part=>part.trim()).filter(Boolean);
    if(related.some(event=>/(?:脑海|脑中|意识中|眼前浮现)/.test(text(event.source_quote)))&&!rules.some(rule=>/(?:呈现方式|呈现载体|交互载体)/.test(rule)))rules.push(`呈现方式：信息直接在${owner}脑海中呈现，不依赖手机等实体设备`);
    return {...item,fixed_rules:rules.join("；")};
  });
}
const compact=value=>text(value).replace(/\s+/g,"").replace(/[，。；：！？、,.!?:;“”「」『』'\"]/g,"");
const futurePattern=/(?:未来|后期|最终|结局|后来会|将会|会在第|第\s*\d+\s*集|逐渐成为|注定|终将|最后会)/;
const hash=value=>crypto.createHash("sha256").update(value).digest("hex").slice(0,24);
const eventSchema={type:"object",properties:{events:{type:"array",items:{type:"object",properties:{order:{type:"integer"},event_type:{type:"string",enum:["event","revelation","relationship_change","system_change","capability_change","prop_change","location_change"]},subject:{type:"string"},action:{type:"string"},object_text:{type:"string"},qualifier_text:{type:"string"},result_text:{type:"string"},location:{type:"string"},time_text:{type:"string"},timeline_type:{type:"string",enum:["main","flashback","flashforward","parallel","unknown"]},timeline_label:{type:"string"},temporal_anchor:{type:"string"},temporal_relation:{type:"string",enum:["after","before","same_time","unknown"]},snapshot_effect:{type:"string",enum:["advance_current","historical_only","future_only","no_change"]},summary:{type:"string"},participants:{type:"array",items:{type:"string"}},source_quote:{type:"string"},follows_candidate_id:{type:["integer","null"]},relation:{type:"string",enum:["继续","回应","兑现","导致","反转","阻断","替代","提及","无"]}},required:["order","event_type","subject","action","object_text","qualifier_text","result_text","location","time_text","timeline_type","timeline_label","temporal_anchor","temporal_relation","snapshot_effect","summary","participants","source_quote","follows_candidate_id","relation"],additionalProperties:false}}},required:["events"],additionalProperties:false};
const baseEventSchema={type:"object",properties:{events:{type:"array",items:{type:"object",properties:{order:{type:"integer"},event_type:{type:"string",enum:["event","revelation","relationship_change","system_change","capability_change","prop_change","location_change"]},subject:{type:"string"},action:{type:"string"},object_text:{type:"string"},qualifier_text:{type:"string"},result_text:{type:"string"},location:{type:"string"},time_text:{type:"string"},summary:{type:"string"},participants:{type:"array",items:{type:"string"}},source_quote:{type:"string"},follows_candidate_id:{type:["integer","null"]},relation:{type:"string",enum:["继续","回应","兑现","导致","反转","阻断","替代","提及","无"]}},required:["order","event_type","subject","action","object_text","qualifier_text","result_text","location","time_text","summary","participants","source_quote","follows_candidate_id","relation"],additionalProperties:false}}},required:["events"],additionalProperties:false};
const linkSchema={type:"object",properties:{links:{type:"array",items:{type:"object",properties:{from_type:{type:"string",enum:["current","history"]},from_order:{type:["integer","null"]},from_candidate_id:{type:["integer","null"]},to_order:{type:"integer"},relation:{type:"string",enum:["回应","兑现","导致","反转","阻断","利用","揭示","升级","促使"]},chain_title:{type:"string"},evidence:{type:"string"}},required:["from_type","from_order","from_candidate_id","to_order","relation","chain_title","evidence"],additionalProperties:false}}},required:["links"],additionalProperties:false};
const localLinkSchema={type:"object",properties:{links:{type:"array",items:{type:"object",properties:{from_order:{type:"integer"},to_order:{type:"integer"},relation:{type:"string",enum:["回应","兑现","导致","反转","阻断","利用","揭示","升级","促使"]},chain_title:{type:"string"},evidence:{type:"string"}},required:["from_order","to_order","relation","chain_title","evidence"],additionalProperties:false}}},required:["links"],additionalProperties:false};
const semanticRelations=new Set(["回应","兑现","导致","反转","阻断","利用","揭示","升级","促使"]);
const dimensionSchema={type:"object",properties:{relationships:{type:"array",items:{type:"object",properties:{order:{type:"integer"},person_a:{type:"string"},person_b:{type:"string"},relationship_state:{type:"string"},summary:{type:"string"},source_quote:{type:"string"}},required:["order","person_a","person_b","relationship_state","summary","source_quote"],additionalProperties:false}},secondary_characters:{type:"array",items:{type:"object",properties:{name:{type:"string"},identity:{type:"string"},traits:{type:"string"},source_quote:{type:"string"}},required:["name","identity","traits","source_quote"],additionalProperties:false}},golden_fingers:{type:"array",items:{type:"object",properties:{order:{type:"integer"},name:{type:"string"},kind:{type:"string",enum:["系统","弹幕","技能","血统","异能","神器","空间","重生记忆","功法","天赋","契约","其他"]},owner:{type:"string"},fixed_rules:{type:"string"},current_state:{type:"string"},change_type:{type:"string",enum:["首次出现","激活","提示","任务变化","数值变化","技能解锁","技能升级","规则揭示","使用","消耗","限制变化","无状态变化"]},change_summary:{type:"string"},source_quote:{type:"string"}},required:["order","name","kind","owner","fixed_rules","current_state","change_type","change_summary","source_quote"],additionalProperties:false}},important_props:{type:"array",items:{type:"object",properties:{order:{type:"integer"},name:{type:"string"},kind:{type:"string",enum:["证据","信物","合同文书","钥匙凭证","通讯存储","武器工具","贵重物","其他"]},significance:{type:"string"},current_holder:{type:"string"},current_location:{type:"string"},origin_text:{type:"string"},current_state:{type:"string"},change_type:{type:"string",enum:["首次出现","获得","转交","使用","内容揭示","状态变化","遗失","损坏","销毁","无状态变化"]},change_summary:{type:"string"},source_quote:{type:"string"}},required:["order","name","kind","significance","current_holder","current_location","origin_text","current_state","change_type","change_summary","source_quote"],additionalProperties:false}}},required:["relationships","secondary_characters","golden_fingers","important_props"],additionalProperties:false};
const goldenAbilityItems={type:"array",items:{type:"object",properties:{order:{type:"integer"},golden_name:{type:"string"},ability_name:{type:"string"},owner:{type:"string"},description:{type:"string"},status:{type:"string",enum:["active","limited","sealed","lost","consumed","upgraded"]},conditions:{type:"string"},change_type:{type:"string",enum:["首次证明","限制变化","封印","失去","消耗","升级","恢复","使用","无状态变化"]},replaces_ability:{type:"string"},change_summary:{type:"string"},source_quote:{type:"string"}},required:["order","golden_name","ability_name","owner","description","status","conditions","change_type","replaces_ability","change_summary","source_quote"],additionalProperties:false}};
dimensionSchema.properties.golden_abilities=goldenAbilityItems;
dimensionSchema.required.push("golden_abilities");
const goldenOnlySchema={type:"object",properties:{golden_fingers:dimensionSchema.properties.golden_fingers},required:["golden_fingers"],additionalProperties:false};
const characterSchema={type:"object",properties:{characters:{type:"array",items:{type:"object",properties:{name:{type:"string"},aliases:{type:"array",items:{type:"string"}},initial_identity:{type:"string"},personality:{type:"string"},backstory:{type:"string"}},required:["name","aliases","initial_identity","personality","backstory"],additionalProperties:false}}},required:["characters"],additionalProperties:false};
const ignoredCharacterKeys=new Set(["name","image_prompt","visual_style","reference_image","reference_image_optional","visual_transformation","performance_rules"]);
function flattenCharacterMaterial(character){
  const values=[];
  const visit=(value,key="")=>{
    if(ignoredCharacterKeys.has(key))return;
    if(Array.isArray(value)){for(const item of value)visit(item);return;}
    if(value&&typeof value==="object"){for(const [childKey,child] of Object.entries(value))visit(child,childKey);return;}
    const clean=text(value);if(clean&&!values.includes(clean))values.push(clean);
  };
  for(const [key,value] of Object.entries(character||{}))visit(value,key);
  return values.join("。").replace(/。+/g,"。").replace(/。$/g,"");
}

export function memoryStats(projectId){
  const entities=get("SELECT COUNT(*) count FROM memory_entities WHERE project_id=@id AND active=1",{id:projectId})?.count||0;
  const events=get("SELECT COUNT(*) count FROM memory_events WHERE project_id=@id AND active=1",{id:projectId})?.count||0;
  const links=get("SELECT COUNT(*) count FROM memory_links WHERE project_id=@id",{id:projectId})?.count||0;
  const chains=get("SELECT COUNT(*) count FROM memory_chains WHERE project_id=@id AND active=1",{id:projectId})?.count||0;
  const embedded=get("SELECT COUNT(*) count FROM memory_events WHERE project_id=@id AND active=1 AND embedding_json<>''",{id:projectId})?.count||0;
  const relationships=get("SELECT COUNT(*) count FROM memory_relationships WHERE project_id=@id",{id:projectId})?.count||0,secondaryCharacters=get("SELECT COUNT(*) count FROM memory_secondary_characters WHERE project_id=@id AND active=1",{id:projectId})?.count||0,goldenFingers=get("SELECT COUNT(*) count FROM memory_golden_fingers WHERE project_id=@id AND active=1",{id:projectId})?.count||0,goldenAbilities=get("SELECT COUNT(*) count FROM memory_golden_abilities WHERE project_id=@id AND active=1",{id:projectId})?.count||0,importantProps=get("SELECT COUNT(*) count FROM memory_important_props WHERE project_id=@id AND active=1",{id:projectId})?.count||0;
  const synced=get("SELECT MAX(episode_no) episode FROM memory_events WHERE project_id=@id AND active=1 AND episode_no>0",{id:projectId})?.episode||0;
  const temporalEvents=get("SELECT COUNT(*) count FROM memory_temporal_relations WHERE project_id=@id",{id:projectId})?.count||0,flashbackEvents=get("SELECT COUNT(*) count FROM memory_events WHERE project_id=@id AND active=1 AND timeline_type='flashback'",{id:projectId})?.count||0;
  const updated=get("SELECT MAX(updated_at) updated_at FROM (SELECT updated_at FROM memory_entities WHERE project_id=@id UNION ALL SELECT updated_at FROM memory_events WHERE project_id=@id)",{id:projectId})?.updated_at||null;
  const extraction=get("SELECT episode_no,scene_count,paragraph_count,first_pass_count,audit_added_count,final_count,status,updated_at FROM memory_extractions WHERE project_id=@id ORDER BY episode_no DESC LIMIT 1",{id:projectId})||null;
  return {status:entities||events?"ready":"empty",entities:Number(entities),events:Number(events),links:Number(links),chains:Number(chains),embedded:Number(embedded),relationships:Number(relationships),secondaryCharacters:Number(secondaryCharacters),goldenFingers:Number(goldenFingers),goldenAbilities:Number(goldenAbilities),importantProps:Number(importantProps),temporalEvents:Number(temporalEvents),flashbackEvents:Number(flashbackEvents),embeddingConfigured:embeddingConfigured(),syncedEpisode:Number(synced),updatedAt:updated,lastExtraction:extraction};
}

export function memorySnapshot(projectId){
  const temporalRelations=all(`SELECT tr.*,a.summary anchor_summary,e.summary event_summary FROM memory_temporal_relations tr LEFT JOIN memory_events a ON a.id=tr.anchor_event_id JOIN memory_events e ON e.id=tr.event_id WHERE tr.project_id=@id ORDER BY tr.episode_no,tr.event_id,tr.marker_order`,{id:projectId});
  const events=all("SELECT * FROM memory_events WHERE project_id=@id AND active=1 ORDER BY episode_no DESC,event_order DESC LIMIT 160",{id:projectId}).map(row=>({...row,time_text:eventDisplayTime(row),temporal_markers:temporalRelations.filter(item=>item.event_id===row.id),participants:JSON.parse(row.participants_json||"[]"),embedding_json:undefined}));
  const abilities=all("SELECT * FROM memory_golden_abilities WHERE project_id=@id AND active=1 ORDER BY latest_episode DESC,canonical_name",{id:projectId}),goldenFingers=attachProvenGoldenAbilities(all("SELECT * FROM memory_golden_fingers WHERE project_id=@id AND active=1 ORDER BY latest_episode DESC,canonical_name",{id:projectId}),events).map(item=>({...item,abilities:abilities.filter(ability=>ability.golden_name===item.canonical_name)}));
  return {stats:memoryStats(projectId),entities:all("SELECT * FROM memory_entities WHERE project_id=@id AND active=1 ORDER BY kind,canonical_name",{id:projectId}).map(row=>({...row,aliases:JSON.parse(row.aliases_json||"[]")})),events,temporalRelations,links:all("SELECT * FROM memory_links WHERE project_id=@id ORDER BY id DESC LIMIT 240",{id:projectId}),chains:all(`SELECT c.*,COUNT(ce.event_id) event_count,MIN(e.episode_no) start_episode,MAX(e.episode_no) latest_episode FROM memory_chains c LEFT JOIN memory_chain_events ce ON ce.chain_id=c.id LEFT JOIN memory_events e ON e.id=ce.event_id WHERE c.project_id=@id AND c.active=1 GROUP BY c.id ORDER BY latest_episode DESC,c.id DESC`,{id:projectId}).map(chain=>({...chain,event_ids:all("SELECT event_id FROM memory_chain_events WHERE chain_id=@id",{id:chain.id}).map(row=>row.event_id)})),relationships:all("SELECT * FROM memory_relationships WHERE project_id=@id ORDER BY latest_episode DESC,person_a,person_b",{id:projectId}),secondaryCharacters:all("SELECT * FROM memory_secondary_characters WHERE project_id=@id AND active=1 ORDER BY latest_episode DESC,canonical_name",{id:projectId}).map(row=>({...row,identity:cleanCharacterProfile(row.identity),traits:cleanCharacterProfile(row.traits)})),goldenFingers,importantProps:all("SELECT * FROM memory_important_props WHERE project_id=@id AND active=1 ORDER BY latest_episode DESC,canonical_name",{id:projectId})};
}

export function rebuildTemporalRelations(projectId,episodeNo=null){
  const where=episodeNo==null?"project_id=@pid":"project_id=@pid AND episode_no=@episode",params=episodeNo==null?{pid:projectId}:{pid:projectId,episode:episodeNo};
  return transaction(()=>{
    run(`DELETE FROM memory_temporal_relations WHERE ${where}`,params);
    const events=all(`SELECT * FROM memory_events WHERE ${where} AND active=1 ORDER BY episode_no,event_order`,params);let previousMain=null,count=0;
    for(const event of events){const markers=temporalMarkersFor(event);for(const marker of markers){const mentioned=[event.source_quote,event.result_text,event.qualifier_text].some(value=>text(value).includes(marker.marker_text)),anchor=mentioned?event:previousMain,relation=event.timeline_type==="flashback"?"before":event.timeline_type==="flashforward"?"after":event.timeline_type==="parallel"?"same_time":marker.relation,anchorLabel=anchor?`EP${String(anchor.episode_no).padStart(2,"0")}事件${anchor.event_order}：${anchor.summary}`:`EP${String(event.episode_no).padStart(2,"0")}当前场景`,evidence=[event.source_quote,event.result_text,event.qualifier_text].map(text).find(value=>value.includes(marker.marker_text))||text(event.source_quote);run(`INSERT OR IGNORE INTO memory_temporal_relations(project_id,event_id,episode_no,marker_order,marker_text,relation,anchor_event_id,anchor_label,timeline_type,marker_kind,precision,source_quote,updated_at) VALUES(@pid,@event,@episode,@order,@marker,@relation,@anchor,@label,@timeline,@kind,@precision,@quote,@time)`,{pid:projectId,event:event.id,episode:event.episode_no,order:marker.marker_order,marker:marker.marker_text,relation,anchor:anchor?.id||null,label:anchorLabel,timeline:event.timeline_type||"main",kind:marker.kind,precision:marker.precision,quote:evidence,time:now()});count++;}if(["main","parallel"].includes(event.timeline_type))previousMain=event;}
    return {relations:count};
  });
}

export async function bootstrapCharacterMemory(project,artifact,signal){
  const content=JSON.parse(artifact.content_json||"{}");
  const characters=Array.isArray(content.characters)?content.characters:[];
  if(!characters.length)return {characters:0};
  const source=characters.map((character,index)=>`【人物${index+1}：${text(character.name)||`未命名人物${index+1}`}】\n${flattenCharacterMaterial(character)||"无其他文字材料"}`).join("\n\n");
  const prompt=`你是线性剧情记忆库的人物档案编辑。下面每个人物的原始材料已经把03人物卡中除图片与表演提示外的全部文字拼接在一起，原字段标签已被移除。不要猜测某句话原本属于哪个字段，必须根据语义和故事时间重新分类。

时间基准固定为“EP01第一场开始前一刻”。输出每个人物的：
1. initial_identity：基准时刻已经成立的年龄、职业、阶层、家庭或组织关系、社会身份。这里只回答“此人当时是谁”，不得写性格、行为倾向、过去经历、秘密真相或未来作用。
2. personality：稳定影响选择的性格、价值取向、处事方式和压力下的行为倾向。这里只回答“此人通常怎样选择和行动”，不得混入年龄、职业、身份、亲属关系、经历、剧情任务和结局。
3. backstory：只有原文能够明确确认在时间基准之前已经完成或长期发生的经历。这里只回答“过去确实发生过什么”。正在发生的开局困境放在身份中；任何未来计划、人物弧光、全剧作用、秘密揭露、感情走向、背叛、死亡、结局和后来获得的能力全部丢弃。

判定规则：凡一句话同时混有身份、性格、过去和未来，必须拆开，只保留能归入前三类的成分；无法从语法和语义确认已经发生的内容，backstory留空。不得把“推动主线、帮助主角、逐渐成长、最终成为、后期发现”等策划语言改写成过去。不得补充原文没有的年龄、病症、数字、地点、关系或别名。每个角色沿用标题中的姓名；aliases只收录材料明确出现的其他称呼。每栏1–3句，宁缺毋滥。

【无标签人物原始材料】
${source}`;
  const first=await generate({stage:"memory_characters",project,prompt,schema:characterSchema,signal});
  const auditPrompt=`你是剧情记忆库的时间边界审校员。请对第一遍人物档案逐人重新审校并返回完整修正版。

这是分类纠错，不是润色：
- initial_identity中出现性格、行为倾向或过去事件，移动到正确栏；出现未来内容直接删除。
- personality中出现年龄、职业、身份、关系、过往事件、剧情功能或结局，移动到正确栏或删除；只保留稳定的选择与行为逻辑。
- backstory必须是EP01开始前明确已经发生或长期持续的经历。出现“将、会、后来、后期、逐渐、最终、结局、帮助主角、推动主线、揭露、成为”等未来走向或策划功能，整段相应内容删除，不得改写成过去。
- 对照原始材料逐字核验姓名、年龄、身份、关系、病症、数字和地点；原文没有就删除。
- 不确定时间归属时宁可留空。不得输出说明。

【无标签原始材料】
${source}

【第一遍待审校档案】
${JSON.stringify(first.output,null,2)}`;
  const audited=await generate({stage:"memory_characters",project,prompt:auditPrompt,schema:characterSchema,signal});
  const extracted=(audited.output?.characters||[]).filter(item=>text(item.name));
  transaction(()=>{
    const names=new Set();
    for(const item of extracted){
      const name=text(item.name),identity=futurePattern.test(text(item.initial_identity))?"":text(item.initial_identity),personality=futurePattern.test(text(item.personality))?"":text(item.personality),backstory=futurePattern.test(text(item.backstory))?"":text(item.backstory);names.add(name);
      run(`INSERT INTO memory_entities(project_id,kind,canonical_name,aliases_json,initial_identity,personality,backstory,source_type,source_ref,active,updated_at)
        VALUES(@pid,'character',@name,@aliases,@identity,@personality,@backstory,'characters',@ref,1,@time)
        ON CONFLICT(project_id,kind,canonical_name) DO UPDATE SET aliases_json=excluded.aliases_json,initial_identity=excluded.initial_identity,personality=excluded.personality,backstory=excluded.backstory,source_ref=excluded.source_ref,active=1,updated_at=excluded.updated_at`,{pid:project.id,name,aliases:JSON.stringify(item.aliases||[]),identity,personality,backstory,ref:String(artifact.version||1),time:now()});
    }
    for(const row of all("SELECT id,canonical_name FROM memory_entities WHERE project_id=@pid AND kind='character' AND source_type='characters'",{pid:project.id}))if(!names.has(row.canonical_name))run("UPDATE memory_entities SET active=0,updated_at=@time WHERE id=@id",{time:now(),id:row.id});
  });
  return {characters:extracted.length,provider:audited.provider,model:audited.model,passes:2};
}

function candidateEvents(projectId,episodeNo){return all("SELECT id,episode_no,event_order,summary,subject,action,object_text,qualifier_text,result_text,location,time_text,timeline_type,timeline_label,temporal_anchor,temporal_relation,snapshot_effect FROM memory_events WHERE project_id=@pid AND active=1 AND episode_no<@episode ORDER BY episode_no DESC,event_order DESC LIMIT 80",{pid:projectId,episode:episodeNo});}

function parseVector(value){try{const parsed=JSON.parse(value||"");return Array.isArray(parsed)?parsed:[];}catch{return [];}}
function pairKey(a,b){return [text(a),text(b)].sort((x,y)=>x.localeCompare(y,"zh-CN")).join("||");}
function upsertVector(projectId,memoryType,sourceId,episodeNo,content,vector,model){if(!vector?.length||!text(content))return;run(`INSERT INTO memory_vectors(project_id,memory_type,source_id,episode_no,text_content,embedding_json,embedding_model,updated_at) VALUES(@pid,@type,@source,@episode,@content,@vector,@model,@time) ON CONFLICT(project_id,memory_type,source_id,embedding_model) DO UPDATE SET episode_no=excluded.episode_no,text_content=excluded.text_content,embedding_json=excluded.embedding_json,updated_at=excluded.updated_at`,{pid:projectId,type:memoryType,source:sourceId,episode:episodeNo,content:text(content),vector:JSON.stringify(vector),model,time:now()});}
async function ensureEventEmbeddings(projectId,episodeNo,signal){
  if(!embeddingConfigured())return 0;const provider=activeEmbeddingProvider();
  const missing=all("SELECT e.id,e.episode_no,e.summary FROM memory_events e WHERE e.project_id=@pid AND e.active=1 AND e.episode_no<@episode AND (e.embedding_json='' OR e.embedding_json IS NULL OR e.embedding_model<>@model OR NOT EXISTS (SELECT 1 FROM memory_vectors v WHERE v.project_id=e.project_id AND v.memory_type='plot_event' AND v.source_id=e.id AND v.embedding_model=@model)) ORDER BY e.episode_no,e.event_order",{pid:projectId,episode:episodeNo,model:provider.model});let updated=0;
  for(let offset=0;offset<missing.length;offset+=64){const batch=missing.slice(offset,offset+64),vectors=await embedTexts(batch.map(item=>item.summary),{signal});for(let index=0;index<batch.length;index++){run("UPDATE memory_events SET embedding_json=@vector,embedding_model=@model,embedded_at=@time WHERE id=@id",{vector:JSON.stringify(vectors[index]),model:provider.model,time:now(),id:batch[index].id});upsertVector(projectId,"plot_event",batch[index].id,batch[index].episode_no,batch[index].summary,vectors[index],provider.model);updated++;}}
  return updated;
}
function semanticCandidates(projectId,episodeNo,vectors,limit=48){
  const history=all("SELECT id,episode_no,event_order,summary,subject,action,object_text,qualifier_text,result_text,location,time_text,timeline_type,timeline_label,temporal_anchor,temporal_relation,snapshot_effect,embedding_json FROM memory_events WHERE project_id=@pid AND active=1 AND episode_no<@episode ORDER BY episode_no,event_order",{pid:projectId,episode:episodeNo});
  const recent=history.filter(item=>item.episode_no===episodeNo-1).slice(-24),scored=[];
  for(const item of history){const vector=parseVector(item.embedding_json);if(!vector.length)continue;let score=-1;for(const query of vectors)score=Math.max(score,cosineSimilarity(query,vector));if(score>=0.3)scored.push({...item,similarity:score});}
  return [...new Map([...recent,...scored.sort((a,b)=>b.similarity-a.similarity).slice(0,limit)].map(item=>[item.id,item])).values()];
}

function rebuildMemoryChains(projectId){
  const links=all("SELECT from_event_id,to_event_id,thread_hint FROM memory_links WHERE project_id=@pid",{pid:projectId}),eventRows=all("SELECT id,summary,episode_no,event_order FROM memory_events WHERE project_id=@pid",{pid:projectId}),adj=new Map();
  for(const link of links){if(!adj.has(link.from_event_id))adj.set(link.from_event_id,new Set());if(!adj.has(link.to_event_id))adj.set(link.to_event_id,new Set());adj.get(link.from_event_id).add(link.to_event_id);adj.get(link.to_event_id).add(link.from_event_id);}
  const oldMembership=all("SELECT ce.chain_id,ce.event_id,c.title FROM memory_chain_events ce JOIN memory_chains c ON c.id=ce.chain_id WHERE c.project_id=@pid",{pid:projectId}),usedOld=new Set(),components=[];
  for(const start of adj.keys()){if(components.some(component=>component.has(start)))continue;const component=new Set(),stack=[start];while(stack.length){const id=stack.pop();if(component.has(id))continue;component.add(id);for(const next of adj.get(id)||[])stack.push(next);}if(component.size>=2)components.push(component);}
  run("DELETE FROM memory_chain_events WHERE chain_id IN (SELECT id FROM memory_chains WHERE project_id=@pid)",{pid:projectId});run("UPDATE memory_chains SET active=0,updated_at=@time WHERE project_id=@pid",{pid:projectId,time:now()});
  for(const component of components){const overlap=new Map();for(const row of oldMembership)if(component.has(row.event_id))overlap.set(row.chain_id,(overlap.get(row.chain_id)||0)+1);const reusable=[...overlap.entries()].sort((a,b)=>b[1]-a[1]).find(([id])=>!usedOld.has(id));let chainId,title;
    if(reusable){chainId=reusable[0];usedOld.add(chainId);title=oldMembership.find(row=>row.chain_id===chainId)?.title||"";}
    const hints=links.filter(link=>component.has(link.from_event_id)&&component.has(link.to_event_id)).map(link=>text(link.thread_hint)).filter(Boolean);if(!title&&hints.length)title=[...new Set(hints)].sort((a,b)=>hints.filter(x=>x===b).length-hints.filter(x=>x===a).length)[0];
    if(!title){const first=eventRows.filter(item=>component.has(item.id)).sort((a,b)=>a.episode_no-b.episode_no||a.event_order-b.event_order)[0];title=text(first?.summary).slice(0,28)||"未命名剧情链";}
    if(chainId)run("UPDATE memory_chains SET title=@title,active=1,updated_at=@time WHERE id=@id",{title,time:now(),id:chainId});else chainId=Number(run("INSERT INTO memory_chains(project_id,title,active,updated_at) VALUES(@pid,@title,1,@time)",{pid:projectId,title,time:now()}).lastInsertRowid);
    for(const eventId of component)run("INSERT OR IGNORE INTO memory_chain_events(chain_id,event_id) VALUES(@chain,@event)",{chain:chainId,event:eventId});
  }
}

function splitScriptScenes(script){
  const lines=text(script).split(/\r?\n/),scenes=[];let current=null;
  for(let index=0;index<lines.length;index++){
    const line=lines[index].trim();if(!line)continue;
    if(/^EP\s*0*\d+\b/i.test(line))continue;
    const heading=/^\d+\s+(?:内景?|外景?)\s+.+/.test(line);
    if(heading){if(current)scenes.push(current);current={sceneNo:scenes.length+1,startLine:index+1,endLine:index+1,lines:[line]};}
    else{if(!current)current={sceneNo:1,startLine:index+1,endLine:index+1,lines:[]};current.lines.push(line);current.endLine=index+1;}
  }
  if(current)scenes.push(current);
  return scenes.map(scene=>({...scene,text:scene.lines.join("\n")}));
}

function splitExtractionUnits(scenes,maxLines=30,overlap=4){
  const units=[];
  for(const scene of scenes){
    const lines=scene.text.split(/\r?\n/).filter(line=>line.trim());
    if(lines.length<=maxLines){units.push({...scene,chunkNo:1,chunkCount:1});continue;}
    const step=Math.max(1,maxLines-overlap),chunkCount=Math.ceil((lines.length-overlap)/step);
    for(let start=0,chunkNo=1;start<lines.length;start+=step,chunkNo++){
      const slice=lines.slice(start,start+maxLines);if(!slice.length)break;
      units.push({...scene,chunkNo,chunkCount,startLine:scene.startLine+start,endLine:scene.startLine+start+slice.length-1,text:slice.join("\n")});
      if(start+maxLines>=lines.length)break;
    }
  }
  return units;
}

function uncoveredTailAndSystemLines(script,events){
  const lines=text(script).split(/\r?\n/).map((line,index)=>({line:line.trim(),lineNo:index+1})).filter(item=>item.line&&!/^EP\s*0*\d+\b/i.test(item.line)),covered=events.map(item=>text(item.source_quote)),positions=events.map(item=>({...sourcePosition(script,item.source_quote),systemLike:item.event_type==="system_change"||/(?:系统|弹幕|技能|血统|异能|鉴定)/.test([item.subject,item.action,item.object_text,item.summary].join(""))}));
  const isCovered=line=>covered.some(quote=>quote&&(quote.includes(line)||line.includes(quote)));
  const isSystemCovered=item=>isCovered(item.line)||positions.some(position=>position.systemLike&&position.start===item.lineNo+1);
  const system=lines.filter(item=>/^(?:系统音|系统|弹幕)(?:V\.O\.)?[：:]/.test(item.line)&&!isSystemCovered(item));
  const tail=lines.slice(-1).filter(item=>!isCovered(item.line));
  return [...new Map([...system,...tail].map(item=>[item.lineNo,item])).values()];
}

function sourcePosition(script,quote){
  const lines=text(script).split(/\r?\n/),needle=text(quote),index=text(script).indexOf(needle);
  if(index<0)return {index:Number.MAX_SAFE_INTEGER,start:null,end:null};
  const before=text(script).slice(0,index),start=before.split(/\r?\n/).length,end=start+needle.split(/\r?\n/).length-1;
  return {index,start,end};
}

function inferTemporalMetadata(event,scenes,previousMain){
  const scene=scenes.find(item=>event._lineStart>=item.startLine&&event._lineStart<=item.endLine),heading=text(scene?.lines?.[0]),quote=text(event.source_quote),structuralContext=[heading,/^(?:画面|镜头|场景)?(?:切回|回到|闪回|回忆|倒叙|闪前|未来画面)/.test(quote)?quote:""].join(" ");
  let timeline_type="main",timeline_label="主时间线",temporal_anchor="",temporal_relation="unknown";
  if(/(?:回忆|闪回|倒叙|十年前|多年前|小时候|童年|往事)/.test(structuralContext)){timeline_type="flashback";timeline_label=cleanStoredTime(event.time_text)||"过去回忆";temporal_anchor=previousMain?.summary||"当前主时间线";temporal_relation="before";}
  else if(/(?:未来画面|闪前|预见未来|未来预示)/.test(structuralContext)){timeline_type="flashforward";timeline_label=cleanStoredTime(event.time_text)||"未来预示";temporal_anchor=previousMain?.summary||"当前主时间线";temporal_relation="after";}
  else if(/(?:与此同时|同一时间|另一边|另一处)/.test(heading)){timeline_type="parallel";timeline_label="与此同时";temporal_anchor=previousMain?.summary||"当前主时间线";temporal_relation="same_time";}
  else {const marker=temporalMarkersFor(event)[0];if(marker){temporal_anchor=previousMain?.summary||"当前场景";temporal_relation=marker.relation;}}
  const snapshot_effect=timeline_type==="flashback"?"historical_only":timeline_type==="flashforward"?"future_only":["relationship_change","system_change","capability_change","prop_change","location_change","event"].includes(event.event_type)?"advance_current":"no_change";
  return {timeline_type,timeline_label,temporal_anchor,temporal_relation,snapshot_effect};
}

function normalizeEventTimeText(event,scene){
  const candidate=cleanStoredTime(event.time_text),heading=text(scene?.lines?.[0]),quote=text(event.source_quote),sceneTime=heading.match(/(?:^|\s)(日|夜|白天|夜晚|凌晨|清晨|上午|中午|下午|傍晚)$/)?.[1]||"";
  if(candidate&&(quote.includes(candidate)||heading.includes(candidate)))return candidate;
  const explicit=explicitTimeFrom(quote);if(explicit)return explicit;
  return sceneTime;
}

const memoryEventRules=`只提取会影响后续世界状态、人物选择、事件因果或精确连续性的变化：实际行动及结果，重要进出地点，道具出现/获得/使用/转交/损毁，明确说出的新信息及获知者，关系/身份/能力变化，系统积分技能数值变化，邀请/约定/命令/威胁/承诺，旧事件的兑现回应阻断反转，以及集尾钩子。普通问候、重复争吵、无结果问句、气氛、表情、无意义走动和不改变任何条件的台词不提取。一个事件只表达一个主要变化；同一句系统播报若同时改变积分和技能，必须拆为两个事件，共用原文证据。时间、地点、金额、数量作为事件属性保存，不拆成啰嗦的独立事件。原文出现的“内、后、前、次日、翌日、与此同时”等时间关系词必须逐字保留，不得把“三天后”概括成“三天内”，也不得自行换算绝对日期。object_text必须写明动作针对的具体人物、事物或事项；qualifier_text只保存能在同类对象中唯一识别它的最小限定；result_text只写直接可见或明确说出的结果。summary必须是脱离上下文仍能独立理解的“主体+行动+具体对象+结果”，不得使用他、她、对方、该物、东西、事情、那里、这个骗局、真相等无独立指向表达，不得写评价、缘由猜测、气氛、“本集”或剧情概括。source_quote必须逐字截取输入剧本中能证明该事件的最短完整原文。`;
const temporalEventRules=`时间必须另行分类：timeline_type=main表示当前主时间线，flashback表示已发生的回忆/倒叙，flashforward表示未来预示，parallel表示与主线同时发生的另一地点，无法确认才用unknown；timeline_label用“主时间线/十年前/与此同时”等最短标签；time_text保留“次日、三天后、十年前”等原文时间；temporal_anchor写它相对于哪个明确事件或时间点，不能确定则留空；temporal_relation只写after/before/same_time/unknown。只有在当前主线或明确同步支线上实际发生并能够改变当前世界状态的事件使用snapshot_effect=advance_current；倒叙用historical_only，未来预示用future_only，仅补充说明而不改变状态用no_change。不得把倒叙中的旧持有人、旧关系或旧数值当成当前状态。`;
function selfContainedIssues(items){const issues=[];for(const [index,item] of items.entries()){const no=index+1,summary=text(item.summary),subject=text(item.subject),object=text(item.object_text),han=(summary.match(/\p{Script=Han}/gu)||[]).length;if(!subject||/^(?:他|她|对方|男人|女人|众人|有人|神秘人)$/.test(subject))issues.push(`${no}：主体没有独立指向`);if(!text(item.action))issues.push(`${no}：缺少明确动作`);if(!object||/^(?:骗局|事情|这件事|东西|邀请|照片|合同|证据|能力|真相|那里|任务)$/.test(object))issues.push(`${no}：对象缺少最小唯一限定`);if(han<8||han>60)issues.push(`${no}：summary应保持简洁自足，当前${han}个汉字`);if(/(?:^|[，。；])(?:他|她|对方)(?:在|向|把|将|已|又|随即|随后)?|(?:该物|此事|这件事|东西|那里|这个骗局|该骗局|真相被揭开)/.test(summary))issues.push(`${no}：summary含依赖上下文的指代`);}return issues;}

export async function extractEpisodeMemory(project,episode,signal){
  if(!embeddingConfigured())throw new Error("剧情事件提炼需要 Embedding API；请先在模型设置中配置并测试连接");
  let candidates=candidateEvents(project.id,episode.episode_no);
  const scenes=splitScriptScenes(episode.script),units=splitExtractionUnits(scenes),firstPass=[];let extractionMeta={provider:"mock",model:""};
  const extractUnit=async unit=>{
    const prompt=`你是线性剧情记忆库的分段事件编辑。唯一事实来源是下面这一段最终剧本。逐行扫描，不得因为事件较小而遗漏高连续性价值变化，也不得把对白复述成多个同义事件。片段之间可能有少量重叠，当前只需完整提炼本片段，后续会统一去重。

${memoryEventRules}

只记录观众确实看到或听到的事实，不使用小说、梗概、人设或未来规划补全。邀约→赴约、威胁→反击等明确关系可连接历史候选；没有充分证据时follows_candidate_id返回null、relation返回无。不判断解决或未解决。

【可连接的历史事件候选】
${JSON.stringify(candidates,null,2)}

【EP${String(episode.episode_no).padStart(2,"0")} 第${unit.sceneNo}场·片段${unit.chunkNo}/${unit.chunkCount}｜约原剧本第${unit.startLine}–${unit.endLine}行】
${unit.text}`;
    const result=await generate({stage:"memory_events",project,prompt,schema:baseEventSchema,extra:{episode},signal});
    return {result,unit};
  };
  for(let batchStart=0;batchStart<units.length;batchStart+=2){
    const batch=units.slice(batchStart,batchStart+2);
    run("UPDATE jobs SET message=@message WHERE project_id=@pid AND type IN ('episode_state_extract','episode_script','episode','full_book') AND status='running'",{pid:project.id,message:`正在并行扫描 EP${String(episode.episode_no).padStart(2,"0")} 剧情片段 ${batchStart+1}–${batchStart+batch.length}/${units.length}`});
    const results=await Promise.all(batch.map(extractUnit));
    for(const {result,unit} of results){extractionMeta={provider:result.provider,model:result.model};for(const item of result.output?.events||[])firstPass.push({...item,scene_no:unit.sceneNo});}
  }
  const audit=extractionMeta,audited=[];
  let merged=firstPass.filter(item=>text(item.summary)&&text(item.source_quote)&&text(episode.script).includes(text(item.source_quote)));
  const lineRows=text(episode.script).split(/\r?\n/);let stillUncovered=uncoveredTailAndSystemLines(episode.script,merged);
  for(let repairRound=1;repairRound<=2&&stillUncovered.length;repairRound++){
    run("UPDATE jobs SET message=@message WHERE project_id=@pid AND type IN ('episode_state_extract','episode_script','episode','full_book') AND status='running'",{pid:project.id,message:`正在补提 EP${String(episode.episode_no).padStart(2,"0")} 的集尾与系统信号（第${repairRound}/2次）`});
    const wanted=new Set(stillUncovered.flatMap(item=>{const indexes=[];for(let i=Math.max(1,item.lineNo-2);i<=Math.min(lineRows.length,item.lineNo+2);i++)indexes.push(i);return indexes;})),repairText=[...wanted].sort((a,b)=>a-b).map(no=>`${no}：${lineRows[no-1]}`).join("\n");
    const previousFailure=repairRound===2?`\n\n【上一轮仍未覆盖】\n${stillUncovered.map(item=>`第${item.lineNo}行：${item.line}`).join("\n")}\n上一轮没有正确覆盖这些具体内容。本轮必须直接为每个仍缺失的独立系统变化或集尾钩子返回事件；不得只改写已有事件。`:"";
    const coveragePrompt=`你是剧情记忆库的定点补漏员。下面列出的剧本行尚未被已有事件覆盖。只提炼其中具有连续性价值的实际事件，尤其是集尾钩子、系统绑定/激活/任务/提示/数值/技能、人物决定、危险逼近和能力实际使用。不得重复已有事件；source_quote必须逐字取自剧本正文，不包含前置行号。若相邻多行共同构成一个事件，可以用最短连续原文作为证据。\n\n${memoryEventRules}\n\n【已有事件】\n${JSON.stringify(merged.map(item=>({summary:item.summary,source_quote:item.source_quote})),null,2)}\n\n【未覆盖行及上下文】\n${repairText}${previousFailure}`;
    const repaired=await generate({stage:"memory_events",project,prompt:coveragePrompt,schema:baseEventSchema,extra:{episode},signal});
    merged.push(...(repaired.output?.events||[]).map(item=>({...item,scene_no:0})).filter(item=>text(item.summary)&&text(item.source_quote)&&text(episode.script).includes(text(item.source_quote))));
    stillUncovered=uncoveredTailAndSystemLines(episode.script,merged);
  }
  if(stillUncovered.length&&audit.provider!=="mock")throw new Error(`剧情记忆覆盖验收未通过：剧本第 ${stillUncovered.map(item=>item.lineNo).join("、")} 行的集尾或系统信号仍未提炼；已保留原记忆，请重试`);
  const seenRaw=new Set(),raw=[];
  for(const item of merged){const signature=`${compact(item.source_quote)}|${compact(item.summary)}`;if(seenRaw.has(signature))continue;seenRaw.add(signature);const position=sourcePosition(episode.script,item.source_quote),sceneNo=Number(item.scene_no)||scenes.find(scene=>position.start>=scene.startLine&&position.start<=scene.endLine)?.sceneNo||1;raw.push({...item,scene_no:sceneNo,_sourceIndex:position.index,_lineStart:position.start,_lineEnd:position.end});}
  raw.sort((a,b)=>a._sourceIndex-b._sourceIndex||Number(a.order)-Number(b.order));raw.forEach((item,index)=>item.order=index+1);
  run("UPDATE jobs SET message=@message WHERE project_id=@pid AND type IN ('episode_state_extract','episode_script','episode','full_book') AND status='running'",{pid:project.id,message:`正在本地整理 EP${String(episode.episode_no).padStart(2,"0")} 的事件与时间线`});
  if(raw.length){
    let issues=selfContainedIssues(raw);
    if(issues.length){
      const issueOrders=[...new Set(issues.map(issue=>Number(issue.split("：")[0])).filter(order=>order>=1&&order<=raw.length))],repairSchema=baseEventSchema;
      const repairPrompt=`你是剧情记忆库的定点事件修复员。只返回下列指定order，不得返回其他事件，不得改变order和source_quote。只修正主体、动作、具体对象、限定、直接结果和summary；summary必须脱离上下文仍能理解，禁止他、她、对方、东西、这个骗局、本集等指代。\n\n【具体问题】\n${issues.join("\n")}\n\n【待修事件】\n${JSON.stringify(issueOrders.map(order=>raw[order-1]).map(({_sourceIndex,_lineStart,_lineEnd,...item})=>item),null,2)}\n\n【完整剧本】\n${episode.script}`;
      const repaired=await generate({stage:"memory_events",project,prompt:repairPrompt,schema:repairSchema,extra:{episode},signal});
      for(const item of repaired.output?.events||[]){const order=Number(item.order);if(issueOrders.includes(order)&&text(episode.script).includes(text(item.source_quote)))raw[order-1]={...raw[order-1],...item};}
      issues=selfContainedIssues(raw);if(issues.length)throw new Error(`剧情事件定点修复后仍不合格：${issues.slice(0,4).join("；")}`);
    }
    let previousMain=null;
    for(let index=0;index<raw.length;index++){const position=sourcePosition(episode.script,raw[index].source_quote),scene=scenes.find(scene=>position.start>=scene.startLine&&position.start<=scene.endLine),sceneNo=scene?.sceneNo||raw[index].scene_no,timeText=normalizeEventTimeText(raw[index],scene),temporal=inferTemporalMetadata({...raw[index],time_text:timeText,_lineStart:position.start},scenes,previousMain);raw[index]={...raw[index],time_text:timeText,...temporal,scene_no:sceneNo,_sourceIndex:position.index,_lineStart:position.start,_lineEnd:position.end};if(["main","parallel"].includes(temporal.timeline_type))previousMain=raw[index];}
  }
  const initialNames=new Set(all("SELECT canonical_name FROM memory_entities WHERE project_id=@pid AND kind='character' AND active=1",{pid:project.id}).map(item=>item.canonical_name));
  const priorRelationships=all("SELECT person_a,person_b,current_state,latest_episode FROM memory_relationships WHERE project_id=@pid",{pid:project.id}),priorGolden=all("SELECT canonical_name,kind,owner,fixed_rules,current_state,latest_episode FROM memory_golden_fingers WHERE project_id=@pid AND active=1",{pid:project.id}),priorAbilities=all("SELECT golden_name,canonical_name,owner,description,status,conditions,replaces_ability,latest_episode FROM memory_golden_abilities WHERE project_id=@pid AND active=1",{pid:project.id}),priorProps=all("SELECT canonical_name,kind,significance,current_holder,current_location,origin_text,current_state,latest_episode FROM memory_important_props WHERE project_id=@pid AND active=1",{pid:project.id});
  const dimensionPrompt=`你是长篇短剧记忆库的分类提炼员。唯一事实来源是下面本集最终剧本。只提炼人物关系变化、剧情中新出现的实名次要人物、主角金手指及变化、重要道具及变化。

【时间边界】
- 下方时间事件表已经区分当前主线、倒叙、未来预示和平行线。人物关系、金手指与道具可以提炼历史事实，但倒叙和未来预示里的旧状态绝不能写成“本集结束时当前快照”。
- 当前快照只依据snapshot_effect=advance_current的证据更新；historical_only、future_only、no_change只作为历史信息，不反向覆盖当前持有人、关系、位置、数值或技能。

【人物关系】
- 只记录本集明确发生变化或首次明确建立的关系；同处一场、对话或既有关系未变化不重复输出。
- relationship_state是本集结束后双方当前可确认关系，不写感觉和预测。summary写清什么行动导致什么关系变化。

【实名次要人物】
- 只提取剧本人物标识或说话人中有稳定姓名、且不在03初始人设名单的人。
- “中年男人、司机、灰色背影、街痞、医生、王叔”等泛称、职业或临时称呼不建档，除非剧本明确将其作为稳定姓名标识。
- identity只写能够跨场次继续成立的身份、职业、组织归属或与主要人物的稳定基础关系；traits只写剧本以多处行为明确证明、能够跨场次延续的稳定处事特征。宁可留空，也不把单次行为概括成人设。
- 严禁写人物在某一刻的位置、姿势、外貌、情绪、正在进行的动作、临时任务或剧情局面。例如“蹲在巷口抽烟盯梢方野”属于剧情事件，不属于人物档案；不得写入identity或traits。

【金手指】
- 指主角持有的系统、弹幕、技能、血统、异能、神器、空间、重生记忆、功法、天赋或契约等特殊优势。普通道具和普通职业技能不算。
- fixed_rules只保存已明确且不会随升级或剧情进展改变的激活条件、触发条件、适用对象、消耗、冷却、次数限制、禁用条件和副作用。可靠度、准确率、成功率、当前检测精度、当前等级、积分及其他可能变化的能力参数全部属于current_state，不得写进fixed_rules。
- 系统、弹幕或界面的呈现与交互载体属于固定规则：明确写在脑海、意识或眼前浮现，就记录为非实体内在呈现；明确绑定手机、手表、直播屏幕等设备才记录对应实体载体。不得把非实体系统推断成手机应用，也不得反向推断。
- current_state只维护金手指整体的绑定对象、积分、系统等级、任务、提示、全局增益惩罚和其他系统级数值；具体能力的作用、可用状态、等级与限制全部写入golden_abilities，不再重复堆入current_state。
- 系统或弹幕的普通重复播报不建变化记录；改变数值、技能、任务、规则、认知或后续行动才记录。没有状态变化时change_type=无状态变化且change_summary留空。

【金手指能力账本】
- golden_abilities把每项具体能力独立记录，不能再把“已证明能力”只堆进golden_fingers.current_state。ability_name使用短而稳定的能力名；description写实际作用；conditions只写已明示的对象、次数、消耗、冷却、代价或触发限制。
- status含义：active正常可用；limited仍可用但受限；sealed暂时封印、以后可恢复；lost永久失去；consumed一次性能力已消耗；upgraded旧版本已被新能力替代。
- 旧能力默认保持原状态，不能因为本集未使用就删除、降级或失效。只有剧本明确展示限制改变、封印、失去、消耗、升级或恢复，才输出相应变化并写清原因、过程和结果。
- 升级时：新能力用新名称和当前状态输出，replaces_ability填写被替代的旧能力名；旧能力同时输出status=upgraded。恢复必须对应先前sealed或limited的能力；普通使用不改变status。
- 剧本直接展示超常效果，即使没有“解锁”播报，也属于首次证明；只能记录画面实际证明的最小能力边界，不得扩大成万能能力。source_quote必须提供直接证据。

【重要道具】
- 只收录真正参与剧情的具体物件：承载关键证据、秘密、威胁、交易、身份凭证、承诺，能触发或改变人物行动，或已明确会被再次使用。记录名称必须带足区分对象的限定词，如“母亲病床威胁照片”，不能只写“照片”。
- 普通陈设、服装、随手工具、仅体现职业或氛围的物件不收录；铜钱、罗盘、手机、名片等即使被拿起也不自动算重要，除非其具体内容或归属确实推动剧情。金手指及其专属神器归入金手指，不在这里重复。
- significance只写该物在已发生剧情中的明确作用。origin_text记录剧本明确交代的来源、购买或取得经过；current_holder记录本集结束时持有人；current_location只记录本集结束时实际所在位置，不能把购买地点或来源误写成当前位置；current_state记录内容、完整性和可用性。不知道就留空，禁止猜测。
- 道具可以在剧情中转交、交易、抢夺、遗失、损坏或销毁，但必须有本集可见事件作为原因，并在change_summary写清“旧状态→发生事件→新状态”；不能无过程跳变。
- 首次达到重要标准，或持有人、位置、内容、完整性、可用性发生变化时输出；无变化但仍被提及时可用于补全快照，此时change_type=无状态变化、change_summary留空。

所有source_quote必须是剧本中逐字存在的最短完整证据。不得使用小说、棗概、人设或未来规划补全。

【03初始人设姓名（不建次要人物档案）】
${JSON.stringify([...initialNames])}

【提炼前当前关系快照】
${JSON.stringify(priorRelationships,null,2)}

【提炼前金手指快照】
${JSON.stringify(priorGolden,null,2)}

【提炼前能力账本】
${JSON.stringify(priorAbilities,null,2)}

【提炼前重要道具快照】
${JSON.stringify(priorProps,null,2)}

【本集事件时间表】
${JSON.stringify(raw.map(item=>({order:item.order,summary:item.summary,time_text:item.time_text,timeline_type:item.timeline_type,timeline_label:item.timeline_label,temporal_anchor:item.temporal_anchor,temporal_relation:item.temporal_relation,snapshot_effect:item.snapshot_effect,source_quote:item.source_quote})),null,2)}

【EP${String(episode.episode_no).padStart(2,"0")}最终剧本】
${episode.script}`;
  const dimensionResult=await generate({stage:"memory_dimensions",project,prompt:dimensionPrompt,schema:dimensionSchema,extra:{episode},signal});
  const genericName=/^(?:中年男人|中年女人|男人|女人|司机|医生|护士|街痞|混混|灰色背影|神秘人|路人|保安|老板)$/;
  const dimension={relationships:(dimensionResult.output?.relationships||[]).filter(item=>text(item.person_a)&&text(item.person_b)&&text(item.summary)&&text(item.person_a)!==text(item.person_b)&&text(episode.script).includes(text(item.source_quote))),secondaryCharacters:(dimensionResult.output?.secondary_characters||[]).filter(item=>text(item.name)&&!genericName.test(text(item.name))&&!initialNames.has(text(item.name))&&text(episode.script).includes(text(item.source_quote))),goldenFingers:(dimensionResult.output?.golden_fingers||[]).filter(item=>text(item.name)&&text(item.owner)&&text(episode.script).includes(text(item.source_quote))),goldenAbilities:(dimensionResult.output?.golden_abilities||[]).filter(item=>text(item.golden_name)&&text(item.ability_name)&&text(item.owner)&&text(item.description)&&text(episode.script).includes(text(item.source_quote))),importantProps:(dimensionResult.output?.important_props||[]).filter(item=>text(item.name)&&text(item.significance)&&text(episode.script).includes(text(item.source_quote)))};
  const eventTemporalScope=event=>event?.timeline_type==="flashback"?"historical_only":event?.timeline_type==="flashforward"?"future_only":["main","parallel"].includes(event?.timeline_type)?"advance_current":"no_change";
  const temporalScope=item=>{const position=sourcePosition(episode.script,item.source_quote),matched=raw.find(event=>position.index>=event._sourceIndex&&position.index<=event._sourceIndex+text(event.source_quote).length)||raw.find(event=>event._sourceIndex>=position.index&&event._sourceIndex<=position.index+text(item.source_quote).length);if(matched)return eventTemporalScope(matched);const sceneNo=scenes.find(scene=>position.start>=scene.startLine&&position.start<=scene.endLine)?.sceneNo,sceneScopes=[...new Set(raw.filter(event=>event.scene_no===sceneNo).map(eventTemporalScope))];if(sceneScopes.length===1)return sceneScopes[0];const allScopes=[...new Set(raw.map(eventTemporalScope))];return allScopes.length===1?allScopes[0]:"no_change";};
  const explicitGoldenSignal=raw.some(item=>item.event_type==="system_change"||/(?:系统|弹幕|血统|异能|技能解锁|空间激活)/.test([item.subject,item.action,item.object_text,item.summary].join("")))&&/(?:系统音|系统绑定|系统已激活|系统激活|技能解锁|血统觉醒|异能觉醒|弹幕)/.test(episode.script);
  if(explicitGoldenSignal&&!dimension.goldenFingers.length){
    run("UPDATE jobs SET message=@message WHERE project_id=@pid AND type IN ('episode_state_extract','episode_script','episode','full_book') AND status='running'",{pid:project.id,message:"检测到 EP"+String(episode.episode_no).padStart(2,"0")+" 存在金手指事件，正在执行专项补漏"});
    const relatedGoldenEvents=raw.filter(item=>item.event_type==="system_change"||/(?:系统|弹幕|血统|异能|技能)/.test([item.subject,item.action,item.object_text,item.summary].join(""))).map(item=>({order:item.order,summary:item.summary,snapshot_effect:item.snapshot_effect,source_quote:item.source_quote}));
    const goldenPrompt=["你是长篇短剧金手指档案补漏员。综合分类上一轮漏掉了金手指，但事件表已经明确识别到系统、特殊能力或觉醒事件。只依据最终剧本与事件表重新提炼golden_fingers，不输出其他类别。","金手指包括主角持有的系统、弹幕、技能、血统、异能、神器、空间、重生记忆、功法、天赋或契约。普通职业技能和普通道具不算。系统已绑定、激活、生成任务、给出专属鉴定结果或提示使用能力，都说明相应金手指已经出现，不得返回空数组。","fixed_rules只累积不会随升级或剧情变化的激活条件、触发条件、使用对象、消耗、冷却、次数、禁用条件和副作用；可靠度、准确率、成功率、当前精度、等级、积分等可变参数必须写入current_state。current_state写本集结束时已确认的完整快照。首次出现或状态变化必须给出change_type与change_summary。source_quote使用剧本中逐字存在的最短完整证据。","【提炼前金手指快照】",JSON.stringify(priorGolden,null,2),"【已识别的相关事件】",JSON.stringify(relatedGoldenEvents,null,2),"【最终剧本】",episode.script].join("\n\n");
    const goldenRepair=await generate({stage:"memory_dimensions",project,prompt:goldenPrompt,schema:goldenOnlySchema,extra:{episode},signal});
    dimension.goldenFingers=(goldenRepair.output?.golden_fingers||[]).filter(item=>text(item.name)&&text(item.owner)&&text(episode.script).includes(text(item.source_quote)));
  }
  dimension.goldenFingers=attachProvenGoldenAbilities(dimension.goldenFingers,raw);
  for(const event of raw.filter(item=>item.event_type==="capability_change"&&text(item.subject))){if(dimension.goldenAbilities.some(item=>text(item.source_quote)===text(event.source_quote)))continue;const owner=text(event.subject),golden=dimension.goldenFingers.find(item=>text(item.owner)===owner)||priorGolden.find(item=>text(item.owner)===owner);if(!golden)continue;const material=[event.action,event.object_text,event.summary].map(text).join(""),abilityName=/(?:鉴定|翡翠|玉石)/.test(material)?"翡翠鉴定能力":`${text(event.action)||"特殊"}能力`;dimension.goldenAbilities.push({order:Number(event.order)||1,golden_name:text(golden.name||golden.canonical_name),ability_name:abilityName,owner,description:text(event.result_text)||text(event.summary),status:"active",conditions:"",change_type:"首次证明",replaces_ability:"",change_summary:text(event.summary),source_quote:text(event.source_quote)});}
  dimension.secondaryCharacters=dimension.secondaryCharacters.filter(item=>temporalScope(item)!=="future_only");
  let eventVectors=[];
  if(raw.length&&embeddingConfigured()){
    run("UPDATE jobs SET message=@message WHERE project_id=@pid AND type IN ('episode_state_extract','episode_script','episode','full_book') AND status='running'",{pid:project.id,message:`正在为 EP${String(episode.episode_no).padStart(2,"0")} 事件建立语义索引`});
    await ensureEventEmbeddings(project.id,episode.episode_no,signal);eventVectors=await embedTexts(raw.map(item=>item.summary),{signal});
    candidates=semanticCandidates(project.id,episode.episode_no,eventVectors);
  }
  const dimensionTexts=[...dimension.relationships.map(item=>item.summary),...dimension.secondaryCharacters.map(item=>`${item.name}：${item.identity}；${item.traits}`),...dimension.goldenFingers.filter(item=>item.change_type!=="无状态变化"&&text(item.change_summary)).map(item=>item.change_summary),...dimension.goldenAbilities.filter(item=>item.change_type!=="无状态变化"&&text(item.change_summary)).map(item=>item.change_summary),...dimension.importantProps.filter(item=>item.change_type!=="无状态变化"&&text(item.change_summary)).map(item=>item.change_summary)],dimensionVectors=dimensionTexts.length?await embedTexts(dimensionTexts,{signal}):[];let dimensionVectorIndex=0;
  let semanticLinks=[];
  if(raw.length>1||candidates.length){
    const localOnly=!candidates.length;
    run("UPDATE jobs SET message=@message WHERE project_id=@pid AND type IN ('episode_state_extract','episode_script','episode','full_book') AND status='running'",{pid:project.id,message:`正在判定 EP${String(episode.episode_no).padStart(2,"0")} 的明确剧情关系`});
    const linkPrompt=`你是剧情因果图编辑。根据当前集事件和历史候选，只返回有明确剧情语义的有向边。

允许的关系：
- 回应：后事件是对前事件的行动回应。
- 兑现：邀约、承诺、威胁、命令或预告被实际执行。
- 导致：前事件直接造成后事件。
- 反转：后事件推翻前事件建立的局面或认知。
- 阻断：后事件打断前事件的行动或目标。
- 利用：后事件明确利用前事件产生的条件。
- 揭示：后事件揭开前事件中隐藏的信息。
- 升级：后事件让同一矛盾、危险或目标明确升级。
- 促使：前事件构成人物做出后事件的明确动机。

硬规则：
1. 纯粹的发生先后、相邻、同场或同一人参与，不建立连接。
2. 不得输出“继续”“随后”“提及”等无因果关系。证据不足就不返回该边。
3. ${localOnly?"本集边只返回from_order和to_order，且from_order必须小于to_order。A可以同时连向B、C，多个前因也可汇入一个结果。":"current边的from_order必须小于to_order；history边只用from_candidate_id指向当前集to_order。A可以同时连向B、C，多个前因也可同时汇入一个结果。"}
4. evidence用一句话说明为什么是该关系，不得猜测。
5. chain_title用5–18个字命名这组事件共同推进的具体剧情事项，例如“王志远原石诈骗”；同一事项必须稳定沿用同名。
6. 没有可靠连接时返回空links数组。
7. “人物同时承受租金、索赔、疾病等压力”只说明压力并存，不等于其中一项直接导致另一项；不得用促使或导致强行相连。促使必须有当前事件中的明确决定、行动或台词作为结果，且能指出前事件如何直接构成动机。
8. 必须等当前集事件完整后再连边；关系证据只能来自两端事件及其source_quote，不得用未提炼的中间剧情补出因果。
9. 系统或能力的“激活→生成任务→提示使用→执行能力→得到鉴定/战斗等结果”，以及“具体危险逼近→系统或人物发出警告”，属于明确可连接的回应、导致、利用或升级关系，不是单纯相邻。当前事件中存在这些明确关系时不得返回空数组。

【当前集事件】
${JSON.stringify(raw.map(item=>({order:item.order,summary:item.summary,source_quote:item.source_quote})),null,2)}

【历史候选】
${JSON.stringify(candidates.map(item=>({id:item.id,episode_no:item.episode_no,event_order:item.event_order,summary:item.summary})),null,2)}`;
    const linked=await generate({stage:"memory_links",project,prompt:linkPrompt,schema:localOnly?localLinkSchema:linkSchema,extra:{episode},signal});
    const candidateIds=new Set(candidates.map(item=>Number(item.id))),seenLinks=new Set();
    semanticLinks=(linked.output?.links||[]).map(link=>localOnly?{...link,from_type:"current",from_candidate_id:null}:link).filter(link=>{
      const to=Number(link.to_order),from=Number(link.from_order),candidate=Number(link.from_candidate_id);
      const valid=semanticRelations.has(link.relation)&&to>=1&&to<=raw.length&&((link.from_type==="current"&&from>=1&&from<to)||(link.from_type==="history"&&candidateIds.has(candidate)));
      if(!valid)return false;const key=`${link.from_type}|${from||candidate}|${to}|${link.relation}`;if(seenLinks.has(key))return false;seenLinks.add(key);return true;
    });
    const hasObviousLocalChain=raw.some(item=>item.event_type==="system_change"||item.event_type==="capability_change")&&raw.length>=3;
    if(!semanticLinks.length&&hasObviousLocalChain){
      run("UPDATE jobs SET message=@message WHERE project_id=@pid AND type IN ('episode_state_extract','episode_script','episode','full_book') AND status='running'",{pid:project.id,message:`EP${String(episode.episode_no).padStart(2,"0")} 建链结果为空，正在定向重试一次`});
      const retryPrompt=`${linkPrompt}\n\n【上一轮问题】\n上一轮返回了空剧情关系，但当前事件中明确存在系统/能力的激活、任务、使用、结果或危险警告链。只重做本集内部关系，不连接纯粹相邻事件；至少检查这些明确动作之间是否构成回应、导致、利用、揭示或升级。`;
      const retried=await generate({stage:"memory_links",project,prompt:retryPrompt,schema:localLinkSchema,extra:{episode},signal});
      semanticLinks=(retried.output?.links||[]).map(link=>({...link,from_type:"current",from_candidate_id:null})).filter(link=>{const to=Number(link.to_order),from=Number(link.from_order),valid=semanticRelations.has(link.relation)&&to>=1&&to<=raw.length&&from>=1&&from<to;if(!valid)return false;const key=`current|${from}|${to}|${link.relation}`;if(seenLinks.has(key))return false;seenLinks.add(key);return true;});
      if(!semanticLinks.length)throw new Error("剧情事件已完整提炼，但模型连续两次未建立任何明确剧情关系；已保留原记忆，请重试建链");
    }
  }
  transaction(()=>{
    const oldIds=all("SELECT id,event_order,source_quote FROM memory_events WHERE project_id=@pid AND episode_no=@episode ORDER BY event_order",{pid:project.id,episode:episode.episode_no});
    for(const item of oldIds)run("DELETE FROM memory_vectors WHERE project_id=@pid AND memory_type='plot_event' AND source_id=@source",{pid:project.id,source:item.id});
    const oldRelationshipIds=all("SELECT id FROM memory_relationship_changes WHERE project_id=@pid AND episode_no=@episode",{pid:project.id,episode:episode.episode_no}).map(item=>item.id),oldGoldenIds=all("SELECT id FROM memory_golden_changes WHERE project_id=@pid AND episode_no=@episode",{pid:project.id,episode:episode.episode_no}).map(item=>item.id),oldAbilityIds=all("SELECT id FROM memory_golden_ability_changes WHERE project_id=@pid AND episode_no=@episode",{pid:project.id,episode:episode.episode_no}).map(item=>item.id),oldPropIds=all("SELECT id FROM memory_prop_changes WHERE project_id=@pid AND episode_no=@episode",{pid:project.id,episode:episode.episode_no}).map(item=>item.id);
    for(const sourceId of oldRelationshipIds)run("DELETE FROM memory_vectors WHERE project_id=@pid AND memory_type='relationship_change' AND source_id=@source",{pid:project.id,source:sourceId});for(const sourceId of oldGoldenIds)run("DELETE FROM memory_vectors WHERE project_id=@pid AND memory_type='golden_change' AND source_id=@source",{pid:project.id,source:sourceId});for(const sourceId of oldAbilityIds)run("DELETE FROM memory_vectors WHERE project_id=@pid AND memory_type='golden_ability_change' AND source_id=@source",{pid:project.id,source:sourceId});for(const sourceId of oldPropIds)run("DELETE FROM memory_vectors WHERE project_id=@pid AND memory_type='important_prop_change' AND source_id=@source",{pid:project.id,source:sourceId});
    run("DELETE FROM memory_relationship_changes WHERE project_id=@pid AND episode_no=@episode",{pid:project.id,episode:episode.episode_no});run("DELETE FROM memory_golden_changes WHERE project_id=@pid AND episode_no=@episode",{pid:project.id,episode:episode.episode_no});run("DELETE FROM memory_golden_ability_changes WHERE project_id=@pid AND episode_no=@episode",{pid:project.id,episode:episode.episode_no});run("DELETE FROM memory_prop_changes WHERE project_id=@pid AND episode_no=@episode",{pid:project.id,episode:episode.episode_no});
    const oldSet=new Set(oldIds.map(x=>x.id));
    const oldQuotes=new Map(oldIds.map(item=>[item.id,compact(item.source_quote)]));
    const successors=oldSet.size?all("SELECT from_event_id,to_event_id,relation,confidence,thread_hint FROM memory_links WHERE project_id=@pid",{pid:project.id}).filter(link=>oldSet.has(link.from_event_id)&&!oldSet.has(link.to_event_id)&&semanticRelations.has(link.relation)):[];
    run("DELETE FROM memory_events WHERE project_id=@pid AND episode_no=@episode",{pid:project.id,episode:episode.episode_no});
    const inserted=[];
    for(const [index,item] of raw.entries()){
      if(!text(episode.script).includes(text(item.source_quote)))continue;
      const sourceHash=hash(`${compact(item.source_quote)}|${compact(item.summary)}`);
      const vector=eventVectors[index]||[],embedding=activeEmbeddingProvider();
      const saved=run(`INSERT INTO memory_events(project_id,episode_no,event_order,event_type,subject,action,object_text,qualifier_text,result_text,location,time_text,timeline_type,timeline_label,temporal_anchor,temporal_relation,snapshot_effect,summary,participants_json,source_quote,source_hash,active,updated_at,scene_no,source_line_start,source_line_end,embedding_json,embedding_model,embedded_at)
        VALUES(@pid,@episode,@ord,@type,@subject,@action,@object,@qualifier,@result,@location,@timeText,@timelineType,@timelineLabel,@temporalAnchor,@temporalRelation,@snapshotEffect,@summary,@participants,@quote,@hash,1,@time,@scene,@lineStart,@lineEnd,@vector,@embeddingModel,@embeddedAt)`,{pid:project.id,episode:episode.episode_no,ord:Number(item.order)||index+1,type:item.event_type||"event",subject:text(item.subject),action:text(item.action),object:text(item.object_text),qualifier:text(item.qualifier_text),result:text(item.result_text),location:text(item.location),timeText:text(item.time_text),timelineType:item.timeline_type||"unknown",timelineLabel:text(item.timeline_label),temporalAnchor:text(item.temporal_anchor),temporalRelation:item.temporal_relation||"unknown",snapshotEffect:item.snapshot_effect||"no_change",summary:text(item.summary),participants:JSON.stringify(item.participants||[]),quote:text(item.source_quote),hash:sourceHash,time:now(),scene:Number(item.scene_no)||1,lineStart:item._lineStart,lineEnd:item._lineEnd,vector:vector.length?JSON.stringify(vector):"",embeddingModel:vector.length?embedding.model:"",embeddedAt:vector.length?now():null});
      const eventId=Number(saved.lastInsertRowid),previousEvent=inserted.at(-1),markers=temporalMarkersFor(item);
      for(const marker of markers){const relation=item.timeline_type==="flashback"?"before":item.timeline_type==="flashforward"?"after":item.timeline_type==="parallel"?"same_time":marker.relation,mentioned=[item.source_quote,item.result_text,item.qualifier_text].some(value=>text(value).includes(marker.marker_text)),anchorId=mentioned?eventId:previousEvent?.id||null,anchorLabel=mentioned?`EP${String(episode.episode_no).padStart(2,"0")}事件${item.order}：${item.summary}`:anchorId?`EP${String(episode.episode_no).padStart(2,"0")}事件${previousEvent.item.order}：${previousEvent.item.summary}`:`EP${String(episode.episode_no).padStart(2,"0")}当前场景`,evidence=[item.source_quote,item.result_text,item.qualifier_text].map(text).find(value=>value.includes(marker.marker_text))||text(item.source_quote);run(`INSERT OR IGNORE INTO memory_temporal_relations(project_id,event_id,episode_no,marker_order,marker_text,relation,anchor_event_id,anchor_label,timeline_type,marker_kind,precision,source_quote,updated_at) VALUES(@pid,@event,@episode,@order,@marker,@relation,@anchor,@label,@timeline,@kind,@precision,@quote,@time)`,{pid:project.id,event:eventId,episode:episode.episode_no,order:marker.marker_order,marker:marker.marker_text,relation,anchor:anchorId,label:anchorLabel,timeline:item.timeline_type||"main",kind:marker.kind,precision:marker.precision,quote:evidence,time:now()});}
      inserted.push({id:eventId,item,sourceQuote:compact(item.source_quote)});
      upsertVector(project.id,"plot_event",eventId,episode.episode_no,item.summary,vector,embedding.model);
    }
    for(const link of semanticLinks){
      const to=inserted[Number(link.to_order)-1]?.id;
      const from=link.from_type==="current"?inserted[Number(link.from_order)-1]?.id:Number(link.from_candidate_id);
      if(from&&to)run("INSERT OR IGNORE INTO memory_links(project_id,from_event_id,to_event_id,relation,confidence,thread_hint) VALUES(@pid,@from,@to,@relation,0.9,@hint)",{pid:project.id,from,to,relation:link.relation,hint:text(link.chain_title)});
    }
    for(const successor of successors){const quote=oldQuotes.get(successor.from_event_id),replacement=inserted.find(item=>item.sourceQuote===quote);if(replacement)run("INSERT OR IGNORE INTO memory_links(project_id,from_event_id,to_event_id,relation,confidence,thread_hint) VALUES(@pid,@from,@to,@relation,@confidence,@hint)",{pid:project.id,from:replacement.id,to:successor.to_event_id,relation:successor.relation,confidence:Math.min(Number(successor.confidence)||0.8,0.8),hint:successor.thread_hint||""});}
    const embeddingModel=activeEmbeddingProvider().model;
    for(const item of dimension.relationships){const a=text(item.person_a),b=text(item.person_b),key=pairKey(a,b),scope=temporalScope(item),saved=run(`INSERT INTO memory_relationship_changes(project_id,episode_no,change_order,person_a,person_b,relationship_state,summary,source_quote,temporal_scope,updated_at) VALUES(@pid,@episode,@order,@a,@b,@state,@summary,@quote,@scope,@time)`,{pid:project.id,episode:episode.episode_no,order:Number(item.order)||1,a,b,state:text(item.relationship_state),summary:text(item.summary),quote:text(item.source_quote),scope,time:now()}),sourceId=Number(saved.lastInsertRowid);if(scope==="advance_current")run(`INSERT INTO memory_relationships(project_id,pair_key,person_a,person_b,current_state,latest_episode,updated_at) VALUES(@pid,@key,@a,@b,@state,@episode,@time) ON CONFLICT(project_id,pair_key) DO UPDATE SET person_a=CASE WHEN excluded.latest_episode>=latest_episode THEN excluded.person_a ELSE person_a END,person_b=CASE WHEN excluded.latest_episode>=latest_episode THEN excluded.person_b ELSE person_b END,current_state=CASE WHEN excluded.latest_episode>=latest_episode THEN excluded.current_state ELSE current_state END,latest_episode=MAX(latest_episode,excluded.latest_episode),updated_at=excluded.updated_at`,{pid:project.id,key,a,b,state:text(item.relationship_state),episode:episode.episode_no,time:now()});upsertVector(project.id,"relationship_change",sourceId,episode.episode_no,item.summary,dimensionVectors[dimensionVectorIndex++],embeddingModel);}
    for(const item of dimension.secondaryCharacters){const name=text(item.name),identity=cleanCharacterProfile(item.identity),traits=cleanCharacterProfile(item.traits),scope=temporalScope(item),existing=get("SELECT id,first_episode,latest_episode,temporal_scope FROM memory_secondary_characters WHERE project_id=@pid AND canonical_name=@name",{pid:project.id,name});let sourceId;if(existing){sourceId=existing.id;const canUpdate=episode.episode_no>=existing.latest_episode&&(scope==="advance_current"||existing.temporal_scope!=="advance_current");if(canUpdate)run("UPDATE memory_secondary_characters SET identity=@identity,traits=@traits,latest_episode=@episode,source_quote=@quote,temporal_scope=@scope,active=1,updated_at=@time WHERE id=@id",{identity,traits,episode:episode.episode_no,quote:text(item.source_quote),scope,time:now(),id:existing.id});}else sourceId=Number(run("INSERT INTO memory_secondary_characters(project_id,canonical_name,identity,traits,first_episode,latest_episode,source_quote,temporal_scope,active,updated_at) VALUES(@pid,@name,@identity,@traits,@episode,@episode,@quote,@scope,1,@time)",{pid:project.id,name,identity,traits,episode:episode.episode_no,quote:text(item.source_quote),scope,time:now()}).lastInsertRowid);upsertVector(project.id,"secondary_character",sourceId,episode.episode_no,`${name}：${identity}；${traits}`,dimensionVectors[dimensionVectorIndex++],embeddingModel);}
    for(const item of dimension.goldenFingers){const name=text(item.name),scope=temporalScope(item),existing=get("SELECT id,latest_episode FROM memory_golden_fingers WHERE project_id=@pid AND canonical_name=@name",{pid:project.id,name});let goldenId=existing?.id;if(scope==="advance_current"){if(existing){if(episode.episode_no>=existing.latest_episode)run("UPDATE memory_golden_fingers SET kind=@kind,owner=@owner,fixed_rules=@rules,current_state=@state,latest_episode=@episode,active=1,updated_at=@time WHERE id=@id",{kind:item.kind,owner:text(item.owner),rules:text(item.fixed_rules),state:text(item.current_state),episode:episode.episode_no,time:now(),id:goldenId});}else goldenId=Number(run("INSERT INTO memory_golden_fingers(project_id,canonical_name,kind,owner,fixed_rules,current_state,latest_episode,active,updated_at) VALUES(@pid,@name,@kind,@owner,@rules,@state,@episode,1,@time)",{pid:project.id,name,kind:item.kind,owner:text(item.owner),rules:text(item.fixed_rules),state:text(item.current_state),episode:episode.episode_no,time:now()}).lastInsertRowid);}if(item.change_type!=="无状态变化"&&text(item.change_summary)){const saved=run("INSERT INTO memory_golden_changes(project_id,episode_no,change_order,golden_name,owner,change_type,summary,current_snapshot,source_quote,temporal_scope,updated_at) VALUES(@pid,@episode,@order,@name,@owner,@type,@summary,@snapshot,@quote,@scope,@time)",{pid:project.id,episode:episode.episode_no,order:Number(item.order)||1,name,owner:text(item.owner),type:item.change_type,summary:text(item.change_summary),snapshot:text(item.current_state),quote:text(item.source_quote),scope,time:now()}),sourceId=Number(saved.lastInsertRowid);upsertVector(project.id,"golden_change",sourceId,episode.episode_no,item.change_summary,dimensionVectors[dimensionVectorIndex++],embeddingModel);}}
    for(const item of dimension.goldenAbilities){const goldenName=text(item.golden_name),name=text(item.ability_name),scope=temporalScope(item),existing=get("SELECT * FROM memory_golden_abilities WHERE project_id=@pid AND golden_name=@golden AND canonical_name=@name",{pid:project.id,golden:goldenName,name}),previousStatus=existing?.status||"";if(scope==="advance_current"){if(existing){if(episode.episode_no>=existing.latest_episode)run("UPDATE memory_golden_abilities SET owner=@owner,description=@description,status=@status,conditions=@conditions,replaces_ability=@replaces,latest_episode=@episode,source_quote=@quote,active=1,updated_at=@time WHERE id=@id",{owner:text(item.owner),description:text(item.description),status:item.status,conditions:text(item.conditions),replaces:text(item.replaces_ability),episode:episode.episode_no,quote:text(item.source_quote),time:now(),id:existing.id});}else run("INSERT INTO memory_golden_abilities(project_id,golden_name,canonical_name,owner,description,status,conditions,replaces_ability,first_episode,latest_episode,source_quote,active,updated_at) VALUES(@pid,@golden,@name,@owner,@description,@status,@conditions,@replaces,@episode,@episode,@quote,1,@time)",{pid:project.id,golden:goldenName,name,owner:text(item.owner),description:text(item.description),status:item.status,conditions:text(item.conditions),replaces:text(item.replaces_ability),episode:episode.episode_no,quote:text(item.source_quote),time:now()});if(item.change_type==="升级"&&text(item.replaces_ability))run("UPDATE memory_golden_abilities SET status='upgraded',latest_episode=@episode,updated_at=@time WHERE project_id=@pid AND golden_name=@golden AND canonical_name=@old",{episode:episode.episode_no,time:now(),pid:project.id,golden:goldenName,old:text(item.replaces_ability)});}if(item.change_type!=="无状态变化"&&text(item.change_summary)){const saved=run("INSERT INTO memory_golden_ability_changes(project_id,episode_no,change_order,golden_name,ability_name,change_type,previous_status,new_status,summary,source_quote,temporal_scope,updated_at) VALUES(@pid,@episode,@order,@golden,@name,@type,@previous,@next,@summary,@quote,@scope,@time)",{pid:project.id,episode:episode.episode_no,order:Number(item.order)||1,golden:goldenName,name,type:item.change_type,previous:previousStatus,next:item.status,summary:text(item.change_summary),quote:text(item.source_quote),scope,time:now()}),sourceId=Number(saved.lastInsertRowid);upsertVector(project.id,"golden_ability_change",sourceId,episode.episode_no,item.change_summary,dimensionVectors[dimensionVectorIndex++],embeddingModel);}}
    for(const item of dimension.importantProps){const name=text(item.name),scope=temporalScope(item),existing=get("SELECT id,first_episode,latest_episode FROM memory_important_props WHERE project_id=@pid AND canonical_name=@name",{pid:project.id,name});let propId=existing?.id;if(scope==="advance_current"){if(existing){if(episode.episode_no>=existing.latest_episode)run("UPDATE memory_important_props SET kind=@kind,significance=@significance,current_holder=@holder,current_location=@location,origin_text=@origin,current_state=@state,latest_episode=@episode,active=1,updated_at=@time WHERE id=@id",{kind:item.kind,significance:text(item.significance),holder:text(item.current_holder),location:text(item.current_location),origin:text(item.origin_text),state:text(item.current_state),episode:episode.episode_no,time:now(),id:propId});}else propId=Number(run("INSERT INTO memory_important_props(project_id,canonical_name,kind,significance,current_holder,current_location,origin_text,current_state,first_episode,latest_episode,active,updated_at) VALUES(@pid,@name,@kind,@significance,@holder,@location,@origin,@state,@episode,@episode,1,@time)",{pid:project.id,name,kind:item.kind,significance:text(item.significance),holder:text(item.current_holder),location:text(item.current_location),origin:text(item.origin_text),state:text(item.current_state),episode:episode.episode_no,time:now()}).lastInsertRowid);}if(item.change_type!=="无状态变化"&&text(item.change_summary)){const saved=run("INSERT INTO memory_prop_changes(project_id,episode_no,change_order,prop_name,change_type,summary,current_holder,current_location,origin_text,current_state,source_quote,temporal_scope,updated_at) VALUES(@pid,@episode,@order,@name,@type,@summary,@holder,@location,@origin,@state,@quote,@scope,@time)",{pid:project.id,episode:episode.episode_no,order:Number(item.order)||1,name,type:item.change_type,summary:text(item.change_summary),holder:text(item.current_holder),location:text(item.current_location),origin:text(item.origin_text),state:text(item.current_state),quote:text(item.source_quote),scope,time:now()}),sourceId=Number(saved.lastInsertRowid);upsertVector(project.id,"important_prop_change",sourceId,episode.episode_no,item.change_summary,dimensionVectors[dimensionVectorIndex++],embeddingModel);}}
    rebuildMemoryChains(project.id);
    run(`INSERT INTO memory_extractions(project_id,episode_no,scene_count,paragraph_count,first_pass_count,audit_added_count,final_count,status,updated_at)
      VALUES(@pid,@episode,@scenes,@paragraphs,@first,@audit,@final,'completed',@time)
      ON CONFLICT(project_id,episode_no) DO UPDATE SET scene_count=excluded.scene_count,paragraph_count=excluded.paragraph_count,first_pass_count=excluded.first_pass_count,audit_added_count=excluded.audit_added_count,final_count=excluded.final_count,status='completed',updated_at=excluded.updated_at`,{pid:project.id,episode:episode.episode_no,scenes:scenes.length,paragraphs:text(episode.script).split(/\r?\n/).filter(line=>line.trim()).length,first:firstPass.length,audit:audited.length,final:inserted.length,time:now()});
  });
  return {episode:episode.episode_no,events:raw.length,scenes:scenes.length,firstPass:firstPass.length,auditAdded:audited.length,provider:audit.provider,model:audit.model};
}

function keywords(value){return [...new Set((text(value).match(/[A-Za-z0-9]+|[一-鿿]{2,8}/g)||[]).filter(x=>x.length>=2))];}
export async function compileMemoryContext(projectId,episode,signal){
  const query=[episode.summary,episode.hook,episode.required_plot,episode.must_not_reveal].join(" "),keys=keywords(query);
  const entities=all("SELECT kind,canonical_name,aliases_json,initial_identity,personality,backstory FROM memory_entities WHERE project_id=@pid AND active=1",{pid:projectId});
  const relevantEntities=entities.filter((row,index)=>index<2||[row.canonical_name,...JSON.parse(row.aliases_json||"[]")].some(name=>name&&query.includes(name)));
  const fields="id,episode_no,event_order,event_type,subject,action,object_text,qualifier_text,result_text,location,time_text,timeline_type,timeline_label,temporal_anchor,temporal_relation,snapshot_effect,summary,participants_json,source_quote,embedding_json";
  const previous=all(`SELECT ${fields} FROM memory_events WHERE project_id=@pid AND active=1 AND episode_no=@previous ORDER BY event_order ASC,id ASC`,{pid:projectId,previous:episode.episode_no-1}).sort((a,b)=>a.event_order-b.event_order||a.id-b.id);
  let recalled=[],relationshipChanges=[],secondaryCharacters=[],goldenChanges=[],propChanges=[];
  if(embeddingConfigured()){
    await ensureEventEmbeddings(projectId,episode.episode_no,signal);const [queryVector]=await embedTexts([query],{signal,purpose:"query"});
    if(queryVector){const provider=activeEmbeddingProvider(),ranked=all("SELECT memory_type,source_id,episode_no,text_content,embedding_json FROM memory_vectors WHERE project_id=@pid AND episode_no<@episode AND embedding_model=@model",{pid:projectId,episode:episode.episode_no,model:provider.model}).map(item=>({...item,similarity:cosineSimilarity(queryVector,parseVector(item.embedding_json))})).filter(item=>item.similarity>=0.3).sort((a,b)=>b.similarity-a.similarity),take=type=>ranked.filter(item=>item.memory_type===type);const plotIds=new Set(take("plot_event").slice(0,20).map(item=>item.source_id)),relationshipIds=new Set(take("relationship_change").slice(0,6).map(item=>item.source_id)),secondaryIds=new Set(take("secondary_character").slice(0,6).map(item=>item.source_id)),goldenIds=new Set(take("golden_change").slice(0,8).map(item=>item.source_id)),propIds=new Set(take("important_prop_change").slice(0,8).map(item=>item.source_id));recalled=all(`SELECT ${fields} FROM memory_events WHERE project_id=@pid AND active=1 AND episode_no<@episode`,{pid:projectId,episode:episode.episode_no}).filter(item=>plotIds.has(item.id)&&item.episode_no!==episode.episode_no-1);relationshipChanges=all("SELECT * FROM memory_relationship_changes WHERE project_id=@pid AND episode_no<@episode ORDER BY episode_no,change_order",{pid:projectId,episode:episode.episode_no}).filter(item=>relationshipIds.has(item.id));secondaryCharacters=all("SELECT * FROM memory_secondary_characters WHERE project_id=@pid AND active=1",{pid:projectId}).filter(item=>secondaryIds.has(item.id)||query.includes(item.canonical_name));goldenChanges=all("SELECT * FROM memory_golden_changes WHERE project_id=@pid AND episode_no<@episode ORDER BY episode_no,change_order",{pid:projectId,episode:episode.episode_no}).filter(item=>goldenIds.has(item.id));propChanges=all("SELECT * FROM memory_prop_changes WHERE project_id=@pid AND episode_no<@episode ORDER BY episode_no,change_order",{pid:projectId,episode:episode.episode_no}).filter(item=>propIds.has(item.id));}
  }
  const selected=[...new Map([...previous,...recalled].map(item=>[item.id,item])).values()],ids=new Set(selected.map(item=>item.id));
  const links=ids.size?all("SELECT l.from_event_id,l.to_event_id,l.relation,l.thread_hint,a.summary from_summary,b.summary to_summary,b.episode_no,b.event_order FROM memory_links l JOIN memory_events a ON a.id=l.from_event_id JOIN memory_events b ON b.id=l.to_event_id WHERE l.project_id=@pid ORDER BY b.episode_no,b.event_order",{pid:projectId}).filter(row=>ids.has(row.from_event_id)||ids.has(row.to_event_id)):[];
  const memberships=ids.size?all("SELECT ce.chain_id,ce.event_id,c.title FROM memory_chain_events ce JOIN memory_chains c ON c.id=ce.chain_id WHERE c.project_id=@pid AND c.active=1",{pid:projectId}).filter(row=>ids.has(row.event_id)):[];
  const relationshipNames=new Set(relationshipChanges.flatMap(item=>[item.person_a,item.person_b])),relationships=all("SELECT * FROM memory_relationships WHERE project_id=@pid",{pid:projectId}).filter(item=>relationshipNames.has(item.person_a)||relationshipNames.has(item.person_b)||query.includes(item.person_a)||query.includes(item.person_b));
  const goldenFingers=attachProvenGoldenAbilities(all("SELECT * FROM memory_golden_fingers WHERE project_id=@pid AND active=1 ORDER BY latest_episode DESC",{pid:projectId}),all("SELECT event_type,subject,qualifier_text,result_text,summary,source_quote FROM memory_events WHERE project_id=@pid AND active=1 AND episode_no<@episode AND event_type IN ('capability_change','system_change','revelation')",{pid:projectId,episode:episode.episode_no}));
  const goldenAbilities=all("SELECT * FROM memory_golden_abilities WHERE project_id=@pid AND active=1 ORDER BY golden_name,canonical_name",{pid:projectId});
  const propNames=new Set(propChanges.map(item=>item.prop_name)),importantProps=all("SELECT * FROM memory_important_props WHERE project_id=@pid AND active=1 ORDER BY latest_episode DESC",{pid:projectId}).filter(item=>propNames.has(item.canonical_name)||query.includes(item.canonical_name));
  const profiles=relevantEntities.map(row=>`${row.canonical_name}｜初始身份：${row.initial_identity||"无"}｜性格：${row.personality||"无"}｜前史：${row.backstory||"无"}`).join("\n");
  const timeLabel=row=>row.timeline_type==="flashback"?"过去回忆":row.timeline_type==="flashforward"?"未来预示":row.timeline_type==="parallel"?"同期支线":row.timeline_type==="unknown"?"时间待定":"当前主线";
  const formatEvent=row=>`EP${String(row.episode_no).padStart(2,"0")}-${row.event_order}：${row.summary}${row.location?`｜地点：${row.location}`:""}${eventDisplayTime(row)?`｜原文时间：${eventDisplayTime(row)}`:""}｜${timeLabel(row)}${row.temporal_anchor?`｜相对锚点：${row.temporal_anchor}`:""}${row.temporal_relation&&row.temporal_relation!=="unknown"?`｜关系：${row.temporal_relation}`:""}`;
  const events=`【最近线性事件｜固定承接】\n${previous.map(formatEvent).join("\n")||"无"}\n\n【较早相关事件｜语义召回】\n${recalled.sort((a,b)=>a.episode_no-b.episode_no||a.event_order-b.event_order).map(formatEvent).join("\n")||"无"}`;
  const chainIds=[...new Set(memberships.map(row=>row.chain_id))],chains=chainIds.map(chainId=>{const title=memberships.find(row=>row.chain_id===chainId)?.title||"剧情链",edges=links.filter(link=>{const memberIds=new Set(all("SELECT event_id FROM memory_chain_events WHERE chain_id=@id",{id:chainId}).map(row=>row.event_id));return memberIds.has(link.from_event_id)&&memberIds.has(link.to_event_id);});return `【${title}】\n${edges.map(row=>`${row.from_summary} →${row.relation}→ ${row.to_summary}`).join("\n")}`;}).filter(Boolean).join("\n\n");
  const scopeLabel=item=>item.temporal_scope&&!['advance_current','current'].includes(item.temporal_scope)?`[${item.temporal_scope==="historical_only"?"过去回忆":item.temporal_scope==="future_only"?"未来预示":"不更新当前状态"}] `:"";
  const relationshipText=relationships.map(item=>`${item.person_a}↔${item.person_b}｜当前关系：${item.current_state}`).join("\n")+(relationshipChanges.length?`\n【相关关系变化】\n${relationshipChanges.map(item=>`EP${String(item.episode_no).padStart(2,"0")}：${scopeLabel(item)}${item.summary}`).join("\n")}`:"");
  const secondaryText=secondaryCharacters.map(item=>`${item.temporal_scope&&item.temporal_scope!=="advance_current"?"[过去记录] ":""}${item.canonical_name}｜已知身份：${cleanCharacterProfile(item.identity)||"无"}｜稳定特征：${cleanCharacterProfile(item.traits)||"无"}｜首次EP${String(item.first_episode).padStart(2,"0")}`).join("\n");
  const abilityStatus={active:"可用",limited:"受限可用",sealed:"暂时封印",lost:"永久失去",consumed:"已经消耗",upgraded:"已被升级替代"},goldenText=goldenFingers.map(item=>{const abilities=goldenAbilities.filter(ability=>ability.golden_name===item.canonical_name).map(ability=>`  - ${ability.canonical_name}｜${abilityStatus[ability.status]||ability.status}｜作用：${ability.description}${ability.conditions?`｜条件/限制：${ability.conditions}`:""}${ability.replaces_ability?`｜替代：${ability.replaces_ability}`:""}`).join("\n");return `${item.canonical_name}｜类型：${item.kind}｜持有者：${item.owner}\n固定规则：${item.fixed_rules||"无"}\n当前快照：${item.current_state||"无"}\n具体能力：\n${abilities||"  - 无"}`;}).join("\n\n")+(goldenChanges.length?`\n【相关历史变化】\n${goldenChanges.map(item=>`EP${String(item.episode_no).padStart(2,"0")}：${scopeLabel(item)}${item.summary}`).join("\n")}`:"");
  const propText=importantProps.map(item=>`${item.canonical_name}｜类型：${item.kind}｜剧情作用：${item.significance}｜来源/取得经过：${item.origin_text||"未知"}｜当前持有人：${item.current_holder||"未知"}｜当前位置：${item.current_location||"未知"}｜当前状态：${item.current_state||"未知"}`).join("\n")+(propChanges.length?`\n【相关历史变化】\n${propChanges.map(item=>`EP${String(item.episode_no).padStart(2,"0")}：${scopeLabel(item)}${item.summary}`).join("\n")}`:"");
  const currentAnchor=all(`SELECT ${fields} FROM memory_events WHERE project_id=@pid AND active=1 AND episode_no<@episode AND timeline_type IN ('main','parallel') ORDER BY episode_no DESC,event_order DESC LIMIT 1`,{pid:projectId,episode:episode.episode_no})[0];
  const temporalRelations=all(`SELECT tr.*,e.summary event_summary,a.summary anchor_summary FROM memory_temporal_relations tr JOIN memory_events e ON e.id=tr.event_id LEFT JOIN memory_events a ON a.id=tr.anchor_event_id WHERE tr.project_id=@pid AND tr.episode_no<@episode ORDER BY tr.episode_no,tr.event_id,tr.marker_order`,{pid:projectId,episode:episode.episode_no}),relationLabel={after:"之后",before:"之前",same_time:"同时",within:"期限内",at:"时间点",unknown:"关系待定"},precisionLabel={exact:"精确",relative:"相对",vague:"模糊"},temporalGraph=temporalRelations.map(item=>`EP${String(item.episode_no).padStart(2,"0")}｜${item.marker_text}｜${precisionLabel[item.precision]||item.precision}时间｜${relationLabel[item.relation]||item.relation}｜锚点：${item.anchor_summary||item.anchor_label||"未确定"}｜事件：${item.event_summary}`).join("\n");
  const timeAxis=currentAnchor?`当前叙事落点：EP${String(currentAnchor.episode_no).padStart(2,"0")}末端，${currentAnchor.summary}。生成新剧情时从这一落点继续，不得把期限、预告或回忆误当成已经发生。\n【原文时间关系图】\n${temporalGraph||"暂无明确相对时间关系"}\n召回内容中标为“过去回忆/未来预示”的事件仅作历史或预示，不得覆盖当前人物关系、道具归属、位置、数值和能力状态。`:`当前叙事落点尚未建立；只能依据本集规划推进，不得自行换算相对日期。`;
  const previousEvents=previous.map(formatEvent).join("\n"),previousLastEvent=previous.length?formatEvent(previous.at(-1)):"";
  return {profiles,events,chains,relationships:relationshipText,secondaryCharacters:secondaryText,goldenFinger:goldenText,importantProps:propText,timeAxis,previousEvents,previousLastEvent,entityCount:relevantEntities.length,eventCount:selected.length,recentCount:previous.length,recalledCount:recalled.length,embeddingUsed:embeddingConfigured()};
}
