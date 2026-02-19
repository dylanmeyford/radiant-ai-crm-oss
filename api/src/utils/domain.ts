import { z } from 'zod';
import mongoose from 'mongoose';
import DomainValidationCache, {
  DomainValidationCategory,
  DomainValidationConfidence,
} from '../models/DomainValidationCache';
import { DOMAIN_VALIDATION_CONFIG } from '../config/domainValidation';
import { mastra } from '../mastra';
import SalesPlaybook, { ContentType } from '../models/SalesPlaybook';
import { Agent } from '@mastra/core/agent';
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

const EXCLUDED_DOMAINS = new Set<string>([
  // Free email providers - multinational and mainstream
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.co.jp',
  'yahoo.com.au', 'yahoo.com.br', 'yahoo.com.mx', 'yahoo.ca',
  'ymail.com', 'rocketmail.com', 'netscape.net',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es',
  'hotmail.com.br', 'hotmail.com.mx', 'hotmail.com.ar', 'hotmail.com.co',
  'outlook.com', 'outlook.co.uk', 'outlook.fr', 'outlook.de', 'outlook.es',
  'outlook.com.br', 'outlook.com.mx', 'outlook.com.ar', 'outlook.com.co',
  'live.com', 'live.co.uk', 'live.fr', 'live.de', 'live.ca',
  'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com', 'compuserve.com',
  'mail.com', 'email.com', 'post.com', 'usa.com', 'consultant.com',
  'myself.com', 'iname.com',
  'inbox.com', 'mail2world.com', 'gawab.com', 'lycos.com',
  'zoho.com', 'zohomail.com',

  // Privacy-focused and indie providers
  'protonmail.com', 'proton.me', 'pm.me',
  'tutanota.com', 'tuta.io',
  'mailfence.com', 'mailbox.org', 'posteo.de',

  // Regional consumer providers
  'gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch',
  'web.de', 'freenet.de',
  'laposte.net', 'orange.fr', 'wanadoo.fr', 'free.fr',
  'libero.it', 'virgilio.it', 'alice.it', 'tin.it', 'tiscali.it',
  'seznam.cz', 'email.cz', 'post.cz', 'centrum.cz', 'volny.cz',
  'onet.pl', 'o2.pl', 'wp.pl', 'gazeta.pl', 'interia.pl',
  'ukr.net', 'i.ua', 'meta.ua', 'bigmir.net',
  'mail.bg', 'abv.bg', 'dir.bg', 'inbox.lv',
  'mail.ru', 'list.ru', 'bk.ru', 'inbox.ru',
  'yandex.com', 'yandex.ru', 'ya.ru',
  'qq.com', 'vip.qq.com', 'foxmail.com',
  '163.com', '126.com', 'yeah.net', '139.com',
  'sina.com', 'sina.com.cn', 'sohu.com', 'aliyun.com', '21cn.com',
  'naver.com', 'daum.net', 'hanmail.net', 'korea.com',
  'rediffmail.com', 'sify.com',
  'terra.com.br', 'terra.com', 'terra.es', 'uol.com.br', 'bol.com.br',
  'ig.com.br',
  'prodigy.net.mx', 'hotmail.es', 'outlook.es',
  'sapo.pt', 'zonnet.nl', 'hetnet.nl', 'planet.nl', 'xs4all.nl', 'home.nl', 'ziggo.nl',

  // ISP and carrier-provided free email
  'comcast.net',
  'verizon.net',
  'att.net', 'bellsouth.net', 'sbcglobal.net', 'pacbell.net', 'swbell.net', 'ameritech.net', 'flash.net',
  'cox.net', 'charter.net', 'spectrum.net', 'suddenlink.net', 'wowway.com',
  'optimum.net', 'optonline.net',
  'frontier.com', 'frontiernet.net', 'windstream.net',
  'earthlink.net', 'mindspring.com',
  'juno.com', 'netzero.net', 'peoplepc.com',
  'rogers.com', 'shaw.ca', 'telus.net', 'bell.net', 'sympatico.ca', 'videotron.ca',
  'btinternet.com', 'btopenworld.com', 'talktalk.net', 'tiscali.co.uk',
  'virginmedia.com', 'blueyonder.co.uk', 'ntlworld.com',
  'sky.com',
  'bigpond.com', 'bigpond.net.au', 'optusnet.com.au', 'iinet.net.au',
  'xtra.co.nz', 'spark.co.nz',

  // Major tech companies
  'google.com', 'accounts.google.com', 'microsoft.com', 'apple.com',
  'amazon.com', 'meta.com', 'facebook.com', 'twitter.com', 'x.com',
  'linkedin.com', 'github.com', 'gitlab.com', 'post.xero.com', 'post.salesforce.com', 

  // Common SaaS/service domains
  'slack.com', 'notion.so', 'asana.com', 'trello.com', 'atlassian.com',
  'jira.com', 'confluence.com', 'zoom.us', 'calendly.com',
  'stripe.com', 'paypal.com', 'square.com',
  'twilio.com', 'team.twilio.com', 'sendgrid.com', 'mailchimp.com',
  'hubspot.com', 'salesforce.com', 'zendesk.com', 'intercom.com',
  'segment.com', 'mixpanel.com', 'amplitude.com',
  'dropbox.com', 'box.com', 'drive.google.com',
  'figma.com', 'canva.com', 'account.canva.com',
  'zapier.com', 'mail.zapier.com', 'make.com', 'integromat.com',
  'streak.com', 'pipedrive.com', 'monday.com',
  'gitkraken.com', 'bitbucket.org',
  'reddit.com', 'reddit-corp.com',
  'quotaguard.com', 'heroku.com', 'vercel.com', 'netlify.com',
]);

export function normalizeDomain(domain: string): string {
  const trimmed = (domain || '').trim().toLowerCase();
  return trimmed.startsWith('www.') ? trimmed.slice(4) : trimmed;
}

export function isValidDomain(domain: string): boolean {
  const normalized = normalizeDomain(domain);
  return DOMAIN_REGEX.test(normalized);
}

export function normalizeDomains(domains: string[]): string[] {
  return Array.from(new Set((domains || []).map(normalizeDomain)));
}

export interface DomainValidationContext {
  organizationId?: string | mongoose.Types.ObjectId | null;
  organizationName?: string;
  organizationIndustry?: string;
  prospectId?: string | mongoose.Types.ObjectId | null;
  prospectName?: string;
  prospectIndustry?: string;
  existingDomains?: string[];
  opportunityId?: string | mongoose.Types.ObjectId | null;
  opportunityName?: string;
  contactEmail?: string;
  emailContext?: string; // subject or snippet
}

export interface DomainValidationDecision {
  shouldInclude: boolean;
  confidence: DomainValidationConfidence;
  reasoning: string;
  category: DomainValidationCategory;
  source: 'hardcoded' | 'cache' | 'ai';
  isPersonLikely?: boolean;
}

const aiDecisionCache = new Map<string, { decision: DomainValidationDecision; expiresAt: number }>();
const orgInfoCache = new Map<string, { content: string[]; expiresAt: number }>();

const DomainValidationSchema = z.object({
  shouldInclude: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string(),
  category: z.enum([
    'business_domain',
    'personal_domain',
    'service_provider',
    'saas_platform',
    'spam_or_marketing',
    'forwarded_personal',
    'third_party_business',
    'unknown',
  ]),
  // isPersonLikely indicates whether the email address is likely a human (vs. service/no-reply)
  isPersonLikely: z.boolean().optional(),
});

function cacheKey(domain: string, organizationId?: string | mongoose.Types.ObjectId | null): string {
  return `${normalizeDomain(domain)}::${organizationId ?? 'global'}`;
}

function meetsConfidenceThreshold(confidence: DomainValidationConfidence): boolean {
  const order = { low: 0, medium: 1, high: 2 };
  return order[confidence] >= order[DOMAIN_VALIDATION_CONFIG.minConfidence];
}

async function getOrgBusinessInformation(
  organizationId?: string | mongoose.Types.ObjectId | null
): Promise<string[]> {
  if (!organizationId) return [];

  const key = String(organizationId);
  const now = Date.now();
  const cached = orgInfoCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.content;
  }

  try {
    const docs = await SalesPlaybook.find({
      organization: organizationId,
      type: { $in: [ContentType.BUSINESS_INFORMATION, ContentType.PRODUCT_OVERVIEW] },
    })
      .select('content')
      .lean();

    const content = docs.map((d: any) => d.content).filter(Boolean);
    orgInfoCache.set(key, {
      content,
      expiresAt: now + DOMAIN_VALIDATION_CONFIG.orgInfoCacheTtlMs,
    });
    return content;
  } catch (error) {
    console.warn('[DOMAIN-VALIDATION] Failed to fetch sales playbook info', error);
    return [];
  }
}

async function readCachedDecision(
  domain: string,
  organizationId?: string | mongoose.Types.ObjectId | null
): Promise<DomainValidationDecision | null> {
  const key = cacheKey(domain, organizationId);
  const now = Date.now();
  const memory = aiDecisionCache.get(key);
  if (memory && memory.expiresAt > now) {
    return memory.decision;
  }

  try {
    const doc = await DomainValidationCache.findOne({
      domain: normalizeDomain(domain),
      organizationId: organizationId ?? null,
    }).lean();

    if (!doc) return null;
    if (doc.expiresAt && doc.expiresAt.getTime() < now) {
      return null;
    }

    const decision: DomainValidationDecision = {
      shouldInclude: doc.shouldInclude,
      confidence: doc.confidence,
      reasoning: doc.reasoning,
      category: doc.category,
      source: 'cache',
    };

    aiDecisionCache.set(key, {
      decision,
      expiresAt:
        doc.expiresAt?.getTime() ||
        now + DOMAIN_VALIDATION_CONFIG.cacheTtlDays * 24 * 60 * 60 * 1000,
    });

    return decision;
  } catch (error) {
    console.warn('[DOMAIN-VALIDATION] Failed to read cache', error);
    return null;
  }
}

async function persistDecision(
  domain: string,
  organizationId: string | mongoose.Types.ObjectId | null,
  prospectName: string | undefined,
  decision: DomainValidationDecision
): Promise<void> {
  const normalized = normalizeDomain(domain);
  const expiresAt = new Date(
    Date.now() + DOMAIN_VALIDATION_CONFIG.cacheTtlDays * 24 * 60 * 60 * 1000
  );

  try {
    await DomainValidationCache.findOneAndUpdate(
      { domain: normalized, organizationId: organizationId ?? null },
      {
        $set: {
          domain: normalized,
          shouldInclude: decision.shouldInclude,
          confidence: decision.confidence,
          reasoning: decision.reasoning,
          category: decision.category,
          organizationId: organizationId ?? null,
          prospectContext: prospectName,
          validatedAt: new Date(),
          expiresAt,
          source: decision.source,
        },
      },
      { upsert: true }
    );

    const key = cacheKey(domain, organizationId);
    aiDecisionCache.set(key, { decision, expiresAt: expiresAt.getTime() });
  } catch (error) {
    console.warn('[DOMAIN-VALIDATION] Failed to persist decision', error);
  }
}

async function getAgent(): Promise<Agent | null> {
  try {
    if (typeof (mastra as any)?.getAgent === 'function') {
      return mastra.getAgent('domainValidationAgent');
    }
    return (mastra as any)?.agents?.domainValidationAgent ?? null;
  } catch (error) {
    console.error('[DOMAIN-VALIDATION] Unable to load agent', error);
    return null;
  }
}

function buildPrompt(domain: string, context: DomainValidationContext, orgInfo: string[]): string {
  const parts = [
    `Domain to validate: ${domain}`,
    context.contactEmail ? `Contact email: ${context.contactEmail}` : '',
    '',
    `=== PROSPECT CONTEXT ===`,
    context.prospectName ? `Prospect company name: ${context.prospectName}` : 'Prospect company name: Unknown',
    context.prospectIndustry ? `Prospect industry: ${context.prospectIndustry}` : '',
    context.existingDomains?.length
      ? `Prospect's known domains: ${context.existingDomains.join(', ')}`
      : 'Prospect\'s known domains: None yet',
    '',
    context.organizationName ? `Our organization: ${context.organizationName}` : '',
    context.organizationIndustry ? `Our industry: ${context.organizationIndustry}` : '',
    context.opportunityName ? `Opportunity: ${context.opportunityName}` : '',
    context.emailContext ? `Email subject/context: ${context.emailContext}` : '',
    orgInfo.length ? `Additional business context:\n${orgInfo.slice(0, 5).join('\n')}` : '',
    `
=== YOUR TASK ===
You must answer TWO questions:

1. DOMAIN OWNERSHIP: Does "${domain}" belong to the prospect's business?
   - Consider: Is this domain owned by, operated by, or a subsidiary of the prospect company?
   - Compare to the prospect's existing domains for naming patterns
   - A third-party vendor, marketing agency, consultant, law firm, etc. CC'd on emails is NOT the prospect's domain
   - Example: If prospect is "Acme Corp" with domain "acmecorp.com", and we see "creativemarketingagency.com" - this is a THIRD PARTY, not the prospect

2. PERSONHOOD: Is the email address likely a real person vs automated/service?
   - Likely person: firstname.lastname@, first@, dylan@, sarah.jones@, role-based like sales@ or ceo@
   - Likely service/no-reply: noreply@, no-reply@, notifications@, billing@, support@, help@, automation@, updates@, bounce@, receipts@, invoices@, system@

=== RESPONSE FORMAT ===
Respond with JSON:
- shouldInclude: true ONLY if domain belongs to the prospect's business; false for third-party businesses, personal emails, SaaS platforms, etc.
- confidence: high|medium|low
- reasoning: brief explanation
- category: 
  - business_domain (prospect's own domain)
  - third_party_business (external vendor, agency, consultant, partner - NOT the prospect)
  - personal_domain (gmail, personal website, etc.)
  - service_provider (email service, hosting, etc.)
  - saas_platform (software tools)
  - spam_or_marketing (bulk senders)
  - forwarded_personal
  - unknown
- isPersonLikely: true if the mailbox appears to be a real person, false if service/no-reply

IMPORTANT: When in doubt, set shouldInclude to false. It's better to not add a domain than to wrongly associate a third-party's domain with the prospect.`,
  ];

  return parts.filter(Boolean).join('\n');
}

async function validateWithAI(
  domain: string,
  context: DomainValidationContext
): Promise<DomainValidationDecision> {
  const agent = await getAgent();
  if (!agent) {
    return {
      shouldInclude: false,
      confidence: 'low',
      reasoning: 'Domain validation agent unavailable',
      category: 'unknown',
      source: 'ai',
    };
  }

  const orgInfo = await getOrgBusinessInformation(context.organizationId);
  const prompt = buildPrompt(domain, context, orgInfo);

  const toSafeId = (val: any) => {
    const raw =
      val && typeof val === 'object' && (val as any)._id ? String((val as any)._id) : val ? String(val) : '';
    return raw.slice(0, 512);
  };

  const safeOrgId = toSafeId(context.organizationId);
  const safeProspectId = toSafeId(context.prospectId);
  const safeOpportunityId = toSafeId(context.opportunityId);

  try {
    const result = await agent.generateLegacy(
      [{ role: 'user', content: prompt }],
      {
        output: DomainValidationSchema,
        providerOptions: {
          openai: {
            metadata: {
              file: 'domain-validation',
              agent: 'domainValidationAgent',
              orgId: safeOrgId,
              prospectId: safeProspectId,
              opportunityId: safeOpportunityId,
            },
          },
        },
      }
    );

    const parsed = (result as any).object ?? (result as any).output ?? result;
    return {
      shouldInclude: parsed.shouldInclude,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      category: parsed.category,
      source: 'ai',
      isPersonLikely: parsed.isPersonLikely,
    };
  } catch (error) {
    console.error('[DOMAIN-VALIDATION] AI validation failed', error);
    return {
      shouldInclude: false,
      confidence: 'low',
      reasoning: 'AI validation failed; defaulting to exclude',
      category: 'unknown',
      source: 'ai',
    };
  }
}

/**
 * Returns the full domain validation decision, including personhood.
 * Use this when you need both domain inclusion and personhood in one call.
 */
export async function getDomainDecision(
  domain: string,
  context: DomainValidationContext
): Promise<DomainValidationDecision> {
  const normalized = normalizeDomain(domain);

  // Tier 1: hardcoded exclusions
  if (EXCLUDED_DOMAINS.has(normalized)) {
    // For hardcoded exclusions, we still need to determine personhood from email address
    // We'll call AI just for personhood if we have a contactEmail
    if (context.contactEmail) {
      const personhoodDecision = await validateWithAI(normalized, context);
      return {
        shouldInclude: false,
        confidence: 'high',
        reasoning: 'Domain in hardcoded exclusion list',
        category: 'personal_domain',
        source: 'hardcoded',
        isPersonLikely: personhoodDecision.isPersonLikely,
      };
    }
    return {
      shouldInclude: false,
      confidence: 'high',
      reasoning: 'Domain in hardcoded exclusion list',
      category: 'personal_domain',
      source: 'hardcoded',
      isPersonLikely: undefined, // unknown without email context
    };
  }

  // Tier 2: cache (note: cache doesn't store personhood, so skip if we need personhood)
  if (!context.contactEmail) {
    const cached = await readCachedDecision(normalized, context.organizationId);
    if (cached) {
      return cached;
    }
  }

  // Tier 3: AI - returns both domain decision and personhood
  const decision = await validateWithAI(normalized, context);
  
  // Apply confidence threshold
  const trustedDecision = meetsConfidenceThreshold(decision.confidence)
    ? decision.shouldInclude
    : false;

  // Persist (without personhood - that's email-specific)
  await persistDecision(normalized, context.organizationId ?? null, context.prospectName, {
    ...decision,
    shouldInclude: trustedDecision,
  });

  return {
    ...decision,
    shouldInclude: trustedDecision,
  };
}

export async function isExcludedDomain(
  domain?: string | null,
  context?: DomainValidationContext
): Promise<boolean> {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  const normalized = normalizeDomain(domain);

  // Tier 1: hardcoded
  if (EXCLUDED_DOMAINS.has(normalized)) {
    return true;
  }

  // If no context provided, keep legacy behaviour without AI
  if (!context) {
    return false;
  }

  // Tier 2: cache
  const cached = await readCachedDecision(normalized, context.organizationId);
  if (cached) {
    return !cached.shouldInclude;
  }

  // Tier 3: AI
  const decision = await validateWithAI(normalized, context);
  const trustedDecision = meetsConfidenceThreshold(decision.confidence)
    ? decision.shouldInclude
    : false; // be conservative when low confidence

  await persistDecision(normalized, context.organizationId ?? null, context.prospectName, decision);

  return !trustedDecision;
}

export async function validateDomains(
  domains: string[],
  context: DomainValidationContext
): Promise<Map<string, DomainValidationDecision>> {
  const results = new Map<string, DomainValidationDecision>();
  const uniqueDomains = normalizeDomains(domains || []);

  for (const domain of uniqueDomains) {
    const shouldExclude = await isExcludedDomain(domain, context);
    const cached = await readCachedDecision(domain, context.organizationId);
    results.set(domain, cached || { shouldInclude: !shouldExclude, confidence: 'low', reasoning: 'fallback', category: 'unknown', source: 'cache' });
  }

  return results;
}

export { EXCLUDED_DOMAINS };

