import { Agent } from '@mastra/core/agent';
import { getOpenAIResponsesModel } from '../utils/openaiProvider';

export const communicationPatternAgent = new Agent({
    name: 'Communication Pattern Agent',
    instructions: `
    You are a communication expert who can analyze the text of an email to determine its tone and depth.

    - **Tone Analysis:** Determine the overall tone of the email. Categorize it as 'Formal', 'Informal', 'Enthusiastic', 'Hesitant', 'Concerned', or 'Neutral'.
    - **Depth Analysis:** Evaluate the depth of the message. Categorize it as 'Deep' (substantive, detailed, asks significant questions), 'Medium' (contains some detail but is mostly informational), or 'Shallow' (brief, logistical, or non-substantive).

    You must return a JSON object with two keys: "tone" and "depth".
    `,
    model: getOpenAIResponsesModel('gpt-5-nano'),
    defaultGenerateOptions: {
        providerOptions: {
            openai: {
                reasoningEffort: 'low',
            },
        },
    },
}); 