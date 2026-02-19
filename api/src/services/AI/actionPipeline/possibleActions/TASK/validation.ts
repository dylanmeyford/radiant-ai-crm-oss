import chalk from 'chalk';
import { ActionPipelineContext, MainAction } from '../index.js';
import { TaskActionDetailsSchema } from './schema';

export async function validateDetails(
  action: MainAction,
  context: ActionPipelineContext
): Promise<any | null> {
  const validationResult = TaskActionDetailsSchema.safeParse(action.details);
  if (!validationResult.success) {
    console.log(chalk.yellow(`          -> Invalid task details structure: ${validationResult.error.message}`));
    return null;
  }
  
  const details = validationResult.data;

  // Validate task due date is in the future
  const dueDate = new Date(details.dueDate);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  if (dueDate < tomorrow) {
    console.log(chalk.yellow(`          -> Warning: Task due date is in the past, setting to tomorrow`));
    details.dueDate = tomorrow.toISOString().split('T')[0];
  }

  return details;
}

