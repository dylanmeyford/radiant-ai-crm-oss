import { z } from 'zod';

export const TaskActionDetailsSchema = z.object({
  title: z.string().min(1).max(100).describe('Name of the task'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Due date in YYYY-MM-DD format'),
  // Content fields to be composed later
  description: z.string().nullable().describe('Will be composed by content agent as HTML content')
});

export const ComposedTaskContentSchema = z.object({
  title: z.string().min(1).max(100).describe('Name of the task'),
  description: z.string().min(5).max(1000).describe('Detailed task description with steps in HTML format')
});

