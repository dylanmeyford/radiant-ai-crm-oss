import { z } from 'zod';

export const CallActionDetailsSchema = z.object({
  contactEmail: z.string().email().describe('Email of the person to call'),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/).describe('Scheduled date in ISO format'),
  // Content fields to be composed later
  purpose: z.string().nullable().describe('Will be composed by content agent')
});

export const ComposedCallContentSchema = z.object({
  purpose: z.string().min(5).max(500).describe('Call purpose with talking points')
});

