# 🌊 墨潮 · AI 短剧自动编剧系统

> 从一句灵感，到可导出的小说与可拍摄短剧剧本。把“灵感—策划—人设—分集梗概—小说中间稿—剧本—跨集记忆”组织成一条可审批、可编辑、可续跑的本地创作流水线。

[![Node.js](https://img.shields.io/badge/Node.js-25%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/) [![License](https://img.shields.io/badge/License-PolyForm%20Noncommercial-blueviolet)](LICENSE) [![Commercial](https://img.shields.io/badge/Commercial-License%20Required-ff4d6d)](COMMERCIAL_LICENSE.md)

## ✨ 项目亮点

- 🎬 **完整 01–06 创作链**：灵感孵化、故事策划、人物人设、卡点与硬约束、分集梗概、小说与剧本。
- 🧠 **项目级剧情记忆**：向量剧情链、最近事件、人物关系、次要人物、时间脉络、金手指、重要道具与资源账本。
- 🔥 **短剧情绪与节奏设计**：普通/下沉剧情模式、强烈/异常强烈情绪、第一/第三人称和“必须发生/不得揭示”硬边界。
- 🧵 **分层写作**：小说中间稿完成剧情设计，再组织剧情安排并转换为可拍摄剧本；每一步均可检查、保存和重试。
- ⚙️ **长任务可靠运行**：后台任务、阶段检查点、自动继续、手动续跑、跨项目并行工作台与动态并发控制。
- 🔌 **多模型可接入**：MiniMax、OpenAI、智谱、DeepSeek、通义千问、Kimi 及 OpenAI-compatible API；Embedding 独立配置。
- 📚 **灵感资料库**：Reality 现实素材与 Market 平台趋势，支持公开来源更新、RSS、手动资料及 RAG 召回。
- 📄 **专业 DOCX 工作流**：分析并复核上传模板，按集导出梗概、小说或剧本，剧本支持人物表格和形象参考图。
- 🔐 **本地优先**：项目、正文、密钥和任务记录默认留在本机，不随 Git 提交。

## 🗺️ 创作流程

1. **灵感孵化**：从种子灵感与可选资料库中形成方向。
2. **故事策划**：标题、框架、世界观、故事梗概、核心期待。
3. **人物人设**：生成、补全、编辑人物，并可上传或生成形象参考。
4. **卡点与硬约束**：约束指定集数范围内的分集规划。
5. **分集梗概**：本集内容、集尾钩子、必须发生、不得揭示和主要人物首次出场规划。
6. **分级写作**：小说中间稿 → 剧情安排 → 可拍摄剧本 → 剧情记忆提炼。

## 🚀 本地启动

要求 Node.js 25 或更高版本（项目使用 Node 内置 SQLite）。

```powershell
git clone https://github.com/lianni0125-hub/MO-mochao-short-drama.git
cd MO-mochao-short-drama
npm install
Copy-Item .env.example .env
npm start
```

GitHub 发布版默认监听 `0.0.0.0:6008`，便于直接制作 AutoDL 镜像。本地使用如果希望保持原来的 3210 端口，只需在不会提交到 Git 的 `.env` 中设置：

```dotenv
PORT=3210
HOST=127.0.0.1
```

随后打开 <http://127.0.0.1:3210>。你电脑上已经存在的 `.env` 不会被本次更新覆盖。

## ☁️ AutoDL 部署

仓库默认已经适配 AutoDL 的 6008 WebUI 端口：

```bash
git clone https://github.com/lianni0125-hub/MO-mochao-short-drama.git
cd MO-mochao-short-drama
npm install
cp .env.example .env
npm run start:autodl
```

普通的 `npm start` 与 `npm run start:autodl` 均可在 AutoDL 使用，默认监听 `0.0.0.0:6008`。AutoDL 会为实例的 6008 端口提供公网映射，可从“自定义服务”入口访问。

正式镜像发布后，用户也可以进入 AutoDL 的 **AI应用 → 应用广场**，搜索并拉取“墨潮 · AI 短剧自动编剧系统”镜像，按应用页面说明启动，无需自行克隆和安装依赖。

## 🔑 模型、Embedding 与本地数据

正文生成 API 与 Embedding API 独立配置。未配置 Embedding 时，策划、人设、模板、保存与导出仍可使用；涉及向量记忆的小说/剧本流程会明确提示。

| 内容 | 默认位置 | 提交 Git |
|---|---|---|
| 项目、正文、任务、剧情记忆 | `data/short-drama.db` | 否 |
| 导入与导出文件 | `data/uploads/`、`data/exports/` | 否 |
| API Key | `.env` | 否 |
| 程序与公开资源 | 项目源码 | 是 |

GitHub 保存源码和版本历史，**不是本地创作内容的云备份**。升级前请备份 `.env` 和 `data/`。

## 🔄 版本更新

应用会读取 GitHub 上的 `version.json`。远端版本高于本地时，左下角按钮变为红色 **“版本更新！”**，点击可查看更新内容。程序只提示，不自动执行 `git pull`，不会擅自覆盖本地数据或密钥。

维护者发布新版时需要同步修改 `package.json` 和 `version.json` 的版本号，并在 `version.json` 填写更新说明后推送至 `main`。

## 🧪 测试

```bash
npm test
```

## ⚖️ 使用许可

### **非商业使用：免费**

### **商业使用：人民币 200 元 / 单一授权主体**

本项目源代码公开，非商业使用适用 **PolyForm Noncommercial 1.0.0**。这是源码可用的非商业许可证，并非 OSI 认定的开放源代码许可证。

使用本项目生成或辅助创作的作品，仅投稿、送审、评估或洽谈，且尚未签约、尚未取得商业权益或经济收益时，无需购买商业授权。作品签约并取得商业权益，或实际产生稿酬、版权费、分成、赞助等收益后，须取得商业授权。

- 个人授权：人民币 200 元/人；备注 `【墨潮 · AI 短剧自动编剧系统】-个人商用授权`
- 企业授权：人民币 200 元/企业主体；备注 `【墨潮 · AI 短剧自动编剧系统】-企业商用授权-XX有限公司`
- 一份授权仅对应一个主体，不得转让、转借、共享或转授权。
- 商业许可只针对本项目本身；作者不主张用户自行创作作品的著作权、稿酬或商业分成。

正式条款：[非商业许可](LICENSE) · [完整商业授权协议](COMMERCIAL_LICENSE.md)

## 💬 联系作者

- 小红书：[@威猛林檎猫](https://www.xiaohongshu.com/user/profile/5d3ee15d000000001202569f)
- 企鹅群：`558494501`　暗号：`我支持MO系列！`

---

如果墨潮帮你把脑海里的故事真正推到了镜头前，欢迎点一颗 ⭐。
