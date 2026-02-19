import mongoose from 'mongoose';
import Contact, { IContact } from '../../../models/Contact';
import Activity, { IActivity } from '../../../models/Activity';
import EmailActivity, { IEmailActivity } from '../../../models/EmailActivity';
import CalendarActivity, { ICalendarActivity } from '../../../models/CalendarActivity';
import Opportunity, { ProcessingStatus } from '../../../models/Opportunity';
import { ContactIntelligenceService } from './contactIntelligenceService';
import { ActivityProcessingQueueService } from '../../activityProcessingService/activityProcessingQueueService';
import chalk from 'chalk';
import Prospect from '../../../models/Prospect';
import { ProposedAction } from '../../../models/ProposedAction';

export interface ActivityInfo {
  activity: IActivity | IEmailActivity | ICalendarActivity;
  activityDate: Date;
  contacts: mongoose.Types.ObjectId[];
  opportunities: mongoose.Types.ObjectId[];
}

export class HistoricalActivityService {
  
  /**
   * Smart activity processor that detects historical activities and handles reprocessing.
   * This is the main method you should call for all new activities.
   * 
   * NOTE: As of recent updates, the historical check logic has been moved to IntelligenceProcessor
   * to prevent race conditions. Activities that reach this method through the queue worker
   * have already been verified to be real-time activities with no batch processing conflicts.
   */
  public static async processActivityWithHistoricalCheck(
    activity: IActivity | IEmailActivity | ICalendarActivity
  ): Promise<void> {
    console.log(chalk.blue.bold(`[+] Processing queued activity ${activity._id} for intelligence...`));
    
    // Activities reaching this method through the queue worker have already been verified
    // to be real-time activities with no batch processing conflicts by IntelligenceProcessor
    // So we can directly process them for intelligence
    await ContactIntelligenceService.processActivityForIntelligenceV2(activity);
    
    console.log(chalk.green(`[+] Successfully processed activity ${activity._id} for intelligence`));
  }

  /**
   * Process only the historical activity without reprocessing subsequent activities.
   * WARNING: This can lead to incorrect intelligence for later activities.
   */
  public static async processSingleHistoricalActivity(
    activity: IActivity | IEmailActivity | ICalendarActivity
  ): Promise<void> {
    console.log(chalk.yellow.bold(`[!] Processing single historical activity ${activity._id} without reprocessing...`));
    console.log(chalk.red(`    WARNING: This may result in incorrect intelligence for subsequent activities!`));
    
    await ContactIntelligenceService.processActivityForIntelligenceV2(activity);
  }

  /**
   * Reprocess all activities chronologically for affected contacts and opportunities.
   * This ensures all intelligence is recalculated with the correct historical context.
   * Periodically re-fetches activities to ensure no new ones are missed during long processing.
   */
  public static async reprocessActivitiesChronologically(
    opportunityId: mongoose.Types.ObjectId,
    contactIds: mongoose.Types.ObjectId[],
    abortSignal?: AbortSignal
  ): Promise<void> {
    console.log(chalk.blue.bold(`[+] Reprocessing activities chronologically for opportunity ${opportunityId}...`));
    
    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      throw new Error(`Opportunity ${opportunityId} not found`);
    }

    // Check for cancellation before starting
    if (abortSignal?.aborted) {
      const error = new Error('Operation was aborted');
      error.name = 'AbortError';
      throw error;
    }

    // Clear all intelligence for affected contacts
    console.log(chalk.cyan(`  -> Clearing existing intelligence for ${contactIds.length} contacts...`));
    for (const contactId of contactIds) {
      // Check for cancellation during clearing
      if (abortSignal?.aborted) {
        const error = new Error('Operation was aborted');
        error.name = 'AbortError';
        throw error;
      }
      
      const contact = await Contact.findById(contactId);
      if (contact) {
        await this.clearAllIntelligenceForContact(contact, opportunityId);
      }
    }

    // Get all activities for these contacts sorted chronologically
    // Since we are clearing all intelligence, we must reprocess from the beginning of time for the opportunity.
    const cutoffDate = opportunity.opportunityStartDate;
    console.log(chalk.cyan(`  -> Fetching all activities since the beginning of time...`));
    
    let activities = await this.getAllActivitiesForOpportunity(opportunityId, cutoffDate);
    console.log(chalk.green(`  -> Found ${activities.length} activities to reprocess chronologically`));

    // Set total activities for progress tracking
    await Opportunity.findByIdAndUpdate(opportunityId, {
      $set: {
        'processingStatus.totalActivities': activities.length,
        'processingStatus.processedActivities': 0
      }
    });

    // Track processed activities to avoid reprocessing
    const processedActivityIds = new Set<string>();
    const REFETCH_INTERVAL = 25; // Re-fetch activities every 25 processed activities
    let totalProcessedCount = 0;

    // Process activities in chronological order with periodic re-fetching
    let i = 0;
    while (i < activities.length) {
      // Check for cancellation at the start of each iteration
      if (abortSignal?.aborted) {
        const error = new Error('Operation was aborted');
        error.name = 'AbortError';
        throw error;
      }
      
      const { activity } = activities[i];
      
      // Skip if already processed (shouldn't happen in normal flow, but safety check)
      const activityId = (activity._id as mongoose.Types.ObjectId).toString();
      if (processedActivityIds.has(activityId)) {
        i++;
        continue;
      }

      console.log(chalk.cyan(`  -> Reprocessing activity ${totalProcessedCount + 1}: ${activityId} (${i + 1}/${activities.length} in current batch)`));
      
      // Implement retry logic with exponential backoff (Task 4.1 & 4.2)
      const MAX_RETRIES = 5;
      let attempt = 0;
      let success = false;
      let lastError: any = null;
      
      while (attempt < MAX_RETRIES && !success) {
        try {
          // Use the new bullet-proof V2 method
          const result = await ContactIntelligenceService.processActivityForIntelligenceV2(activity);
          console.log(chalk.green(`    -> Successfully processed activity ${activityId} on attempt ${attempt + 1}, processed ${result.processed} contact-opportunity pairs`));
          success = true;
        } catch (error) {
          lastError = error;
          attempt++;
          
          if (attempt < MAX_RETRIES) {
            // Calculate exponential backoff delay: 2^attempt * 1000ms (1s, 2s, 4s, 8s, 16s)
            const delayMs = Math.pow(2, attempt) * 1000;
            console.warn(chalk.yellow(`    -> [Not final failure] Attempt ${attempt} failed for activity ${activityId}, retrying in ${delayMs}ms... Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
            
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, delayMs));
          } else {
            console.error(chalk.red(`    -> All ${MAX_RETRIES} attempts failed for activity ${activityId}. Halting chronological processing.`));
            console.error(chalk.red(`    -> Final error:`), error);
          }
        }
      }
      
      if (!success) {
        // Task 4.3: Mark activity as failed but DO NOT halt processing
        console.error(chalk.red.bold(`[!] CRITICAL: Activity ${activityId} failed after ${MAX_RETRIES} attempts. Skipping this activity and continuing.`));
        console.error(chalk.red(`    -> Final error for ${activityId}:`), lastError);

        // Mark the activity as failed in the ActivityProcessingQueue if it exists
        try {
          await ActivityProcessingQueueService.markAsFailed(
            activityId,
            `Failed after ${MAX_RETRIES} retry attempts. Last error: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`
          );
        } catch (queueError) {
          console.warn(chalk.yellow(`    -> Could not mark activity ${activityId} as failed in queue (may not be queued):`, queueError));
        }
        
        // Continue to the next activity instead of throwing an error
        i++;
        continue;
      }
      
      processedActivityIds.add(activityId);
      totalProcessedCount++;

      // Update processed activities count for progress tracking
      await Opportunity.findByIdAndUpdate(opportunityId, {
        $set: { 'processingStatus.processedActivities': totalProcessedCount }
      });
      
      i++;

      // Periodically re-fetch activities to catch any new ones added during processing
      if (totalProcessedCount % REFETCH_INTERVAL === 0 && totalProcessedCount > 0) {
        console.log(chalk.magenta(`  -> Re-fetching activities to check for new additions (processed ${totalProcessedCount} so far)...`));
        
        const refreshedActivities = await this.getAllActivitiesForOpportunity(opportunityId, cutoffDate);
        
        // Find new activities that weren't in our original list
        const newActivities = refreshedActivities.filter(
          activityInfo => !processedActivityIds.has((activityInfo.activity._id as mongoose.Types.ObjectId).toString())
        );
        
        if (newActivities.length > 0) {
          console.log(chalk.yellow(`  -> Found ${newActivities.length} new activities that were added during processing!`));
          
          // Merge new activities with remaining unprocessed activities
          const remainingActivities = activities.slice(i);
          const allPendingActivities = [...remainingActivities, ...newActivities];
          
          // Re-sort all pending activities chronologically
          allPendingActivities.sort((a, b) => a.activityDate.getTime() - b.activityDate.getTime());
          
          
          // Update our activities list and reset index
          activities = [
            ...activities.slice(0, i), // Already processed activities
            ...allPendingActivities     // All pending activities in chronological order
          ];
          
          console.log(chalk.green(`  -> Updated activity list: ${activities.length} total activities (${newActivities.length} newly discovered)`));
        } else {
          console.log(chalk.gray(`  -> No new activities found during re-fetch`));
        }
      }
    }

    // Update the opportunity's last intelligence update timestamp
    const finalOpp = await Opportunity.findById(opportunityId);
    if (finalOpp) {
      const maxDate = activities.length > 0 ? activities[activities.length - 1].activityDate : new Date();
      const now = new Date();
      
      // For future activities, use receivedViaWebhookAt to prevent future dates from blocking intelligence processing
      let timestampToUse = maxDate;
      if (activities.length > 0 && maxDate > now) {
        const lastActivity = activities[activities.length - 1].activity;
        if ('receivedViaWebhookAt' in lastActivity && lastActivity.receivedViaWebhookAt) {
          timestampToUse = lastActivity.receivedViaWebhookAt;
        }
      }
      
      const safeTimestamp = timestampToUse > now ? now : timestampToUse;
      finalOpp.lastIntelligenceUpdateTimestamp = finalOpp.lastIntelligenceUpdateTimestamp ?
        new Date(Math.max(finalOpp.lastIntelligenceUpdateTimestamp.getTime(), safeTimestamp.getTime())) :
        safeTimestamp;
      await finalOpp.save();
    } else {
      console.warn(chalk.yellow(`[!] Could not find opportunity ${opportunityId} to update final timestamp.`));
    }

    console.log(chalk.green.bold(`[+] Successfully reprocessed ${totalProcessedCount} activities chronologically`));
  }

  /**
   * Get all activities for an opportunity's contacts, sorted chronologically.
   */
  private static async getAllActivitiesForOpportunity(
    opportunityId: mongoose.Types.ObjectId,
    fromDate: Date = new Date(0)
  ): Promise<ActivityInfo[]> {
    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      throw new Error(`Opportunity ${opportunityId} not found`);
    }

    const contactIds = opportunity.contacts;

    // Fetch all activity types
    // Not all activities have contacts, so we need to use the prospect instead.
    const activities = await Activity.find({
      prospect: opportunity.prospect,
      $or: [
        { date: { $gte: fromDate } },
        { date: { $exists: false } }
      ],
    });

    const emailActivities = await EmailActivity.find({
      contacts: { $in: contactIds },
      $or: [
        { date: { $gte: fromDate } },
        { date: { $exists: false } }
      ]
    });

    const calendarActivities = await CalendarActivity.find({
      contacts: { $in: contactIds },
      $or: [
        { startTime: { $gte: fromDate } },
        { startTime: { $exists: false } }
      ]
    });

    // Convert to ActivityInfo format
    const allActivities: ActivityInfo[] = [
      ...activities.map(activity => ({
        activity,
        activityDate: activity.date || new Date(),
        contacts: activity.contacts,
        opportunities: [opportunityId]
      })),
      ...emailActivities.map(activity => ({
        activity,
        activityDate: activity.date || new Date(),
        contacts: activity.contacts,
        opportunities: [opportunityId]
      })),
      ...calendarActivities.map(activity => ({
        activity,
        activityDate: activity.startTime || new Date(),
        contacts: activity.contacts,
        opportunities: [opportunityId]
      }))
    ];

    // Sort by activity date
    allActivities.sort((a, b) => a.activityDate.getTime() - b.activityDate.getTime());

    return allActivities;
  }

  /**
   * Clear all intelligence data for a contact on a specific opportunity.
   */
  private static async clearAllIntelligenceForContact(
    contact: IContact,
    opportunityId: mongoose.Types.ObjectId
  ): Promise<void> {
    const intel = contact.getOpportunityIntelligence(opportunityId);
    if (!intel) return;

    // Clear all intelligence data
    intel.engagementScore = 0;
    intel.scoreHistory = [];
    intel.behavioralIndicators = [];
    intel.communicationPatterns = [];
    intel.roleAssignments = [];
    intel.relationshipStory = '';
    intel.responsiveness = [];

    await contact.save();
    console.log(chalk.gray(`    -> Cleared intelligence for contact ${contact._id}`));
  }

  /**
   * Reprocess all intelligence for an entire opportunity (nuclear option).
   * Use this when you want to completely rebuild all intelligence from scratch.
   */
  public static async reprocessEntireOpportunity(
    opportunityId: mongoose.Types.ObjectId,
    abortSignal?: AbortSignal
  ): Promise<void> {
    console.log(chalk.red.bold(`[!!!] NUCLEAR OPTION: Reprocessing entire opportunity ${opportunityId} from scratch...`));
    
    // Check for cancellation before starting
    if (abortSignal?.aborted) {
      const error = new Error('Operation was aborted');
      error.name = 'AbortError';
      throw error;
    }
    
    const opportunity = await Opportunity.findById(opportunityId);
    const proposedAction = await ProposedAction.findById(opportunity?._id);
    if (!opportunity) {
      throw new Error(`Opportunity ${opportunityId} not found`);
    }

    // Check for cancellation before reset phase
    if (abortSignal?.aborted) {
      const error = new Error('Operation was aborted');
      error.name = 'AbortError';
      throw error;
    }

    // ======= RESET PHASE =======
    console.log(chalk.yellow.bold(`[RESET] Starting comprehensive reset phase for opportunity ${opportunityId}...`));
    
    // Start a transaction for atomic reset operations
    const session = await mongoose.startSession();
    
    try {
      await session.withTransaction(async () => {
        // 1. Delete all processedFor receipts from all activities associated with this opportunity
        console.log(chalk.cyan(`  -> Removing processedFor receipts from all activities...`));
        
        const bulkOps = [];
        
        // Remove receipts from base Activity collection
        bulkOps.push({
          updateMany: {
            filter: { prospect: opportunity.prospect },
            update: { $pull: { processedFor: { opportunityId: opportunityId } } }
          }
        });
        
        // Remove receipts from EmailActivity collection
        bulkOps.push({
          updateMany: {
            filter: { contacts: { $in: opportunity.contacts } },
            update: { $pull: { processedFor: { opportunityId: opportunityId } } }
          }
        });
        
        // Remove receipts from CalendarActivity collection
        bulkOps.push({
          updateMany: {
            filter: { contacts: { $in: opportunity.contacts } },
            update: { $pull: { processedFor: { opportunityId: opportunityId } } }
          }
        });
        
        // Execute all bulk operations
        if (bulkOps.length > 0) {
          await Activity.bulkWrite([bulkOps[0]], { session });
          await EmailActivity.bulkWrite([bulkOps[1]], { session });
          await CalendarActivity.bulkWrite([bulkOps[2]], { session });
        }
        
        console.log(chalk.green(`  -> Successfully removed processedFor receipts from all activities`));
        
        // 2. Reset all derived intelligence fields on the opportunity object
        console.log(chalk.cyan(`  -> Resetting opportunity-level intelligence...`));
        opportunity.meddpicc = {} as any;
        opportunity.opportunitySummary = undefined;
        opportunity.latestDealNarrative = '';
        opportunity.dealNarrativeHistory = [];
        opportunity.keyMilestones = [];
        opportunity.riskFactors = [];
        opportunity.stakeholders = [];
        opportunity.dealTemperatureHistory = [];
        opportunity.lastIntelligenceUpdateTimestamp = undefined;
        await opportunity.save({ session });

        // Delete opportunity proposed actions
        await ProposedAction.deleteMany({ opportunity: opportunityId });
        
        console.log(chalk.green(`  -> Successfully reset opportunity-level intelligence`));
        
        // 3. Reset all derived intelligence fields on all associated contacts for this opportunity
        console.log(chalk.cyan(`  -> Resetting contact-level intelligence for ${opportunity.contacts.length} contacts...`));
        
        const contacts = await Contact.find({ _id: { $in: opportunity.contacts } }).session(session);
        for (const contact of contacts) {
          const intel = contact.getOpportunityIntelligence(opportunityId);
          if (intel) {
            // Reset all intelligence data for this specific opportunity
            intel.engagementScore = 0;
            intel.scoreHistory = [];
            intel.behavioralIndicators = [];
            intel.communicationPatterns = [];
            intel.roleAssignments = [];
            intel.relationshipStory = '';
            intel.responsiveness = [];
            await contact.save({ session });
          }
        }
        
        console.log(chalk.green(`  -> Successfully reset contact-level intelligence for all contacts`));
      });
      
      console.log(chalk.green.bold(`[RESET] Reset phase completed successfully for opportunity ${opportunityId}`));
      
    } catch (error) {
      console.error(chalk.red.bold(`[RESET] Reset phase failed for opportunity ${opportunityId}:`), error);
      throw error;
    } finally {
      await session.endSession();
    }
    
    // Check for cancellation before rebuild phase
    if (abortSignal?.aborted) {
      const error = new Error('Operation was aborted');
      error.name = 'AbortError';
      throw error;
    }

    // ======= REBUILD PHASE =======
    console.log(chalk.blue.bold(`[REBUILD] Starting rebuild phase for opportunity ${opportunityId}...`));

    // Reprocess all contacts
    await this.reprocessActivitiesChronologically(
      opportunityId,
      opportunity.contacts,
      abortSignal
    );

    console.log(chalk.green.bold(`[+] Nuclear reprocessing complete for opportunity ${opportunityId}`));
  }

  /**
   * Check if an activity would be considered historical for any opportunity.
   * Useful for warning users before they add historical activities.
   */
  public static async checkIfActivityWouldBeHistorical(
    activityDate: Date,
    contactIds: mongoose.Types.ObjectId[]
  ): Promise<{ isHistorical: boolean; affectedOpportunities: mongoose.Types.ObjectId[] }> {
    const opportunities = await Opportunity.find({ contacts: { $in: contactIds } });
    const affectedOpportunities: mongoose.Types.ObjectId[] = [];

    for (const opportunity of opportunities) {
      const lastUpdate = opportunity.lastIntelligenceUpdateTimestamp;
      if (lastUpdate && activityDate < lastUpdate) {
        affectedOpportunities.push(opportunity._id as mongoose.Types.ObjectId);
      }
    }

    return {
      isHistorical: affectedOpportunities.length > 0,
      affectedOpportunities
    };
  }
}
