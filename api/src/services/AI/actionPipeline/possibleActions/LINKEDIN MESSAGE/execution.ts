import mongoose from 'mongoose';
import chalk from 'chalk';
import { IProposedAction } from '../../../../../models/ProposedAction';
import Opportunity from '../../../../../models/Opportunity';
import Activity, { ActivityType } from '../../../../../models/Activity';
import Contact from '../../../../../models/Contact';
import { recordSentPlaybooks } from '../../../../sentPlaybookService';

export async function execute(
  action: IProposedAction,
  executingUserId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession
): Promise<any> {
  console.log(chalk.cyan(`    -> Executing LinkedIn message action via handler...`));

  const details = action.details as {
    contactEmail: string;
    message: string;
    scheduledFor: string;
  };

  const opportunity = await Opportunity.findById(action.opportunity).session(session);
  if (!opportunity) {
    throw new Error(`Opportunity ${action.opportunity} not found`);
  }

  const contact = await Contact.findOne({
    'emails.address': details.contactEmail
  }).session(session);

  if (!contact) {
    throw new Error(`Contact with email ${details.contactEmail} not found`);
  }

  const scheduledTime = new Date(details.scheduledFor);

  const linkedInActivity = new Activity({
    type: ActivityType.LINKEDIN,
    title: `Send LinkedIn Message to ${contact.firstName} ${contact.lastName}`,
    description: `Scheduled LinkedIn message:\n\n${details.message}`,
    date: scheduledTime,
    status: 'to_do',
    prospect: opportunity.prospect,
    contacts: [contact._id],
    organization: opportunity.organization,
    createdBy: executingUserId,
    metadata: {
      sourceAction: action._id,
      sourceActionType: action.type,
      contactEmail: details.contactEmail,
      linkedInMessage: details.message
    }
  });

  await linkedInActivity.save({ session });

  console.log(chalk.green(`    -> LinkedIn message task created for ${scheduledTime.toISOString()} via handler`));
  
  // Record sent playbooks if metadata is available
  try {
    const workflowMetadata = action.details?.workflowMetadata;
    if (workflowMetadata?.sourcesUsed && workflowMetadata?.contactIds && workflowMetadata?.opportunityId) {
      const playbooksToRecord = workflowMetadata.sourcesUsed
        .filter((source: any) => source.type === 'collateral' || source.type === 'case_study')
        .map((source: any) => ({
          documentId: source.id,
          documentType: source.type,
        }));

      if (playbooksToRecord.length > 0) {
        await recordSentPlaybooks(
          workflowMetadata.contactIds,
          workflowMetadata.opportunityId,
          playbooksToRecord
        );
        console.log(chalk.green(`    -> Recorded ${playbooksToRecord.length} sent playbooks for ${workflowMetadata.contactIds.length} contacts`));
      }
    }
  } catch (error) {
    console.error(chalk.yellow(`    -> Warning: Failed to record sent playbooks:`), error);
    // Don't fail the LinkedIn message creation if recording fails
  }

  return { type: 'linkedin_task_created', activityId: linkedInActivity._id, scheduledFor: scheduledTime };
}

