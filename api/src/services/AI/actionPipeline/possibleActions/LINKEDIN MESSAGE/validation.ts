import chalk from 'chalk';
import { ActionPipelineContext, MainAction } from '../index.js';
import { LinkedInMessageActionDetailsSchema } from './schema';

export async function validateDetails(
  action: MainAction,
  context: ActionPipelineContext,
  validContactEmails: Set<string>
): Promise<any | null> {
  const validationResult = LinkedInMessageActionDetailsSchema.safeParse(action.details);
  if (!validationResult.success) {
    console.log(chalk.yellow(`          -> Invalid LinkedIn message details structure: ${validationResult.error.message}`));
    return null;
  }
  
  const details = validationResult.data;

  if (!validContactEmails.has(details.contactEmail)) {
    console.log(chalk.yellow(`          -> No valid contact email for LinkedIn message action`));
    return null;
  }

  return details;
}

