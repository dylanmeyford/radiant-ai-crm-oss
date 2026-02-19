import { IActivity } from '../../../models/Activity';
import { IEmailActivity } from '../../../models/EmailActivity';
import { ICalendarActivity } from '../../../models/CalendarActivity';
import { IContact } from '../../../models/Contact';
import { ContactIntelligenceService } from './contactIntelligenceService';
import { ActivityProcessingQueueService } from '../../activityProcessingService/activityProcessingQueueService';
import Contact from '../../../models/Contact';
import Prospect from '../../../models/Prospect';
import Opportunity from '../../../models/Opportunity';
import chalk from 'chalk';

/**
 * Main entry point for all intelligence processing.
 * This service automatically handles queuing and chronological ordering per prospect.
 */
export class IntelligenceProcessor {
  
  /**
   * MAIN METHOD: Use this for all new activity processing.
   * Performs historical activity checks before enqueueing to prevent race conditions.
   */
  public static async processActivity(
    activity: IActivity | IEmailActivity | ICalendarActivity
  ): Promise<void> {
    console.log(chalk.blue.bold(`[+] IntelligenceProcessor: Processing activity ${activity._id}...`));
    
    // CalendarActivities can exist without a prospect (recorded before prospect is created in system)
    // The queue requires a prospect, so process these directly without enqueueing
    const isCalendarActivity = 'startTime' in activity;
    if (isCalendarActivity && !activity.prospect) {
      console.log(chalk.gray(`[+] IntelligenceProcessor: CalendarActivity ${activity._id} has no prospect, processing directly without queue`));
      await this.processActivityDirect(activity);
      return;
    }
    
    try {
      // CRITICAL: Check for historical activity and batch processing conflicts BEFORE enqueueing
      // This prevents race conditions where activities are processed individually before batch restart
      const shouldEnqueue = await this.performHistoricalActivityCheck(activity);
      
      if (!shouldEnqueue) {
        console.log(chalk.yellow(`[+] IntelligenceProcessor: Activity ${activity._id} handled by batch processing or direct processing`));
        return;
      }
      
      // Only enqueue if it's a real-time activity with no batch processing conflicts
      await ActivityProcessingQueueService.enqueueActivity(activity);
      console.log(chalk.green(`[+] IntelligenceProcessor: Successfully enqueued activity ${activity._id}`));
    } catch (error) {
      console.error(chalk.red(`[!] IntelligenceProcessor: Failed to process activity ${activity._id}:`), error);
      // Fallback to direct processing if everything fails
      console.log(chalk.yellow(`[!] IntelligenceProcessor: Falling back to direct processing for activity ${activity._id}`));
      await this.processActivityDirect(activity);
    }
  }

  /**
   * Performs historical activity check and batch processing conflict resolution.
   * Returns true if the activity should be enqueued, false if it was handled directly.
   */
  private static async performHistoricalActivityCheck(
    activity: IActivity | IEmailActivity | ICalendarActivity
  ): Promise<boolean> {
    console.log(chalk.blue(`[+] IntelligenceProcessor: Performing historical activity check for ${activity._id}...`));
    
    // Get activity date
    const activityDate = (activity as ICalendarActivity).startTime || activity.date;
    if (!activityDate) {
      console.warn(chalk.yellow(`[!] Activity ${activity._id} has no date, processing as current activity`));
      return true; // Enqueue normally
    }

    // Get affected contacts and opportunities
    let contacts: IContact[] = [];
    contacts = await Contact.find({ _id: { $in: activity.contacts } });
    if (contacts.length === 0) {
      const prospect = await Prospect.findById(activity.prospect).populate('contacts');
      if (prospect) {
        contacts = prospect.contacts as unknown as IContact[];
      }
    }
    const allOpportunities = await Opportunity.find({ contacts: { $in: contacts } }).populate('stage');
    const opportunities = this.selectRelevantOpportunities(allOpportunities);

    // Check if this activity is historical for any opportunity
    // Apply grace period to account for email delivery delays and processing time
    const HISTORICAL_GRACE_PERIOD_MS = parseInt(process.env.HISTORICAL_GRACE_PERIOD_MS || '300000'); // 5 minutes default
    let isHistorical = false;
    const opportunitiesToReprocess = new Set<string>();

    for (const opportunity of opportunities) {
      const lastUpdate = opportunity.lastIntelligenceUpdateTimestamp;
      
      if (lastUpdate === undefined) {
        // No previous processing - treat as historical to ensure proper chronological processing
        console.log(chalk.yellow(`[!] Historical activity detected! No previous intelligence processing for opportunity ${opportunity._id}`));
        isHistorical = true;
        opportunitiesToReprocess.add(opportunity._id.toString());
      } else {
        // Apply grace period: only consider historical if activity is more than grace period before last update
        // Guard against future-dated lastUpdate (e.g., scheduler writes or clock skew)
        const now = new Date();
        const effectiveLastUpdate = lastUpdate > now ? now : lastUpdate;
        const graceAdjustedThreshold = new Date(effectiveLastUpdate.getTime() - HISTORICAL_GRACE_PERIOD_MS);
        
        if (activityDate < graceAdjustedThreshold) {
          console.log(chalk.yellow(`[!] Historical activity detected! Activity date ${activityDate.toISOString()} is before grace-adjusted threshold ${graceAdjustedThreshold.toISOString()} (last update: ${lastUpdate.toISOString()}, grace period: ${HISTORICAL_GRACE_PERIOD_MS}ms) for opportunity ${opportunity._id} -activity id ${activity._id}`));
          isHistorical = true;
          opportunitiesToReprocess.add(opportunity._id.toString());
        } else if (activityDate < lastUpdate) {
          console.log(chalk.cyan(`[+] Activity date ${activityDate.toISOString()} is within grace period of last update ${lastUpdate.toISOString()} for opportunity ${opportunity._id} - treating as real-time`));
        }
      }
    }

    // Check if any opportunity has reprocessing running or scheduled in the queue
    const opportunitiesWithBatchProcessing = new Set<string>();
    for (const opportunity of opportunities) {
      const opportunityId = opportunity._id.toString();
      const queueStatus = await ActivityProcessingQueueService.isOpportunityProcessing(opportunityId);
      
      if (queueStatus.isRunning || queueStatus.isScheduled) {
        opportunitiesWithBatchProcessing.add(opportunityId);
        console.log(chalk.yellow.bold(`[!] Opportunity reprocessing is ${queueStatus.isRunning ? 'active' : 'scheduled'} for opportunity ${opportunityId}`));
        console.log(chalk.cyan(`    Running: ${queueStatus.isRunning}, Scheduled: ${queueStatus.isScheduled}`));
        if (queueStatus.scheduledFor) {
          console.log(chalk.cyan(`    Scheduled for: ${queueStatus.scheduledFor.toISOString()}`));
        }
      }
    }

    // Handle different scenarios based on guide requirements
    if (opportunitiesWithBatchProcessing.size > 0) {
      if (isHistorical) {
        // Scenario: Historical activity during batch processing
        // Guide requirement: "If the activity is historical and there is a batch running, re-start that batch processing"
        console.log(chalk.yellow.bold(`[!] Historical activity during batch processing - restarting batch for affected opportunities`));
        
        const { opportunityBatchProcessingService } = require('../../activityProcessingService/opportunityBatchProcessingService');
        for (const opportunityId of opportunitiesWithBatchProcessing) {
          await opportunityBatchProcessingService.restartBatchProcessing(
            opportunityId,
            `Historical activity ${activity._id} detected during batch processing`
          );
        }
        
        console.log(chalk.green(`[+] Successfully restarted batch processing for ${opportunitiesWithBatchProcessing.size} opportunities`));
        return false; // Don't enqueue - handled by batch processing
      } else {
        // Scenario: Real-time activity during batch processing
        // Guide requirement: "If the activity is real time, and there is a batch already running, it should add the activity to the end of the list of activities the batch is processing"
        console.log(chalk.cyan(`[+] Real-time activity during batch processing - adding to batch queue`));
        
        await ActivityProcessingQueueService.addActivityToBatchQueue(
          activity,
          `Real-time activity during batch processing for ${opportunitiesWithBatchProcessing.size} opportunities`
        );
        
        console.log(chalk.green(`[+] Successfully added real-time activity to batch queue`));
        return false; // Don't enqueue - handled by batch processing
      }
    }

    // No batch processing is running
    if (!isHistorical) {
      // Scenario: Real-time activity with no batch running
      // Guide requirement: "If the activity is real time and there is no batch running, it should process the activity for intelligence"
      console.log(chalk.green(`[+] Real-time activity with no batch running - will enqueue for normal processing`));
      return true; // Enqueue normally
    }

    // Scenario: Historical activity with no batch running
    // Guide requirement: "If the activity is historical and there is no batch running, schedule the opportunity for reprocessing"
    console.log(chalk.yellow.bold(`[!] Historical activity with no batch running - scheduling opportunity reprocessing`));
    
    for (const opportunityIdStr of opportunitiesToReprocess) {
      // First, mark all other pending activities for this prospect as completed
      // since batch processing will handle them all chronologically
      const prospectId = activity.prospect;
      await ActivityProcessingQueueService.markProspectActivitiesAsProcessedByBatch(
        prospectId,
        `Batch reprocessing triggered by historical activity ${activity._id}`
      );
      
      // Schedule the opportunity reprocessing through the unified queue system
      await ActivityProcessingQueueService.scheduleOpportunityReprocessing(
        opportunityIdStr,
        `Historical activity ${activity._id} detected`
      );
    }
    
    console.log(chalk.green(`[+] Successfully scheduled opportunity reprocessing for ${opportunitiesToReprocess.size} opportunities`));
    return false; // Don't enqueue - handled by batch processing
  }

  /**
   * Selects the most relevant opportunities from a list of all opportunities.
   * Uses the same logic as other services in the codebase:
   * 1. If only one opportunity, use it
   * 2. If multiple opportunities, prefer active ones
   * 3. If multiple active opportunities, use the most recently updated
   * 4. If no active opportunities, use the most recently updated closed one
   */
  private static selectRelevantOpportunities(allOpportunities: any[]): any[] {
    if (allOpportunities.length <= 1) {
      return allOpportunities;
    }

    const activeOpportunities = allOpportunities.filter(
      (opp) => {
        const stage = opp.stage as any;
        return !stage?.isClosedWon && !stage?.isClosedLost;
      }
    );

    if (activeOpportunities.length === 1) {
      console.log(chalk.cyan(`[+] IntelligenceProcessor: Using single active opportunity: ${activeOpportunities[0]._id}`));
      return activeOpportunities;
    } else if (activeOpportunities.length > 1) {
      // If multiple are active, use the most recently updated one
      activeOpportunities.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      console.warn(chalk.yellow(`[!] IntelligenceProcessor: Multiple active opportunities found. Using most recent: ${activeOpportunities[0]._id}`));
      return [activeOpportunities[0]];
    } else {
      // No active opportunities. Use the most recently updated closed opportunity
      allOpportunities.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      console.log(chalk.yellow(`[!] IntelligenceProcessor: No active opportunities found. Using most recent closed: ${allOpportunities[0]._id}`));
      return [allOpportunities[0]];
    }
  }

  /**
   * DIRECT PROCESSING METHOD: Bypasses the queue system and processes immediately.
   * Use this only for:
   * - System recovery scenarios when queue is unavailable
   * - Manual administrative processing
   * - Testing purposes
   * - Media processing scenarios where the activity has already been processed once
   * WARNING: This bypasses chronological ordering guarantees per prospect.
   */
  public static async processActivityDirect(
    activity: IActivity | IEmailActivity | ICalendarActivity
  ): Promise<void> {
    console.log(chalk.yellow(`[!] IntelligenceProcessor: Direct processing activity ${activity._id} (bypassing queue and historical checks)...`));
    
    // Process directly without historical checks
    await ContactIntelligenceService.processActivityForIntelligenceV2(activity);
  }
} 