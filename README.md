<div align="center">
  <img src="assets/radiant_logo.svg" alt="Radiant" height="80" />
  <h1>Radiant AI CRM</h1>
  <p><strong>Your AI-powered sales rep that never sleeps.</strong></p>
  <p>
    <a href="https://meetradiant.com"><img src="https://img.shields.io/badge/meetradiant.com-5B4CF6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0xIDE3aC0ydi02aDJ2NnptMC04aC0yVjdoMnYyeiIvPjwvc3ZnPg==&logoColor=white" alt="Website" /></a>
    <a href="https://github.com/dylanmeyford/radiant-ai-crm-oss/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-blue?style=for-the-badge" alt="License" /></a>
    <a href="https://x.com/dylanmeyford"><img src="https://img.shields.io/badge/@dylanmeyford-000000?style=for-the-badge&logo=x&logoColor=white" alt="X / Twitter" /></a>
  </p>
  <p><em>Open-source AI CRM that works autonomously — so you can focus on running your business.</em></p>
</div>

---

<p align="center">
  <img src="assets/app view.png" alt="Radiant App" width="100%" />
</p>


Radiant is an open-source AI CRM that works autonomously in the background — analysing your pipeline, drafting your next move, and keeping every deal moving forward. Wake up in the morning, approve actions, get back to prospecting.

*note:* This was a closed project that I've opensourced, so it's a little rough around the edges in terms of opensource documentation. I'm working on improving that. Please DM me on X with questions.

---

## What Radiant Does For You


|                                                          |                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Connects to your email and calendar**                  | Radiant plugs directly into your existing tools — no data entry, no manual syncing.           |
| **Analyses every activity automatically**                | Every email, meeting, and interaction is processed and turned into actionable intelligence.   |
| **Joins and analyses every meeting**                     | Radiant attends your calls, extracts key insights, and updates your CRM automatically.        |
| **Processes every deal and drafts the next best action** | Always know what to do next — Radiant pro-actively surfaces the right move at the right time. |
| **Consumes your files and playbooks**                    | Feed it your sales playbooks, decks, and docs — Radiant learns your process and follows it.   |
| **Sends, schedules, drafts and cancels emails**          | Radiant handles your outreach end-to-end, with your voice and your strategy.                  |
| **Researches and enriches contacts and deals**           | Automatically fills in the gaps — company info, contacts, context — without lifting a finger. |
| **Creates meeting agendas automatically**                | Every call prepared. Every attendee briefed. Every agenda ready before you walk in.           |
| **Finds new contacts to add to your deals**              | Radiant identifies the right stakeholders and adds them to your pipeline automatically.       |


---

## Your New Sales Flow

> **Wake up in the morning → approve actions → get back to prospecting.**

No more CRM admin. No more dropped follow-ups. No more missed opportunities. Just a pipeline that moves itself.

---

## Highlights

- AI-first CRM that acts agentically to drive deals forward — not just log them
- Revenue-ready billing foundation with Stripe subscriptions and webhooks
- Native communication workflows through Nylas email and calendar integrations
- Type-safe, full-stack monorepo setup with shared conventions and docs
- Built for practical local development with a dev container-first backend workflow
- Built in eval framework

## Monorepo Layout

- `api/` - TypeScript + Express backend with MongoDB, Stripe, Nylas, and AI workflows
- `frontend/` - React + TypeScript + Vite web application
- `api/docs/` - backend docs for billing, AI usage, webhooks, and integrations

## Local Development (Recommended)

Preferred local workflow is using the dev container for backend development.

1. Open the `api/` folder in VS Code or Cursor.
2. Reopen in container using `api/.devcontainer/devcontainer.json`.
3. Use the container terminal to install dependencies and run services.

## Bring Your Own OpenAI Key (BYOK)

Radiant uses OpenAI for all AI features (currently - I plan to allow users to choose their models) — pipeline analysis, action drafting, meeting summarisation, and more. When self-hosting, you supply your own OpenAI API key.

**Steps:**

1. Create an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
2. Add it to your API environment file:
   - Dev container: `api/.devcontainer/dev.env`
   - Local setup: `api/.env`

```
OPENAI_API_KEY=sk-...your-key-here...
```

> **Cost**: All API usage is billed directly to your OpenAI account. You can monitor spend and set usage limits in the [OpenAI dashboard](https://platform.openai.com/usage).

---

## Quick Start

If you are not using the dev container, use this local setup:

1. Install dependencies from the repository root:

```bash
npm install
```

1. Create environment files:

```bash
cp api/.env.example api/.env
cp frontend/.env.example frontend/.env.development
```

1. Start API and frontend together:

```bash
npm run dev
```

## Documentation

- API setup and architecture: `api/README.md`
- Frontend setup and integration: `frontend/README.md`
- API security notes: `api/SECURITY.md`

## Contributing and Policies

- Contributing guide: `.github/CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Security policy: `.github/SECURITY.md`
- License: `LICENSE` (AGPL-3.0)

