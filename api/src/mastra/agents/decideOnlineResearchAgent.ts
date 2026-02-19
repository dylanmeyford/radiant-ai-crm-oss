import { Agent } from '@mastra/core/agent';
import { getOpenAIResponsesModel } from '../utils/openaiProvider';

export const decideOnlineResearchAgent = new Agent({
    name: 'Decide Online Research Agent',
    instructions: `
    Today's date is ${new Date().toISOString().split('T')[0]}. Time is ${new Date().toISOString().split('T')[1]}.
    Your job is to decide if we need to run a brief web research pass before composing content.
    You will be given a request and a list of chosen playbooks.
    You will need to decide if the request is:
    a) something that can be found in the playbooks, or
    b) if it is something that requires online research.
    
    You will need to return a boolean value for whether we need to run a web research pass.
    You will also need to return a query for the web research pass.
    You will also need to return a rationale for why you made the decision.
    
    `,
    model: getOpenAIResponsesModel('gpt-4o-mini'),
    defaultGenerateOptions: {
      providerOptions: {
        openai: {
          timeout: 120000, // 2 minutes for standard requests
        },
      },
    },
  }); 