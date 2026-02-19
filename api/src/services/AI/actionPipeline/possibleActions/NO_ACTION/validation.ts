import chalk from 'chalk';
import { ActionPipelineContext, MainAction } from '../index.js';
import { NoActionDetailsSchema } from './schema';

export async function validateDetails(
  action: MainAction,
  context: ActionPipelineContext
): Promise<any | null> {
  const validationResult = NoActionDetailsSchema.safeParse(action.details);
  if (!validationResult.success) {
    console.log(chalk.yellow(`          -> Invalid no_action details structure: ${validationResult.error.message}`));
    return null;
  }
  
  const details = validationResult.data;

  const reviewDate = new Date(details.nextReviewDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (reviewDate <= today) {
    console.log(chalk.yellow(`          -> Warning: Review date is today or in the past, setting to tomorrow`));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    details.nextReviewDate = tomorrow.toISOString().split('T')[0];
  }

  return details;
}

