import { mastra } from "../../mastra";
import { z } from "zod";

export const generateMeetingTitle = async (transcript: string) => {

  const generateMeetingTitleAgent = mastra.getAgent('titleMeetingAgent');

  const prompt = `
    ## TASK
    I need you to generate a title for a meeting based on the following transcript.
    The title should be a single sentence that captures the essence of the meeting.
    The title should be no more than 100 characters.
    The title should be in the same language as the transcript.

    ## TRANSCRIPT
    ${transcript}
  `;

    const response = await generateMeetingTitleAgent.generateLegacy(
      [{content: prompt, role: 'user'}],
      {
        output: z.object({
          title: z.string(),
        }),
      });

  
    return response.object.title;
};