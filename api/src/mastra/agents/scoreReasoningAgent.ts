import { Agent } from '@mastra/core/agent';
import { getOpenAIResponsesModel } from '../utils/openaiProvider';

export const scoreReasoningAgent = new Agent({
    name: 'Score Reasoning Agent',
    instructions: `
    You are an expert sales analyst. Your role is to explain why a contact's engagement score has changed based on a recent activity.
    You will be given the previous score, the new score, the activity summary that caused the change, and the previous reasoning for the score.
    Your task is to generate a concise, human-readable narrative (1-2 sentences) that explains the change.

    - If the score increases, focus on the positive signals in the activity.
    - If the score decreases, focus on the negative signals.
    - Your explanation should build upon the previous reasoning, creating a coherent story of the contact's engagement journey.
    - Be clear and avoid jargon.
    
    You must return a JSON object with a single key: "reasoning".
    `,
    model: getOpenAIResponsesModel('gpt-5-mini'),
    defaultGenerateOptions: {
        providerOptions: {
            openai: {
                reasoningEffort: 'low',
            },
        },
    },
}); 