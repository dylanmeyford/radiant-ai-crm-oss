# Contributing to Radiant AI CRM OSS

Thanks for your interest in contributing.

## Development Setup

1. Install Node.js 20+ and npm.
2. Clone the repository.
3. Install dependencies:

```bash
npm install
```

4. Create local env files:

```bash
cp api/.env.example api/.env
cp frontend/.env.example frontend/.env.development
```

5. Start development servers:

```bash
npm run dev
```

## Branch and PR Workflow

- Create a feature branch from `main`
- Keep PRs focused and small where possible
- Include tests or a clear reason if tests are not added
- Link related issues in your PR description

## Coding Standards

- Use clear naming and keep functions focused
- Avoid introducing secrets into source or test files
- Keep docs updated when behavior or setup changes

## Before Opening a PR

- Run frontend lint/type checks and backend tests locally
- Verify no generated artifacts are committed (`dist`, `node_modules`, local `.env`)
- Confirm new environment variables are documented in `.env.example`
