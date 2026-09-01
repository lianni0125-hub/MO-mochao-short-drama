import { DEFAULT_TEMPLATE } from "./default-template.js";

export const ZHIHU_YANXUAN_MANJU_TEMPLATE = {
  id:"zhihu-yanxuan-manju",
  name:"知乎盐选（漫剧）",
  kind:"builtin",
  version:1,
  planningSections:DEFAULT_TEMPLATE.planningSections,
  scriptFormat:{
    episodeHeading:"",
    sceneHeading:"场次序号 外/内 地点 日/夜",
    dialogue:"角色名：台词",
    voiceOver:"角色名 V.O.：画外音；角色名 OS：内心独白，均不使用括号",
    specialSpeaker:"",
    action:"环境、动作、表情及可见结果使用独立短段落，只写镜头能够拍到的内容",
    notes:"仅在确有制作必要时使用【蒙太奇】等方括号提示",
    novelCharacters:{min:700,ideal:1000,max:1300},
    targetCharacters:{min:500,ideal:700,max:900},
    novelAcceptance:{min:700,ideal:1000,max:1300},
    scriptAcceptance:{min:500,ideal:700,max:900},
    targetScenes:{min:1,ideal:2,max:9},
    writingRules:[],
    normalization:[],
    sampleExcerpt:`1 外 近海海面下 日

海水浑浊冰冷，Kane手中紧握着断裂的钢板尖角，被鲨鱼拖着不断下沉。

鲨鱼张开巨口不断逼近，锋利牙齿蹭过他的脖颈。

Kane：去死！

Kane发力将钢板尖角刺向鲨鱼眼球。鲨鱼剧烈挣扎，尾鳍狠狠拍打四周海水。

2 外 荒岛滩地 日

岸边，Serena失声痛哭。

海面翻涌过后，Kane从水中游回岸边，一步步走上沙滩。`
  }
};

export const BUILTIN_TEMPLATES = [DEFAULT_TEMPLATE, ZHIHU_YANXUAN_MANJU_TEMPLATE];

export function builtinTemplateById(id){
  const normalized=String(id||"default");
  return BUILTIN_TEMPLATES.find(template=>template.id===normalized)||null;
}

export function builtinTemplateSummary(template){
  return {
    id:template.id,
    name:template.name,
    kind:template.kind,
    source:"builtin",
    analysis:{
      planningSections:template.planningSections,
      inferredScriptFormat:template.scriptFormat,
      sourceAnalysis:template.sourceAnalysis
    }
  };
}
