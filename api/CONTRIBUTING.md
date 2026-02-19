# Contributing

Thanks for your interest in contributing.

## Development Setup

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy env templates and provide sandbox/test credentials:
   - `.env.example`
   - `.devcontainer/dev.env.example`
   - `.devcontainer/test.env.example`
4. Start services (or use devcontainer setup), then run:
   ```bash
   npm run dev
   ```

## Project Structure

- `src/routes`: route definitions
- `src/controllers`: HTTP request handlers
- `src/services`: core business logic and external integrations
- `src/models`: Mongoose models
- `src/tests`: end-to-end integration tests

## Code Guidelines

- Use TypeScript and keep strict typing where possible.
- Keep routes thin; place logic in services.
- Avoid introducing secrets or credentials in tracked files.
- Use clear naming and focused functions.

## Tests

This project uses end-to-end style tests with real integrations in sandbox mode.

```bash
npm test
```

Before opening a PR, also run:

```bash
npm run lint
npm run test-type
```

## Pull Requests

- Open an issue first for major changes.
- Keep PRs focused and small when possible.
- Include:
  - what changed
  - why it changed
  - how you tested it
- Update docs when behavior or setup changes.

## Commit Messages

- Use clear, imperative messages (example: `add webhook retry handling`).
- Group related changes together.
