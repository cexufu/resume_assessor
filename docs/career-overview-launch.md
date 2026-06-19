# Career Overview Launch Notes

## Current Status

- Source package archived under `source-material/files/career-development/`.
- Runnable application copied to `apps/career-overview/`.
- Render blueprint added at repository root in `render.yaml`.
- Local syntax check passed with `npm.cmd run check`.
- Local dependency load passed for `mammoth` and `pdf-parse`.
- Local HTTP smoke test passed for:
  - `/api/health`
  - `/`
  - `/career.html`
  - `/study.html`
  - `/ability.html`
- Browser smoke test confirmed the homepage renders:
  - title: `职业发展总览`
  - H1: `职业发展总览`
  - one resume file upload input
  - three module links

## Deployment Target

Use Render Web Service for the MVP.

Expected service settings:

```text
Root Directory: apps/career-overview
Runtime: Node
Build Command: npm ci
Start Command: npm start
```

Required secret:

```text
DEEPSEEK_API_KEY=<server-side DeepSeek key>
```

Other environment variables are already defined in `render.yaml`.

## Public Smoke Test

After deployment, open:

```text
https://<render-service-url>/api/health
```

Expected:

```json
{
  "ok": true,
  "app": "职业发展总览",
  "provider": "deepseek",
  "hasDeepSeekKey": true
}
```

Then verify:

1. Open `/`.
2. Confirm the homepage loads and shows `职业发展总览`.
3. Upload or paste a short non-sensitive test resume.
4. Generate the overview.
5. Open each deep module page and generate one test report.

## Current Blockers

- This repository has no Git remote configured.
- GitHub CLI is not installed in the local environment.
- Render CLI is not installed in the local environment.
- A production `DEEPSEEK_API_KEY` has not been provided or configured.
