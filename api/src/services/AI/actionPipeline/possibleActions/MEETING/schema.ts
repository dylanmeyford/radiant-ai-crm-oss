import { z } from 'zod';

const IsoDateTimeSecondsSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  .describe('Scheduled date in ISO format');

export const MeetingActionDetailsSchema = z.object({
  mode: z
    .enum(['create', 'update', 'cancel'])
    .describe(
      'Meeting operation mode: create = schedule a new meeting, update = modify an existing meeting, cancel = cancel an existing meeting'
    ),
  existingCalendarActivityId: z
    .string()
    .nullable()
    .describe(
      'Required for update and cancel modes. Use the CalendarActivity ID from upcoming commitments. Null for create mode.'
    ),
  title: z.string().min(1).max(200).nullable().describe('Meeting title. Null for cancel mode.'),
  attendees: z
    .array(z.string().email())
    .min(1)
    .nullable()
    .describe('Array of attendee email addresses. Null for cancel mode.'),
  duration: z.number().min(15).max(480).nullable().describe('Meeting duration in minutes. Null for cancel mode.'),
  scheduledFor: IsoDateTimeSecondsSchema.nullable().describe('Scheduled date in ISO format. Null for cancel mode.'),
  location: z.string().min(1).max(500).nullable().describe('Optional meeting location. Null when not needed.'),
  // Content fields to be composed later
  agenda: z.string().nullable().describe('Will be composed by content agent')
});

export const ComposedMeetingContentSchema = z.object({
  agenda: z.string().min(10).max(2000).describe('Detailed meeting agenda')
});

