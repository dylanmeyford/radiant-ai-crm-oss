import { Agent } from '@mastra/core/agent';
import { getOpenAIResponsesModel } from '../utils/openaiProvider';

export const relationshipStoryAgent = new Agent({
    name: 'Relationship Story Agent',
    instructions: `
    You are an expert sales strategist and storyteller.
    Your task is to synthesize a contact's engagement data within a specific sales opportunity into a concise, insightful narrative.
    You will be provided with key data points including engagement scores, roles, and behavioral indicators.
    Your output MUST be a JSON object with a single key: "story".
    The story should capture the essence of the relationship's trajectory.
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