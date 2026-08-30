export const DEFAULT_TEMPLATE = {
  id:"default", name:"默认专业短剧模板（小说转剧本）", kind:"builtin", version:5,
  planningSections:[
    {id:"planning",order:1,title:"故事策划",required:true,fields:["title","framework","worldbuilding","synopsis","core_expectations"]},
    {id:"characters",order:2,title:"人物人设",required:true,fields:["role","name","age","personality","biography","image_prompt","reference_image_optional"]},
    {id:"cards",order:3,title:"卡点与硬约束",required:true,fields:["total_episodes","card_1","card_2","card_3","hard_constraints"]}
  ],
  scriptFormat:{
    episodeHeading:"EP01",
    sceneHeading:"场次序号 外/内 地点 日/夜",
    dialogue:"角色名：台词",
    voiceOver:"角色名 V.O.：画外音；角色名 OS：内心独白，均不使用括号",
    action:"环境、动作、表情及可见结果使用独立短段落，只写镜头能够拍到的内容",
    notes:"仅在确有制作必要时使用【蒙太奇】等方括号提示",
    novelCharacters:{min:2000,ideal:2500,max:3000},
    targetCharacters:{min:1500,ideal:1750,max:2000},
    novelAcceptance:{min:2000,max:4000},
    scriptAcceptance:{min:1000,max:2000},
    targetScenes:{min:1,ideal:2,max:3},
    rules:[
      "标题独立一行写 EP01；卡点集可写 EP09【一卡】",
      "场次标题独立一行：序号 + 外/内 + 具体地点 + 日/夜，例如：2 外 城中村街道 日",
      "每个动作段只承担一个清晰的可拍摄信息单位，以人物、环境或道具的可见变化为主",
      "一集围绕一条连续因果链展开：当前问题→人物行动→阻力或结果→新问题；不把逐集框架字段改写成说明文",
      "对白必须在当下有行动目的，如请求、拒绝、试探、威胁、隐瞒或做决定；不让人物讲解观众已经看到的事",
      "对白为“角色名：台词”，单独成段，不在台词后加括号神态",
      "系统播报当作可听见的特殊角色，使用“系统音：”并统一称呼",
      "系统音只播报本集必须确立的规则或奖励，不擅自新增等级、声望、任务、次数或其他数值系统",
      "必要神态写成独立可见反应，仅在它传递新信息或改变关系时保留",
      "禁止使用瞳孔骤缩、眼睛一亮、眼中闪过、眼神一沉、嘴角上扬、眉头一皱、倒吸凉气等套路化微反应；握紧拳头属于可拍动作，可在确有剧情作用时使用",
      "正文不使用任何圆括号或小括号；V.O./OS 直接写在角色名后；方括号只保留极少量必要蒙太奇提示",
      "开头立即承接上集悬念或进入当前危机，不回顾前情；结尾在危险、发现或强反应出现后立即停止，不做总结",
      "先生成2000–3000字、采用05所选叙事人称的小说中间稿，再转换为1500–2000字剧本；严格1–3场"
    ],
    sampleExcerpt:`EP02

1 外 近海海面下 日

海水浑浊冰冷，Kane手中紧握着断裂的钢板尖角，被鲨鱼拖着不断下沉。

鲨鱼张开巨口不断逼近，锋利牙齿蹭过他的脖颈。

Kane：去死！

Kane发力将钢板尖角刺向鲨鱼眼球。鲨鱼剧烈挣扎，尾鳍狠狠拍打四周海水。

2 外 荒岛滩地 日

岸边，Serena失声痛哭。

海面翻涌过后，Kane从水中游回岸边，一步步走上沙滩。`
  },
  sourceAnalysis:{sampleEpisodes:9,averageCharacters:596,minCharacters:367,maxCharacters:712,averageScenes:2.4,totalSceneHeadings:22,totalDialogueLines:72,embeddedCharacterImages:7}
};
