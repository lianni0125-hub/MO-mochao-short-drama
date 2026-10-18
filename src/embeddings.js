import OpenAI from "openai";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { activeEmbeddingProvider, config, embeddingProviderDefaults } from "./config.js";

const clean=value=>String(value||"").replace(/\s+/g," ").trim();
function mockVector(value){const vector=new Array(64).fill(0);for(const [index,char] of [...clean(value)].entries())vector[(char.codePointAt(0)+index*17)%vector.length]+=1;const norm=Math.hypot(...vector)||1;return vector.map(item=>item/norm);}

const batchProfilePath=path.join(config.dataDir,"embedding-batch-profile.json");
let batchProfileLoaded=false,batchProfile=null;
const providerFingerprint=provider=>crypto.createHash("sha256").update(JSON.stringify({id:provider.id||"custom",baseUrl:String(provider.baseUrl||"").replace(/\/$/,""),model:provider.model||"",key:crypto.createHash("sha256").update(provider.apiKey||"").digest("hex")})).digest("hex");
function readBatchProfile(){if(batchProfileLoaded)return batchProfile;batchProfileLoaded=true;try{batchProfile=JSON.parse(fs.readFileSync(batchProfilePath,"utf8"));}catch{batchProfile=null;}return batchProfile;}
function writeBatchProfile(profile){batchProfile=profile;batchProfileLoaded=true;try{fs.mkdirSync(path.dirname(batchProfilePath),{recursive:true});fs.writeFileSync(batchProfilePath,JSON.stringify(profile),"utf8");}catch{}}
function learnedBatchLimit(provider){const fingerprint=providerFingerprint(provider),saved=readBatchProfile();if(saved?.fingerprint&&saved.fingerprint!==fingerprint){writeBatchProfile({fingerprint,limit:null});return null;}return Number.isInteger(saved?.limit)&&saved.limit>0?saved.limit:null;}
function rememberBatchLimit(provider,limit){if(Number.isInteger(limit)&&limit>0)writeBatchProfile({fingerprint:providerFingerprint(provider),limit,updatedAt:new Date().toISOString()});}

export function embeddingBatchLimitError(error){
  const material=[error?.message,error?.error?.message,error?.response?.data?.error?.message,error?.cause?.message].filter(Boolean).join(" ");
  const baiduLimit = material.match(/\bembeddings?\s+max\s+input\s+length\s+is\s+(\d+)\b/i);
  if (baiduLimit) {
    return {
      recognized: true,
      limit: Number(baiduLimit[1])
    };
  }
  const batchContext=/(?:batch[ _-]?(?:size|count)|input\.contents|too\s+many\s+inputs|number\s+of\s+inputs|input\s+count|contents?\s+(?:count|size)|批量|批次|输入数量|输入条数|文本数量|文本条数|数组(?:大小|长度|数量))/i.test(material);
  const limitContext=/(?:not\s+(?:be\s+)?(?:larger|greater)\s+than|no\s+more\s+than|at\s+most|maximum|max(?:imum)?|limit(?:ed)?\s+to|too\s+(?:many|large)|invalid|不得超过|不能超过|不可超过|最多|上限|最大|数量无效|批量大小无效)/i.test(material);
  if(!batchContext||!limitContext)return {recognized:false,limit:null};
  const patterns=[
    /(?:not\s+(?:be\s+)?(?:larger|greater)\s+than|no\s+more\s+than|at\s+most|limit(?:ed)?\s+to|maximum(?:\s+(?:batch\s+)?size)?(?:\s+is|\s+of|\s*[:=])?|max(?:imum)?(?:\s+(?:batch\s+)?size)?(?:\s+is|\s+of|\s*[:=])?)\s*(\d+)/i,
    /(?:不得超过|不能超过|不可超过|最多(?:为|是)?|上限(?:为|是|：|:)?|最大(?:批量|批次|数量|条数)?(?:为|是|：|:)?)\s*(\d+)/i,
    /(?:batch(?:\s*size)?|inputs?|input\.contents|contents|texts?|批量|批次|输入数量|文本数量).{0,80}?(\d+)/i
  ];
  for(const pattern of patterns){const value=Number(material.match(pattern)?.[1]);if(Number.isInteger(value)&&value>=1&&value<=2048)return {recognized:true,limit:value};}
  return {recognized:true,limit:null};
}

export function embeddingConfigured(){const provider=activeEmbeddingProvider();return provider.id==="mock"?process.env.ALLOW_MOCK_WORKFLOWS==="1":Boolean(provider.apiKey&&provider.baseUrl&&provider.model);}

async function requestEmbeddingBatch(input,provider,{signal,purpose}){
  if(provider.protocol==="gemini"){
    const model=provider.model.replace(/^models\//,""),resource=`models/${model}`,endpoint=`${provider.baseUrl.replace(/\/$/,"")}/${resource}:batchEmbedContents`;
    const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":provider.apiKey},body:JSON.stringify({requests:input.map(value=>({model:resource,content:{parts:[{text:value}]},taskType:purpose==="query"?"RETRIEVAL_QUERY":"RETRIEVAL_DOCUMENT",outputDimensionality:768}))}),signal});
    const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`Google Gemini Embedding 请求失败（${response.status}）：${body?.error?.message||response.statusText}`);
    const vectors=(body.embeddings||[]).map(item=>item.values);if(vectors.length!==input.length||vectors.some(item=>!Array.isArray(item)||!item.length))throw new Error("Google Gemini Embedding 返回的向量数量或格式不正确");return vectors;
  }
  if(provider.protocol==="minimax"){
    const base=provider.baseUrl.replace(/\/$/,""),endpoint=new URL(base.endsWith("/embeddings")?base:`${base}/embeddings`);if(provider.groupId)endpoint.searchParams.set("GroupId",provider.groupId);
    const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${provider.apiKey}`},body:JSON.stringify({texts:input,model:provider.model,type:purpose==="query"?"query":"db"}),signal});
    const body=await response.json().catch(()=>({})),status=Number(body?.base_resp?.status_code||0);if(!response.ok||status!==0)throw new Error(`MiniMax Embedding 请求失败（${response.status}）：${body?.base_resp?.status_msg||body?.error?.message||response.statusText}`);
    const vectors=body.vectors||[];if(vectors.length!==input.length||vectors.some(item=>!Array.isArray(item)||!item.length))throw new Error("MiniMax Embedding 返回的向量数量或格式不正确");return vectors;
  }
  const client=new OpenAI({apiKey:provider.apiKey,baseURL:provider.baseUrl,timeout:60000,maxRetries:0});
  const response=await client.embeddings.create({model:provider.model,input,encoding_format:"float"},signal?{signal}:undefined);
  const ordered=[...(response.data||[])].sort((a,b)=>a.index-b.index).map(item=>item.embedding);
  if(ordered.length!==input.length||ordered.some(item=>!Array.isArray(item)||!item.length))throw new Error("Embedding API 返回的向量数量或格式不正确");
  return ordered;
}

export async function embedTexts(values,{signal,providerOverride,purpose="document"}={}){
  const input=values.map(clean).filter(Boolean);if(!input.length)return [];
  const provider=providerOverride||activeEmbeddingProvider();
  if(provider.id==="mock")return input.map(mockVector);
  if(!provider.apiKey||!provider.baseUrl||!provider.model)return [];
  // let limit=learnedBatchLimit(provider)||input.length;
  const providerCap =
    provider.id === "baidu" && provider.model === "bge-large-zh"? 16: Infinity;
  let limit = Math.min(
    learnedBatchLimit(provider) || input.length,
    providerCap
  );
  for(let adjustment=0;adjustment<12;adjustment++){
    try{
      const vectors=[];
      for(let offset=0;offset<input.length;offset+=limit)vectors.push(...await requestEmbeddingBatch(input.slice(offset,offset+limit),provider,{signal,purpose}));
      if(vectors.length!==input.length)throw new Error("Embedding API 返回的向量数量与输入不一致");
      return vectors;
    }catch(error){
      if(signal?.aborted)throw error;
      const issue=embeddingBatchLimitError(error);if(!issue.recognized)throw error;
      const next=issue.limit&&issue.limit<limit?issue.limit:Math.max(1,Math.floor(limit/2));
      if(next>=limit||limit<=1)throw error;
      limit=next;rememberBatchLimit(provider,limit);
    }
  }
  throw new Error("Embedding API 批量上限自适应失败");
}

export function cosineSimilarity(a,b){if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length)return -1;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):-1;}

export async function testEmbeddingConnection(body={}){
  const id=embeddingProviderDefaults[body.provider]?body.provider:"custom",preset=embeddingProviderDefaults[id];
  const provider={...preset,id,baseUrl:String(body.base_url||preset.baseUrl||"").trim().replace(/\/$/,""),model:String(body.model||preset.model||"").trim(),apiKey:String(body.api_key||"").trim()||config.embeddingProviderKeys?.[id]||"",groupId:String(body.group_id||"").trim()||(id==="minimax"?config.embeddingGroupId||"":"")};
  if(id!=="mock"&&!provider.apiKey)throw new Error("请填写 Embedding API Key");if(id==="custom"&&!provider.baseUrl)throw new Error("请填写 Embedding Base URL");if(!provider.model)throw new Error("请填写 Embedding 模型名称");
  const started=Date.now(),vectors=await embedTexts(["剧情记忆连接测试"],{providerOverride:provider,purpose:"query"});
  return {ok:true,providerLabel:preset.label,model:provider.model,dimensions:vectors[0]?.length||0,latencyMs:Date.now()-started};
}
