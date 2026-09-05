import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.APP_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),"mochao-arrangement-test-"));
process.env.LLM_PROVIDER="mock";
const { applyLocalArrangementRepair,applyMissingScriptScenes,buildLocalArrangementRepairPrompt,buildMissingScriptScenesPrompt,cleanEpisodeText,consolidateEpisodeArrangementScenes,lockScriptSceneHeadings,normalizeEpisodeArrangementText,novelSceneTransitionCandidates,removeRedundantScreenplayTimeLines,validatePlainOutput }=await import("../src/llm.js");

test("screenplay cleanup removes Markdown wrappers before structural parsing",()=>{
  const cleaned=cleanEpisodeText("**EP01**\n\n**1 \u5185 \u51fa\u79df\u5c4b \u591c**\n\n**\u65b9\u91ce\uff1a\u6211\u56de\u6765\u4e86\u3002**\n\n**\n\n---");
  assert.equal(cleaned,"1 \u5185 \u51fa\u79df\u5c4b \u591c\n\u65b9\u91ce\uff1a\u6211\u56de\u6765\u4e86\u3002");
});

test("screenplay cleanup splits crowded action and dialogue without model repair",()=>{
  const cleaned=cleanEpisodeText("1 内 仓库 夜\n方野走过去。苏婉清：站住！ 方野：凭什么？");
  assert.equal(cleaned,"1 内 仓库 夜\n方野走过去。\n苏婉清：站住！\n方野：凭什么？");
});

test("screenplay cleanup removes only standalone minute/hour narration before counting",()=>{
  const lines=removeRedundantScreenplayTimeLines(["1 内 仓库 夜","十分钟后。","方野 V.O.：只剩十分钟。","距离爆炸只剩三分钟。","方野：我等了两个小时。","半小时过去了。"]);
  assert.deepEqual(lines,["1 内 仓库 夜","方野 V.O.：只剩十分钟。","距离爆炸只剩三分钟。","方野：我等了两个小时。"]);
});

test("screenplay cleanup removes a bare wait clause and restores its subject",()=>{
  const lines=removeRedundantScreenplayTimeLines([
    "他等了十分钟，拎着两大袋药冲回住处。",
    "方野又等了半小时，推开药店后门。",
    "方野等了十分钟，医生终于走出手术室。",
    "距离爆炸只剩三分钟，方野冲向出口。"
  ]);
  assert.deepEqual(lines,[
    "他拎着两大袋药冲回住处。",
    "方野推开药店后门。",
    "方野等了十分钟，医生终于走出手术室。",
    "距离爆炸只剩三分钟，方野冲向出口。"
  ]);
});

test("screenplay validation rejects explicit third-person self-reference in protagonist VO only",()=>{
  const bad="1 内 仓库 夜\n方野 V.O.：方野必须救出母亲。\n方野：我会回来。";
  const issue=validatePlainOutput("episode",bad,{protagonistIdentifier:"方野",minEffectiveCharacters:0,maxEffectiveCharacters:9999});
  assert.match(issue,/主角V\.O\.仍用第三人称称呼主角本人/);
  const safe="1 内 仓库 夜\n方野 V.O.：他已经发现我了。\n方野：我会回来。";
  assert.doesNotMatch(validatePlainOutput("episode",safe,{protagonistIdentifier:"方野",minEffectiveCharacters:0,maxEffectiveCharacters:9999}),/主角V\.O\.仍用第三人称称呼主角本人/);
});

test("screenplay validation reports every forbidden expression with its scene",()=>{
  const script="1 内 仓库 夜\n方野眉头一皱。\n方野：站住。\n2 外 街口 日\n苏婉清眼睛一亮。\n苏婉清：是他。";
  const plan="【剧情安排】\n1 内 仓库 夜\n（方野阻拦）\n2 外 街口 日\n（苏婉清发现目标）\n【逻辑推理】";
  const issue=validatePlainOutput("episode",script,{episode:{episode_plan:plan},minEffectiveCharacters:0,maxEffectiveCharacters:9999});
  assert.match(issue,/第1场.*眉头一皱/);
  assert.match(issue,/第2场.*眼睛一亮/);
});

test("existing script headings are renumbered while legacy missing scenes can be patched",()=>{
  const plan=`【剧情安排】
1 外 巷口 下午
（方野等车）
2 内 黑色商务车内 下午
（方野扶母亲上车+车辆穿过城区）
3 外 高档公寓楼前 下午
（商务车停下）
【逻辑推理】
逻辑检查：✓ 无问题`;
  const partial=`1 外 巷口 日
方野站在路边。
3 外 高档公寓楼前 日
商务车停下。`;
  const error="剧本场次数与剧情安排不一致：剧情安排3场，剧本2场";
  assert.match(buildMissingScriptScenesPrompt(partial,error,{episode:{episode_plan:plan}}),/缺失场次2/);
  const patched=applyMissingScriptScenes(partial,`【补写场次2】
**2 内 黑色商务车内 下午**
方野扶着母亲上车。
方野：妈，慢点。
【补写结束】`,{episode:{episode_plan:plan}});
  assert.match(patched,/1 外 巷口 下午/);
  assert.match(patched,/2 内 黑色商务车内 下午/);
  assert.match(patched,/3 外 高档公寓楼前 下午/);
  const completeWithLooseHeadings=`1 外 巷口 日\n方野等车。\n2 内 黑色商务车 日\n方野上车。\n3 外 公寓楼前 日\n商务车停下。`;
  assert.equal(lockScriptSceneHeadings(completeWithLooseHeadings,plan).split("\n").filter(line=>/^\d+\s/.test(line)).join("\n"),"1 外 巷口 日\n2 内 黑色商务车 日\n3 外 公寓楼前 日");
});

test("screenplay may use a different scene count from the arrangement",()=>{
  const plan="【剧情安排】\n1 内 仓库 夜\n（进入仓库+发生交锋）\n【逻辑推理】";
  const script="1 外 仓库门口 夜\n方野：开门。\n2 内 仓库 夜\n苏婉清：进来。";
  const issue=validatePlainOutput("episode",script,{episode:{episode_plan:plan},minEffectiveCharacters:0,maxEffectiveCharacters:9999});
  assert.doesNotMatch(issue,/场次数与剧情安排不一致|未对应剧情安排地点/);
});

const wrap=arrangement=>`【情绪走向】
本集情绪曲线：压力→cliffhanger
【情绪节点】
压透：危机加深
【剧情安排】
${arrangement}
【逻辑推理】
1. 事件如何承接？→前因导致后果
逻辑检查：✓ 无问题`;

test("拒绝剧情安排标题中的时间占位词",()=>{
  const issue=validatePlainOutput("episode_arrangement",wrap(`1 外 城中村出租屋 时间
（方野返回住处+发现母亲病情恶化）`));
  assert.match(issue,/格式说明当成了真实时空/);
});

test("接受程序归一后的箭头地点路线",()=>{
  const original=wrap(`1 外 城中村巷道/城中村巷口 凌晨
（方野穿过巷道）`);
  const normalized=normalizeEpisodeArrangementText(original);
  assert.match(normalized,/1 外 城中村巷道→城中村巷口 凌晨/);
  const issue=validatePlainOutput("episode_arrangement",original);
  assert.equal(issue,"");
});

test("接受超过三个且逐一独立编号的真实场次",()=>{
  const issue=validatePlainOutput("episode_arrangement",wrap(`1 外 城中村巷道 凌晨
（方野甩开跟踪）
2 内 临时住所 凌晨
（方野取出药方）
3 外 药店 清晨
（方野买药）
4 内 临时住所 清晨
（方野照顾母亲）`));
  assert.equal(issue,"");
});

test("接受带具体钟点和自然口语的时段",()=>{
  const issue=validatePlainOutput("episode_arrangement",wrap(`1 外 高档公寓楼前 下午一点多
（车辆停下+人物在楼前与助理交谈）
2 内 高档公寓 晚上
（双方当面对质+秘密即将揭开）`));
  assert.equal(issue,"");
});

test("接受完整的自然时段、钟点和范围表达",()=>{
  const arrangements=[
    "1 外 公寓楼前 晚\n（人物抵达）",
    "1 外 河岸 晨\n（人物醒来）",
    "1 内 病房 当晚\n（医生通知结果）",
    "1 外 车站 次日清晨\n（人物登车）",
    "1 内 办公室 13:30\n（会议开始）",
    "1 内 客厅 晚上八点半\n（双方对质）",
    "1 外 街道 下午一点多至傍晚\n（人物持续寻找线索）",
    "1 内 食堂 饭后不久\n（双方交换消息）",
    "1 外 校门 放学后\n（人物遭到拦截）",
    "1 外 山顶 日落前\n（人物找到目标）",
    "1 内 病房 三天后\n（病人醒来）"
  ];
  for(const arrangement of arrangements)assert.equal(validatePlainOutput("episode_arrangement",wrap(arrangement)),"",arrangement);
});

test("地点方位词不能冒充时间",()=>{
  const issue=validatePlainOutput("episode_arrangement",wrap(`1 外 高档公寓楼前
（车辆停下+人物进入公寓）`));
  assert.match(issue,/缺少明确时段/);
});

test("程序自动捋顺重复的场次编号",()=>{
  const issue=validatePlainOutput("episode_arrangement",wrap(`1 外 巷道 夜
（方野穿过巷道）
1 内 出租屋 夜
（方野推门进屋）`));
  assert.equal(issue,"");
});

test("程序把同一场标题下裂开的多个圆括号段合成事件链",()=>{
  const original=wrap(`22 内 高档公寓阳台 夜
（方野扶着母亲在阳台透气+方野作出决定）

（他感受到肩上的责任）

（决定直面困境）`),normalized=normalizeEpisodeArrangementText(original);
  assert.match(normalized,/1 内 高档公寓阳台 夜\n（方野扶着母亲在阳台透气\+方野作出决定\+他感受到肩上的责任\+决定直面困境）/);
  assert.equal((normalized.match(/^[（(]/gm)||[]).length,1);
  assert.equal(validatePlainOutput("episode_arrangement",original),"");
});

test("不在占位词表中的自然时间直接通过",()=>{
  const issue=validatePlainOutput("episode_arrangement",wrap(`4 内 城中村出租屋 凌晨至天明
（方野守在母亲床边）`));
  assert.equal(issue,"");
});

test("接受并归一常见的标题编号格式",()=>{
  const text=`【情绪走向】\n曲线\n【情绪节点】\n节点\n【剧情安排】\n1. 外 巷口 日\n（甲+乙）\n2、内 出租屋 夜\n（丙+钩子）\n【逻辑推理】\n逻辑检查：✓ 无问题`;
  assert.equal(validatePlainOutput("episode_arrangement",text),"");
});

test("接受场次前缀、冒号和 Markdown 标题",()=>{
  const text=`【情绪走向】\n曲线\n【情绪节点】\n节点\n【剧情安排】\n### **场次一：外景：巷口 日**\n（甲+乙）\n场次2：内｜出租屋 夜\n（丙+钩子）\n【逻辑推理】\n逻辑检查：✓ 无问题`;
  assert.equal(validatePlainOutput("episode_arrangement",text),"");
});

test("程序合并相邻的完全相同场次并连续重编号",()=>{
  const text=wrap(`1 内 高档公寓 深夜
（事件A+事件B）
2 内 高档公寓 深夜
（事件B+事件C）
3 外 公寓楼前 深夜
（事件D）`);
  const output=consolidateEpisodeArrangementScenes(text);
  assert.match(output,/1 内 高档公寓 深夜\n（事件A\+事件B\+事件C）/);
  assert.match(output,/2 外 公寓楼前 深夜\n（事件D）/);
  assert.doesNotMatch(output,/3 外 公寓楼前/);
});

test("程序按200汉字阈值合并同内外景同时段的包含地点",()=>{
  const text=wrap(`1 外 城中村巷道 凌晨
（方野沿巷道寻找线索）
2 外 城中村巷道垃圾堆旁 凌晨
（方野翻找垃圾并发现关键物品）
3 内 出租屋 凌晨
（方野回家）`);
  const output=consolidateEpisodeArrangementScenes(text);
  assert.match(output,/1 外 城中村巷道→城中村巷道垃圾堆旁 凌晨/);
  assert.match(output,/2 内 出租屋 凌晨/);
});

test("程序不合并内外景或时段不同的相邻场次",()=>{
  const text=wrap(`1 外 城中村巷道 凌晨
（事件A）
2 内 城中村巷道垃圾堆旁 凌晨
（事件B）
3 外 城中村巷道垃圾堆旁 清晨
（事件C）`);
  const output=consolidateEpisodeArrangementScenes(text);
  assert.match(output,/1 外 城中村巷道 凌晨/);
  assert.match(output,/2 内 城中村巷道垃圾堆旁 凌晨/);
  assert.match(output,/3 外 城中村巷道垃圾堆旁 清晨/);
});

test("拒绝事件链中途进入另一真实地点却没有分场",()=>{
  const issue=validatePlainOutput("episode_arrangement",wrap(`1 外 城中村巷道 凌晨
（方野确认无人跟踪+靠墙点烟+走进城中村出租屋+冲到母亲床边）`));
  assert.match(issue,/中途已经发生明确地点转换/);
});

test("允许新场第一项用进入动作完成落地",()=>{
  const issue=validatePlainOutput("episode_arrangement",wrap(`1 外 城中村巷道 凌晨
（方野确认无人跟踪+靠墙点烟）
2 内 城中村出租屋 凌晨
（方野推开出租屋铁门+冲到母亲床边）`));
  assert.equal(issue,"");
});

test("单纯开门动作不判定为地点转换",()=>{
  const issue=validatePlainOutput("episode_arrangement",wrap(`1 外 城中村出租屋门口 凌晨
（方野敲门+推开出租屋铁门+站在门口与房东对话）`));
  assert.equal(issue,"");
});

test("一次列出全部明确的漏切地点转换",()=>{
  const issue=validatePlainOutput("episode_arrangement",wrap(`1 外 城中村巷道 凌晨
（方野确认无人跟踪+走进城中村出租屋+冲回卧室）
2 外 医院门口 清晨
（方野下车+进入医院病房+返回公司办公室）`));
  assert.match(issue,/走进城中村出租屋/);
  assert.match(issue,/冲回卧室/);
  assert.match(issue,/进入医院病房/);
  assert.match(issue,/返回公司办公室/);
});

test("转场返修由程序截取事件链且模型只补标题",()=>{
  const original=`【情绪走向】\n保持不变\n\n【情绪节点】\n保持不变\n\n【剧情安排】\n1 外 城中村巷道 凌晨\n（方野跑向药店+方野走进药店+方野递出药方）\n\n2 内 出租屋 清晨\n（方野照顾母亲）\n\n【逻辑推理】\n逻辑检查：✓ 无问题`;
  const error="以下事件链中途已经发生明确地点转换，应分别从对应事件开始建立新场次：场次1第2项“方野走进药店”";
  const prompt=buildLocalArrangementRepairPrompt(original,error,{episode:{novel:"方野跑向药店。方野走进药店，递出药方。"}});
  assert.match(prompt,/场次1-1/);assert.match(prompt,/已经由程序截出的事件链：方野走进药店\+方野递出药方/);assert.doesNotMatch(prompt,/小说原文/);
  const patched=applyLocalArrangementRepair(original,"场次1-1｜内 药店 凌晨",error);
  assert.match(patched,/1 外 城中村巷道 凌晨/);assert.match(patched,/2 内 药店 凌晨/);assert.match(patched,/3 内 出租屋 清晨/);assert.match(patched,/【情绪节点】\n保持不变/);assert.match(patched,/【逻辑推理】\n逻辑检查：✓ 无问题/);
});

test("一次为同一错误场次中的多个转场片段补标题",()=>{
  const original=wrap(`1 外 城中村巷道 凌晨
（方野确认无人跟踪+方野走进药店+方野买到药+方野回到出租屋+方野给母亲喂药）`);
  const error="以下事件链中途已经发生明确地点转换，应分别从对应事件开始建立新场次：场次1第2项“方野走进药店”；场次1第4项“方野回到出租屋”";
  const prompt=buildLocalArrangementRepairPrompt(original,error,{});assert.match(prompt,/场次1-1/);assert.match(prompt,/场次1-2/);
  const patched=applyLocalArrangementRepair(original,"场次1-1｜内 药店 凌晨\n场次1-2｜内 出租屋 凌晨",error);
  assert.match(patched,/1 外 城中村巷道 凌晨\n（方野确认无人跟踪）/);assert.match(patched,/2 内 药店 凌晨\n（方野走进药店\+方野买到药）/);assert.match(patched,/3 内 出租屋 凌晨\n（方野回到出租屋\+方野给母亲喂药）/);
});

test("完整验收优先返回整体问题而不是进入转场补丁",()=>{
  const text=`【情绪走向】\n本集情绪曲线：压力→悬念\n【情绪节点】\n压透：危机\n【剧情安排】\n1 外 巷道 凌晨\n（方野确认无人跟踪+方野走进药店）\n【逻辑推理】\n1. 为什么行动？→ 因为危机。`;
  const issue=validatePlainOutput("episode_arrangement",text);assert.match(issue,/缺少最终逻辑检查结论/);assert.doesNotMatch(issue,/地点转换/);
});

test("缺少时段只补场次标题且原事件链不变",()=>{
  const original=wrap(`1 外 城中村巷道
（方野确认无人跟踪+方野靠墙休息）`),error="场次1标题缺少明确时段：“1 外 城中村巷道”";
  const prompt=buildLocalArrangementRepairPrompt(original,error,{});assert.match(prompt,/禁止返回或改写事件链/);
  const patched=applyLocalArrangementRepair(original,"场次1｜外 城中村巷道 凌晨",error);
  assert.match(patched,/1 外 城中村巷道 凌晨/);assert.match(patched,/（方野确认无人跟踪\+方野靠墙休息）/);
});

test("生成前从小说提取明确落地的转场候选但忽略开门",()=>{
  const candidates=novelSceneTransitionCandidates("方野推开铁门，站在门口说话。随后他走进24小时药店，与老板交易。汽车停在高档公寓楼前。之后他回到公司办公室。 ");
  assert.equal(candidates.length,3);
  assert.ok(candidates.some(item=>item.includes("走进24小时药店")));
  assert.ok(candidates.some(item=>item.includes("停在高档公寓楼前")));
  assert.ok(candidates.some(item=>item.includes("回到公司办公室")));
  assert.ok(candidates.every(item=>!item.includes("推开铁门")));
});
