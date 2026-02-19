import chalk from 'chalk';
import { ActionPipelineContext, MainAction } from '../index.js';
import { LookupActionDetailsSchema } from './schema';

export async function validateDetails(
  action: MainAction,
  _context: ActionPipelineContext,
  _validContactEmails?: Set<string>,
  _validEmailActivityIds?: Set<string>
): Promise<any | null> {
  const validationResult = LookupActionDetailsSchema.safeParse(action.details);
  if (!validationResult.success) {
    console.log(chalk.yellow(`          -> Invalid lookup details structure: ${validationResult.error.message}`));
    return null;
  }

  const details = validationResult.data;

  // Nothing context-dependent to validate for now; return as-is.
  return details;
}


