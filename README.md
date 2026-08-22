# 墨潮 · AI 短剧自动编剧系统

本地优先的中文短剧创作工作台。它不是单 Prompt 包装器，而是把创意、专业策划、卡点、逐集框架、节奏/情绪任务、Story State、单集写作和质量检查组织成可审核的工程流程。

## 已实现

- 项目规格、题材、集数、受众、平台和创意 Seed
- Hard Constraints 与卡点集数/范围
- Idea → 对标与改编 → 故事梗概 → 集数/付费卡点 → 核心期待/画面对标 → 人物人设/形象图 → Skeleton → Outline → Episode Writing 审批流程
- Market / Reality 资料库、手动录入、RSS 更新和历史快照
- DOCX 模板分析：识别策划分区、人物结构、剧本样稿和格式特征
- 内置专业默认模板；上传其他剧本后可提炼篇幅/场次/对白/括号规则并按项目切换
- 人物形象图可用 MiniMax image-01 生成、手动上传或跳过，并随人物表导出
- Episode Compiler：动态组合已批准成果、约束、Story State、Writing Brief 和模板摘录
- OpenAI Responses API，以及 MiniMax、智谱、DeepSeek、通义千问、Kimi 和自定义 OpenAI-compatible API
- 页面内连接测试：校验 Base URL、API Key、模型 ID、响应格式和延迟
- 无 API Key 的离线演示模式
- 单集格式/约束/连续性质检入口
- Story State 持久化和单集生成后的自动状态提取
- 项目策划与剧本 DOCX 导出
- Windows 本地定时更新脚本

## 启动

要求 Node.js 25 或更高版本（项目使用 Node 自带 SQLite）。

```powershell
cd 'D:\codex专用 文件夹\ai-short-drama-writer'
npm install
npm start
```

打开 <http://127.0.0.1:3210>。也可以双击或运行 `scripts/start.ps1`。

## 配置真实模型

复制 `.env.example` 为 `.env`，然后填写：

```dotenv
OPENAI_API_KEY=你的密钥
OPENAI_MODEL=gpt-5.4-mini
LLM_PROVIDER=openai
```

密钥只保存在本机 `.env`，该文件已被 Git 忽略。没有密钥时界面会显示“离线演示模式”，仍可体验完整工作流，但内容是占位生成结果。

LLM 接口集中在 `src/llm.js`，以后可以增加其他供应商而不改变业务数据结构。

## 数据保存位置

- SQLite：`data/short-drama.db`
- 导入模板：`data/uploads/`
- 导出文档：`data/exports/`

这些运行数据默认不提交到 Git。原始模板不会被覆盖。

## 自动更新

界面或 API 可添加 RSS 来源，也可以手动录入市场榜单和现实热点。立即执行所有来源更新：

```powershell
npm run update:sources
```

注册 Windows 每日更新任务（可能需要相应的系统权限）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-daily-update-task.ps1 -At '09:00'
```

电脑关机时不会更新；任务配置了 `StartWhenAvailable`，恢复运行后可补跑。平台抓取需要逐一确认公开接口、服务条款和稳定性，当前没有内置绕过登录、验证码或反爬的逻辑。

## 测试

```powershell
npm test
```

测试覆盖项目创建、约束、四阶段生成与批准、逐集框架、单集写作、质量检查和 DOCX 导出。

## 重要边界

- Market / Reality 检索只进入 Idea 阶段。
- 用户剧本语料用于离线研究节奏与情绪，不默认作为 Writer RAG。
- 卡点先于完整逐集框架。
- Writer 只获得项目自身必要状态和近期上下文，不塞入全部历史正文。
- 导入文档的正文只作为数据和模板，不作为系统指令执行。
