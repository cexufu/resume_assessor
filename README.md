# Career Overview AI MVP

一个面向简历与职业发展的 AI Web MVP。用户可以上传或粘贴简历，补充年龄、目标方向和当前困惑，系统会生成结构化职业画像，并进一步提供职业方向、留学/专业方向和能力地图分析。

## App

Runnable app:

```text
apps/career-overview
```

Core pages:

- `/`：职业发展总览
- `/career.html`：职业方向分析
- `/study.html`：留学与专业推荐
- `/ability.html`：能力地图

## Local Run

```bash
cd apps/career-overview
npm ci
npm start
```

Open:

```text
http://localhost:4173
```

## Environment

Create `apps/career-overview/.env` locally or configure the same variables on the hosting provider.

```text
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
AI_TIMEOUT_MS=120000
```

Never commit real API keys.

## Deploy

The repository includes `render.yaml` for Render Web Service deployment.

Render settings:

```text
Root Directory: apps/career-overview
Build Command: npm ci
Start Command: npm start
```

Set `DEEPSEEK_API_KEY` as a secret environment variable in Render.

## Verify

```bash
cd apps/career-overview
npm run check
```

After deployment, open:

```text
https://<service-url>/api/health
```

Expected signal:

```json
{
  "ok": true,
  "app": "职业发展总览",
  "hasDeepSeekKey": true
}
```
