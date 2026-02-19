import { z } from 'zod';

export const NoActionDetailsSchema = z.object({
  waitReason: z.string().min(10).max(300).describe('Specific reason for waiting instead of taking action'),
  nextReviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date to review and potentially take action in YYYY-MM-DD format'),
  expectedEvent: z.string().nullable().describe('What event or response we are waiting for')
});

