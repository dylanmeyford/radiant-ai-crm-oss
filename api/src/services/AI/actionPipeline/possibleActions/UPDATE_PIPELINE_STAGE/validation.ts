import chalk from 'chalk';
import mongoose from 'mongoose';
import { ActionPipelineContext, MainAction } from '../index';
import { UpdatePipelineStageDetailsSchema } from './schema';
import PipelineStage from '../../../../../models/PipelineStage';

export async function validateDetails(
  action: MainAction,
  context: ActionPipelineContext,
  validContactEmails: Set<string>,
  validEmailActivityIds: Set<string>
): Promise<any | null> {
  const validationResult = UpdatePipelineStageDetailsSchema.safeParse(action.details);
  if (!validationResult.success) {
    console.log(chalk.yellow(`          -> Invalid action details: ${validationResult.error.message}`));
    return null;
  }
  
  const details = validationResult.data;
  
  // Validate that targetStageId is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(details.targetStageId)) {
    console.log(chalk.yellow(`          -> Invalid targetStageId: not a valid ObjectId`));
    return null;
  }

  // Get current stage ID
  const currentStageId = (context.opportunity.stage as any)?._id?.toString() || context.opportunity.stage.toString();
  
  // Validate that target stage is different from current stage
  if (details.targetStageId === currentStageId) {
    console.log(chalk.yellow(`          -> Target stage is the same as current stage`));
    return null;
  }

  // Validate that the target stage exists and belongs to the opportunity's pipeline
  const targetStage = await PipelineStage.findOne({
    _id: details.targetStageId,
    pipeline: context.opportunity.pipeline
  });

  if (!targetStage) {
    console.log(chalk.yellow(`          -> Target stage not found or doesn't belong to the opportunity's pipeline`));
    return null;
  }

  // Return validated details with stage name verification
  return {
    targetStageId: details.targetStageId,
    targetStageName: targetStage.name // Use the actual stage name from DB
  };
}

