# radiant-ai-crm-oss

Open-source monorepo for Radiant CRM, combining the API and web app in one workspace.

## Monorepo Layout

- `api/` - TypeScript/Express backend with MongoDB, Stripe, Nylas, and AI workflows
- `frontend/` - React/TypeScript/Vite web app
- `api/docs/` - backend technical docs (billing, AI usage, webhooks, and integrations)

## Highlights

- AI-powered CRM workflows and opportunity intelligence
- Billing and subscription support via Stripe
- Email and calendar integrations via Nylas
- Shared OSS policies and contribution templates in one repository

## Prerequisites

- Node.js 20+
- npm
- MongoDB (local or hosted)
- Stripe and Nylas test credentials

## Quick Start

1. Install dependencies from the root:

```bash
npm install
```

2. Create env files:

```bash
cp api/.env.example api/.env
cp frontend/.env.example frontend/.env.development
```

3. Start both apps:

```bash
npm run dev
```

## App Documentation

- API setup and architecture: `api/README.md`
- Frontend setup and integration: `frontend/README.md`

## Contributing and Policies

- Contributing guide: `.github/CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Security policy: `.github/SECURITY.md`
- License: `LICENSE` (AGPL-3.0)
