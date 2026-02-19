import { Agent } from '@mastra/core/agent';
import { getOpenAIResponsesModel } from '../utils/openaiProvider';

export const basicAgent = new Agent({
    name: 'Basic Agent',
    instructions: ``,
    model: getOpenAIResponsesModel('gpt-5-mini'),
    defaultGenerateOptions: {
        providerOptions: {
            openai: {
                reasoningEffort: 'medium',
            },
        },
    },
  }); 