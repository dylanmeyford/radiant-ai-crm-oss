import { ActionPipelineContext, MainAction } from '../index.js';

export async function composeContent(
  action: MainAction,
  context: ActionPipelineContext,
  parentAction?: MainAction
): Promise<any | null> {
  // No content composition needed for pipeline stage updates
  // The reasoning field in the main action already explains why the stage change is proposed
  return null;
}

