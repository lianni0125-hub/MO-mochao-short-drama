import { all, get } from "./db.js";
import { DEFAULT_TEMPLATE } from "./default-template.js";

export function listTemplates(projectId){
  const uploaded=all("SELECT id,project_id,name,original_name,kind,analysis_json,created_at FROM templates WHERE project_id IS NULL OR project_id=@id ORDER BY id DESC",{id:projectId}).map(x=>({...x,id:String(x.id),source:"uploaded",analysis:JSON.parse(x.analysis_json||"{}")}));
  return [{id:"default",name:DEFAULT_TEMPLATE.name,kind:"builtin",source:"builtin",analysis:{planningSections:DEFAULT_TEMPLATE.planningSections,inferredScriptFormat:DEFAULT_TEMPLATE.scriptFormat,sourceAnalysis:DEFAULT_TEMPLATE.sourceAnalysis}},...uploaded];
}
export function templateContext(project){
  if(!project.template_id||project.template_id==="default")return {id:"default",name:DEFAULT_TEMPLATE.name,text:JSON.stringify(DEFAULT_TEMPLATE,null,2),analysis:{inferredScriptFormat:DEFAULT_TEMPLATE.scriptFormat}};
  const row=get("SELECT * FROM templates WHERE id=@id",{id:Number(project.template_id)});
  return row?{...row,id:String(row.id),text:row.extracted_text||"",analysis:JSON.parse(row.analysis_json||"{}")}:{id:"default",name:DEFAULT_TEMPLATE.name,text:JSON.stringify(DEFAULT_TEMPLATE,null,2),analysis:{inferredScriptFormat:DEFAULT_TEMPLATE.scriptFormat}};
}

export function templateWritingGuide(template){
  const raw=template?.analysis?.inferredScriptFormat||DEFAULT_TEMPLATE.scriptFormat;
  const format={
    episodeHeading:raw.episodeHeading||raw.episode_heading||"EP01",
    sceneHeading:raw.sceneHeading||raw.scene_heading||"序号 + 内景/外景 + 地点 + 时间",
    dialogue:raw.dialogue||"角色名：台词",
    voiceOver:raw.voiceOver||raw.voice_over||"",
    specialSpeaker:raw.specialSpeaker||raw.special_speaker||"",
    action:raw.action||"",
    notes:raw.notes||"",
    targetCharacters:raw.targetCharacters||null,
    targetScenes:raw.targetScenes||null,
    writingRules:raw.writingRules||raw.rules||[],
    normalization:raw.normalization||[]
  };
  const range=format.targetCharacters||{};
  const center=Number(range.average||range.ideal||(range.min!=null&&range.max!=null?(range.min+range.max)/2:0));
  const target=center?Math.round(center):0;
  const generationTarget=target?{characters:target,minCharacters:Number(range.min||Math.round(target*.8)),maxCharacters:Number(range.max||Math.round(target*1.2)),finalRange:range}:{characters:1750,minCharacters:1500,maxCharacters:2000,finalRange:{min:1500,ideal:1750,max:2000}};
  const novelRange=raw.novelCharacters||raw.novel_characters||{min:1000,ideal:1250,max:1500};
  const novelTarget={characters:Number(novelRange.ideal||novelRange.average||1250),minCharacters:Number(novelRange.min||1000),maxCharacters:Number(novelRange.max||1500),finalRange:novelRange};
  const isDefault=String(template?.id||"default")==="default";
  const scriptAcceptance=raw.scriptAcceptance?{min:Number(raw.scriptAcceptance.min),max:Number(raw.scriptAcceptance.max)}:isDefault?{min:1000,max:2000}:{min:generationTarget.minCharacters,max:generationTarget.maxCharacters};
  const novelAcceptance=raw.novelAcceptance?{min:Number(raw.novelAcceptance.min),max:Number(raw.novelAcceptance.max)}:isDefault?{min:2000,max:4000}:{min:novelTarget.minCharacters,max:novelTarget.maxCharacters};
  const text=String(template?.text||"");
  const scriptStart=text.search(/(?:^|\n)\s*(?:中文\s*DRAFT\s*\n)?\s*EP\s*0*1\b/i);
  let sample=raw.sampleExcerpt||"";
  if(template?.id!=="default"&&!sample&&scriptStart>=0){
    const script=text.slice(scriptStart);
    const thirdEpisode=script.search(/\n\s*EP\s*0*3\b/i);
    sample=script.slice(0,thirdEpisode>0?thirdEpisode:Math.min(script.length,6000));
  }
  sample=sample.replace(/^([^\n：]{1,24})\s*[（(]\s*(V\.O\.|OS)\s*[）)]\s*：/gim,"$1 $2：").replace(/[（）()]/g,"");
  return {templateName:template?.name||DEFAULT_TEMPLATE.name,format,generationTarget,novelTarget,scriptAcceptance,novelAcceptance,sample};
}
