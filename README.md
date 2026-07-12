# Career Overview AI

AI resume and career development analyzer for people who want a clearer next step, not another generic resume rewrite.

`Career Overview AI` turns a resume, goals, and context into a structured career profile, then generates practical analysis across career direction, study planning, ability gaps, and follow-up questions.

## Who It Is For

- Students and early-career professionals choosing a next direction.
- Career changers trying to connect past experience with future options.
- Advisors, mentors, and education consultants who need a structured first-pass analysis.
- Builders exploring AI products for career planning, resume analysis, and ability mapping.

## What It Does

- Upload or paste a resume in TXT, MD, PDF, or DOCX format.
- Generate a structured `career_profile` from the user's evidence.
- Produce a short career development overview.
- Generate deeper modules for career direction, study or major planning, and ability mapping.
- Support streaming follow-up questions based on the profile and generated reports.
- Export the model response as JSON for review or further product work.

## Product Principles

- Ability matters more than experience labels.
- Resume clarity is itself a signal of professional readiness.
- Good advice should distinguish execution, tactical judgment, and strategic potential.
- Career possibilities should be evidence-based while still surfacing one or two non-obvious paths.
- The product should not promise employment, admission, salary growth, or psychological outcomes.

## Why This Project Is Different

Most resume tools focus on polishing wording. This project focuses on diagnosis:

- What capabilities are actually evidenced by the resume?
- Which claims are weak, generic, or unsupported?
- What next move is realistic given the user's current profile?
- Which direction may be worth exploring beyond the user's default path?

## Quick Start

```bash
npm ci
npm start
```

Open:

```text
http://localhost:4173
```

The production app lives under:

```text
apps/career-overview
```

## Environment Variables

Create a local `.env` file or configure the same variables on your deployment platform.

```text
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
PORT=4173
AI_TIMEOUT_MS=120000
PROFILE_MAX_TOKENS=1100
OVERVIEW_MAX_TOKENS=1300
MODULE_MAX_TOKENS=1900
CHAT_MAX_TOKENS=1100
JSON_REPAIR_MAX_TOKENS=1200
MAX_RESUME_TEXT_CHARS=12000
MAX_PROFILE_RESUME_TEXT_CHARS=8000
MAX_PROFILE_JSON_CHARS=3500
MAX_MODULE_INPUT_CHARS=1000
MAX_FILE_BYTES=6000000
MAX_BODY_BYTES=12000000
```

Keep `DEEPSEEK_API_KEY` on the server side only. Do not put real API keys in frontend files or commit them to GitHub.

## API Surface

- `GET /api/health`
- `GET /api/test-ai`
- `POST /api/analyze-resume`
- `POST /api/analyze-career`
- `POST /api/analyze-study`
- `POST /api/analyze-ability`
- `POST /api/chat-resume`

## Deploying To Render

Recommended Render Web Service settings:

```text
Root Directory: apps/career-overview
Build Command: npm ci
Start Command: npm start
```

After deployment, check:

```text
/api/health
```

Confirm that `hasDeepSeekKey` is `true` before sharing the app publicly.

## Privacy And Safety Notes

Resume content can contain sensitive personal information. This MVP is designed for server-side model calls, but production use should add:

- a visible privacy notice,
- retention limits for uploaded resumes,
- rate limiting,
- access control for private beta users,
- clearer disclaimers for career, education, and psychological boundaries.

## Roadmap

- Add a public demo link and screenshots to this README.
- Add sample input and sample output for a safe fictional resume.
- Add a privacy notice page for beta users.
- Add lightweight analytics for conversion and drop-off points.
- Package the analysis framework as reusable prompts and evaluation cases.

## Related Positioning

This repository is part of a broader set of AI communication, public-opinion, and career-support tools by [CEXU FU](https://github.com/cexufu).
