import { z } from 'zod';

export const LinkedInMessageActionDetailsSchema = z.object({
  contactEmail: z.string().email().describe('Email of the person to message on LinkedIn'),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/).describe('Scheduled date in ISO format, for the best timezone for the recipient'),
  // Content fields to be composed later
  message: z.string().nullable().describe('Will be composed by content agent')
});

export const ComposedLinkedInMessageContentSchema = z.object({
  message: z.string().min(10).max(1000).describe('LinkedIn message content')
});

