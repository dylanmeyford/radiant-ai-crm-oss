import chalk from 'chalk';
import { ActionPipelineContext, MainAction } from '../index.js';
import { MeetingActionDetailsSchema } from './schema';
import mongoose from 'mongoose';

export async function validateDetails(
  action: MainAction,
  context: ActionPipelineContext,
  validContactEmails: Set<string>,
  _validEmailActivityIds?: Set<string>
): Promise<any | null> {
  const validationResult = MeetingActionDetailsSchema.safeParse(action.details);
  if (!validationResult.success) {
    console.log(chalk.yellow(`          -> Invalid meeting details structure: ${validationResult.error.message}`));
    return null;
  }
  
  const details = validationResult.data;

  const requiresMeetingFields = details.mode === 'create' || details.mode === 'update';
  if (requiresMeetingFields) {
    if (!details.title || !details.duration || !details.scheduledFor || !details.attendees?.length) {
      console.log(chalk.yellow('          -> Missing required fields for create/update meeting action'));
      return null;
    }
  }

  if (details.mode === 'update' || details.mode === 'cancel') {
    if (!details.existingCalendarActivityId || !mongoose.Types.ObjectId.isValid(details.existingCalendarActivityId)) {
      console.log(chalk.yellow('          -> Invalid existingCalendarActivityId for update/cancel meeting action'));
      return null;
    }
  }

  // Cancellation does not require attendees validation.
  if (details.mode === 'cancel') {
    return details;
  }

  const validEmails = (details.attendees || []).filter((email: string) => {
    const isValid = validContactEmails.has(email);
    if (!isValid) {
      console.log(chalk.yellow(`          -> Warning: Invalid attendee email ${email}`));
    }
    return isValid;
  });

  if (validEmails.length === 0) {
    console.log(chalk.yellow(`          -> No valid attendees for meeting action`));
    return null;
  }

  return { ...details, attendees: validEmails };
}

