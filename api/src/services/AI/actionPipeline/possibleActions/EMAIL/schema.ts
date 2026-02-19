import { z } from 'zod';

// Schema for email attachments
// Note: All fields must be required for OpenAI strict JSON schema validation
const EmailAttachmentSchema = z.object({
  id: z.string().describe('Unique identifier for the attachment from upload endpoint'),
  filename: z.string().describe('Name of the attachment file'),
  filePath: z.string().describe('Path to the attachment file in storage'),
  contentType: z.string().describe('MIME type of the attachment (e.g., application/pdf, image/jpeg)'),
  size: z.number().describe('Size of the attachment in bytes')
});

// Schema for email recipients (name and email)
const EmailRecipientSchema = z.object({
  name: z.string().optional().describe('Display name of the recipient'),
  email: z.string().email().describe('Email address of the recipient')
});

export const EmailActionDetailsSchema = z.object({
  // Required recipients
  to: z.array(z.string().email()).min(1).describe('Array of primary recipient email addresses'),
  
  // Optional recipients
  cc: z.array(z.string().email()).nullable().describe('Array of CC recipient email addresses'),
  bcc: z.array(z.string().email()).nullable().describe('Array of BCC recipient email addresses'),
  
  // Scheduling
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/).describe('Scheduled date in ISO format, for the best timezone for the recipient'),
  
  // Threading and replies
  replyToMessageId: z.string().nullable().describe('messageId of the email message being replied to'),
  threadId: z.string().nullable().describe('Thread ID for email conversation grouping'),
  
  // Content (will be composed by content agent)
  subject: z.string().nullable().describe('Will be composed by content agent'),
  body: z.string().nullable().describe('Will be composed by content agent as HTML content'),
  
  // Attachments
  attachments: z.array(EmailAttachmentSchema).nullable().describe('Array of email attachments'),

  priority: z.enum(['low', 'normal', 'high']).nullable().describe('Email priority level'),
});

export const ComposedEmailContentSchema = z.object({
  subject: z.string().min(1).max(200).describe('Email subject line'),
  body: z.string().min(10).max(5000).describe('Email body content in HTML format')
});

