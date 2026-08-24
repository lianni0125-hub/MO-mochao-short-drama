import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(root, process.env.APP_DATA_DIR || "data");

export const config = {
  root,
  dataDir,
  dbPath: path.join(dataDir, "short-drama.db"),
  uploadsDir: path.join(dataDir, "uploads"),
  exportsDir: path.join(dataDir, "exports"),
  publicDir: path.join(root, "public"),
  port: Number(process.env.PORT || 3210),
  llmProvider: process.env.LLM_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "mock"),
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.4-mini",
  baseUrl: process.env.LLM_BASE_URL || "",
  embeddingProvider: process.env.EMBEDDING_PROVIDER || "custom",
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL || "",
  embeddingModel: process.env.EMBEDDING_MODEL || "",
  embeddingApiKey: process.env.EMBEDDING_API_KEY || "",
  embeddingGroupId: process.env.MINIMAX_EMBEDDING_GROUP_ID || "",
  embeddingProviderKeys: {
    openai:process.env.OPENAI_EMBEDDING_API_KEY||(process.env.EMBEDDING_PROVIDER==="openai"?process.env.EMBEDDING_API_KEY||"":""),
    google:process.env.GOOGLE_EMBEDDING_API_KEY||((process.env.EMBEDDING_PROVIDER==="google"||(process.env.MINIMAX_EMBEDDING_API_KEY&&process.env.EMBEDDING_API_KEY&&process.env.EMBEDDING_API_KEY!==process.env.MINIMAX_EMBEDDING_API_KEY))?process.env.EMBEDDING_API_KEY||"":""),
    minimax:process.env.MINIMAX_EMBEDDING_API_KEY||(process.env.EMBEDDING_PROVIDER==="minimax"?process.env.EMBEDDING_API_KEY||"":""),
    zhipu:process.env.ZHIPU_EMBEDDING_API_KEY||(process.env.EMBEDDING_PROVIDER==="zhipu"?process.env.EMBEDDING_API_KEY||"":""),
    qwen:process.env.QWEN_EMBEDDING_API_KEY||(process.env.EMBEDDING_PROVIDER==="qwen"?process.env.EMBEDDING_API_KEY||"":""),
    custom:process.env.CUSTOM_EMBEDDING_API_KEY||(process.env.EMBEDDING_PROVIDER==="custom"?process.env.EMBEDDING_API_KEY||"":"")
  },
  providerKeys: {
    openai: process.env.OPENAI_API_KEY || "",
    minimax: process.env.MINIMAX_API_KEY || "",
    zhipu: process.env.ZHIPU_API_KEY || "",
    deepseek: process.env.DEEPSEEK_API_KEY || "",
    qwen: process.env.DASHSCOPE_API_KEY || "",
    moonshot: process.env.MOONSHOT_API_KEY || "",
    custom: process.env.CUSTOM_API_KEY || ""
  }
};

export const providerDefaults = {
  openai: { label:"OpenAI", baseUrl:"https://api.openai.com/v1", model:"gpt-5.4-mini", protocol:"responses" },
  minimax: { label:"MiniMax（中国区）", baseUrl:"https://api.minimaxi.com/v1", model:"MiniMax-M2.7", protocol:"chat_completions" },
  zhipu: { label:"智谱 GLM", baseUrl:"https://open.bigmodel.cn/api/paas/v4", model:"glm-5.2", protocol:"chat_completions" },
  deepseek: { label:"DeepSeek", baseUrl:"https://api.deepseek.com", model:"deepseek-v4-flash", protocol:"chat_completions" },
  qwen: { label:"通义千问（阿里云百炼）", baseUrl:"https://dashscope.aliyuncs.com/compatible-mode/v1", model:"qwen3.8-max", protocol:"chat_completions" },
  moonshot: { label:"Kimi / 月之暗面", baseUrl:"https://api.moonshot.cn/v1", model:"kimi-k2.6", protocol:"chat_completions" },
  custom: { label:"其他 OpenAI-compatible API", baseUrl:"", model:"", protocol:"chat_completions" },
  mock: { label:"离线演示模式", baseUrl:"", model:"local-demo", protocol:"mock" }
};

export const embeddingProviderDefaults = {
  openai: {label:"OpenAI Embedding",baseUrl:"https://api.openai.com/v1",model:"text-embedding-3-small"},
  google: {label:"Google Gemini Embedding",baseUrl:"https://generativelanguage.googleapis.com/v1beta",model:"gemini-embedding-001",protocol:"gemini"},
  minimax: {label:"MiniMax Embedding（embo-01）",baseUrl:"https://api.minimaxi.com/v1",model:"embo-01",protocol:"minimax"},
  zhipu: {label:"智谱 Embedding",baseUrl:"https://open.bigmodel.cn/api/paas/v4",model:"embedding-3"},
  qwen: {label:"通义千问 Embedding",baseUrl:"https://dashscope.aliyuncs.com/compatible-mode/v1",model:"text-embedding-v4"},
  custom: {label:"其他 OpenAI-compatible Embedding",baseUrl:"",model:""},
  mock: {label:"离线测试",baseUrl:"",model:"local-embedding"}
};

export function activeProvider() {
  const preset = providerDefaults[config.llmProvider] || providerDefaults.custom;
  return { ...preset, id:config.llmProvider, baseUrl:config.baseUrl || preset.baseUrl, model:config.openaiModel || preset.model, apiKey:config.providerKeys[config.llmProvider] || "" };
}

export function activeEmbeddingProvider(){
  const preset=embeddingProviderDefaults[config.embeddingProvider]||embeddingProviderDefaults.custom;
  return {...preset,id:config.embeddingProvider,baseUrl:config.embeddingBaseUrl||preset.baseUrl,model:config.embeddingModel||preset.model,apiKey:config.embeddingProviderKeys?.[config.embeddingProvider]||"",groupId:config.embeddingProvider==="minimax"?config.embeddingGroupId||"":""};
}
