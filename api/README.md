# radiant-api

Backend API for the Radiant CRM monorepo, built with TypeScript, Express, MongoDB, Mastra, Nylas, and Stripe.

## Features

- Contact and opportunity management
- AI-driven action pipeline and intelligence workflows
- Email/calendar integrations through Nylas
- Stripe billing (base plan, additional account pricing, AI usage billing)
- End-to-end tests that exercise real routes and sandbox services

## Tech Stack

- TypeScript + Node.js
- Express.js
- MongoDB + Mongoose
- Mastra AI tooling
- Nylas SDK
- Stripe SDK
- Jest (e2e-style tests)

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- MongoDB

### Install

```bash
npm install
```

### Environment Variables

Copy the example env file and fill in real values:

```bash
cp .env.example .env
```

For required variables, see `./.env.example` and `./docs/SECRET_ROTATION_CHECKLIST.md`.

### Run Locally

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Tests

```bash
npm test
```

## Project Docs

- `./docs/STRIPE_QUICKSTART.md`
- `./docs/BILLING_SETUP_GUIDE.md`
- `./docs/BILLING_IMPLEMENTATION_SUMMARY.md`
- `./docs/AI_USAGE_TRACKING.md`
- `./docs/NYLAS_RATE_LIMITING.md`

## Open Source Policies

- License: `../LICENSE`
- Security policy: `../.github/SECURITY.md`
- Contributing guide: `../.github/CONTRIBUTING.md`
- Code of conduct: `../CODE_OF_CONDUCT.md`
