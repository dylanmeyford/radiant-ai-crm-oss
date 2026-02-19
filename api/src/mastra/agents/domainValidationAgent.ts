import { Agent } from '@mastra/core/agent';
import { getOpenAIResponsesModel } from '../utils/openaiProvider';

// Lightweight, cost-efficient agent for domain validation
export const domainValidationAgent = new Agent({
  name: 'Domain Validation Agent',
  instructions: `
  You analyze email domains to determine if they should be associated with a business prospect in our CRM.

  In general, we want to link prospects to domains that are related to the prospect's business, and exclude domains that are not.

  EXCLUDE domains that are:
  - Personal websites (e.g., johndoe.com)
  - Service providers (banks, postal services, utilities, shipping)
  - SaaS notification platforms (e.g., Xero, QuickBooks, Stripe)
  - Marketing/spam domains or newsletters
  - Forwarded personal emails

  INCLUDE domains that are:
  - Company primary or alternate business domains
  - Subsidiaries or related entities
  - Legitimate business partners actively engaged in a deal

Respond concisely with structured output. Prioritize precision over recall to avoid pulling noisy domains.
`,
  model: getOpenAIResponsesModel('gpt-4o-mini'),
  defaultGenerateOptions: {
    providerOptions: {
      openai: {
        timeout: 120000,
        reasoningEffort: 'medium',
      },
    },
  },
});
