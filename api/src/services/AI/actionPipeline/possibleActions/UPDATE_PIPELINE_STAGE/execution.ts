import mongoose from 'mongoose';
import chalk from 'chalk';
import { IProposedAction } from '../../../../../models/ProposedAction';
import Opportunity from '../../../../../models/Opportunity';
import PipelineStage from '../../../../../models/PipelineStage';

export async function execute(
  action: IProposedAction,
  executingUserId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession
): Promise<any> {
  console.log(chalk.cyan(`    -> Executing pipeline stage update via handler...`));

  const details = action.details as {
    targetStageId: string;
    targetStageName: string;
  };

  // Fetch the opportunity within the transaction
  const opportunity = await Opportunity.findById(action.opportunity).session(session);
  if (!opportunity) {
    throw new Error(`Opportunity ${action.opportunity} not found`);
  }

  // Validate the target stage still exists and belongs to the opportunity's pipeline
  const targetStage = await PipelineStage.findOne({
    _id: details.targetStageId,
    pipeline: opportunity.pipeline
  }).session(session);

  if (!targetStage) {
    throw new Error(`Target stage ${details.targetStageId} not found or doesn't belong to the opportunity's pipeline`);
  }

  // Get current stage for logging
  const oldStageId = opportunity.stage.toString();
  const oldStage = await PipelineStage.findById(oldStageId).session(session);
  const oldStageName = oldStage?.name || 'Unknown';

  // Update the opportunity's stage
  await Opportunity.findOneAndUpdate(
    { _id: action.opportunity, organization: opportunity.organization },
    { $set: { stage: new mongoose.Types.ObjectId(details.targetStageId) } },
    { session, runValidators: true }
  );

  console.log(chalk.green(`    -> Pipeline stage updated from "${oldStageName}" to "${details.targetStageName}"`));
  
  return {
    type: 'pipeline_stage_updated',
    success: true,
    oldStageId: oldStageId,
    oldStageName: oldStageName,
    newStageId: details.targetStageId,
    newStageName: details.targetStageName
  };
}

