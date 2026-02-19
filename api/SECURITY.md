# Security Policy

## Reporting a Vulnerability

Please do not open public GitHub issues for security vulnerabilities.

Instead, report vulnerabilities privately to the maintainers via your preferred secure contact channel for this repository. Include:

- affected component/path
- reproduction steps
- expected impact
- proof-of-concept (if available)

## Response Process

- Acknowledgement target: within 72 hours
- Initial triage target: within 7 days
- Fix timeline: depends on severity and scope

We will coordinate disclosure timing with reporters when possible.

## Scope

This policy covers:

- API endpoints and authentication flows
- data processing and storage logic
- third-party integration surfaces (Nylas, Stripe, AWS)
- dependency-related vulnerabilities

## Security Practices in This Repository

- Secrets must never be committed to source control.
- Use `.env.example` and `.devcontainer/*.env.example` for placeholders only.
- Rotate credentials immediately if exposure is suspected.
- See `docs/SECRET_ROTATION_CHECKLIST.md` for incident response and rotation steps.
