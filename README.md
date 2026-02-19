<p align="center">
  <img src="assets/radiant_logo.svg" alt="Radiant" height="48" />
</p>



# Radiant AI CRM (OSS)

**Your AI-powered sales rep that never sleeps.** [meetradiant.com](https://meetradiant.com)

Built by: [https://x.com/dylanmeyford](https://x.com/dylanmeyford)

<p align="center">
  <img src="assets/app view.png" alt="Radiant App" width="100%" />
</p>


Radiant is an open-source AI CRM that works autonomously in the background — analysing your pipeline, drafting your next move, and keeping every deal moving forward. Wake up in the morning, approve actions, get back to prospecting.

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

## Monorepo Layout

- `api/` - TypeScript + Express backend with MongoDB, Stripe, Nylas, and AI workflows
- `frontend/` - React + TypeScript + Vite web application
- `api/docs/` - backend docs for billing, AI usage, webhooks, and integrations

## Local Development (Recommended)

Preferred local workflow is using the dev container for backend development.

1. Open the `api/` folder in VS Code or Cursor.
2. Reopen in container using `api/.devcontainer/devcontainer.json`.
3. Use the container terminal to install dependencies and run services.

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

