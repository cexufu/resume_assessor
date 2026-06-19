# 职业发展总览

这是一个无构建的 Node.js + 静态前端 MVP，用 DeepSeek 生成简历与职业发展分析。

## 功能

- 上传或粘贴 TXT/MD/PDF/DOCX 简历
- 生成结构化 `career_profile`
- 输出职业发展短总览
- 分页生成职业方向、留学/专业方向、能力地图分析
- 支持基于画像和报告上下文的流式追问
- 支持导出模型返回的 JSON

## 启动

```bash
npm ci
npm start
```

默认访问：

```text
http://localhost:4173
```

## 环境变量

```text
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
PORT=4173
AI_TIMEOUT_MS=120000
PROFILE_MAX_TOKENS=1100
OVERVIEW_MAX_TOKENS=900
MODULE_MAX_TOKENS=1400
CHAT_MAX_TOKENS=900
JSON_REPAIR_MAX_TOKENS=1200
MAX_RESUME_TEXT_CHARS=12000
MAX_PROFILE_RESUME_TEXT_CHARS=8000
MAX_PROFILE_JSON_CHARS=3500
MAX_MODULE_INPUT_CHARS=1000
MAX_FILE_BYTES=6000000
MAX_BODY_BYTES=12000000
```

`DEEPSEEK_API_KEY` 只能放在服务端环境变量或本地 `.env` 中，不能写进前端文件。

## API

- `GET /api/health`
- `GET /api/test-ai`
- `POST /api/analyze-resume`
- `POST /api/analyze-career`
- `POST /api/analyze-study`
- `POST /api/analyze-ability`
- `POST /api/chat-resume`

## 上线

推荐使用 Render Web Service：

```text
Root Directory: apps/career-overview
Build Command: npm ci
Start Command: npm start
```

上线后先检查 `/api/health`，确认 `hasDeepSeekKey` 为 `true`。
