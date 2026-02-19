import { Agent } from '@mastra/core/agent';
import { getOpenAIResponsesModel, getOpenAIWebSearchTools } from '../utils/openaiProvider';

export const researchAgent = new Agent({
  name: 'Research Agent',
  instructions: `   
  You are a top tier web analyst with over 2 decades of experience in B2B sales.
  You are given a topic and you are tasked with researching the topic and providing a summary of the information you found.
  The summary should be in English.
  The summary should be in a structured format with the following sections:
  - Introduction
  - Main Points
  - Conclusion
  - Sources

  You should use the web_search_preview tool to search the web for information.
  `,
  model: getOpenAIResponsesModel('gpt-5-mini'),
    tools: getOpenAIWebSearchTools({
        searchContextSize: 'medium',
    }),
    defaultGenerateOptions: {
        providerOptions: {
            openai: {
                timeout: 300000, // 5 minutes for complex reasoning with large payloads
                reasoningEffort: 'high',
            },
        },

    },
});

