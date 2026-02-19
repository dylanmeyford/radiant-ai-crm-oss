import { z } from 'zod';

export const UpdatePipelineStageDetailsSchema = z.object({
  targetStageId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .describe('MongoDB ObjectId of the target pipeline stage'),
  targetStageName: z.string()
    .min(1)
    .max(100)
    .describe('Name of the target stage for readability')
});

