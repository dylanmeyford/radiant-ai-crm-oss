import chalk from 'chalk';
import { ActionPipelineContext, MainAction } from '../index.js';
import { CallActionDetailsSchema } from './schema';

export async function validateDetails(
  action: MainAction,
  context: ActionPipelineContext,
  validContactEmails: Set<string>
): Promise<any | null> {
  const validationResult = CallActionDetailsSchema.safeParse(action.details);
  if (!validationResult.success) {
    console.log(chalk.yellow(`          -> Invalid call details structure: ${validationResult.error.message}`));
    return null;
  }
  
  const details = validationResult.data;

  if (!validContactEmails.has(details.contactEmail)) {
    console.log(chalk.yellow(`          -> No valid contact email for call action`));
    return null;
  }

  return details;
}

