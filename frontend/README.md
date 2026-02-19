# radiant-front

Frontend application for Radiant, built with React, TypeScript, Vite, Tailwind CSS, Radix UI, and TanStack Query.

## Requirements

- Node.js 20+
- npm 10+
- Backend API running locally (see `../api`)

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.development
```

3. Update `.env.development` values for your local environment.

4. Start the app:

```bash
npm run dev
```

The app runs at `http://localhost:5173` by default.

## Environment variables

- `VITE_API_URL`: Base URL for the backend API (example: `http://localhost:3006`)
- `VITE_STRIPE_PUBLISHABLE_KEY`: Stripe publishable key (test or production)
- `VITE_FRONTEND_URL`: Frontend public URL (used for generated links)

## Scripts

- `npm run dev`: Start the Vite dev server
- `npm run build`: Type-check and build production assets
- `npm run build:fast`: Build production assets without TypeScript project build
- `npm run typecheck`: Run TypeScript checks
- `npm run lint`: Run ESLint
- `npm run preview`: Preview production build locally

## Backend integration

This frontend expects the backend API from `radiant-api`.

- Typical local setup:
  - Backend at `http://localhost:3006`
  - Frontend at `http://localhost:5173`

Set `VITE_API_URL` accordingly.

## Open Source Policies

- Contributing guide: `../.github/CONTRIBUTING.md`
- Security policy: `../.github/SECURITY.md`
- Code of conduct: `../CODE_OF_CONDUCT.md`
- License: `../LICENSE`
