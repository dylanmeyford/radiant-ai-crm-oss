import mongoose from 'mongoose';
import chalk from 'chalk';
import { IProposedAction } from '../../../../../models/ProposedAction';
import Opportunity from '../../../../../models/Opportunity';
import Activity, { ActivityType } from '../../../../../models/Activity';
import Contact from '../../../../../models/Contact';

export async function execute(
  action: IProposedAction,
  executingUserId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession
): Promise<any> {
  console.log(chalk.cyan(`    -> Executing call action via handler...`));

  const details = action.details as {
    contactEmail: string;
    purpose: string;
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

  const callActivity = new Activity({
    type: ActivityType.CALL,
    title: `Scheduled Call: ${details.purpose.substring(0,50)}...`,
    description: details.purpose,
    date: scheduledTime,
    status: 'scheduled',
    prospect: opportunity.prospect,
    contacts: [contact._id],
    organization: opportunity.organization,
    createdBy: executingUserId,
    metadata: {
      sourceAction: action._id,
      sourceActionType: action.type,
      contactEmail: details.contactEmail
    }
  });

  await callActivity.save({ session });

  console.log(chalk.green(`    -> Call scheduled for ${scheduledTime.toISOString()} via handler`));
  return { type: 'call_scheduled', activityId: callActivity._id, scheduledFor: scheduledTime };
}

