import { Agent } from '@mastra/core/agent';
import { getOpenAIResponsesModel } from '../utils/openaiProvider';

/**
 * Generates concise sales-focused summaries for playbook content.
 * Used when no files are attached and we need a quick synopsis from the text body.
 */
export const playbookSummaryAgent = new Agent({
  name: 'Playbook Summary Agent',
  instructions: `
  You are a senior sales enablement strategist.
  Given a playbook's type, title, tags, keywords, and raw content, write a concise 2-3 sentence summary that:
  - Clearly states the document type and primary value proposition.
  - Highlights when and how a seller should use it.
  - Focuses on business outcomes and sales utility (not implementation details).

  OUTPUT: Return a JSON object:
  {
    "contentSummary": "string, 2-3 sentences, sales-focused",
    "confidence": "High|Medium|Low"
  }

  Rules:
  - Keep it factual and specific to the provided content.
  - Do NOT invent features or claims not in the content.
  - If content is thin, still produce the best possible concise summary and set confidence accordingly.
  `,
  model: getOpenAIResponsesModel('gpt-5-mini'),
  defaultGenerateOptions: {
    providerOptions: {
      openai: {
        reasoningEffort: 'medium',
      },
    },
  },
});

