# Domain Validation and Contact Creation

This document explains how the application handles domain validation, smart domain association, and contact creation when processing emails and calendar events.

## Overview

When emails or calendar events arrive via Nylas webhooks, the system:
1. Identifies new email addresses not yet in the CRM
2. Determines if the domain belongs to an existing prospect
3. Validates whether the email is from a real person (vs. automated/no-reply)
4. Creates contacts and associates them with prospects and opportunities

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Nylas Webhook                                   │
│                    (Email or Calendar Event)                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      NylasService.ts                                    │
│  processNewEmailActivity() / processNewCalendarActivity()               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Domain Validation                                  │
│                      (src/utils/domain.ts)                              │
│                                                                         │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐ │
│  │  Hardcoded  │ → │  In-Memory  │ → │   MongoDB   │ → │     AI      │ │
│  │  Exclusions │   │    Cache    │   │    Cache    │   │  (LLM Call) │ │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Contact Creation                                   │
│                      (Contact.ts model)                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Domain Validation Decision

The `getDomainDecision()` function returns two key pieces of information:

| Field | Description |
|-------|-------------|
| `shouldInclude` | Does this domain belong to the prospect's business? |
| `isPersonLikely` | Is this email address a real person (vs. service/no-reply)? |

### Categories

Domains are classified into the following categories:

| Category | Description | Example |
|----------|-------------|---------|
| `business_domain` | The prospect's own domain | acmecorp.com for Acme Corp |
| `third_party_business` | External vendor, agency, consultant | marketingagency.com |
| `personal_domain` | Personal email providers | gmail.com, outlook.com |
| `service_provider` | Email/hosting services | sendgrid.com |
| `saas_platform` | Software tools | slack.com, notion.so |
| `spam_or_marketing` | Bulk senders | newsletter platforms |
| `forwarded_personal` | Personal forwards | |
| `unknown` | Cannot determine | |

## Processing Flow

### Step 1: Filter Email Addresses

When an email/event arrives:
- Extract all email addresses (from, to, cc, bcc, participants)
- Filter out organization's own domains
- Find existing contacts for these addresses

### Step 2: Determine Prospect Context

```javascript
const contactProspectIds = contacts.map(c => c.prospect).filter(Boolean);
const uniqueProspectIds = [...new Set(contactProspectIds.map(id => id.toString()))];
const singleProspectContextId = uniqueProspectIds.length === 1 ? uniqueProspectIds[0] : null;
```

If all existing contacts belong to the **same prospect**, we have a "single prospect context" which enables smart domain association.

### Step 3: Early Exit Check (Optimization)

Before calling the AI, the system checks if there's any prospect to associate with:

```javascript
// First, check if domain belongs to any existing prospect
let prospectByDomain = await Prospect.findOne({ 
  domains: { $in: [domain] }, 
  organization: user.organization 
});

// If no prospect found by domain AND no prospect context, skip entirely
if (!prospectByDomain && !singleProspectContextId) {
  console.log(`[NYLAS-EMAIL] No prospect context for ${emailAddress}, skipping`);
  continue;  // NO LLM CALL - saves cost
}
```

This optimization prevents LLM calls for emails that have no connection to any prospect.

### Step 4: AI Domain Validation

When we have prospect context, the AI is called with:

```javascript
const decision = await getDomainDecision(domain, {
  organizationId: user.organization,
  contactEmail: emailAddress,
  emailContext: email.subject,
  prospectName: prospectContext.name,        // e.g., "Acme Corp"
  existingDomains: prospectContext.domains,  // e.g., ["acmecorp.com"]
});
```

The AI determines:
1. **Is this domain the prospect's domain?** (comparing against prospect name and existing domains)
2. **Is this a real person?** (checking for patterns like `noreply@`, `notifications@`, etc.)

### Step 5: Process Decision

```
                    ┌─────────────────────────────────┐
                    │  isPersonLikely === false?      │
                    └───────────────┬─────────────────┘
                                    │ YES
                                    ▼
                        SKIP ENTIRELY (no contact)
                                    
                    ┌─────────────────────────────────┐
                    │  shouldInclude === true?        │
                    │  (Domain belongs to prospect)   │
                    └───────────────┬─────────────────┘
                              │           │
                        YES   │           │  NO (excludeDomain = true)
                              ▼           ▼
          ┌───────────────────────┐   ┌───────────────────────────┐
          │ Add domain to         │   │ Use existing prospect     │
          │ prospect if new       │   │ context (no domain added) │
          │ (smart association)   │   │                           │
          └───────────────────────┘   └───────────────────────────┘
                              │           │
                              ▼           ▼
                    ┌─────────────────────────────────┐
                    │  Create Contact with flags:     │
                    │  - domainExcluded: true/false   │
                    │  - origin: 'external_cc' or     │
                    │           'nylas_email/calendar'│
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │  Link contact to Opportunity    │
                    └─────────────────────────────────┘
```

## Smart Domain Association

When a new domain appears in an email with existing prospect contacts:

1. AI validates if the domain belongs to that prospect
2. If `shouldInclude: true`, the domain is added to the prospect's domain list
3. This allows future emails from that domain to be automatically associated

**Example:**
- Email from `john@acmecorp.com` (known contact at Acme Corp)
- CC'd: `sarah@acme-subsidiary.com` (new address)
- AI determines `acme-subsidiary.com` belongs to Acme Corp
- Domain is added to Acme Corp's domain list
- Future emails from `acme-subsidiary.com` auto-associate

## Third-Party Contacts

When someone CC'd is from a different business (e.g., a marketing agency):

1. AI determines `shouldInclude: false` (not the prospect's domain)
2. AI determines `isPersonLikely: true` (it's a real person)
3. Contact is created with `domainExcluded: true` and `origin: 'external_cc'`
4. Contact is linked to the Opportunity
5. Domain is **NOT** added to the prospect

This allows tracking of deal-related third parties without polluting the prospect's domain list.

## Caching

Domain validation uses a 3-tier caching strategy:

| Tier | Storage | TTL | Description |
|------|---------|-----|-------------|
| 1 | Hardcoded Set | Forever | ~93 known excluded domains (gmail.com, etc.) |
| 2 | In-Memory Map | Until restart | Fast lookup for recent decisions |
| 3 | MongoDB | 30 days | Persistent cache in `DomainValidationCache` collection |

**Important:** The cache stores domain decisions, not personhood. Personhood is evaluated per-email since `dylan@company.com` vs `noreply@company.com` require different decisions.

## Configuration

Located in `src/config/domainValidation.ts`:

```javascript
export const DOMAIN_VALIDATION_CONFIG = {
  cacheTtlDays: 30,           // How long to cache decisions
  minConfidence: 'medium',    // Minimum AI confidence to trust
  aiModel: 'gpt-4o-mini',     // Model used for validation
  batchSize: 5,               // Batch size for bulk validation
  orgInfoCacheTtlMs: 600000,  // 10 minutes for org info cache
};
```

## Contact Model Integration

The Contact model has a post-save hook that can also trigger domain validation:

```javascript
// Contact.ts post-save hook
if (doc.domainExcluded || doc.origin === 'external_cc') {
  // Skip domain extraction for flagged contacts
  return;
}

// Otherwise, validate domains and potentially add to prospect
const validationResults = await validateDomains(candidateDomains, context);
```

Contacts created with `domainExcluded: true` skip this secondary validation.

## Files

| File | Purpose |
|------|---------|
| `src/utils/domain.ts` | Core domain validation logic and AI integration |
| `src/models/DomainValidationCache.ts` | MongoDB cache schema |
| `src/config/domainValidation.ts` | Configuration constants |
| `src/services/NylasService.ts` | Email/calendar processing that triggers validation |
| `src/models/Contact.ts` | Contact model with post-save domain extraction |
| `src/mastra/agents/domainValidationAgent.ts` | AI agent definition |

## Troubleshooting

### Domain wrongly added to prospect

1. Check the `DomainValidationCache` collection for the cached decision
2. The AI may have had insufficient context (missing `prospectName` or `existingDomains`)
3. Clear the cache entry to force re-evaluation

### LLM not being called

1. Domain may be in hardcoded exclusions (`EXCLUDED_DOMAINS` in domain.ts)
2. Domain may be cached in MongoDB
3. No prospect context available (optimization skips LLM)

### Contact not created

1. `isPersonLikely` returned `false` (detected as service/no-reply)
2. No prospect found by domain AND no `singleProspectContextId`
3. Check logs for `[NYLAS-EMAIL]` or `[NYLAS-CALENDAR]` entries
