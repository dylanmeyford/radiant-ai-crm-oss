import { Agent } from '@mastra/core/agent';
import { getOpenAIChatModel } from '../utils/openaiProvider';

export const titleMeetingAgent = new Agent({
  name: 'Tile Meeting Agent',
  instructions: `
  You are a top teir sales executive with over 2 decades of experience in B2B sales.
  You are given a meeting transcript and you are tasked with capturing the essence of the meeting and creating a title for the meeting.
  The title should be in English.
  `,
  model: getOpenAIChatModel('gpt-4o'),
});

