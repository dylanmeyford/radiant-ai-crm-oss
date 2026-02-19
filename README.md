# Radiant AI CRM (OSS)



Open-source monorepo for Radiant AI CRM, with the API and web app in one workspace.

## Highlights

- AI-first CRM workflows for lead research, opportunity management, and automation
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

