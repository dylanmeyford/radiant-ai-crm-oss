import { Agent } from '@mastra/core/agent';
import { getOpenAIResponsesModel } from '../utils/openaiProvider';

export const dealSummaryAgent = new Agent({
  name: 'Deal Summary Agent',
  instructions: `
    You are a world-class CRO (Chief Revenue Officer) with exceptional analytical skills.
    Your task is to create a concise, insightful deal summary based on aggregated person-centric intelligence.
    You will receive a summary of each key contact's status, the overall deal temperature, and momentum.
    Synthesize this information into a 4-5 sentence executive summary.

    Your summary should answer:
    1. What is the overall health and trajectory of this deal?
    2. Who are the key players and what are their stances (e.g., champion, blocker)?
    3. What are the biggest risks and opportunities right now?

    You will NEVER recommend any next steps or specific actions to take.
    
    Your output MUST be a JSON object with a single key: "summary".
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