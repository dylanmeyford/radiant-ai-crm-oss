import mongoose from 'mongoose';
import chalk from 'chalk';
import { ActionPipelineService } from '../AI/actionPipeline/ActionPipelineService';
import { ProposedAction } from '../../models/ProposedAction';
import { opportunityBatchProcessingService } from './opportunityBatchProcessingService';
import Activity from '../../models/Activity';
import EmailActivity from '../../models/EmailActivity';
import CalendarActivity from '../../models/CalendarActivity';
import Opportunity from '../../models/Opportunity';
import User from '../../models/User';
import NylasConnection from '../../models/NylasConnection';

/**
 * Service to handle triggering the Action Pipeline after activities or opportunities finish processing.
 * Contains logic to determine whether to generate new actions or re-evaluate existing ones.
 */
export class ActionPipelineTriggerService {

  /**
   * Triggers action pipeline after an individual activity finishes processing.
   * Only triggers if there's no batch processing running/queued/scheduled for the opportunity.
   * Skips action pipeline for outgoing EmailActivity and CalendarActivity (from organization domains).
   * 
   * @param activityId - The ID of the activity that was processed
   * @param activityType - The type of activity that was processed
   * @param opportunityId - The ID of the opportunity this activity belongs to
   */
  public static async triggerAfterActivityProcessing(
    activityId: mongoose.Types.ObjectId,
    activityType: 'Activity' | 'EmailActivity' | 'CalendarActivity',
    opportunityId: mongoose.Types.ObjectId
  ): Promise<void> {
    try {
      console.log(chalk.blue.bold(`[ACTION-PIPELINE-TRIGGER] Checking if action pipeline should trigger after activity ${activityId} processing...`));

      // // Check if this is an outgoing EmailActivity or CalendarActivity from organization domain
      // if (activityType === 'EmailActivity' || activityType === 'CalendarActivity') {
      //   const isOutgoing = await this.isActivityOutgoing(activityId, activityType);
      //   if (isOutgoing) {
      //     console.log(chalk.yellow(`[ACTION-PIPELINE-TRIGGER] Skipping action pipeline for activity ${activityId} - outgoing ${activityType} from organization domain`));
      //     return;
      //   }
      // }

      // Check if opportunity has batch processing running/queued/scheduled
      const batchProcessingStatus = await this.checkOpportunityBatchProcessingStatus(opportunityId.toString());
      
      if (batchProcessingStatus.hasActiveProcessing) {
        console.log(chalk.yellow(`[ACTION-PIPELINE-TRIGGER] Skipping action pipeline for activity ${activityId} - opportunity ${opportunityId} has active batch processing`));
        console.log(chalk.gray(`  -> Batch processing status: scheduled=${batchProcessingStatus.isScheduled}, running=${batchProcessingStatus.isRunning}`));
        return;
      }

      // No batch processing, safe to trigger action pipeline
      console.log(chalk.green(`[ACTION-PIPELINE-TRIGGER] Triggering action pipeline for activity ${activityId} (opportunity ${opportunityId})`));
      
      // Determine whether to generate new actions or re-evaluate existing ones
      const hasExistingActions = await this.hasExistingProposedActions(opportunityId);
      
      if (hasExistingActions) {
        console.log(chalk.cyan(`[ACTION-PIPELINE-TRIGGER] Re-evaluating existing actions for opportunity ${opportunityId}`));
        await ActionPipelineService.reEvaluateActions(
          opportunityId, 
          `Activity ${activityId} (${activityType}) was processed`
        );
      } else {
        console.log(chalk.cyan(`[ACTION-PIPELINE-TRIGGER] Generating new proposed actions for opportunity ${opportunityId}`));
        await ActionPipelineService.generateProposedActions(opportunityId);
      }

      console.log(chalk.green.bold(`[ACTION-PIPELINE-TRIGGER] Successfully triggered action pipeline for activity ${activityId}`));

    } catch (error) {
      console.error(chalk.red(`[ACTION-PIPELINE-TRIGGER] Error triggering action pipeline for activity ${activityId}:`), error);
      // Don't throw - we don't want action pipeline errors to break activity processing
    }
  }

  /**
   * Triggers action pipeline after an entire opportunity finishes batch processing.
   * Always triggers regardless of existing actions since the entire opportunity was reprocessed.
   * 
   * @param opportunityId - The ID of the opportunity that was processed
   */
  public static async triggerAfterOpportunityProcessing(
    opportunityId: mongoose.Types.ObjectId
  ): Promise<void> {
    try {
      console.log(chalk.blue.bold(`[ACTION-PIPELINE-TRIGGER] Triggering action pipeline after opportunity ${opportunityId} batch processing...`));

      // Determine whether to generate new actions or re-evaluate existing ones
      const hasExistingActions = await this.hasExistingProposedActions(opportunityId);
      
      if (hasExistingActions) {
        console.log(chalk.cyan(`[ACTION-PIPELINE-TRIGGER] Re-evaluating existing actions for opportunity ${opportunityId} after batch processing`));
        await ActionPipelineService.reEvaluateActions(
          opportunityId, 
          'Entire opportunity was reprocessed via batch processing'
        );
      } else {
        console.log(chalk.cyan(`[ACTION-PIPELINE-TRIGGER] Generating new proposed actions for opportunity ${opportunityId} after batch processing`));
        await ActionPipelineService.generateProposedActions(opportunityId);
      }

      console.log(chalk.green.bold(`[ACTION-PIPELINE-TRIGGER] Successfully triggered action pipeline for opportunity ${opportunityId}`));

    } catch (error) {
      console.error(chalk.red(`[ACTION-PIPELINE-TRIGGER] Error triggering action pipeline for opportunity ${opportunityId}:`), error);
      // Don't throw - we don't want action pipeline errors to break opportunity processing
    }
  }

  /**
   * Checks if an EmailActivity or CalendarActivity is outgoing from the organization.
   * An activity is considered outgoing if it comes from a domain that belongs to the organization.
   * 
   * @param activityId - The ID of the activity to check
   * @param activityType - The type of activity ('EmailActivity' or 'CalendarActivity')
   * @returns True if the activity is outgoing from organization domain, false otherwise
   */
  private static async isActivityOutgoing(
    activityId: mongoose.Types.ObjectId,
    activityType: 'EmailActivity' | 'CalendarActivity'
  ): Promise<boolean> {
    try {
      let activity = null;
      let organizationId = null;
      let senderEmail = null;

      if (activityType === 'EmailActivity') {
        activity = await EmailActivity.findById(activityId)
          .select('from organization')
          .lean();
        
        if (activity && activity.from && activity.from.length > 0) {
          senderEmail = activity.from[0].email;
          organizationId = activity.organization;
        }
      } else if (activityType === 'CalendarActivity') {
        activity = await CalendarActivity.findById(activityId)
          .select('organizer creator organization')
          .lean();
        
        if (activity) {
          // For calendar activities, check the organizer first, then creator
          senderEmail = activity.organizer?.email || activity.creator?.email;
          organizationId = activity.organization;
        }
      }

      if (!activity || !senderEmail || !organizationId) {
        console.warn(chalk.yellow(`[ACTION-PIPELINE-TRIGGER] Could not determine sender for activity ${activityId}`));
        return false; // Safe default - allow action pipeline to run
      }

      // Get organization domains
      const organizationDomains = await this.getOrganizationDomains(organizationId);
      
      // Extract domain from sender email
      const senderDomain = senderEmail.split('@')[1];
      
      if (!senderDomain) {
        console.warn(chalk.yellow(`[ACTION-PIPELINE-TRIGGER] Invalid sender email format: ${senderEmail}`));
        return false; // Safe default - allow action pipeline to run
      }

      // Check if sender domain is in organization domains
      const isOutgoing = organizationDomains.has(senderDomain);
      
      console.log(chalk.gray(`[ACTION-PIPELINE-TRIGGER] Activity ${activityId} sender: ${senderEmail}, domain: ${senderDomain}, isOutgoing: ${isOutgoing}`));
      
      return isOutgoing;

    } catch (error) {
      console.error(chalk.red(`[ACTION-PIPELINE-TRIGGER] Error checking if activity ${activityId} is outgoing:`), error);
      return false; // Safe default - allow action pipeline to run
    }
  }

  /**
   * Gets all domains used by users in the organization.
   * 
   * @param organizationId - The ID of the organization
   * @returns Set of domain names used by organization users
   */
  private static async getOrganizationDomains(
    organizationId: mongoose.Types.ObjectId
  ): Promise<Set<string>> {
    try {
      // Get all organization Nylas connections' email addresses
      const orgNylasConnections = await NylasConnection.find({ organization: organizationId }, 'email').lean();
      const organizationDomains = new Set<string>();
      
      orgNylasConnections.forEach(connection => {
        if (connection.email) {
          const domain = connection.email.split('@')[1];
          if (domain) {
            organizationDomains.add(domain);
          }
        }
      });

      console.log(chalk.gray(`[ACTION-PIPELINE-TRIGGER] Organization ${organizationId} domains: ${Array.from(organizationDomains).join(', ')}`));
      
      return organizationDomains;

    } catch (error) {
      console.error(chalk.red(`[ACTION-PIPELINE-TRIGGER] Error getting organization domains for ${organizationId}:`), error);
      return new Set(); // Safe default - empty set means no outgoing activities detected
    }
  }

  /**
   * Checks if an opportunity has active batch processing (running, queued, or scheduled).
   * 
   * @param opportunityId - The ID of the opportunity to check
   * @returns Object with batch processing status information
   */
  private static async checkOpportunityBatchProcessingStatus(
    opportunityId: string
  ): Promise<{
    hasActiveProcessing: boolean;
    isScheduled: boolean;
    isRunning: boolean;
  }> {
    try {
      const [isScheduled, isRunning] = await Promise.all([
        opportunityBatchProcessingService.isProcessingScheduled(opportunityId),
        opportunityBatchProcessingService.isProcessingRunning(opportunityId)
      ]);

      return {
        hasActiveProcessing: isScheduled || isRunning,
        isScheduled,
        isRunning
      };
    } catch (error) {
      console.error(chalk.red(`[ACTION-PIPELINE-TRIGGER] Error checking batch processing status for ${opportunityId}:`), error);
      // Return safe default (assume no active processing) to allow action pipeline to run
      return {
        hasActiveProcessing: false,
        isScheduled: false,
        isRunning: false
      };
    }
  }

  /**
   * Checks if an opportunity has existing proposed actions.
   * 
   * @param opportunityId - The ID of the opportunity to check
   * @returns True if there are existing proposed actions, false otherwise
   */
  private static async hasExistingProposedActions(
    opportunityId: mongoose.Types.ObjectId
  ): Promise<boolean> {
    try {
      const existingActionsCount = await ProposedAction.countDocuments({
        opportunity: opportunityId,
        status: { $in: ['PROPOSED', 'APPROVED'] }
      });

      if (existingActionsCount > 0) {
        return true;
      }

      const opportunity = await Opportunity.findById(opportunityId).select('contacts prospect').lean();
      if (!opportunity) {
        return false;
      }

      const orConditions: Record<string, any>[] = [];
      if (Array.isArray(opportunity.contacts) && opportunity.contacts.length > 0) {
        orConditions.push({ contacts: { $in: opportunity.contacts } });
      }
      if (opportunity.prospect) {
        orConditions.push({ prospect: opportunity.prospect });
      }

      if (orConditions.length === 0) {
        return false;
      }

      const hasScheduledEmail = await EmailActivity.exists({
        status: 'scheduled',
        isDraft: false,
        isSent: false,
        'metadata.sourceAction': { $exists: true },
        $or: orConditions
      });

      return Boolean(hasScheduledEmail);
    } catch (error) {
      console.error(chalk.red(`[ACTION-PIPELINE-TRIGGER] Error checking existing actions for ${opportunityId}:`), error);
      // Return false as safe default (will trigger generateProposedActions)
      return false;
    }
  }

  /**
   * Helper method to get the opportunity ID for a given activity.
   * 
   * @param activityId - The ID of the activity
   * @param activityType - The type of activity
   * @returns The opportunity ID if found, null otherwise
   */
  public static async getOpportunityIdForActivity(
    activityId: mongoose.Types.ObjectId,
    activityType: 'Activity' | 'EmailActivity' | 'CalendarActivity'
  ): Promise<mongoose.Types.ObjectId | null> {
    try {
      let activity = null;

      switch (activityType) {
        case 'Activity':
          activity = await Activity.findById(activityId).select('prospect').lean();
          break;
        case 'EmailActivity':
          activity = await EmailActivity.findById(activityId).select('prospect').lean();
          break;
        case 'CalendarActivity':
          activity = await CalendarActivity.findById(activityId).select('prospect').lean();
          break;
      }

      if (!activity || !activity.prospect) {
        console.warn(chalk.yellow(`[ACTION-PIPELINE-TRIGGER] Could not find activity ${activityId} or it has no prospect`));
        return null;
      }

      // Find the opportunity for this prospect
      // Import here to avoid circular dependency
      const Opportunity = require('../../models/Opportunity').default;
      const opportunity = await Opportunity.findOne({ 
        prospect: activity.prospect 
      }).select('_id').lean();

      if (!opportunity) {
        console.warn(chalk.yellow(`[ACTION-PIPELINE-TRIGGER] Could not find opportunity for prospect ${activity.prospect}`));
        return null;
      }

      return opportunity._id;

    } catch (error) {
      console.error(chalk.red(`[ACTION-PIPELINE-TRIGGER] Error getting opportunity for activity ${activityId}:`), error);
      return null;
    }
  }
} 