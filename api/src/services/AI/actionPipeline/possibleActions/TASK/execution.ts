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
  console.log(chalk.cyan(`    -> Executing task action via handler...`));

  const details = action.details as {
    description: string;
    dueDate: string;
  };

  const opportunity = await Opportunity.findById(action.opportunity).session(session);
  if (!opportunity) {
    throw new Error(`Opportunity ${action.opportunity} not found`);
  }

  // const taskActivity = new Activity({
  //   type: ActivityType.TASK,
  //   title: `Task: ${details.description.substring(0, 50)}...`,
  //   description: details.description,
  //   date: new Date(details.dueDate),
  //   status: 'to_do',
  //   prospect: opportunity.prospect,
  //   contacts: opportunity.contacts,
  //   organization: opportunity.organization,
  //   createdBy: executingUserId,
  //   metadata: {
  //     sourceAction: action._id,
  //     sourceActionType: action.type
  //   }
  // });

  // await taskActivity.save({ session });

  // console.log(chalk.green(`    -> Task created with ID ${taskActivity._id} via handler`));
  // return { type: 'task_created', activityId: taskActivity._id };
  
  console.log(chalk.yellow(`    -> Task execution temporarily disabled`));
  return { type: 'task_disabled', message: 'Task execution is temporarily disabled' };
}

