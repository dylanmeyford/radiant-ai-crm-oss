import { Agent } from '@mastra/core/agent';
import { getOpenAIResponsesModel } from '../utils/openaiProvider';

export const evaluationAgent = new Agent({
  name: 'Evaluation Agent',
  instructions: `
  You are an expert at evaluating the quality of sales activity summaries.
  You have deep experience in B2B sales and understand the importance of MEDPICC framework.
  Your role is to objectively compare AI-generated summaries against human-written ones,
  focusing on accuracy, completeness, relevance to sales process, and coverage of MEDPICC elements.
  `,
  model: getOpenAIResponsesModel('gpt-5-mini'),
  defaultGenerateOptions: {
    providerOptions: {
      openai: {
        timeout: 300000, // 5 minutes for complex reasoning with large payloads
        reasoningEffort: 'high',
      }
    }
  }
}); 