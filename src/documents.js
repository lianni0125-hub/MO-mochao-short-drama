import fs from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableCell, TableRow, WidthType, ImageRun, AlignmentType, BorderStyle, VerticalAlign, TableLayoutType, PageBreak } from "docx";
import { config } from "./config.js";
import { DEFAULT_TEMPLATE } from "./default-template.js";

const sectionAliases = [
  ["benchmark", /对标|改编方向/], ["synopsis", /故事梗概|梗概/], ["cards", /集数和付费卡点|卡点/],
  ["expectations", /核心期待/], ["visual", /画面对标|视觉参考/], ["characters", /人物人设|人物小传/],
  ["script", /^中文DRAFT$|^EP\s*0*1/i], ["worldbuilding", /世界观/]
];

function classify(lines) {
  const sections = {};
  let current = "overview";
  for (const line of lines) {
    const hit = sectionAliases.find(([, pattern]) => pattern.test(line.trim()));
    if (hit) current = hit[0];
    (sections[current] ||= []).push(line);
  }
  const scriptLines = sections.script || [];
  const scenePattern = /^\d+\s+(内景|外景|内|外)\s+.+/;
  const dialoguePattern = /^[\w\u4e00-\u9fff .（）()]+[:：]/;
  const episodes=[];let episodeCurrent=null;
  for(const line of scriptLines){const match=line.match(/^EP\s*0*(\d+)/i);if(match){episodeCurrent={episodeNo:Number(match[1]),lines:[]};episodes.push(episodeCurrent);}else if(episodeCurrent)episodeCurrent.lines.push(line);}
  const episodeStats=episodes.map(ep=>{const text=ep.lines.join("");return {episodeNo:ep.episodeNo,characters:(text.match(/\p{Script=Han}/gu)||[]).length,paragraphs:ep.lines.length,scenes:ep.lines.filter(x=>scenePattern.test(x)).length,dialogueLines:ep.lines.filter(x=>dialoguePattern.test(x)).length,parentheticals:(text.match(/（[^）]+）|\([^\)]+\)/g)||[]).length,bracketNotes:(text.match(/【[^】]+】|\[[^\]]+\]/g)||[]).length};});
  const avg=key=>episodeStats.length?Math.round(episodeStats.reduce((sum,x)=>sum+x[key],0)/episodeStats.length*10)/10:0;
  return {
    sections,
    detected: {
      hasPlanningTemplate: Object.keys(sections).some(x => ["benchmark", "synopsis", "cards", "characters"].includes(x)),
      hasScriptSample: scriptLines.some(x => /^EP\s*\d+/i.test(x)),
      episodeHeadings: scriptLines.filter(x => /^EP\s*\d+/i.test(x)),
      sceneHeadingCount: scriptLines.filter(x => scenePattern.test(x)).length,
      dialogueCount: scriptLines.filter(x => dialoguePattern.test(x)).length
    },
    planningSections: DEFAULT_TEMPLATE.planningSections,
    inferredScriptFormat: {
      episodeHeading: "EP01",
      sceneHeading: "场次序号 外/内 地点 日/夜",
      action: "动作、环境和表情使用独立段落",
      dialogue: "角色名：台词",
      voiceOver: "角色名 V.O.：画外音；角色名 OS：内心独白，均不使用括号",
      specialSpeaker: "系统音：播报内容",
      notes: "制作或蒙太奇提示使用方括号",
      novelCharacters:{...DEFAULT_TEMPLATE.scriptFormat.novelCharacters},
      targetCharacters:episodeStats.length?{min:Math.min(...episodeStats.map(x=>x.characters)),average:avg("characters"),max:Math.max(...episodeStats.map(x=>x.characters))}:null,
      targetScenes:episodeStats.length?{min:Math.min(...episodeStats.map(x=>x.scenes)),average:avg("scenes"),max:Math.max(...episodeStats.map(x=>x.scenes))}:null,
      writingRules:["动作和环境独立成段且必须可拍摄","对白采用角色名加冒号","神态只有改变剧情信息时才写成独立动作","避免对白后堆叠括号表演说明","括号仅保留V.O./OS等声音来源","方括号仅用于必要蒙太奇或制作提示","结尾必须形成续看钩子"],
      normalization: ["统一系统音/系统声", "统一 V.O./OS", "统一中英文标点与空格"]
    },
    episodeStats,
    sourceAnalysis:{
      sampleEpisodes:episodeStats.length,
      averageCharacters:avg("characters"),
      minCharacters:episodeStats.length?Math.min(...episodeStats.map(x=>x.characters)):0,
      maxCharacters:episodeStats.length?Math.max(...episodeStats.map(x=>x.characters)):0,
      averageScenes:avg("scenes"),
      totalSceneHeadings:episodeStats.reduce((sum,x)=>sum+x.scenes,0),
      totalDialogueLines:episodeStats.reduce((sum,x)=>sum+x.dialogueLines,0)
    }
  };
}

export async function analyzeDocx(filePath) {
  const { value } = await mammoth.extractRawText({ path: filePath });
  const lines = value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const analysis=classify(lines);
  const scriptStart=value.search(/(?:^|\n)\s*EP\s*0*1\b/i);
  if(scriptStart>=0){
    const script=value.slice(scriptStart);
    const thirdEpisode=script.search(/\n\s*EP\s*0*3\b/i);
    analysis.inferredScriptFormat.sampleExcerpt=script.slice(0,thirdEpisode>0?thirdEpisode:Math.min(script.length,6000)).trim();
  }else analysis.inferredScriptFormat.sampleExcerpt="";
  return { text: value, analysis: { ...analysis, lineCount: lines.length, characterCount: value.length } };
}

function valueParagraphs(value, level = HeadingLevel.HEADING_2) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap((item, i) => [new Paragraph({ text: `${i + 1}. ${typeof item === "string" ? item : JSON.stringify(item, null, 2)}` })]);
  if (typeof value === "object") return Object.entries(value).flatMap(([k, v]) => [new Paragraph({ text: k, heading: level }), ...valueParagraphs(v, HeadingLevel.HEADING_3)]);
  return String(value).split("\n").map(text => new Paragraph({ children: [new TextRun(text)] }));
}

const labels={benchmark_works:"对标作品",adaptation_direction:"改编方向和思路",framework:"框架",worldbuilding:"世界观",character_direction:"人设方向",ai_spectacles:"利用AI制作的大场景",opening_state:"开场状态",inciting_incident:"诱发事件",core_mechanism:"核心机制",development:"发展",conspiracy_or_reversal:"阴谋/反转",ending_direction:"结局方向",synopsis:"故事梗概",total_episodes:"总集数",card_1:"一卡付费集",card_2:"二卡付费集",card_3:"三卡付费集",core_expectations:"核心期待",visual_references:"画面对标"};
function labeledParagraphs(value){if(value==null||value==="")return[];if(Array.isArray(value))return value.flatMap((x,i)=>[new Paragraph({text:`${i+1}. ${typeof x==="string"?x:JSON.stringify(x)}`})]);if(typeof value==="object")return Object.entries(value).flatMap(([k,v])=>[new Paragraph({text:labels[k]||k,heading:HeadingLevel.HEADING_2}),...labeledParagraphs(v)]);return String(value).split("\n").map(text=>new Paragraph({text}));}
const tableBorders={top:{style:BorderStyle.SINGLE,size:0,color:"DEE0E3"},bottom:{style:BorderStyle.SINGLE,size:0,color:"DEE0E3"},left:{style:BorderStyle.SINGLE,size:0,color:"DEE0E3"},right:{style:BorderStyle.SINGLE,size:0,color:"DEE0E3"},insideHorizontal:{style:BorderStyle.SINGLE,size:0,color:"DEE0E3"},insideVertical:{style:BorderStyle.SINGLE,size:0,color:"DEE0E3"}};
const screenplayRun=(text,options={})=>new TextRun({text,font:{ascii:"Arial",hAnsi:"Arial",eastAsia:"等线"},size:options.size||22,bold:Boolean(options.bold),color:options.color});
const screenplayParagraph=(children,options={})=>new Paragraph({children:Array.isArray(children)?children:[screenplayRun(String(children??""),options)],alignment:options.alignment||AlignmentType.LEFT,spacing:{before:options.before??120,after:options.after??120,line:288,lineRule:"auto"}});
const cell=(children,width)=>new TableCell({children,width:{size:width,type:WidthType.DXA},verticalAlign:VerticalAlign.TOP,margins:{top:60,bottom:30,left:120,right:120}});
function rasterDimensions(data,type){if(type==="png"&&data.length>=24)return {width:data.readUInt32BE(16),height:data.readUInt32BE(20)};if(type==="gif"&&data.length>=10)return {width:data.readUInt16LE(6),height:data.readUInt16LE(8)};if(type==="jpg"){let offset=2;while(offset+9<data.length){if(data[offset]!==0xff){offset++;continue}const marker=data[offset+1],length=data.readUInt16BE(offset+2);if(marker>=0xc0&&marker<=0xc3)return {height:data.readUInt16BE(offset+5),width:data.readUInt16BE(offset+7)};if(length<2)break;offset+=2+length}}return {width:2,height:3};}
function fittedImage(data,type,maxWidth=145,maxHeight=230){const source=rasterDimensions(data,type),scale=Math.min(maxWidth/source.width,maxHeight/source.height,1);return {width:Math.max(1,Math.round(source.width*scale)),height:Math.max(1,Math.round(source.height*scale))};}
function characterTable(characters,images){const widths=[1800,1800,2880,2400],headerParagraph=text=>screenplayParagraph([screenplayRun(text,{bold:true})]);const rows=[new TableRow({children:["角色","人名","人物小传","形象参考"].map((text,index)=>cell([headerParagraph(text)],widths[index]))})];characters.forEach((c,i)=>{const image=images.find(x=>x.character_index===i);let imageChildren=[screenplayParagraph("未生成/未上传",{alignment:AlignmentType.CENTER})];if(image?.file_path&&fs.existsSync(image.file_path)){const ext=path.extname(image.file_path).toLowerCase(),type=ext===".png"?"png":ext===".gif"?"gif":"jpg",data=fs.readFileSync(image.file_path),transformation=fittedImage(data,type);imageChildren=[screenplayParagraph([new ImageRun({data,transformation,type})],{alignment:AlignmentType.CENTER})];}const profile=[];if(c.age)profile.push(screenplayParagraph([screenplayRun("年龄",{bold:true}),screenplayRun(`：${c.age}`)]));if(c.personality)profile.push(screenplayParagraph([screenplayRun("性格",{bold:true}),screenplayRun(`：${c.personality}`)]));if(c.biography)profile.push(screenplayParagraph([screenplayRun("人物小传",{bold:true}),screenplayRun(`：${c.biography}`)]));if(c.visual_transformation)profile.push(screenplayParagraph(`【${String(c.visual_transformation).replace(/^【|】$/g,"")}】`));if(c.performance_rules?.length)profile.push(screenplayParagraph(`表演规则：${c.performance_rules.join("；")}`));rows.push(new TableRow({cantSplit:true,children:[cell([screenplayParagraph(c.role||"")],widths[0]),cell([screenplayParagraph(c.name||"")],widths[1]),cell(profile.length?profile:[screenplayParagraph("")],widths[2]),cell(imageChildren,widths[3])]}));});return new Table({layout:TableLayoutType.FIXED,columnWidths:widths,borders:tableBorders,rows});}

const heading=(text,level=HeadingLevel.HEADING_1)=>new Paragraph({text,heading:level,spacing:{before:240,after:140}});
const bodyParagraphs=value=>String(value??"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(text=>new Paragraph({text,alignment:AlignmentType.JUSTIFIED,spacing:{line:360,after:100},indent:{firstLine:480}}));
const stripEpisodeHeading=text=>String(text||"").replace(/^\s*(?:\*\*)?\s*EP\s*0*\d+(?:\s*【[^】]+】)?\s*(?:\*\*)?\s*(?:\r?\n|$)/i,"").trim();
function planningValue(artifacts,key){const planning=artifacts.find(x=>x.type==="planning")?.content||{};const value=planning[key];return typeof value==="string"?value:value==null?"":JSON.stringify(value,null,2);}

function screenplayChildren(project,artifacts,episodes,characterImages){
  const children=[screenplayParagraph([screenplayRun(project.title,{bold:true,size:52})],{before:480,after:480})];
  const fields=[["框架","framework"],["世界观","worldbuilding"],["故事梗概","synopsis"],["核心期待","core_expectations"]];
  fields.forEach(([label,key],index)=>{children.push(screenplayParagraph([screenplayRun(`${index+1}）${index===0?" ":""}${label}`,{bold:true})]));const color=key==="core_expectations"?"245BDB":undefined,bold=key==="framework";String(planningValue(artifacts,key)).split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach(text=>children.push(screenplayParagraph([screenplayRun(text,{bold,color})])))});
  const characterArtifact=artifacts.find(x=>x.type==="characters")?.content;
  if(Array.isArray(characterArtifact?.characters)&&characterArtifact.characters.length)children.push(screenplayParagraph([screenplayRun("人物人设",{bold:true,size:32})],{before:320}),characterTable(characterArtifact.characters,characterImages));
  children.push(screenplayParagraph([screenplayRun("中文DRAFT",{bold:true,size:36})],{before:380,after:140}));
  episodes.forEach(ep=>{children.push(screenplayParagraph([screenplayRun(`EP${String(ep.episode_no).padStart(2,"0")}`,{bold:true,size:32})],{before:320}));const text=stripEpisodeHeading(ep.script);String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach(line=>children.push(screenplayParagraph(line)));});
  return children;
}

function novelChildren(project,artifacts,episodes){
  const synopsis=planningValue(artifacts,"synopsis"),children=[new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:360,after:360},children:[new TextRun({text:project.title,bold:true,size:40,font:"宋体"})]})];
  if(synopsis){children.push(heading("作品简介",HeadingLevel.HEADING_1),...bodyParagraphs(synopsis),new Paragraph({children:[new PageBreak()]}));}
  children.push(heading("正文",HeadingLevel.HEADING_1));episodes.forEach((ep,index)=>{children.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{before:index?300:120,after:180},children:[new TextRun({text:String(ep.episode_no),bold:true,size:28})]}));children.push(...bodyParagraphs(ep.novel));});return children;
}

export async function exportProjectDocx(project, artifacts, episodes, characterImages=[],options={}) {
  const type=options.type==="novel"?"novel":"script",children=type==="novel"?novelChildren(project,artifacts,episodes):screenplayChildren(project,artifacts,episodes,characterImages);
  const defaultRun=type==="script"?{font:{ascii:"Arial",hAnsi:"Arial",eastAsia:"等线"},size:22}:{font:"宋体",size:24};const defaultParagraph=type==="script"?{alignment:AlignmentType.LEFT,spacing:{before:120,after:120,line:288}}:{spacing:{line:300}};
  const doc = new Document({styles:{default:{document:{run:defaultRun,paragraph:defaultParagraph}},paragraphStyles:[{id:"Title",name:"Title",basedOn:"Normal",next:"Normal",quickFormat:true,run:{font:"宋体",size:40,bold:true},paragraph:{alignment:AlignmentType.CENTER,spacing:{after:360}}},{id:"Heading1",name:"Heading 1",basedOn:"Normal",next:"Normal",quickFormat:true,run:{font:"黑体",size:30,bold:true},paragraph:{spacing:{before:260,after:140}}},{id:"Heading2",name:"Heading 2",basedOn:"Normal",next:"Normal",quickFormat:true,run:{font:"黑体",size:27,bold:true},paragraph:{spacing:{before:220,after:120}}}]},sections: [{ properties: {page:{size:{width:11905,height:16840}}}, children }] });
  const buffer = await Packer.toBuffer(doc);
  const safe = project.title.replace(/[<>:"/\\|?*]/g, "_");
  const filename = `${safe}_${type==="novel"?"小说稿":"剧本稿"}_${Date.now()}.docx`;
  const target = path.join(config.exportsDir, filename);
  fs.writeFileSync(target, buffer);
  return { filename, target };
}
