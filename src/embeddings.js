import OpenAI from "openai";
import { activeEmbeddingProvider, config, embeddingProviderDefaults } from "./config.js";

const clean=value=>String(value||"").replace(/\s+/g," ").trim();
function mockVector(value){const vector=new Array(64).fill(0);for(const [index,char] of [...clean(value)].entries())vector[(char.codePointAt(0)+index*17)%vector.length]+=1;const norm=Math.hypot(...vector)||1;return vector.map(item=>item/norm);}

export function embeddingConfigured(){const provider=activeEmbeddingProvider();return provider.id==="mock"||Boolean(provider.apiKey&&provider.baseUrl&&provider.model);}

export async function embedTexts(values,{signal,providerOverride,purpose="document"}={}){
  const input=values.map(clean).filter(Boolean);if(!input.length)return [];
  const provider=providerOverride||activeEmbeddingProvider();
  if(provider.id==="mock")return input.map(mockVector);
  if(!provider.apiKey||!provider.baseUrl||!provider.model)return [];
  if(provider.protocol==="gemini"){
    const model=provider.model.replace(/^models\//,""),resource=`models/${model}`,endpoint=`${provider.baseUrl.replace(/\/$/,"")}/${resource}:batchEmbedContents`;
    const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":provider.apiKey},body:JSON.stringify({requests:input.map(value=>({model:resource,content:{parts:[{text:value}]},taskType:purpose==="query"?"RETRIEVAL_QUERY":"RETRIEVAL_DOCUMENT",outputDimensionality:768}))}),signal});
    const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`Google Gemini Embedding 请求失败（${response.status}）：${body?.error?.message||response.statusText}`);
    const vectors=(body.embeddings||[]).map(item=>item.values);if(vectors.length!==input.length||vectors.some(item=>!Array.isArray(item)||!item.length))throw new Error("Google Gemini Embedding 返回的向量数量或格式不正确");return vectors;
  }
  const client=new OpenAI({apiKey:provider.apiKey,baseURL:provider.baseUrl,timeout:60000,maxRetries:0});
  const response=await client.embeddings.create({model:provider.model,input,encoding_format:"float"},signal?{signal}:undefined);
  const ordered=[...(response.data||[])].sort((a,b)=>a.index-b.index).map(item=>item.embedding);
  if(ordered.length!==input.length||ordered.some(item=>!Array.isArray(item)||!item.length))throw new Error("Embedding API 返回的向量数量或格式不正确");
  return ordered;
}

export function cosineSimilarity(a,b){if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length)return -1;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):-1;}

export async function testEmbeddingConnection(body={}){
  const id=embeddingProviderDefaults[body.provider]?body.provider:"custom",preset=embeddingProviderDefaults[id];
  const provider={...preset,id,baseUrl:String(body.base_url||preset.baseUrl||"").trim().replace(/\/$/,""),model:String(body.model||preset.model||"").trim(),apiKey:String(body.api_key||"").trim()||config.embeddingApiKey||""};
  if(id!=="mock"&&!provider.apiKey)throw new Error("请填写 Embedding API Key");if(id==="custom"&&!provider.baseUrl)throw new Error("请填写 Embedding Base URL");if(!provider.model)throw new Error("请填写 Embedding 模型名称");
  const started=Date.now(),vectors=await embedTexts(["剧情记忆连接测试"],{providerOverride:provider,purpose:"query"});
  return {ok:true,providerLabel:preset.label,model:provider.model,dimensions:vectors[0]?.length||0,latencyMs:Date.now()-started};
}
