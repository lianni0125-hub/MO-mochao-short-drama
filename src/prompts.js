const shared = `你是中国微短剧项目的专业策划与编剧。严格服从已锁定的硬约束，不擅自改变集数、卡点、人物关系、秘密揭露顺序和结局。输出必须是可执行的专业创作材料，避免空泛评价。`;

const shortDramaEngine = `以下是不可被默认模板或用户模板覆盖的内置短剧叙事引擎：
1. EP01 必须快速交代故事背景、主角身份、核心困境、主角当下的解决思路与明确目标，并尽快进入事件，不以缓慢铺垫开场。
2. EP01采用“长抑短扬”：约65%–80%的有效篇幅用于具体压制、欺负、矛盾升级与主角尝试受阻，让观众充分代入；后约20%–35%才让金手指或核心优势出现，取得反击条件并停在即将打脸的强钩子。EP01没有开场爽点，不得过早让主角翻身。
3. EP02起采用跨集锯齿循环：开场约10%–20%立即承接上一集钩子，完成一次明确打脸或爽点兑现；随后约55%–70%进入新的压制、欺负或矛盾并连续加码；后约15%–25%让主角借助金手指、能力、证据或资源找到破局点，准备下一次打脸；集尾停在可由下一集开场兑现的具体钩子。不能把当集后段写成完整打脸后再另造钩子，也不能让受压贯穿多集而没有开场兑现。
4. 每一集末尾都必须设置具体、可承接的钩子或悬念，例如新危险、新人物、关键信息、迫近选择、反派行动或强烈结果；禁止用“故事才刚刚开始”等空泛句代替钩子。`;

const episodeExecutionEngine = `单集成稿采用对白主导：冲突、信息、立场、选择和关系变化优先通过人物对话正面发生。凡是人物之间存在请求、拒绝、质疑、威胁、试探、隐瞒、羞辱、辩解、讨价还价或作出决定，就必须把关键交锋展开成对白，不能用“双方争执”“他解释一番”“众人嘲讽”等动作或概述代替。一个关键冲突通常至少完成“提出要求或攻击→回应或拒绝→对方拿出压力、证据或后果→人物作出新回应或选择”的有效回合；每句都要改变压力、信息或关系，不能机械凑句。
动作只写演员理解并完成这场戏所必需的内容：每场开头用一至两句建立场地规模、关键区域和主要人物的初始位置；人物因剧情进入、离开、接近、阻拦、拖拽或转移到另一位置；关键道具被使用或易手；造成状态变化的身体行动、危险及其可见结果。空间建立不是气氛描写，必须能回答“谁在哪里、正对谁做什么、入口或关键物件在哪里”。能从对白直接听明白的情绪和关系，不再补神态动作；不为每句对白配动作，不写喝水、起身、转头、看向、沉默片刻等不改变剧情的过程。对白应占正文信息量的主要部分，有限字数优先给关键交锋，而不是环境和动作。
每一条非对白文字必须通过两道检查：第一，摄影机或麦克风能直接记录，演员能按字面执行；第二，删掉后会影响观众理解人物进出、关键道具、身体冲突、危险结果或事件状态。任一道不通过就不写。严禁“心里一沉、心里咯噔一下、咯噔、暗自、内心、以为、误以为、意识到、明白、觉得、认为”等心理判断或作者解释。“咯噔”一类只有心理感受、没有独立信息的文字直接删除，不得改写成 V.O./OS。若误会、犹豫或判断会推动剧情，必须外化成改变局面的动作和对白，例如不要写“男人以为他在犹豫”，而要让男人递近道具并说出新的报价或催促。
严禁在动作段转述人物说过的话。出现“说是、表示、解释、告诉、声称、问道、回答、回应”等语言行为时，必须改写成“角色名：台词”并展开必要回合。例如“说是开过光的”属于人物主张，必须由具体人物直接说出口，不能冒充道具或动作描述。
正文在生成阶段就禁止使用任何圆括号或小括号，包括对白后的语气、神态、动作说明。画外音直接写“角色名 V.O.：”，内心独白直接写“角色名 OS：”，均不得加括号。模板中即使出现圆括号示例，也不得模仿；这条内置规则高于模板。
严格执行05已确认的本集大概内容与“必须发生”因果链：它们规定人物为何出现、为何找主角、事件如何在有限场景内连续升级。不得自行换成更方便但缺少动机的相遇。剧本最后发生的事件必须是“必须发生”最后节点，不得另造、重复或替换钩子。`;

const episodePlanExecutionEngine = `严格按照已生成的单集表演蓝图写成可拍摄剧本。动作与对白的分工服从事件：空间、身体处境、关键道具、危险逼近和动作结果用简洁可见动作；请求、拒绝、质疑、羞辱、威胁、辩解、交易和选择必须写成现场对白，不能由旁白转述。每个非对白段只保留一个摄影机可记录、且删掉会影响事件理解的信息。不得写心理判断、作者解释、无效微动作或任何圆括号；V.O.和OS直接写在角色名后。覆盖蓝图全部节拍，最后准确落到05钩子并立即停。`;

const storyModeRule=(project,stage)=>project.story_mode==="miniprogram"?`【剧情模式｜下沉】
采用真正的小程序风。情绪逻辑高于现实尺度、生理常识和正常人的自保理性：允许亲密关系中的极端施害、身体毁损、囚禁控制、公开羞辱、集体背叛、猎奇装置、恋爱脑纠缠、超常承伤与一轮比一轮离谱的升级。人物可因偏执、占有欲、误会、对白月光或替代者的偏爱、要求受害者懂事等扭曲感情，实施与现实收益严重失衡的伤害；若与普通强烈或异常强烈档中的“现实利益动机、不得无动机发疯”等要求冲突，以本模式为准。
神剧情必须同时具备情绪因果和具体机制，不能只写抽象受虐或把普通争吵换成狠话：先确定受害者最在乎的亲密关系与明确软肋，再让掌握软肋的亲近者明知后果仍将食物、药物、温度、交通工具、医疗程序、婚礼、孩子、遗物、宠物、身份文件或其他贴合当前项目的载体变成伤害工具；让受害者因爱、愧疚、期待、证明忠诚、害怕失去或长期控制而反常配合、忍耐或不肯离开；伤害必须造成夸张且可见的后果，随后揭开施害者真正目的竟是讨好别人、制造机会、替人出气、腾出位置、验证服从或其他与代价严重失衡的自私需求。不得机械照抄固定桥段，必须依据本项目人物软肋、关系和场域重新组合出具有传播性的具体事件。
反派或亲近者不能只承认自己恶毒，必须用冠冕堂皇的歪理把牺牲包装成爱、还情、懂事、赎罪、成全或理所当然。关键交锋采用“受害者提出最低限度的正常诉求→对方用更荒谬的理由拒绝→另一位亲友或利益相关者站队补刀→揭开更深一层背叛”的逐层升级；每次回答都要新增事实、加重代价或改变关系，不能只是重复辱骂。受害者可在遭受不可原谅的伤害后仍因执念、误会或最后一点期待继续纠缠，直到最信任的人也背叛、最后一次期待落空。
${stage==="outline"?"05负责发明并锁定上述神剧情。重要虐点应明确写出：被利用的软肋、具体伤害载体、受害者为何反常配合、施害者用什么歪理要求牺牲、谁继续站队补刀、产生什么可见后果、背后荒谬私利何时揭开。每个阶段轮换身体伤害、情感背叛、亲友背刺、身份剥夺、孩子或亲情掠夺、财产生存权剥夺、公共羞辱、极端装置惩罚等不同维度，避免整本只重复同一种虐法。关键节点后让受害者或主角突然作出同等级、立即生效且改变关系的反常决定；必须写清具体行动，不能只写心灰意冷、决定反击或以后报仇，并用该行动或其即时后果形成可承接钩子。":"06只负责把05已经锁定的软肋、伤害载体、反常配合、歪理、补刀、可见后果、荒谬私利和反常决定完整展开。不得主动合理化、降级成普通争吵、替人物恢复正常理性，也不得临时另造新的重大酷刑或背叛抢走既定事件链；对话要逐层揭露，每一轮都新增事实、代价或关系变化。只要05没有明确规定长期残疾、永久失去能力或持续昏迷，严重伤势默认可快速恢复并继续剧情，不补写治疗过程或现实医学解释。"}
小程序风只放宽现实尺度、生理恢复与人物情感理性，不放宽姓名、身份、首登场集、人物知情、金手指持有者、秘密揭露顺序、道具归属、必须发生链条和集尾钩子的连续性。当前情绪强度只决定对白、羞辱、压迫与反扑的表达密度：选择“强烈”也不得削弱05既定的离谱事件，选择“异常强烈”也不得越过05临时新增重大伤害。`:"";

const stageOrder = ["idea", "planning", "characters", "cards", "outline"];
const writingCharacters=artifacts=>(artifacts.find(x=>x.type==="characters")?.content?.characters||[]).map(({role,name,age,personality})=>({role:role||"",name:name||"",age:age||"",personality:personality||""}));
const novelContextText=value=>String(value??"").replace(/[“"]([^”"\n]+)[”"]/g,"「$1」").replace(/[（）()]/g,"").trim();
const numberedRequiredPlot=value=>{
  const items=novelContextText(value).split(/→|[；;\n]+/).map(item=>item.trim()).filter(Boolean);
  return items.length?items.map((item,index)=>`节点${index+1}：${item}`).join("\n"):"无";
};
const novelCharacterText=characters=>characters.map((c,index)=>`${index+1}. ${novelContextText(c.name)||"未命名人物"}｜${novelContextText(c.role)||"角色"}｜${novelContextText(c.age)}｜性格：${novelContextText(c.personality)}`).join("\n")||"无额外人设";
const storyStateUsageGroups = [
  {tag:"NOW",title:"当前仍需处理",categories:new Set(["unresolved","goal"]),rule:"仅表示本集开场仍存在的压力或未完成事项；只有与本集必须发生直接相关时才影响人物行动，不得照抄状态原句。"},
  {tag:"CONTINUE",title:"持续条件",categories:new Set(["relationship","prop","capability"]),rule:"仅用于保持关系、关键道具归属和既有能力连续；不是本集必须展示的事件，不得重新讲述获得过程。"},
  {tag:"BEFORE",title:"此前已成立",categories:new Set(["system","knowledge","foreshadow"]),rule:"这些信息或系统状态在本集开始前已经成立；只作为前置条件，不得重复揭露、重复奖励、重复解锁或原句复述。"},
  {tag:"BACKGROUND",title:"背景事实",categories:new Set(["fact","identity"]),rule:"只用于避免前后矛盾；不得为了交代背景而额外制造对白、动作或剧情。"},
  {tag:"REFERENCE",title:"人物参考",categories:new Set(["character"]),rule:"只有本集既定事件已经调用该人物时才参考；不得为覆盖档案而强行安排其出场。"}
];
const novelStateText=states=>{
  if(!states?.length)return "无，这是首集或尚未形成连续性状态";
  return storyStateUsageGroups.map(group=>{
    const items=states.filter(item=>group.categories.has(String(item.category||"")));
    if(!items.length)return "";
    return `【${group.tag}｜${group.title}】\n使用规则：${group.rule}\n${items.map(item=>`- ${novelContextText(item.subject||item.category)}：${novelContextText(item.value)}`).join("\n")}`;
  }).filter(Boolean).join("\n\n");
};

const constraintScopeLabel=item=>item.episode_start?item.episode_end&&Number(item.episode_end)!==Number(item.episode_start)?`EP${String(item.episode_start).padStart(2,"0")}–EP${String(item.episode_end).padStart(2,"0")}`:`EP${String(item.episode_start).padStart(2,"0")}`:"全剧";
const constraintsInRange=(constraints,range=null)=>(constraints||[]).filter(item=>item.kind==="hard"&&item.category!=="card").filter(item=>{
  if(!range||!item.episode_start)return true;
  const start=Number(item.episode_start),end=Number(item.episode_end||item.episode_start);
  return start<=Number(range.end)&&end>=Number(range.start);
}).map(item=>({...item,scope:constraintScopeLabel(item),description:`【适用${constraintScopeLabel(item)}】${item.description}`}));
const hardConstraintText=(constraints,range=null)=>constraintsInRange(constraints,range).map(item=>`- ${item.description}`).join("\n")||"无";

function context(stage, project, constraints, artifacts, evidence = [], range = null) {
  const stageIndex = stageOrder.indexOf(stage);
  const allowedArtifacts = stage==="characters"
    ? artifacts.filter(artifact=>["idea","planning","characters","character_brief"].includes(artifact.type))
    : ["episode","quality","state_update"].includes(stage)
    ? artifacts.filter(artifact=>["idea","planning","characters","cards"].includes(artifact.type))
    : stageIndex < 0 ? artifacts
    : artifacts.filter(artifact => stageOrder.indexOf(artifact.type) < stageIndex);
  const compact = artifact => {
    if(artifact.type==="control_settings")return {type:"control_settings",content:{card_points:artifact.content?.card_points||"未指定"}};
    if(!["episode","quality","state_update"].includes(stage))return {type:artifact.type,content:artifact.content};
    if(artifact.type==="idea")return {type:"idea",content:{core_hook:artifact.content?.core_hook,protagonist_goal:artifact.content?.protagonist_goal,approved_idea:artifact.content?.approved_idea}};
    if(artifact.type==="characters")return {type:"characters",content:{characters:(artifact.content?.characters||[]).map(c=>({role:c.role,name:c.name,age:c.age,personality:c.personality,biography:c.biography}))}};
    return {type:artifact.type,content:artifact.content};
  };
  const effectiveHardConstraints=stage==="state_update"?[]:constraintsInRange(constraints,range);
  return JSON.stringify({
    project: { title: project.title, tags: project.tags, totalEpisodes: project.total_episodes, audience: project.audience, platform: project.platform, restrictions: project.restrictions, seed: project.seed, storyMode:project.story_mode||"normal", ...(["episode","quality"].includes(stage)?{emotionIntensity:project.emotion_intensity||"strong"}:{}) },
    hardConstraints: effectiveHardConstraints,
    approvedArtifacts: allowedArtifacts.filter(x => x.status === "approved").map(compact),
    ideaEvidence: evidence
  }, null, 2);
}

export function buildStagePrompt(stage, project, constraints, artifacts, evidence = [], range = null) {
  const tasks = {
    idea: `诊断创意缺口，结合证据但不要照搬作品或热点，提出并整合一个可支撑全剧的创意。字段：diagnosis、market_fit、differentiation、core_hook、protagonist_goal、sustained_conflict、relationship_engine、story_promise、approved_idea。`,
    planning: `仿照当前专业模板的信息密度，生成可直接定案的极简策划，不要写成分析报告。只输出五个字段：1.title：一个有网感、有记忆点、适合短视频平台传播的中文短剧标题，通常 6–16 个汉字；优先抓住主角身份反差、核心机制、极端处境或强爽点，可使用口语化悬念、身份反转或利益承诺，但必须准确对应本剧。禁止空泛的“逆袭人生”、无关热词、标点堆砌、多个备选和照搬现有作品名。2.framework：单行，约 6–8 个节点，用“→”连接，不超过 160 字。3.worldbuilding：必须是字符串，只写 3–5 行，每行为“短标签：一至两句设定”，总计不超过 350 字。4.synopsis：只写 2 个短段落，第一段写开局与主要发展，第二段写反转与结局方向，总计 180–300 字。5.core_expectations：只写一句话，高度概括全剧反复兑现的核心期待。句式为“主角依靠【核心手段/机制】，自身获得【成长】，逐步完成【核心目标】。”约 25–50 字。不用箭头，不列清单，不展开升级细节，不写阴谋、反转、结局、主题或观众分析。禁止输出对标分析、市场评价、创作理由、抽象方法论、字段说明或重复概括。`,
    benchmark: `完成正式策划第1部分“对标和改编”。字段：benchmark_works（作品、平台、集数、标签、仅作哪一维度参考）、adaptation_direction、framework（完整走向链）、worldbuilding（时代地域、场域、规则、危机、势力、隐藏真相）、character_direction、ai_spectacles（适合AI视觉化的大场景）。对标作品如无检索证据必须标记为模型建议，不冒充市场事实。`,
    synopsis: `完成正式策划第2部分“故事梗概”。梗概必须能覆盖全剧而非只写开头。字段：opening_state、inciting_incident、core_mechanism、development、conspiracy_or_reversal、ending_direction、synopsis。`,
    cards: `完成正式策划第3部分“集数和付费卡点”。严格采用项目总集数和用户硬约束。字段：total_episodes、card_1、card_2、card_3；每个卡点包含 position、paywall、buildup、event、state_change、promise、next_phase。未设置三卡时明确写无。`,
    expectations: `完成正式策划第4部分“核心期待”与第5部分“画面对标”。字段：core_expectations（观众持续期待的核心爽点/情绪回报/视觉变化）、visual_references（作品名、参考维度、source_type=model_suggestion、verified=false）。不得把模型联想伪装成RAG证据。`,
    characters: `根据已确认的02故事策划生成核心人物卡，默认 4–8 人。顶层只包含 visual_style 和 characters。若上下文存在 character_brief，它是用户的“人物补充要求”：可以是指定人物、人设灵感、需要AI补全的部分或希望增加的角色，必须在02策划范围内落实，不得借此改写主线。首次生成时，先落实用户明确指定的人物，再补齐主线必需的人物。若上下文已有 characters，这是后续重新生成：保留现有人物的姓名、核心定位和不冲突设定，只按 character_brief 明确调整或增加，其他人物只做合理补全；不得默默删除现有人物。visual_style 是全剧所有人物共用的视觉基准，必须从02的框架、世界观和故事梗概提取时代地域、核心场域、题材气质、真人短剧质感、统一色彩与光线；写成80–160字，不含任何单个人物特征。characters 数组中每人只包含 role、name、age、personality、biography、image_prompt。personality 简洁具体；biography 写清身份、与主线的关系、全剧作用与结局方向。image_prompt 只写该人物独有且能被画面直接呈现的特征：明确年龄与性别呈现、体型比例、脸型与五官、肤色、发型、符合时代/地域/职业/经济状况的分层服装及材质颜色、鞋履、一个有身份意义的配饰或道具、克制而明确的站姿与表情；不得用“善良、腹黑、气场强大”等抽象性格词替代外观，不写剧情动作，不出现第二个人，不使用在世真人或明星脸。全身人物设定图的构图和禁用项由系统在生图时统一追加，不要在每个人的 image_prompt 中重复。`,
    skeleton: `先确定核心主线、核心冲突、关键秘密和结局，再规划一卡/二卡/三卡。每个卡点写清位置、前置积累、事件、状态改变、续看承诺、后续阶段。字段：main_plot、core_conflict、key_secrets、ending、cards、phases。`,
    outline: `将已批准的故事策划、人物人设、卡点和硬约束展开为完整分集梗概，必须恰好包含项目总集数。每集字段：episode_no、title、summary、hook、required_plot、must_not_reveal、purpose、start_state、end_state、must_reveal、rhythm、emotion、card_relation。summary 简洁写清本集发生什么，并严格执行内置跨集锯齿节奏：EP01大比例受压，后段仅获得金手指或反击条件；EP02起开场先兑现上一集准备的打脸，随后大比例进入新压制，后段再获得破局点并准备下一集打脸。hook 必须是下一集开场可以直接兑现的具体动作、证据、能力机会或对峙局面。required_plot 从 summary 和 hook 提炼按发生顺序排列的可拍事件链；EP02起必须参考上一集 required_plot，其最后一项就是上一集钩子。本集第一项不是“承接动作”或“反击准备”，而必须直接完成该钩子的爽点兑现：主角用上一集已经准备好的能力、证据、资源或行动当场反击，并写清对手丢脸、认输、受损、被迫退让或局势翻转等可见结果。禁止把“亮出证据、发动能力、来到现场、准备出手、对手震惊”等尚未产生结果的动作单列为第一项；这些动作与打脸结果合并成同一个首节点。如果本集 summary 没有明写这次兑现，仍必须根据上一集钩子补出最小、直接、不改变后续走向的兑现事件；这是唯一允许超出本集 summary 字面的补充。紧接着用兑现造成的结果自然过渡到本集 summary 的第一个既定事件，之后不得继续扩写额外支线。后续仍严格保持“大部分新压制→后段获得破局点→下一集打脸钩子”的既定比例。EP01不适用此规则。must_not_reveal 写本集只能铺垫、不能提前说破的信息；确实没有时只写“无”，有多项时必须在同一行用中文分号“；”连接，禁止编号、项目符号和换行。`,
    episode: `撰写指定单集微短剧。这些是不随模板切换的内置底线：只写观众能看到或听到的内容；不写文学性心理、作者解释、主题概括、镜头参数、导演指令、演员教学或时长说明；不为凑篇幅堆砌转头、点头、皱眉、握拳等无效微动作；硬性禁用瞳孔骤缩、眼睛一亮、眼中闪过、眼神一沉/一凛、嘴角上扬、眉头一皱、脸色一变、倒吸凉气等套路化反应词。握紧拳头不是禁词，但只有它会改变交锋或推动剧情时才写。情绪只在观众必须知道人物当前状态时，用身体发抖、表情惊慌、动作停下等朴素可见结果表达；动作、环境、道具、反应和对白必须用于推进事件、传递必要信息、改变关系或制造危机；不重复上一集已完成的事件，不提前泄露后续集的信息；本集必须发生明确的状态变化，结尾停在新危险、新发现、新选择或强烈反应上。具体的 EP 标题、场次格式、篇幅、场数和声音标注服从当前选中的模板；文风、情绪、节奏和剧情逻辑始终服从内置创作规则，不受模板影响。任何圆括号或小括号始终禁止，模板不得覆盖。只输出剧本成稿。`,
    state_update: `从刚完成的小说中间稿与最终剧本中更新精简的连续性账本。它同时记录“动态状态”和“高连续性价值的具体事实”，不是剧情摘要。

字段为 items 数组；每项含 category、subject、value、status。category 仅限：fact（连续性事实）、knowledge（已揭露信息）、relationship（关系变化）、capability（非系统的能力或身份变化）、system（系统状态）、character（次要人物档案）、prop（关键道具归属）、unresolved（未解决事件）。status 仅限 active、resolved、replaced。

必须记录两类信息：
1. 动态状态：新获得或失去的道具、已知秘密、关系变化、非系统的能力身份变化、系统状态、尚未解决或本集解决的事件。
2. 连续性事实：即使本集没有“变化”，只要未来可能再次使用、写错会造成明显矛盾、会影响人物选择关系或现实压力，就记录。包括具体病症与住院地点、学校和年级、公司与职位、住址、亲属婚姻、债务费用、约定日期地点金额、关键经历和其他稳定身份锚点。保留原文中的准确名称、数字、时间、地点和诊断。

3. 系统状态：category 使用 system，subject 固定使用剧中系统或机制的正式名称。value 必须是本集结束时的完整当前快照，整合并保留旧快照中仍有效的内容，包括绑定对象、积分/经验/等级/好感/战力等由系统维护的数值、已解锁技能及等级、当前任务与进度、持续增益或惩罚、仍在指导主角行动的当前系统建议或指引。积分增减要写更新后总值，不只写“+10”。金钱、年龄、日期等普通现实数字不属于 system。系统的“解锁清单和数值”归 system；人物已经可以实际使用的能力另记 capability，只写能做什么、已知限制和使用条件，不重复积分等系统账本数值。system 只输出 active 完整快照。

4. 次要人物：category 使用 character，只记录03已批准主要人设之外、且在最终剧本的人物标识中具有明确姓名的角色。人物必须以姓名作为对白前缀或具名行动者实际出现在剧本中，例如“阿龙：……”或“王叔走到摊前”；subject 直接使用该姓名。无名泛称或描述性标识一律不记录，包括“中年男人、灰色背影、司机、护士、路人、混混、系统音”等，即使其当场有动作或对白也不能建立人物档案。输出前遍历剧本的具名对白者和具名行动者，不得遗漏有姓名且参与事件的人物。value 只保留最终剧本或已有账本明示的身份/职业、稳定背景及与主要人物的基础关系；不记录本集暂时动作、情绪、外貌印象和未解决事件。严禁根据穿着猜年龄，严禁自行推断年龄、阵营、职位、隶属、性格或背景。character 只输出 active 完整快照。

5. 能力或身份变化：category 使用 capability，每一项能力或现实身份使用独立、稳定的 subject，例如“翡翠鉴定能力”“相术技能”“签约鉴宝师身份”。value 记录持有人、实际作用、明示限制或对外身份；不写系统积分、等级或解锁日志。

6. 人物关系：category 使用 relationship，subject 必须同时写出双方，固定格式为“人物A ↔ 人物B”，不得只写其中一人。A与B、B与A属于同一关系。value 必须是本集结束时的完整当前关系快照，保留仍有效的雇佣、合作、信任、利益、敌对、胁迫、亲属或情感层次，而不只写本集新发生的一个变化。relationship 只输出 active 完整快照；新快照会以版本方式替代旧快照。

输出前必须执行一次“明确实体＋精确属性”强制扫描。只要小说或剧本明确给出具名人物、明确亲属、学校、医院、公司、机构或关键物品，并同时给出下列任一精确信息，就默认具有高连续性价值，必须输出或并入已有条目的更新：真实姓名、年龄、具体病症、病因、治疗方式与频率、学校与年级班级、单位与职位、住址、亲属关系、日期时间、地点房号、金额、编号、固定周期或其他可核对属性。信息通过人物对白说出也必须扫描，不能因为它没有形成新动作、像背景介绍或本集暂未再次使用而忽略。精确属性必须与它所属的实体在同一句原文或无歧义的相邻指代链中共现；严禁把不同场景、不同机构或不同物品的区域、房号、编号、金额拼接到另一实体。

若本集为现有泛称角色补出了姓名或更精确信息，例如已有“方野母亲病情”，本集出现“陈秀兰女士，52岁，糖尿病引发肾衰竭，每周透析三次”，必须识别为同一实体并更新原有主体，不得跳过，也不得另建含义重复的“陈秀兰病情”。更新后的 value 应完整保留姓名、年龄、病因、病症和治疗频率等互不冲突的精确信息。医院床位、欠费、缴费期限等仍在持续的现实压力另记 unresolved，不与稳定病情混在一起。

不要把同一事项混成一条：稳定事实与待解决压力应拆开。例如“母亲患尿毒症并住在市一院”记 fact；“三天内需补交两万元”另记 unresolved。prop 只记录最终剧本明确赋予跨集剧情功能的物品，例如证据、契约、信物、任务目标、能力载体，或明确约定后续必须使用的关键物；subject 使用稳定物品名，value 记录持有人、关键内容和集尾持续状态。普通生活用品、职业工具、摆摊物件、钱币、衣物，以及只在当场被拿起、扔下、弄脏、损坏或捡回的物品都不记录；铜钱、罗盘这类普通算命道具默认不记录，除非剧本明确将其设为后续关键线索或能力载体。一次性场景装饰、普通动作、短暂情绪、无后续作用的路人或地点不记录。

最终剧本是本次提炼唯一允许使用的剧情事实来源；不得读取、补充或推断小说中间稿独有的信息。每个 subject 和 value 都必须是脱离当前页面仍能独立理解的状态快照，禁止出现“本集”这种相对指代；直接写已经成立的事实、当前结果或尚未解决的问题，不写“本集新增、本集验证、本集结束时”等过程标签。任何推测性信息都不得作为事实或人物档案记录，包括带有“看起来、疑似、似乎、好像、可能是”等含义的判断；只有最终剧本或已有账本明确确认后才能记录。当前账本中未变化的项目不要重复输出，但剧本中新出现的姓名、年龄、病症、学校、职位等精确属性属于对旧条目的有效更新，不能当作“没有变化”而略过。必须逐条检查已有 unresolved：若最终剧本已明确展示索赔被撤回、威胁者退让且当前威胁解除、债务付清、目标完成或问题以其他可见结果结束，必须沿用已有 category 与 subject 输出 resolved；只是暂时离场、口头拖延、风险仍可能继续时不得判定解决。要替换或补全旧状态时，先以相同 category 与 subject 输出 replaced，再以相同 category 与 subject 和包含新旧有效信息的新 value 输出 active。新增 subject 使用短而稳定的实体或事项名称，避免换同义称呼。通常0–20项，人物和系统项不得因项数上限被省略；没有值得延续的内容则返回空数组。`,
    quality: `检查文本是否违反硬约束、人物设定、秘密揭露顺序、连续性、短剧叙事引擎和专业格式；尤其检查本集是否有实际事件推进与具体结尾钩子。字段 passed、issues（severity/category/message）、suggestions。`
  };
  const engine = ["outline", "episode", "quality"].includes(stage) ? `\n\n${shortDramaEngine}${["episode","quality"].includes(stage)?`\n\n${episodePlanExecutionEngine}`:""}` : "";
  return `${shared}${engine}\n\n当前任务：${tasks[stage]}\n\n项目上下文：\n${context(stage, project, constraints, artifacts, evidence, range)}`;
}

export function buildOutlineSpinePrompt(project,constraints,artifacts){
  return `${shared}
${shortDramaEngine}
${storyModeRule(project,"outline")}
项目输入：${context("outline",project,constraints,artifacts)}

现在只规划覆盖全剧的“因果坐标”，不要写详细分集梗概、对白、场次或必须发生。宏观材料必须先被翻译成可持续推进的戏剧资源：人物现实目标与软肋、对手可采取的施压手段、金手指成长边界、关键关系、秘密揭露顺序、卡点及结局。

为EP01至EP${project.total_episodes}逐集给出：episode_no、phase、inherited_state、dramatic_task、state_change、ending_action、future_boundary、first_appearance_characters。
- inherited_state：本集开场前已经成立且本集必须承接的局面，不写未来事实。
- dramatic_task：本集唯一主要冲突及其现实利益，不写空泛“推进主线”。
- state_change：本集结束时必须产生的新增变化，不能与开场相同。
- ending_action：结尾具体发生的动作、证据、选择或危险，下一集能直接承接。
- future_boundary：本集绝不能提前使用的后续秘密、人物认知、打脸或结果。
- first_appearance_characters：只列03主要人物中在该集第一次真正进入现场并参与行动或对白的人物姓名；多人用中文分号连接，没有则写“无”。必须为每名主要人物确定且只确定一次首登场集，未到该集不得让其提前进入现场；仅被别人提及不算出场。

全剧必须形成连续因果：上一集ending_action直接制约下一集inherited_state；已经完成的事情不得重复执行；秘密、能力、关系、道具、地点和人物认知不得无因跳变。EP01长抑短扬，EP02起开场兑现上一集钩子后进入新压制，阶段卡点和结局严格服从已批准材料。只返回JSON。`;
}

export function buildOutlineDramaticBatchPrompt(project,constraints,artifacts,spine,currentSpine,previousFinal,nextSpine){
  return `${shared}
${shortDramaEngine}
${storyModeRule(project,"outline")}
项目输入：${context("outline",project,constraints,artifacts,[],{start:Math.min(...currentSpine.map(item=>Number(item.episode_no))),end:Math.max(...currentSpine.map(item=>Number(item.episode_no)))})}

你正在把全剧因果坐标中的一个小窗口设计成真正有戏的短剧分集，不是一次完成最终字段。

【全剧因果坐标｜只用于防止吃书】
${JSON.stringify(spine,null,2)}

【当前窗口｜必须详细设计】
${JSON.stringify(currentSpine,null,2)}

【此前已经确定的末尾｜只承接，不重写】
${JSON.stringify(previousFinal,null,2)}

【下一窗口边界｜只用于留戏，不得提前兑现】
${JSON.stringify(nextSpine,null,2)}

每集返回episode_no、title、dramatic_design、summary、hook、purpose、start_state、end_state、rhythm、emotion、card_relation、first_appearance_characters。first_appearance_characters必须逐字照搬当前全剧因果坐标，不得增删或移集。

dramatic_design必须依次写清：开场即发生的危机；人物初始位置与现实目标；对手基于利益抓住什么软肋并采取什么具体施压行为；人物怎样应对；压力怎样升级并造成钱、机会、证据、关系、身体安全或行动空间上的可见后果；人物被迫作出什么选择；转机或爽点如何出现；怎样停在具体钩子。不要用“发生争执、遭到刁难、矛盾升级、主角反击”等栏目式概括代替事件。

短剧应尽可能晚地进入场景：直接从危机已经开始的动作切入，背景借冲突中的行动和信息交锋交代，不写赶路、寒暄、观察环境和与本集选择无关的日常铺垫。每一步必须由上一步的结果触发；反派的坏落实为有目的的行为、被利用的软肋和实际后果，不靠辱骂或无理由发疯。

summary再把dramatic_design压缩成一段简洁、连贯、有因果的本集大概内容；保留具体行动、软肋、升级、选择和结果，不写分析标签。hook必须等于因果坐标的ending_action所要求的本集落点，不得另造第二个结尾。只返回JSON。`;
}

export function buildOutlineFinalizePrompt(project,constraints,artifacts,spine,currentSpine,drafts,previousFinal,nextSpine){
  return `${shared}
${shortDramaEngine}
${storyModeRule(project,"outline")}
项目输入：${context("outline",project,constraints,artifacts,[],{start:Math.min(...currentSpine.map(item=>Number(item.episode_no))),end:Math.max(...currentSpine.map(item=>Number(item.episode_no)))})}

你是分集梗概连续性编辑。核对下面这批戏剧设计，修正后直接返回最终分集字段；不要输出检查报告。

【全剧因果坐标】${JSON.stringify(spine,null,2)}
【当前坐标】${JSON.stringify(currentSpine,null,2)}
【上一批末尾】${JSON.stringify(previousFinal,null,2)}
【待核对草稿】${JSON.stringify(drafts,null,2)}
【后续边界】${JSON.stringify(nextSpine,null,2)}

逐集检查：上一集钩子是否直接成为下一集开场局面；已完成事件是否被重复；人物地点、认知、关系、能力、道具与秘密是否无因跳变；开场是否有无效铺垫；施压是否有具体行为、软肋与可见后果；每一步是否由前一步触发；本集状态是否真的改变；后续秘密和打脸是否提前使用。只修有问题处，不改变全剧坐标和卡点。

每集只返回episode_no、title、summary、hook、purpose、start_state、end_state、required_plot、must_reveal、must_not_reveal、rhythm、emotion、card_relation、first_appearance_characters。first_appearance_characters必须逐字照搬当前全剧因果坐标，不得增删或移集。
required_plot必须从已经核准的summary与hook中提炼4–7个不可遗漏的可表演事件节点，用“→”连接。节点写具体人物行动及可见变化，不写静态身份、分析标签或空泛任务；最后节点就是hook。EP02起首节点必须直接兑现上一集hook并写出可见结果，不能停在准备动作。
must_not_reveal只写当前窗口明确留到后续的具体信息；没有则写“无”，多项用中文分号连接。summary保持一小段连贯叙述，不把字段分析写进页面。只返回JSON。`;
}

export function buildCharacterImagePromptPrompt(project, artifacts, character, index, existingVisualStyle="") {
  const planning=artifacts.find(x=>x.type==="planning")?.content||{};
  const characters=artifacts.find(x=>x.type==="characters")?.content?.characters||[];
  return `${shared}

任务：只为第 ${index+1} 位人物重新生成适配 MiniMax image-01 的人物形象提示词，同时保持全剧视觉统一。

先依据02故事策划确定全剧共用 visual_style。它只包含时代地域、核心场域、题材气质、真人短剧的摄影质感、统一色彩和光线，不得混入任何单个人物的年龄、长相或服装。若“现有统一风格”非空，必须原样返回，不得改写，以免人物画风漂移。

image_prompt 只描述当前人物独有、可直接看见且彼此不矛盾的特征：
1. 明确年龄、性别呈现、体型和身高比例；五官必须具体到脸型、眉眼、鼻唇、肤色与皮肤质感；发型写清长度、形状和颜色。
2. 服装必须符合02的时代地域，以及人物职业、身份和经济状况；写清上装、下装、外层、材质、主辅色、磨损或整洁程度、鞋履。最多保留一个有身份意义的配饰或手持道具。
3. 只写一个人物的静态设定照。姿态与表情具体、克制、可执行，不写奔跑、打斗、多人互动或剧情场面。
4. 禁止明星姓名、相似某明星、抽象人格评价、互相冲突的外观、夸张网红磨皮、动漫化描述。不要把统一画风重复塞进 image_prompt。

只输出 JSON：visual_style 和 image_prompt。visual_style 80–160字；image_prompt 120–260字。

项目：${JSON.stringify({title:project.title,tags:project.tags,seed:project.seed},null,2)}
02故事策划：${JSON.stringify(planning,null,2)}
现有统一风格：${existingVisualStyle||"（尚未建立，请从02生成）"}
当前人物：${JSON.stringify(character,null,2)}
其他人物仅用于避免造型雷同：${JSON.stringify(characters.map((c,i)=>i===index?null:{name:c.name,role:c.role,age:c.age,image_prompt:c.image_prompt}).filter(Boolean),null,2)}`;
}

export function buildPlanningSectionPrompt(section, project, constraints, artifacts) {
  const planning = artifacts.find(x => x.type === "planning")?.content || {};
  const idea = artifacts.find(x => x.type === "idea")?.content || {};
  const rules = {
    title: `只重写 title。生成一个有网感、有记忆点、适合短视频平台传播的中文短剧标题，通常 6–16 个汉字。优先突出主角身份反差、核心机制、极端处境或本剧最强爽点，可采用口语化悬念、身份反转或利益承诺；必须准确对应现有框架、世界观、梗概和核心期待。禁止空泛的“逆袭人生”、无关网络热词、标点堆砌、多个备选、解释标题或照搬现有作品名。`,
    framework: `只重写 framework。必须是单行字符串，用“→”连接 6–8 个节点，不超过 160 字。保留现有世界观、故事梗概和核心期待已确定的事实，只优化全剧走向链。`,
    worldbuilding: `只重写 worldbuilding。必须是字符串，只写 3–5 行，每行“短标签：一至两句设定”，总计不超过 350 字。不改变现有框架、故事主线和核心期待，不新增会改写主线的重大设定。`,
    synopsis: `只重写 synopsis。必须是字符串，只写两个短段落，总计 180–300 字。第一段写开局与主要发展，第二段写反转与结局方向。严格遵循现有框架、世界观和核心期待，不另造一个故事。`,
    core_expectations: `只重写 core_expectations。必须是一句约 25–50 字的字符串，句式为“主角依靠【核心手段/机制】，自身获得【成长】，逐步完成【核心目标】。”不用箭头，不列清单，不展开升级细节，不写阴谋、反转、结局、主题或观众分析。`
  };
  if (!rules[section]) throw new Error("未知的策划字段");
  return `${shared}\n\n任务：${rules[section]}\n只输出包含 ${section} 的 JSON 对象，不输出其他字段。\n\n项目基础：\n${JSON.stringify({title:project.title,seed:project.seed,totalEpisodes:project.total_episodes,tags:project.tags},null,2)}\n\n已确认创意：\n${JSON.stringify(idea,null,2)}\n\n当前故事策划（除目标字段外均为不可改动的上下文）：\n${JSON.stringify(planning,null,2)}\n\n硬约束：\n${JSON.stringify(constraints.filter(x=>x.kind==="hard"),null,2)}`;
}

export function buildEpisodeBoundariesPrompt(summary, hook, episodeNo=0, previousRequiredPlot="", constraints=[]) {
  const continuity=Number(episodeNo)>1?`本集是EP${String(episodeNo).padStart(2,"0")}。生成“必须发生”时，必须参考上一集事件链，上一集最后一项就是上一集钩子。本集第一项必须直接完成这个钩子的爽点兑现，而不是只写承接、准备或出手：把主角使用上一集已备好的能力、证据、资源或行动，与对手丢脸、认输、受损、被迫退让或局势翻转的可见结果合并为同一个首节点。禁止以“亮出证据、发动能力、来到现场、准备出手、众人震惊”等尚未产生结果的动作作为第一项。当本集梗概没有明写兑现时，爽点兑现优先，必须依据上一集钩子补出最小、直接、不改变本集后续走向的兑现事件；这是唯一允许超出本集梗概字面的补充。第二节点必须利用这次兑现的结果，自然过渡到本集梗概的第一个既定事件；之后完全回归本集梗概，并继续执行“大部分新压制→后段破局→下一集钩子”。不得重复钩子、跳时空、换冲突、重新铺垫或借兑现新增支线。`:"本集是EP01，不需要承接上一集事件链。";
  return `你是微短剧的写作边界编辑。主要根据下面给出的“本集大概内容”和“集尾钩子”提炼两个字段；上一集链条仅用于确定本集开头如何承接，不得挪用上一集其他事件。

【必须发生】应尽可能完整提取所有不可遗漏的可拍事件，包括关键人物行动、冲突、信息出现、关系或局势变化，以及抵达钩子前必须完成的结果；使用分号连接，不写空泛目标，不新增原文没有的事件。
【不得揭示】只写本集梗概明确保留到钩子之后、或本集只能铺垫而不能提前说破的信息；不得凭空创造秘密。确实没有时只写一个“无”；有多项时必须写在同一行，用中文分号“；”连接，不使用数字编号、项目符号、顿号清单或换行。

${continuity}

严格只输出两行：
【必须发生】……
【不得揭示】……

本集大概内容：
${String(summary||"").trim()}

集尾钩子：
${String(hook||"").trim()}

上一集必须发生链条：
${Number(episodeNo)>1?String(previousRequiredPlot||"未提供").trim():"无，EP01"}

本集适用硬约束（已按集数筛选，必须落实且不得挪到其他集）：
${hardConstraintText(constraints,{start:Number(episodeNo),end:Number(episodeNo)})}`;
}

export function buildEpisodeBoundaryPrompt(summary, hook, field, episodeNo=0, previousRequiredPlot="", constraints=[]) {
  const task=field==="must_not_reveal"
    ? `只提炼“不得揭示”：写出本集只能铺垫、必须留到钩子之后或后续集才能说破的信息。只能依据输入判断，不得凭空创造秘密。输出只有两种合法形式：确实没有时只写一个“无”；有多项时全部写在同一行，各项用中文分号“；”连接。严禁数字编号、项目符号、顿号清单、字段名和换行。每项只写一个暂不能说破的具体信息，不写原因或解释。`
    : `只提炼“必须发生”。它是一条从本集梗概抽出的、剧本正文必须实际演出来的事件因果链，不是人物设定，不是摘要，不能逐句复述，也不能只改写集尾钩子。

必须按以下顺序在内部完成提炼与组织：
1. 找出本集的“现实目标”：主角当下具体想解决什么。只有这个目标会驱动本集行动时才写入节点，不单列身份背景。疾病、欠款、救人时限等若直接驱动行动，属于剧情动力而非静态背景，必须保留。
2. 从梗概中选择能形成“先抑后爽”的主冲突链，优先组织为：现实目标→具体压制或羞辱→主角尝试受阻、代价或危机加重→能力、证据、援手或机会介入→主角反击、兑现小爽点或取得反击条件→集尾钩子。压制必须落在主角当下最痛的现实处境；后一个节点必须由前一个节点触发或改变。凡梗概明确写出“被催租、被驱赶、被挤兑、被羞辱、被威胁、被抢夺、被殴打”等动态遭遇，即使它写在人物背景句中，也属于必须表演的压制事件，不能当作背景删除。
3. 若梗概本集已经包含反击或兑现，必须保留其可见结果；若梗概只推进到金手指出现、发现机会或准备反击，则停在“即将爽”的强期待，不得擅自添加打脸结果、透支下一集。
4. 同一轮压制合并为一个递进节点，次要事件只有在它会加重压力、促成转折或影响钩子时才保留。不得为了覆盖原文而把互不相关的事实机械串联。
5. 再检查“集尾钩子”，把抵达钩子的必要条件补齐，并将钩子本身作为最后一个节点；钩子必须完整保留人物、动作、关键信息和结果。
6. 最后反向核对：删除静态身份、职业介绍、人物性格、日常状态、世界观背景、作者评价、未来秘密和不改变剧情的细节。例如“方野是城中村街头神棍，靠相术杂耍维持生计”只是人物背景，不列入；若梗概明确写他本集摆摊并由此引发冲突，才提炼该场发生的具体冲突。保留下来的每个节点必须满足：正文若不演这件事，后续事件便无法成立、情绪蓄压会中断或爽点将失去铺垫。

本集为 EP${String(episodeNo||"").padStart(2,"0")}。EP01的链条按“约65%–80%压制与受阻→后约20%–35%金手指出现、获得反击条件→准备打脸的钩子”组织，不安排开场爽点，也不参考上一集。EP02及以后必须先读取下方“上一集必须发生链条”，其最后一项就是上一集钩子。本集第一个节点必须直接完成该钩子的爽点兑现，不能只写一个承接动作：把主角使用上一集已经准备好的能力、证据、资源或行动，与对手丢脸、认输、利益受损、被迫退让或局势翻转的可见结果写在同一个首节点。严禁以“主角亮出证据、发动能力、来到现场、准备出手、对手震惊、双方开始对峙”等未产生打脸结果的准备态作为第一节点；也不能重复上一集钩子、跳时空、换冲突或重新铺垫。若本集梗概没有写出兑现结果，规则优先级为“上一集爽点必须兑现”高于“不得补充梗概外事件”：必须依据上一集钩子补出最小、直接的兑现，但只能补这一件事，不得新增人物、支线、秘密或改变本集后续走向。第二节点必须由兑现结果自然触发，并过渡到本集梗概的第一个既定事件；从第二节点起完全回归本集梗概。随后仍按“约55%–70%新压制与矛盾升级→后约15%–25%找到破局点→准备下一集打脸的钩子”组织，受压部分占最多节点，后段转机和准备打脸只占少数节点。

梗概中“尚不知道、背后其实、未来将发现”等作者掌握但本集人物和观众不应得知的背景，不得列入必须发生。输出通常为 4–7 个事件节点，每项尽量控制在 12–30 个汉字，严格按照戏剧因果与发生顺序用“→”连接成一行。每个节点只写“谁遭遇或做了什么、造成什么关键变化”，不标注“抑、爽、转折”等分析标签，不使用序号、分号或换行，不扩写场景，不新增输入中没有的事件。`;
  return `你是微短剧的写作边界编辑。${task}

只输出该字段的正文内容，不加字段名、标题、JSON、Markdown、解释或其他字段。

本集大概内容：
${String(summary||"").trim()}

集尾钩子：
${String(hook||"").trim()}

上一集必须发生链条：
${Number(episodeNo)>1?String(previousRequiredPlot||"未提供").trim():"无，EP01"}

本集适用硬约束（已按集数筛选，必须落实且不得挪到其他集）：
${hardConstraintText(constraints,{start:Number(episodeNo),end:Number(episodeNo)})}`;
}

export function buildSceneTreatmentPrompt(summary, hook, requiredPlot, mustNotReveal, episodeNo=0) {
  return `你是微短剧的场景编排编辑。只根据下面给出的“本集大概内容”“集尾钩子”“必须发生”和“不得揭示”，生成本集的场景推进方案。不得读取、推测或改写其他集，不新增输入之外的支线、秘密、人物关系或结局。

写作要求：
1. 只写一段约120–220字的连贯叙述，不用箭头、序号、清单、场次标题或剧本对白。
2. 写清梗概中人物为什么出现、为什么发生接触、上一事件怎样直接引发下一事件。
3. 能在同一地点连续发生的矛盾尽量合并，通过人物进入、电话、现场打断或既有行动自然衔接；不能让人物无缘无故找上主角。
4. EP${String(episodeNo||"").padStart(2,"0")}必须服从跨集比例：EP01前65%–80%用于压制和受阻，后20%–35%才出现转机并准备打脸；EP02以后开场10%–20%先兑现上一集爽点，中段55%–70%进入新压制，后段15%–25%获得破局点并准备下一集打脸。梗概没有写到的事件不得擅自补造。
5. 最后一句必须准确落到给定钩子；人物、事件、信息和结果不得替换，只能补足抵达钩子的因果过程。
6. “必须发生”中的每一项都要在这段推进方案里找到明确位置；严格避开“不得揭示”。
7. 只输出场景推进方案这一段正文，不加标题、字段名、JSON、Markdown或解释。

本集大概内容：
${String(summary||"").trim()}

集尾钩子：
${String(hook||"").trim()}

必须发生：
${String(requiredPlot||"").trim()}

不得揭示：
${String(mustNotReveal||"无").trim()}`;
}

export function buildEpisodeExecutionPlanPrompt(episode, templateGuide, emotionIntensity="strong") {
  const brief=Object.fromEntries(["episode_no","summary","hook","required_plot","must_not_reveal"].map(key=>[key,episode?.[key]??""]));
  const intensity=emotionIntensity==="extreme"?"异常强烈：压制、羞辱、恐惧、爱憎与反击接近下沉短剧强度。反派或对手不能只态度恶劣，必须为了夺利、控制、灭口、抢夺、嫉妒或维护地位而主动施害；关键压制同时规划阴险手段、诛心对白和现实后果，普通压制至少具备其中两项。让其利用合同、欠款、身份、规则、舆论或主角软肋设局、栽赃、诱骗、封退路，被揭穿后再按自身利益否认、甩锅、灭证、威胁或加码。不得无动机发疯、无缘由掌握秘密或只靠脏话显得坏。":"强烈：关键对手必须基于自身利益采取至少一个改变局面的具体行为，给主角造成钱、机会、信誉、证据、关系或行动空间上的可见影响，不能只靠态度、嘲讽和对白制造冲突。规划完整的行为、对白交锋、现实后果和利益反应；对手被质疑后可以辩解、推责、拉人站队或挽回损失，确认无法翻盘后才退让。";
  return `你是微短剧的单集表演设计师。先为本集制作一份可直接交给编剧的“表演蓝图”，不要写最终剧本。

原样稿方法：不是小说概述，也不是机械追求对白占比，而是把危机逐拍演出来。空间、身体处境、关键道具、危险逼近和动作结果用简洁可见动作；求助、拒绝、质疑、羞辱、威胁、辩解、选择和关系变化用现场对白回合。动作与对白交替推动同一条因果链。

规划规则：
1. 按模板限制规划 1–3 场；每场写清地点、进入时的具体问题、连续发生的表演节拍。
2. 每个节拍标明“必要动作”或“对白回合”。必要动作必须可拍且删掉会影响事件理解；不得出现心理判断、作者解释或转述人物说话。
3. 凡某人物主动找主角、提出交易、制造压力或改变局面，必须先规划其现场动机，并安排完整对白回合，不能只说一句便消失。对白回合写清双方各自想得到什么、如何加压、如何回应，通常 3–6 句，但不预写最终台词。
4. “必须发生”的箭头链是本集的情绪—因果主梁，按顺序逐项映射，不得拆散。若为EP01，把约65%–80%的成稿段落分给受压、冲突和尝试受阻，后20%–35%才出现金手指或破局条件，并停在准备打脸的钩子；若为EP02及以后，把开场10%–20%用于兑现上一集钩子的爽点，中段55%–70%用于新的压制与矛盾，后段15%–25%才找到破局点并准备下一集打脸。不得在后段提前完成本应留到下一集开场的打脸。若与“不得揭示”冲突，后者优先。
5. ${intensity}
6. 最后一个节拍必须与 hook 的人物、事件、信息和结果完全一致，出现后立刻停，不重复钩子。
7. 规划约 20–32 个成稿段落的容量，目标有效字符约 ${templateGuide?.generationTarget?.characters||600}，上限 ${templateGuide?.generationTarget?.maxCharacters||720}；把字数优先分给关键危机和对白交锋。

只输出简洁蓝图，格式如下：
【场景1】地点与时间｜本场问题
必要动作：……
对白回合：人物A的目的……；人物B如何回应……；压力如何升级……
必要动作：……
【场景2】……
【覆盖检查】必须发生各项分别落在哪个节拍；不得揭示如何避开
【钩子落点】准确描述最后一个可见或可听节拍

本集输入：
${JSON.stringify(brief,null,2)}`;
}

export function buildEpisodePrompt(project, constraints, artifacts, episode, states, templateGuide, continuity = {}) {
  const episodeRange={start:Number(episode?.episode_no),end:Number(episode?.episode_no)};
  const base = buildStagePrompt("episode", project, constraints, artifacts, [], episodeRange);
  const episodeBrief = Object.fromEntries(["episode_no","title","summary","hook","purpose","start_state","end_state","required_plot","must_reveal","must_not_reveal","card_relation"].map(key=>[key,episode?.[key]??""]));
  episodeBrief.continuity_ledger=states;
  const intensityRule=(project.emotion_intensity||"strong")==="extreme"
    ? "异常强烈：采用下沉短剧式高压表达。反派或对手必须基于夺利、控制、灭口、抢夺、嫉妒或维护地位等明确利益主动施害，不能只表现为态度差。关键压制同时具备阴险手段、诛心对白和现实后果：利用合同、欠款、身份、规则、舆论或主角软肋设局、诱骗、栽赃、封死退路；对白抓住贫穷、身份低、无能、守不住亲人或当众丢脸等具体痛点连续加码；行为必须让主角实际失去钱、机会、证据、信任或安全。被揭穿后，对手要按自身利益立刻否认、甩锅、灭证、威胁或反扑，而不是轻易认输。可让利益相关者趁势站队或落井下石，但每个人都必须有现场动机。对白要针锋相对，善用接住对方原话再加码或反杀的句式。反击时让对方失去具体利益、脸面、地位或关系。不能靠重复辱骂、全员吼叫、无动机发疯、降智违法或无缘由掌握秘密制造强烈。"
    : "强烈：所有喜怒哀乐与甜感都要清楚、有力度，并落实为带目的的对白、明确选择和可见后果。关键对手不能只靠态度、讽刺或辱骂制造冲突，必须基于自身利益采取至少一个改变局面的具体行为，让主角在钱、机会、信誉、证据、关系或行动空间上受到可见影响。对手的对白围绕具体经历、数字、规则、身份和行为展开，通过炫耀、辩解、命令、自证或合理化，自然暴露无知、贪婪、虚伪、傲慢或认知错误；不得为了推进剧情让其主动承认秘密或降智自爆。主角可以忍耐、观察、记住、试探或暂缓反击，是否拆穿及何时打脸严格服从本集事件链和钩子。对手被质疑后按利益继续辩解、推责、拉人站队或挽回损失，确认无法翻盘后才退让。强烈不等于粗俗吼叫，也不靠无效动作代替冲突。";
  return `${base}\n\n本项目的成稿情绪强度（仅用于本次剧本成稿，不改变分集梗概）：${intensityRule}\n\n已完成的单集表演蓝图（本次成稿的直接执行依据；按顺序落实每个节拍，不输出蓝图标题、类型标签或覆盖检查）：\n${continuity.executionPlan||"无；仅旧项目允许根据05字段临时规划"}\n\n当前集写作任务（不得跨集挪用情节；不包含也不参考本集旧稿）：\n${JSON.stringify(episodeBrief,null,2)}\n\n上一集收尾（只承接已发生的状态，不复述）：\n${continuity.previousEnding||"无，这是首集或上一集未写"}\n\n下一集边界（这些情节必须留给下一集）：\n${JSON.stringify(continuity.nextBrief||{},null,2)}\n\n当前选中的模板写作指南（只决定格式与文风，其中示例情节不是本项目事实，严禁照搬）：\n${JSON.stringify({templateName:templateGuide?.templateName,format:templateGuide?.format},null,2)}\n\n清洗前生成目标：\n${JSON.stringify(templateGuide?.generationTarget||{},null,2)}\n这里的最大字符数是成稿硬上限，不再额外增加清洗余量；有限字数优先用于冲突对白、有效事件、阻力、道具和状态变化。${templateGuide?.sample?`\n\n该模板的少量原文格式样例（只学形式，不学故事）：\n${templateGuide.sample}`:""}\n\n长度是硬约束：必须落在模板 generationTarget 的 minCharacters–maxCharacters 范围内，并尽量接近 characters；不得以增加动作描写填充字数。默认模板同时限制为约 20–32 个有效段落，其中对白应为主要部分。\n\n最终输出禁令：正文必须从集标题开始；不输出分析过程、Markdown 代码块、字面量 \\n、字数统计、“EP完”或修订说明。`;
}

export function buildEpisodeNovelPrompt(project, constraints, artifacts, episode, states, templateGuide, continuity = {}) {
  const characters=writingCharacters(artifacts);
  const planning=artifacts.find(item=>item.type==="planning")?.content||{};
  const narrativePerson=project.narrative_person==="third"?"third":"first";
  const narrativePersonRule=narrativePerson==="third"
    ? `锁定第三人称限知视角。除叙述称谓外，完整继承第一人称限知的写法、情绪深度和主观贴近程度。将第一人称中的“我”对应改为主角固定姓名以及与其性别一致的“他”或“她”，但仍然紧贴主角当下的所见、所闻、感受、疼痛、欲望、判断、怀疑、回忆和选择，可以直接描写主角的内心想法，也可以使用带有主角语气的自由间接引语。不得因为使用第三人称而退化为客观旁观、镜头说明、动作流水账或剧情概述。
叙述者掌握的信息范围与第一人称限知相同，只能知道主角当下已经感知、获知、回忆或合理推断出的内容；不得进入其他人物内心，不得替其他人物确认未说出口的动机、秘密和真实想法。叙述段不得用“我、我们、咱们”作为主角自称；对白中的“我”是人物正常说话，不受叙述人称限制。`
    : `锁定第一人称限知视角。主角在叙述段始终以“我”自称，不得改用主角姓名或“他、她”把主角写成第三人称。对白中的人物称谓不受此限制。叙述者只能写“我”当下已经感知、获知或推断出的信息，不得切换到其他人物内心，不得使用全知视角提前解释秘密、动机或结果。`;
  const openingRule=Number(episode?.episode_no||1)===1
    ? `这是EP01。第一句就进入【必须发生】第一项对应的具体行动或冲突，让主角正在做事、正在被要求、被驱赶、被催逼或面对迫近问题；不得先介绍主角身份、职业履历、世界观、环境全貌或概括生活有多惨。背景信息只能在冲突推进中顺带显露。`
    : `这是EP${String(episode?.episode_no||1).padStart(2,"0")}。本集【必须发生】节点1是唯一的开篇剧情任务，通常就是上一集钩子的现场兑现。新一集第一句必须落在上一集结尾之后，写节点1中的第一个新动作、新回应或新后果；不得先复述钩子、重放上一集画面、概括前情或自行设计过渡剧情。先读取【上一集小说连续性概要】理解完整因果和人物处境，再按编号从小到大读取【上一集最近事件】校正实际顺序与硬事实；两者冲突时以最近事件为准。最近事件中已经说出口的对白、已经播报的系统信息、已经完成的动作、已经得出的发现与结果，均视为完成，禁止原句复制、换措辞转述或再次表演。【上一集小说末尾】最后3–5行只是定位参照：从中提取结尾时的人物位置、持有物、认知和仍悬而未决的即时动作，然后丢弃其原句，不得把这些原句写入本集。若上一集最后一个动作确实停在进行中，只从它的下一拍或对方的即时回应接写，不能从动作起点重写。只有完成节点1必不可少、且属于节点1自身过程的最少动作可以放在结果之前，不得在节点1前增加独立事件。不使用上集说到、却说、话说等说书腔。`;
  const intensity=(project.emotion_intensity||"strong")==="extreme"
    ? "异常强烈：多重现实危机叠压到绝境。反派或对手必须出于明确利益主动施害，不只态度恶劣；关键压制同时具备阴险手段、诛心对白和现实后果，利用规则、舆论或主角软肋设局并封退路，被揭穿后按利益继续否认、甩锅、灭证、威胁或反扑。反击造成明确利益、脸面、地位或关系损失。"
    : "强烈：冲突和情绪明确外放。关键对手基于自身利益采取改变局面的现实行为，给主角造成钱、机会、信誉、证据、关系或行动空间上的可见影响；对白通过炫耀、辩解、命令、自证或合理化自然暴露其无知、贪婪、虚伪、傲慢或认知错误。主角不必立刻拆穿，反击时机服从本集事件链和钩子；最终反击产生清晰的局势变化。";
  return `你是中国微短剧的小说中间稿编剧。严格执行内置工作流；模板只能限定篇幅与格式，不能改变文风或剧情边界。

${storyModeRule(project,"writing")}

【本集适用硬约束｜已按集数筛选】
${hardConstraintText(constraints,{start:Number(episode?.episode_no),end:Number(episode?.episode_no)})}
只执行上面列出的全剧约束及覆盖本集的约束；其他集的局部硬约束未投入，不得猜测或提前执行。

综合【本集大概内容】【必须发生】【不得揭示】【人设】写一篇本集小说中间稿。小说是设计具体剧情的中间产物，要把事件动机、因果、情绪、能力触发和对手反应彻底想顺，为下一步转写剧本服务。其中【本集大概内容】负责说明本集意图、人物动机、因果背景和信息来源；【必须发生】负责锁定可执行事件及其先后顺序；两者不是两套并列剧情。【必须发生】最后一个节点已经是本集唯一钩子，小说不再读取或另写第二份钩子。

【叙事人称｜全局最高优先级】
${narrativePersonRule}
从第一段到最后一段保持同一人称。此规则高于模板格式、样例、扩写要求和定向修订要求；任何材料若暗示另一种人称，只学习其剧情信息，不得跟随其人称。

【短段表达规则｜不得削减剧情】
40个汉字只限制单个自然段的表达长度，不限制一集的事件数量、对白回合、冲突层次、人物感受和情绪强度。戏剧完整度高于文字精简：先把每个节点的行动、回应、升级、后果和选择设计完整，再用多个自然、各自成立的短段写出来；不得为了少写字而删掉有效事件、对手手段、现实损失、关键反应、对白攻防、反扑或选择。小说的丰富度来自更多有效动作、对白回合、选择、反应和局面变化，不来自拉长同一个动作、观察过程或环境描写。一个自然段只表达一个完整的信息或节拍，不把同一句话、同一个动作或同一条信息机械截断。

【叙述禁区】
优先写行动、对白、选择和局面变化。环境、外貌、声音、感官和心理可以为建立处境、人物感受、信息发现、危险或行动服务，但必须短促，不连续铺陈，也不重复证明已经交代清楚的状态；能用一个明确状态说清，就不再追加呼吸、光线、气味、触感等装饰性证明。禁止房间装修和环境全貌，禁止静态罗列人物年龄、妆容、服装、身材、气场和阅历，禁止用连续比较、推断和解释代替剧情。允许用一个短句写主角真实感受或必要内心，使压迫、痛苦、震惊、喜悦和选择具有代入感；不得反复回味同一情绪，也不得替非视角人物断言内心。第一段必须直接写人物正在实施或承受的关键动作，或一句立即改变局面的对白；不得从环境全貌、前情回顾、身份介绍或静态外貌开始。

【小说开头技巧】
${openingRule}

【小说承担剧情设计】
这不是把梗概换成人称化复述，也不是追求文学辞藻的最终小说。必须在正文中完成具体剧情设计：每个关键事件都写清人物当前目标、出现的阻碍、人物采取的办法、对方基于自身利益作出的反应、产生的可见后果，以及该后果怎样直接触发下一个事件。每个主要冲突都尽量构成“软肋明确→对手采取具体行为→现实后果落地→人物被迫选择”的闭环；强情绪来自选择和后果，不来自形容词或重复辱骂。人物为什么来到下一处、反派为什么离开或再次出现、能力怎样触发、道具从哪里来、系统声音为何只有持有者能感知，都要在小说中自然解决。后续的剧情安排只整理这篇小说已经设计好的逻辑，不应替小说补救缺失因果。

硬规则：
0. 先结合【本集大概内容】理解每个【必须发生】节点为什么发生、人物为什么采取该行动、信息从哪里来以及节点之间怎样因果相接，再执行节点链。大概内容中与节点重复的事件只能写一次；其中必要的动机、因果或信息来源应融入对应节点内部，不得另起一条重复剧情。大概内容不是第二套事件清单，不得据此跳过、调换或增加独立于【必须发生】之外的剧情分支。若材料存在冲突，依次服从【不得揭示】与硬约束、剧情记忆中的既定事实和【必须发生】；大概内容只在这些边界内补足逻辑。结尾只服从【必须发生】最后节点，不得再从大概内容中提炼、补写或重复另一份结尾。
1. 【必须发生】已经拆成从“节点1”开始的顺序检查点。先在内部建立节点1至最后节点的覆盖清单，再按编号逐项写作，但正文不得输出节点编号或清单。开篇必须直接进入已经发生的危机，绝不能从赶路、到场、寒暄、观察环境、回忆背景或节点2开始；当前节点的人物行动、交锋与明确结果尚未写成之前，禁止进入、借用或提前暗示后续节点。每个节点至少形成一个完整的戏剧单元，写清目标、软肋或筹码、对手的具体施压行为、应对、升级、可见后果与被迫选择；该结果再触发下一节点。不得删节点、交换顺序、把相隔节点揉成一件事，或用一句回忆、概述、事后转述代替现场展开。最后节点就是钩子，写到此处立即停止，不加环境余韵、过渡、总结或下一步结果。
2. 严格避开【不得揭示】；不新增会改变主线、能力规则、人物关系或后续走向的事实。
3. 严格执行上方【小说开头技巧】。所有集都从节点1直接开戏；EP02以后，上一集末尾与最近事件只约束节点1开始时的人物位置、认知、道具和已完成事项，不构成节点1之前的额外剧情。先在内部区分“上一集已经完成”与“仍在进行”：已完成内容完全跳过；仍在进行的动作也不能重写动作本身，只能写它的下一拍、对方回应或随之产生的新后果。开头前两段内必须出现节点1的新推进，不能用回忆、解释、环境、心理总结或换措辞复述消耗篇幅。
4. ${intensity}
5. 完整照做 Skill 的小说扩充原则：【必须发生】只规定本集不可缺少、不可乱序的事件骨架，不限制每个节点内部的具体戏剧设计。必须先完成当前节点，再在当前节点结果与下一节点之间设计自然转场。请在不改变事件顺序、既定事实、人物认知、人物关系、能力规则、道具状态和后续边界的前提下，天马行空、大胆主动加戏；通过具体事件和行为深挖人设，把性格真正设计成情节。表现层可以自由创造并充分展开对白交锋、现场阻力、临时策略、冲突升级、对手反扑、笑点、情感张力、选择、可见后果和不影响连续性的软细节，使成稿明显超越事件链的逐条复述。新增软细节必须立即参与人物行动、对白攻防、阻力或结果，不能只是环境、外貌、感官和氛围陈列。这里的“充分展开”只能增加新的有效行动、回应、攻防、选择与结果，或增加有明确目的的对白回合；不得把一次拿取、观察、走路、受伤或思考写成多步过程，不得用外观、触感、光线、环境、氛围、感官和重复情绪替代剧情。每一处新增内容都必须归属于当前正在执行的某个节点，并能在本集内解释清楚或收束；“自由加戏”绝不代表可以另选开头、绕过节点或打乱节点。
5.1 事实层只能谨慎新增剧情确实需要、且不会锁死后续的最少信息。剧情记忆中已有的姓名、地点、来源、金额、日期、身份、病症、关系、道具归属与状态、系统规则与数值都是开场基准，不得为了加戏替换、否定或绕开；真实品牌、机构、精确金额、精确日期、重大前史、新能力和新规则若非【必须发生】明确需要，禁止擅自创造。尤其不得为了让相邻事件显得紧密，凭空创造同谋、预谋、知情、通风报信、共同利益或隐藏关系；没有既有证据时，相邻事件可以只是先后发生、被现场打断或自然换人，不必强行建立因果。
5.2 严格遵守人物认知边界。人物在任一时刻只能依据此前已经亲眼看见、亲耳听见、被明确告知或亲自查证的信息作出反应；【必须发生】中稍后才会兑现的揭露、打脸、身份、结果和钩子，不是开场事实，绝不能倒推成该人物已经知道。不得在缺少前置获知事件时写“被骗后的懊恼”“得知真相后的愤怒”“早已明白”“像是知道了”等状态。先写清信息如何到达该人物，再写其即时反应；没有证据时只写当下可观察动作、现场对白或中性的疑惑与警惕。无论选择哪种人称，都不得直接断言非视角人物的内心认知。
5.3 本章已经明确建立的人物身份、能力、知情范围、物品归属、事件原因、损失对象、关系、承诺、数字和动机，后文必须沿用；不得为了升级冲突或增强爽感，临时改写前文事实、补出隐藏利益关系或重新解释事件来源。只有【本集大概内容】或【必须发生】明确安排该揭露，且正文写出获得信息或证据的过程，才允许推翻此前的表面认知。
5.4 时间按自然日序推进。下午到傍晚、夜晚通常仍属同一天；夜晚之后出现天亮、日出或清晨，通常自然进入次日，不必补写无效过渡。只有跳过多日、进入倒叙，或时间变化可能中断正在发生的即时事件时，才需作最短且成立的交代。地点变化本身不代表时间变化；倒叙结束后回到原主线时点。若上一段停在攻击、开门、追问、追逐、倒计时等必须立即兑现的动作上，必须先写出结果，不能借换日跳过。
6. 压制必须打在命根子上，并尽量叠加两三个不同维度的现实危机形成绝境。系统或核心能力不能轻易激活，必须在主角走投无路时成为唯一破局希望；能力触发、道具来源和使用条件必须符合人设与故事状态。道具可以通过本集明确写出的赠送、交易、抢夺、遗失、损坏等事件改变归属或状态；系统也可以通过任务完成、消耗、升级、解锁或新提示产生进展，但必须从开场快照出发，写清原因、过程和结果，数值能够前后计算，禁止无因易主、无因跳级或无因改变规则。对手被揭穿后不会轻易认输或直接离场，必须有合乎利益的翻脸、加码、威胁或反扑。
6.1 金手指的呈现载体严格继承当前快照与历史证据。脑海、意识或仅主角可见的非实体系统，绝不能为了展示信息临时改成手机应用、手机屏幕、平板、手表、纸质报告或公开投屏；设备型系统也不能无因改成脑内系统。主角需要说服别人时，只能说出自己观察到的结论、指出现实可见破绽、展示剧情中真实存在的证据，或建议去现实机构复检，不能把他人不可见的系统界面直接展示给对方。
6.2 每项金手指默认只有剧情状态中标注的当前持有者知情，持有者不等于主角，也不得把一项金手指的知情权套给另一项。只有【本集大概内容】或【必须发生】明确写出某个非持有者已经获知该金手指，该人物才可以知道、提及或据此行动；没有这项明确依据时，非持有者不得知道、识别、准确推断或说出系统、弹幕、异能、血统、任务、积分、规则、能力来源等内幕，也不得擅自新增“你怎么突然会了”“你以前明明不会”“你身上有秘密”等追查能力来源的剧情。非持有者只能对现场可见的行为、证据和结果作出反应。
7. EP01按约6:4或7:3先抑后爽，前大半压透，后小半才出现转机并停在准备打脸的钩子；EP02至倒数第二集先用开头兑现上一集爽点，再用大半篇幅压透，后小半获得转机并停在下一次行动钩子；最后一集集中兑现全部打脸和爽点，不再制造下一轮未兑现循环。
8. 对白风格严格服从当前选项。${project.emotion_intensity==="extreme"?"下沉档：对手的坏必须由目的、行为、对白和后果共同呈现。让其先为夺利、控制、灭口、抢夺或维护地位采取可见的设局、诱骗、栽赃、封路或威胁，再用主角的穷、弱、没见识和命根子作筹码说出诛心且带条件的台词，并造成当场可见损失。关键压制同时具备阴险手段、诛心对白、现实后果；被揭穿后按利益继续否认、甩锅、灭证、威胁或反扑。不能只靠脏话、无缘由吼叫、降智违法或突然知道未知信息显得坏。":"强烈档：让对手在做出具体阻碍行为的同时主动说事。其对白围绕具体经历、数字、规则、身份和行为，通过炫耀、辩解、命令、自证或合理化，自然暴露无知、贪婪、虚伪、傲慢或认知错误，让观众觉得气人但仍符合人物利益。不得让对手为了方便剧情直接承认秘密或降智自爆。主角不必抓漏洞追问或当场拆穿，可以忍耐、观察、记住、试探或暂缓反击；拆穿与打脸时机严格服从【必须发生】和钩子。"} 系统或特殊声音同样使用「」写入小说，内容像开礼包，只短促播报结果和解锁，不得写成规则说明书或界面清单。
8.1 单人场景不等于无语言。除非本集明确要求全程无声或不能出声，整章不得没有任何直接语言。没有其他可说话人物时，让主角围绕眼前目标、危险、疼痛、判断或决定说出短促且会推动行动的话，必要时可写少量直接内心语言；已有依据的系统音、广播、录音或电话对象可以参与，怪物只能发出符合设定的声音。不得为凑对白凭空新增联系人、广播内容、系统激活、人物知情或让无语言能力的对象突然会说话；不得用自言自语复述读者已经看到的动作和背景。${project.emotion_intensity==="extreme"?"异常强烈档的单人高压场景不能只靠连续动作和受难描写维持强度；主角必须用短促外说、自言自语或必要的直接内心语言，持续表达抗拒、判断、恐惧、愤怒、选择或反击意图，每次语言都要推动下一步行动。":""}
9. 严格执行上方锁定的${narrativePerson==="third"?"第三人称限知":"第一人称限知"}；对白只能使用中文直角引号「」，正文禁止英文双引号和中文弯双引号。禁止纯人物名后直接接冒号和台词，也禁止用说、问连接台词。需要标明说话人时，把人物与真实动作自然连写后再接台词。正确示例：王志远放下茶杯：「怎么样？」错误形式包括纯人物名直接接台词、人物名说或问后接台词、人物名后用括号插入动作。也可以直接写「台词」，在前后叙述中自然明确说话人。所有台词必须是完整自然句。小说允许用简短的主角内心与情绪感受增强代入，但每次只写一个清楚的感受、判断或选择，不连续渲染，不重复已经写出的局面；禁止任何圆括号或小括号。
9.1 每个自然段不区分叙述、对白或混合段，全部不得超过40个汉字；通常写10–30个汉字，确有必要可以接近40字，标点、数字和英文不计入。一个自然段承载一个完整动作、反应、感受、对白目的或局面变化；信息较多时，应按自然的戏剧节拍换段，而不是删掉有效内容。对白要充分展开交锋，不能为了40字缩成概述或减少回合。避免连续描摹同一外观、观察、拿取、行走、环境或感官过程；禁止把同一句话、同一个动作或同一信息机械切成多个残句规避限制。
10. 写完后严格执行 Skill 自检并在内部直接修正：把成稿逐段反向对应节点1至最后节点，确认每个节点都能在正文中找到现场发生的行动、交锋和结果，且正文首次出现各节点的顺序与编号完全一致；任何节点缺失、只有概述、顺序颠倒或后项抢跑，都必须在输出前修正。再检查每个事件的前因后果、能力如何触发且是否符合设定、对手反应是否符合利益、情绪是否自然递进、结尾是否准确停在链条最后一个钩子；通读整章核对身份、能力、知情、归属、原因、损失、关系、数字和动机，消除后文无依据改写前文事实的矛盾。最后逐段统计汉字并改到40字以内：优先缩短句式或按动作、回应、升级、结果等自然节拍换段，禁止删除有效事件、对手手段、现实后果、人物感受、对白攻防、反扑和选择；删除的只能是重复解释、重复状态和连续装饰性描摹。确认第一段是关键动作或改变局面的对白。输出前检查全部标点：圆括号和小括号必须为零；英文双引号及中文弯双引号必须为零；每一句对白和声音都必须使用「」并成对闭合。钩子必须体现主角已经决定或开始行动，而不是刚发现机会、继续挨欺负或站着发呆。不要输出自检过程。
11. 有效中文字符必须在 ${templateGuide?.novelTarget?.minCharacters||1000}–${templateGuide?.novelTarget?.maxCharacters||1500} 之间，目标约 ${templateGuide?.novelTarget?.characters||1250}，不得靠重复和无效景物凑字。

【本集编号】EP${String(episode?.episode_no||1).padStart(2,"0")}
【02全剧创作宪法】
框架：${novelContextText(planning.framework)||"无"}
世界观：${novelContextText(planning.worldbuilding)||"无"}
故事梗概：${novelContextText(planning.synopsis)||"无"}
核心期待：${novelContextText(planning.core_expectations)||"无"}
【本集大概内容｜只用于补足动机、因果、语境与信息来源，不是第二套事件清单】
${novelContextText(episode?.summary)||"无"}
【必须发生｜严格按编号执行，正文不显示编号】
${numberedRequiredPlot(episode?.required_plot)}
【不得揭示】${novelContextText(episode?.must_not_reveal)||"无"}
【人设】
${novelCharacterText(characters)}

【主要人物首登场边界】
${continuity.characterAppearancePlan||"旧项目尚未规划首登场集；仅按本集大概内容与必须发生决定人物是否出场。"}
未到规划首登场集的主要人物，其人设只作为未来边界，不得让其进入现场、行动、说话、联系主角或无依据介入事件；别人自然提及其姓名不等于本人出场。当集标为首次出场的人物必须由本集既定事件自然引入，不能为完成名单硬塞无关镜头。已经首登场的人物也不等于本集必须出现，仍以本集大概内容与必须发生为准。

【线性剧情记忆】
剧情记忆不是剧情任务。【必须发生】【不得揭示】和本集剧情设计决定本集写什么；记忆只用于保持世界连续，禁止逐条复述或为了展示记忆强行安排人物出场。初始人物档案描述EP01开始前已经成立的身份、性格和前史；事件记录描述最终剧本中实际发生过的事情。事件链的箭头表示后来如何承接，链条末端只是目前最新记录，不等于必须在本集继续。
上一集小说连续性概要（帮助理解完整因果与结尾局面，不是新剧情任务；若与最近事件冲突，以最近事件为准）：
${novelContextText(continuity.previousNovelSummary)||"无，这是首集"}
当前时间轴与叙事落点：
${novelContextText(continuity.memory?.timeAxis)||"尚无时间轴记录"}
相关人物初始档案：
${novelContextText(continuity.memory?.profiles)||"无"}
剧情中相关的实名次要人物：
${novelContextText(continuity.memory?.secondaryCharacters)||"无"}
相关人物当前关系与关系变化：
${novelContextText(continuity.memory?.relationships)||"无"}
主角金手指固定规则、当前快照与相关变化：
${novelContextText(continuity.memory?.goldenFinger)||"无"}
相关重要道具的作用、当前快照与历史变化：
${novelContextText(continuity.memory?.importantProps)||"无"}
相关资源账本（当前数量、所有权和可用性是开场基准；除非本集明确写出获得、支出、转让、出售、冻结等过程，否则不得无因改变。待到账不等于已到账，非流动资产不等于现金）：
${novelContextText(continuity.memory?.resources)||"无"}
相关历史事件：
${novelContextText(continuity.memory?.events)||"无，这是首集或尚未提炼剧本事件"}
相关事件链：
${novelContextText(continuity.memory?.chains)||"无"}
上一集最近事件（严格从上到下发生；不得倒序理解）：
${novelContextText(continuity.memory?.previousEvents)||"无，这是首集"}
上一集最终落点（即上列最后一条，不是新任务）：
${novelContextText(continuity.memory?.previousLastEvent)||"无，这是首集"}
上一集小说末尾：
${novelContextText(continuity.previousNovelEnding)||"无，这是首集或上一集尚无小说"}

只输出小说正文，不输出标题、分析、Markdown、字数或说明。`;
}

export function buildPreviousNovelSummaryPrompt(previousEpisode,continuity={}){
  return `你是微短剧小说的连续性编辑。现在要在生成下一章之前，为上一章制作一份干净、准确的内部交接概要。

【资料分工】
1. 上一章小说全文用于理解完整因果、人物动机、现场处境和当前锁定叙事人称中已经设计的过程。
2. “最终剧本最近事件”来自正式成稿，是已经真实发生的事实账本，负责校正事件顺序、结果、人物认知、地点、时间、金额、道具和系统状态。
3. 两者冲突时必须以最终剧本最近事件为准；小说中存在、但最终事件账本没有支持的精确日期、相对时间、金额、品牌、机构、病症、身份、关系、道具来源、系统规则或数值，不得写入概要。
4. 不参考下一章梗概，不续写，不预测，不创造任何新事实，不把已完成动作写成仍需再次执行。

只输出以下四行，每个字段一行，不加标题、序号、Markdown或解释：
关键事件：按因果顺序概括上一章真正发生并产生结果的主要事件。
人物与状态：写上一章结束时与下一章开场直接相关的人物位置、认知、关系、能力和关键道具状态。
精确锚点：只写资料已经明确支持、后续不能擅改的时间、地点、金额、原话、道具来源与系统数值；没有则写无。
结尾局面：写最后正在发生的现场局面，以及人物已经开始但尚未完成的即时行动；不得使用笼统的“未解决事件”。

控制在180–450个汉字。用完整、无歧义的句子；禁止使用“本集、上集、该事件、此事、对方、那个东西”等脱离来源后指向不明的说法。

【上一章】EP${String(previousEpisode?.episode_no||"").padStart(2,"0")}
【最终剧本最近事件｜从上到下发生，最高事实优先级】
${novelContextText(continuity.previousEvents)||"无"}

【最终落点】
${novelContextText(continuity.previousLastEvent)||"无"}

【上一章小说全文｜仅用于理解因果和处境】
${novelContextText(previousEpisode?.novel)}`;
}

export function buildEpisodeArrangementPrompt(project, artifacts, episode, states, templateGuide, continuity={}) {
  const characters=writingCharacters(artifacts);
  return `你是微短剧的剧情统筹。严格照搬 Skill 的第二步，根据已经完成剧情设计的小说中间稿，输出情绪和剧情安排及逻辑推理。这里只整理、压缩和检查小说里已经发生的设计，不另写小说，不生成剧本，不新增或替换事件与钩子。

${storyModeRule(project,"writing")}

只输出以下四个区块：

【情绪走向】
用一行写完整曲线，格式为“本集情绪曲线：阶段（具体事件）→ 阶段（具体事件）→ …… → cliffhanger”；再用一行写节奏比例及本集先爽后压或先压后爽的安排。必须对应小说真实事件，不能只写抽象情绪词。

【情绪节点】
按剧情阶段逐行列出“节点名称：具体事件和情绪结果”。明确开篇爽点、压透、转机、更大危机和cliffhanger中本集实际存在的部分；情绪逐层递进，不能忽高忽低。

【剧情安排】
把小说压缩为严格1–3场。每场先写“1 外/内 地点 时间”，下一行用一对圆括号把本场全部事件按发生顺序以“+”连接。每场第一个事件先用最短文字标明场地规模或关键区域、主要人物初始位置以及正在发生的动作；后续只记录会改变人物位置或局面的进入、离开、接近、阻拦、拖拽和关键道具动线，不写气氛与装饰性环境。地点和时间均未改变时必须合并在同一场；前一场结果直接引发下一场，不写无关过渡。最后一个事件必须是既定cliffhanger，写到此处停止。

【逻辑推理】
针对本集真正可能断裂的因果逐条写成“1. 具体问题？→ 具体答案”。至少检查：上一事件怎样触发下一事件、人物为何在此时出现或再次出现、能力与道具从何而来、系统如何触发且为何只有主角听见、主角为何作出结尾选择。不能写泛泛的“符合逻辑”。如发现问题，先在内部修正剧情安排再输出。最后单独写“逻辑检查：✓ 无问题”。

小说中间稿：
${episode?.novel||""}

本集大概内容（只作核心目标、人物动机和因果方向的偏题校验，不得据此新增小说未设计的事件，也不得把它当成第二套事件顺序）：
${novelContextText(episode?.summary)||"无"}

必须发生：${episode?.required_plot||""}
不得揭示：${episode?.must_not_reveal||"无"}
人设（仅用于核对行为动机）：
${novelCharacterText(characters)}
故事状态（仅用于核对连续性）：
${novelStateText(states)}

严格模仿上述结构，只输出四个【】区块，不输出边界检查、人物标识符、Markdown或额外解释。`;
}

export function buildSkillEpisodePrompt(project, constraints, artifacts, episode, states, templateGuide, continuity = {}) {
  const base="你是中国微短剧的专业剧本编剧。严格按照已确认的小说与剧情安排转换，不重新设计剧情。";
  const characters=writingCharacters(artifacts);
  const protagonist=characters.find(item=>/(?:^|[男女])主角|男主|女主/.test(String(item.role||"")))?.name||"主角";
  const intensity=(project.emotion_intensity||"strong")==="extreme"
    ? "异常强烈：下沉短剧式高压表达；忠实保留小说中反派主动施害的目的、阴险手段和现实后果，把威胁条件与所抓软肋落实为可拍行为和诛心对白。被揭穿后的否认、甩锅、灭证、威胁或反扑不得软化；反击必须让对手失去具体利益、脸面、地位或关系。"
    : "强烈：忠实保留小说中对手基于利益采取的现实阻碍、给主角造成的可见影响，以及其在炫耀、辩解、命令、自证或合理化中自然暴露自身的对白。不得把具体行为缩成口头争吵，也不得擅自让主角提前拆穿；反击时机服从既定事件链，反击造成清晰可见的局势变化。";
  const novelSource=String(continuity.novel||episode?.novel||""),novelNarration=novelSource.replace(/「[^」]*」/g,"").replace(/“[^”]*”/g,"").replace(/"[^"\n]*"/g,""),selectedPerspective=project.narrative_person==="third"?"third":"first",detectedPerspective=/我|我们|咱们/.test(novelNarration)?"first":"third";
  const sourcePerspectiveRule=detectedPerspective==="third"
    ? `当前小说实际为第三人称来源。先逐句识别人物真正说出口的内容，再转换为统一剧本格式。凡“人物动作接引号台词”“引号台词后接人物说话或动作”“台词与人物动作同段”等第三人称小说句法，必须拆成独立动作行和“人物：台词”行。剧本不得保留「」、“”或英文双引号；不得遗漏已经说出口的对白，也不得把叙述误改成对白。`
    : `当前小说实际为第一人称来源。小说叙述中的“我”固定对应主角${protagonist}；逐句识别独立对白及说话人，再转换成“人物：台词”。不得把叙述者“我”误当成新的角色标识。`;
  return `${base}

${storyModeRule(project,"writing")}

任务：把已经完成的小说中间稿转换为可直接拍摄的微短剧剧本。小说已经完成剧情设计，不得另写剧情、调换事件、替换钩子或参考本集旧稿。

情绪强度：${intensity}
必须发生：${episode?.required_plot||""}
不得揭示：${episode?.must_not_reveal||"无"}

小说中间稿：
${continuity.novel||episode?.novel||""}

已经确认的情绪和剧情安排（必须逐场执行，不得在转换时另做一套安排）：
${continuity.episodePlan||episode?.episode_plan||""}

人物人设：${JSON.stringify(characters,null,2)}
当前有效故事状态（只作连续性约束，不是待转换内容）：
${novelStateText(states)}
上一集剧本末尾：${continuity.previousEnding||"无，这是首集或上一集未写"}
锁定人物标识符：${JSON.stringify(continuity.lockedIdentifiers||[],null,2)}

转换规则：
0. 故事状态不是剧情任务。不得把连续性状态重新解释成对白、动作或旁白；只转换本集小说与剧情安排已经实际使用的内容。状态里的概率、风险评级、数值、旧系统播报和既往结论，不得因为出现在状态栏就写进剧本。
0.1 项目当前选择为${selectedPerspective==="third"?"第三人称":"第一人称"}；转换前检测到当前小说实际来源为${detectedPerspective==="third"?"第三人称":"第一人称"}。${sourcePerspectiveRule}
1. 严格1–3场并执行剧情安排。同一地点且同一时间不得拆成两个场次；只有地点或时间发生变化才允许换场。场次标题严格服从当前模板；默认模板写成“2 外 城中村街道 日”，只能使用外/内和日/夜，不写外景/内景、白天/夜晚。第三人称；对白写“人物：台词”且每句独立成段；系统播报写“系统音：”；只有主角在必要时可用“主角名 V.O.：”。内心独白必须直接写成“主角名 V.O.：台词”，严禁先写“在心里说、心中默念、内心说道”等动作说明，再另起一行写成普通对白。
1.1 剧情安排中的编号是权威场次分组，不得拆分、合并、删减或重新编号。若某个编号标题带“→”、地点/时间跨度，或剧情安排用同一个编号连续列出多个地点，它表示一个复合场次：剧本只保留一个编号总标题，并按安排顺序在内部使用独立一行的“【内 地点 时间】”“【外 地点 时间】”转场标记；这些标记不另计场数。每次换地点必须先写转场标记，随后才写该处动作与对白；不得把不同地点悄悄混进同一动作段，也不得用分号把转场标记与正文挤在一行。总标题、内部地点顺序和时间推进必须忠实照搬剧情安排。
2. 删除小说旁白、内心、作者解释、身份推测、情绪外化、比喻、感官和状态摘要，只保留可见关键动作与现场对白。“得像……”等比喻一律删除。镜头不能直接证明的信息不得冒充动作，例如“看起来像老板”“期限逼近”“母亲在医院等钱救命”“口袋只剩四十七块三”；若剧情必须让观众知道，优先改由人物当场说出、点数实物或展示明确道具。只有主角${protagonist}可以使用 V.O.，其他任何人物禁止使用 V.O./OS；主角V.O.也只能承载主角自己的认知、疑问或选择，绝不能替其他人物复述、猜测或脑补台词。小说若写“某人看了主角一眼，那眼神的意思是：你敢……/你要是……/否则……”等未说出口的请求、命令、警告或威胁，整段作者解释及其脑补内容直接删除，既不能改成主角V.O.，也不能新增为对方现场对白，因为那会改变“是否说出口”的事件状态；只有小说或剧情安排明确写明该人物实际说出口时，才转换为该人物对白。主角出现“心里一凛/心中一凛”时删除该情绪短语，只有紧随其后的主角自身认知、疑问或选择对观众确有必要，才把那部分信息改成一句“${protagonist} V.O.：台词”，不得写“我心里一凛”。非主角的内心信息不得转成 V.O.，必要时改成其现场对白或改变局面的可见动作，否则删除。V.O.只补必要信息，不能承担连续讲解。禁止任何圆括号或小括号。
3. 对白是正文主体。请求、拒绝、质疑、羞辱、威胁、辩解、交易、选择和信息交锋必须展开成完整自然句，不能缩成“某人逼着要钱”“某人解释了原因”等动作概述。
3.1 单人场景也不得机械转换成整集零台词。除非小说或本集要求明确规定全程无声或不能出声，主角可以对眼前对象说话、自言自语，或将确有必要且会改变下一步行动的自身认知写成一句主角 V.O.；已有依据的系统音、广播、录音或电话对象按小说转换，怪物只能保留符合设定的发声。不得凭空新增联系人、广播事实、系统激活、人物知情或让无语言能力的对象突然说话，也不得用台词复述已经可见的动作和背景。${project.emotion_intensity==="extreme"?"异常强烈档的单人高压场景不得把小说中的语言张力清洗成连续动作；保留主角表达抗拒、判断、恐惧、愤怒、选择或反击意图的短促语言，并确保每句都会推动下一步行动。":""}
4. 动作只保留三类：每场开头一至两句必要空间建立，写清场地规模或关键区域、主要人物初始位置和正在发生的动作；与对白同时发生并改变交锋的动作；改变人物位置、道具归属或局面走向的关键动线。空间建立不得写灯光、天气、气味、氛围和装饰性陈设。动作必须是演员此刻真正执行、镜头可以直接确认的行为，不能用来交代背景、余额、期限、场外人物处境或概括正在发生的矛盾；这些必要信息优先转成现场对白或明确道具，无法自然外化时才使用一句主角 V.O.。删掉后不影响空间理解、事件理解或对手反应的动作一律不写；任何“声音卡在喉咙里、话堵在嗓子里、张嘴却说不出话”等不改变局面的套路化迟疑都直接删除，不能改成 V.O.。
5. 继续出现的人物必须逐字使用锁定标识符，禁止换称呼或临时创造同义称呼。严格覆盖“必须发生”并避开“不得揭示”。写到小说钩子处立即停止，不加环境、过渡、总结或“待续”。
6. 禁止环境、天气、氛围、时间推进、比喻、感官、情绪外化、声音语气、旁白总结、沉默/不说话/盯着看、“脸一阵青一阵白”等状态与套路化神态描述。禁止单独写“某人走了”“某人来了”这种没有表演过程的结果句；若进出场会影响当前交锋，应写成可拍摄的具体动作，例如“刘麻子头也不回地走了”“王志远推开人群走进来”“两个保安架着黄毛离开”。每场结尾必须出现推动下一场的新危机或冲突，只有最后一场使用cliffhanger。
7. ${project.emotion_intensity==="extreme"?"下沉档：不得把小说中反派的主动施害缩成态度恶劣或几句脏话。保留其明确利益目的、设局或封路行为和实际损害；对白要把主角软肋变成带条件的威胁、羞辱或交易筹码，句句推动行为后果。小说中被揭穿后的否认、甩锅、灭证、威胁或反扑必须现场展开，但不得擅自新增小说没有设计的恶行。":"强烈档：不得把小说中对手已经采取的现实阻碍和造成的后果缩成打嘴炮。完整展开其基于利益的行为，以及在炫耀、辩解、命令、自证或合理化中自然暴露无知、贪婪、虚伪、傲慢或认知错误的具体对白。主角不必抓漏洞追问；小说没有安排当场拆穿时，剧本也不得擅自提前打脸。对手被质疑后的辩解、推责、拉人站队或挽回利益应按小说现场展开。"} 所有台词都是顺嘴的完整自然句；极端突发时可偶尔用短句，但不得通篇碎片化。

排版硬规则：EP标题单独一行；每个场次标题单独一行；每句“人物：台词”单独一行；动作不得与台词混在同一行。两句人物台词之间如果有多句或多段连续动作，必须全部合并成一个动作段、只占一行，不能把每个动作句各拆一行。同一行不得出现两个人物台词；不同类别之间保留换行，不得把整篇正文挤成一段。
8. 系统音像开礼包，短促播报结果与解锁，不念规则说明书，不擅自增加积分等系统设定。
8.1 严格保留小说与故事状态中已经成立的金手指呈现载体。非实体脑内系统不得改写成主角掏手机、展示屏幕、打开应用或公开播放系统结果；若需要让其他人物相信，只转换主角实际说出口的判断、可拍摄的现实证据和复检建议。
8.2 每项金手指默认只有下方“当前金手指持有关系”中标注的持有者知情，持有者不一定是主角。除非【本集大概内容】或【必须发生】明确写出某个非持有者已经获知该项金手指，否则剧本不得让其提及、识别、准确推断该金手指或追问能力来源；小说里若误写了这种越权知情，转换时直接删除，只保留该人物对现场可见行为、证据和结果的反应，不得把越权信息改写成另一句对白。
当前金手指持有关系：${continuity.goldenKnowledgeOwners||"暂无已建立的金手指持有关系"}

模板只控制格式、篇幅与场次，绝不控制文风、情绪、节奏或剧情逻辑；样例只用于核对排版，故事和表达方式不得照搬：
${JSON.stringify({templateName:templateGuide?.templateName,format:templateGuide?.format,generationTarget:templateGuide?.generationTarget},null,2)}
${templateGuide?.sample?`模板格式样例：\n${templateGuide.sample}`:""}

有效字符必须在 ${templateGuide?.generationTarget?.minCharacters||1500}–${templateGuide?.generationTarget?.maxCharacters||2000} 之间，目标约 ${templateGuide?.generationTarget?.characters||1750}。有限字数优先用于冲突对白，不得靠动作填充。

只输出从EP标题开始的完整剧本；不输出分析、Markdown、字数、“EP完”或修订说明。`;
}
