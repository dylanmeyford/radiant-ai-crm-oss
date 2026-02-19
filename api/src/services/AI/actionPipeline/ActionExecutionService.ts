import mongoose from 'mongoose';
import chalk from 'chalk';
import { ProposedAction, IProposedAction } from '../../../models/ProposedAction';
import Activity, { ActivityType, IActivity } from '../../../models/Activity';
import EmailActivity, { IEmailActivity } from '../../../models/EmailActivity';
import CalendarActivity, { ICalendarActivity } from '../../../models/CalendarActivity';
import { actionRegistry } from './possibleActions/index';
import User from '../../../models/User';
import { cleanupProposedActionAttachments } from '../../emailAttachmentService';

export interface ActionExecutionResult {
  success: boolean;
  executedAt?: Date;
  executionDetails?: any;
  error?: string;
}

export class ActionExecutionService {
  /**
   * Executes an approved ProposedAction by delegating to the appropriate registered handler.
   * It also updates the action status and source activities within a transaction.
   * 
   * @param actionId ID of the ProposedAction to execute
   * @param executingUserId ID of the user executing the action
   * @returns Promise resolving to execution result
   */
  public static async execute(
    actionId: mongoose.Types.ObjectId,
    executingUserId: mongoose.Types.ObjectId
  ): Promise<ActionExecutionResult> {
    console.log(chalk.blue.bold(`[ACTION EXECUTION] Executing action ${actionId}...`));

    const session = await mongoose.startSession();
    
    try {
      return await session.withTransaction(async () => {
        // 1. Fetch and validate the action
        const action = await ProposedAction.findById(actionId).session(session);
        if (!action) {
          throw new Error(`ProposedAction with ID ${actionId} not found`);
        }

        if (action.status !== 'APPROVED') {
          throw new Error(`Action ${actionId} is not approved for execution (status: ${action.status})`);
        }

        console.log(chalk.cyan(`  -> Executing ${action.type} action via handler: ${action.reasoning}`));

        // 2. Get the handler and execute the action
        const handler = actionRegistry.getHandler(action.type);
        if (!handler) {
          throw new Error(`Unsupported action type: No handler registered for ${action.type}`);
        }
        
        const executionResult = await handler.execute(action, executingUserId, session);

        // 2.5. Store resulting activity if one was created
        if (executionResult && executionResult.activityId && executionResult.activityModel) {
          console.log(chalk.cyan(`    -> Linking action to resulting activity: ${executionResult.activityModel} ${executionResult.activityId}`));
          
          // Initialize resultingActivities array if it doesn't exist
          if (!action.resultingActivities) {
            action.resultingActivities = [];
          }
          
          // Add the resulting activity to the action
          action.resultingActivities.push({
            activityId: executionResult.activityId,
            activityModel: executionResult.activityModel
          });
        }

        // 3. Update the ProposedAction status
        const executedAt = new Date();
        action.status = 'EXECUTED';
        action.executedAt = executedAt;
        await action.save({ session });

        console.log(chalk.green.bold(`[ACTION EXECUTION] Successfully executed action ${actionId}`));

        return {
          success: true,
          executedAt,
          executionDetails: executionResult
        };
      });

    } catch (error) {
      console.error(chalk.red(`[ACTION EXECUTION] Error executing action ${actionId}:`), error);
      
      // Update action status to failed and clean up attachments (outside transaction)
      try {
        const failedAction = await ProposedAction.findById(actionId);
        if (failedAction) {
          // Clean up any attachments before marking as failed
          try {
            await cleanupProposedActionAttachments(failedAction, failedAction.organization.toString());
          } catch (cleanupError) {
            console.error('Error cleaning up attachments during action execution failure:', cleanupError);
            // Continue with status update even if cleanup fails
          }
          
          await ProposedAction.findByIdAndUpdate(actionId, {
            status: 'REJECTED', // Mark as rejected if execution fails
            executedAt: new Date()
          });
        }
      } catch (updateError) {
        console.error(chalk.red(`[ACTION EXECUTION] Failed to update action status:`, updateError));
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };

    } finally {
      await session.endSession();
    }
  }


  /**
   * Schedules a ProposedAction for future execution.
   * This method can be used to set up scheduled actions that will be executed later.
   * 
   * @param actionId ID of the ProposedAction to schedule
   * @param scheduledFor When to execute the action
   * @returns Promise resolving to scheduling result
   */
  public static async scheduleExecution(
    actionId: mongoose.Types.ObjectId,
    scheduledFor: Date
  ): Promise<{ success: boolean; scheduledFor: Date; error?: string }> {
    console.log(chalk.blue.bold(`[ACTION EXECUTION] Scheduling action ${actionId} for ${scheduledFor.toISOString()}...`));

    try {
      const action = await ProposedAction.findByIdAndUpdate(
        actionId,
        { scheduledFor },
        { new: true }
      );

      if (!action) {
        throw new Error(`ProposedAction with ID ${actionId} not found`);
      }

      console.log(chalk.green(`[ACTION EXECUTION] Action ${actionId} scheduled for ${scheduledFor.toISOString()}`));
      
      // Note: In a production system, you would integrate with a job scheduler here
      // (e.g., node-cron, Bull Queue, or similar) to actually execute the action at the scheduled time

      return { success: true, scheduledFor };

    } catch (error) {
      console.error(chalk.red(`[ACTION EXECUTION] Error scheduling action ${actionId}:`), error);
      return {
        success: false,
        scheduledFor,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}
