import { z } from 'zod';

export const LookupActionDetailsSchema = z.object({
  query: z.string().min(5).max(300).describe('The question or information to look up'),
  // Content fields to be composed later
  answer: z.string().nullable().describe('Will be composed by content agent as the looked-up answer'),
  // Note: Using plain string instead of .url() because OpenAI strict mode doesn't support 'uri' format
  sources: z.array(z.string()).nullable().describe('Optional list of source URLs used for the answer'),
  confidence: z.number().min(0).max(1).nullable().describe('Confidence score for the answer between 0 and 1')
});

export const ComposedLookupContentSchema = z.object({
  answer: z.string().min(3).max(5000).describe('The answer to the lookup query'),
  sources: z.array(z.string()).nullable().describe('List of source URLs used to derive the answer'),
  confidence: z.number().min(0).max(1).nullable().describe('Confidence score for the answer between 0 and 1')
});


