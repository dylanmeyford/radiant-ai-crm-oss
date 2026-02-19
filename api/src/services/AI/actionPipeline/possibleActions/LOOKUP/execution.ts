import mongoose from 'mongoose';
import chalk from 'chalk';
import { IProposedAction } from '../../../../../models/ProposedAction';
import Opportunity from '../../../../../models/Opportunity';
import Activity, { ActivityType } from '../../../../../models/Activity';

export async function execute(
  action: IProposedAction,
  executingUserId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession
): Promise<any> {
  console.log(chalk.cyan(`    -> Executing lookup action via handler...`));

  const details = action.details as {
    query: string;
    answer?: string;
    sources?: string[];
    confidence?: number;
  };

  const opportunity = await Opportunity.findById(action.opportunity).session(session);
  if (!opportunity) {
    throw new Error(`Opportunity ${action.opportunity} not found`);
  }

  // Record the lookup answer as a NOTE activity for traceability
  // const noteLines: string[] = [];
  // noteLines.push(`Lookup question: ${details.query}`);
  // if (typeof details.answer === 'string' && details.answer.trim().length > 0) {
  //   noteLines.push('\nAnswer:\n' + details.answer);
  // }
  // if (Array.isArray(details.sources) && details.sources.length > 0) {
  //   noteLines.push('\nSources:\n' + details.sources.map((s) => `- ${s}`).join('\n'));
  // }
  // if (typeof details.confidence === 'number') {
  //   noteLines.push(`\nConfidence: ${(details.confidence * 100).toFixed(0)}%`);
  // }

  // const now = new Date();
  // const lookupActivity = new Activity({
  //   type: ActivityType.NOTE,
  //   title: `Lookup Result: ${details.query.substring(0, 60)}${details.query.length > 60 ? '...' : ''}`,
  //   description: noteLines.join('\n'),
  //   date: now,
  //   status: 'completed',
  //   prospect: opportunity.prospect,
  //   contacts: opportunity.contacts,
  //   organization: opportunity.organization,
  //   createdBy: executingUserId,
  //   metadata: {
  //     sourceAction: action._id,
  //     sourceActionType: action.type,
  //     lookupQuery: details.query,
  //     lookupConfidence: details.confidence,
  //     lookupSources: details.sources,
  //   }
  // });

  // await lookupActivity.save({ session });

  // console.log(chalk.green(`    -> Lookup recorded as note ${lookupActivity._id} via handler`));
  // return { type: 'lookup_recorded', activityId: lookupActivity._id };
  
  console.log(chalk.yellow(`    -> Lookup execution temporarily disabled`));
  return { type: 'lookup_disabled', message: 'Lookup execution is temporarily disabled' };
}


