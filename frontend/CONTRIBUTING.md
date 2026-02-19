# Contributing to radiant-front

Thanks for your interest in contributing.

## Development setup

1. Fork and clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Create local env file:

```bash
cp .env.example .env.development
```

4. Start development server:

```bash
npm run dev
```

## Code standards

- Use TypeScript for all application code.
- Use functional React components.
- Use existing UI primitives from `src/components/ui` and shadcn/Radix patterns.
- Keep feature-specific code in the relevant `src/components/<feature>` directory.
- Keep reusable side-effect logic in hooks under `src/hooks`.
- Follow existing Tailwind utility patterns and responsive-first styling.
- Use TanStack Query for server state and optimistic updates.

## Before opening a PR

Run checks locally:

```bash
npm run typecheck
npm run lint
npm run build
```

## Pull request guidelines

- Keep PRs focused on a single change area.
- Write clear PR titles and descriptions (problem, approach, validation).
- Include screenshots for UI changes.
- Link related issues when applicable.

## Reporting issues

When opening issues, include:

- Expected behavior
- Actual behavior
- Steps to reproduce
- Environment details (OS, browser, Node version)
