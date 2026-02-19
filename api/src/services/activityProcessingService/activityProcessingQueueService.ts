import mongoose from 'mongoose';
import ActivityProcessingQueue, { IActivityProcessingQueueItem } from '../../models/ActivityProcessingQueue';
import { IActivity } from '../../models/Activity';
import { IEmailActivity } from '../../models/EmailActivity';
import { ICalendarActivity } from '../../models/CalendarActivity';
import Activity from '../../models/Activity';
import EmailActivity from '../../models/EmailActivity';
import CalendarActivity from '../../models/CalendarActivity';
import Opportunity from '../../models/Opportunity';
import chalk from 'chalk';
import os from 'os';

/**
 * Service to manage activity processing queues per prospect and opportunity reprocessing with debouncing.
 * Ensures activities are processed in chronological order within each prospect.
 * Provides database-backed debouncing for opportunity reprocessing to survive reboots.
 */
export class ActivityProcessingQueueService {
  private static readonly NODE_ID = `${os.hostname()}-${process.pid}`;
  private static readonly STUCK_PROCESSING_TIMEOUT = 5 * 60 * 1000;
  private static readonly DEFAULT_DEBOUNCE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  /**
   * Get the debounce timeout from environment variable with fallback
   */
  private static getDebounceTimeout(): number {
    const envTimeout = process.env.OPPORTUNITY_REPROCESSING_DEBOUNCE_MS;
    const timeout = envTimeout ? parseInt(envTimeout, 10) : this.DEFAULT_DEBOUNCE_TIMEOUT;
    
    if (isNaN(timeout) || timeout < 0) {
      console.warn(`Invalid OPPORTUNITY_REPROCESSING_DEBOUNCE_MS value: ${envTimeout}. Using default ${this.DEFAULT_DEBOUNCE_TIMEOUT}ms`);
      return this.DEFAULT_DEBOUNCE_TIMEOUT;
    }
    
    return timeout;
  }

  /**
   * Add an activity to the processing queue.
   * Activities will be processed in chronological order per prospect.
   */
  public static async enqueueActivity(
    activity: IActivity | IEmailActivity | ICalendarActivity
  ): Promise<IActivityProcessingQueueItem> {
    console.log(chalk.blue(`[QUEUE] Enqueueing activity ${activity._id} for prospect ${activity.prospect}`));

    // Determine activity type for polymorphic reference
    let activityType: 'Activity' | 'EmailActivity' | 'CalendarActivity';
    if ('threadId' in activity) {
      activityType = 'EmailActivity';
    } else if ('startTime' in activity) {
      activityType = 'CalendarActivity';
    } else {
      activityType = 'Activity';
    }

    // Get activity date for chronological ordering
    const activityDate = (activity as ICalendarActivity).startTime || activity.date;
    if (!activityDate) {
      throw new Error(`Activity ${activity._id} has no date - cannot determine chronological order`);
    }

    // Calculate priority based on chronological order
    // Use timestamp as priority (earlier = lower number = higher priority)
    const priority = activityDate.getTime();

    // Check if already queued
    const existingQueueItem = await ActivityProcessingQueue.findOne({
      activity: activity._id,
      activityType,
      queueItemType: 'activity',
    });

    if (existingQueueItem) {
      console.log(chalk.yellow(`[QUEUE] Activity ${activity._id} already queued with status: ${existingQueueItem.status}`));
      return existingQueueItem;
    }

    // Create queue item
    const queueItem = new ActivityProcessingQueue({
      prospect: activity.prospect,
      organization: activity.organization,
      activity: activity._id,
      activityType,
      activityDate,
      queueItemType: 'activity',
      priority,
      status: 'pending',
    });

    await queueItem.save();
    console.log(chalk.green(`[QUEUE] Successfully enqueued activity ${activity._id} with priority ${priority}`));

    return queueItem;
  }

  /**
   * Schedule opportunity reprocessing with database-backed debouncing.
   * This replaces the in-memory timer-based approach for reboot resilience.
   */
  public static async scheduleOpportunityReprocessing(
    opportunityId: mongoose.Types.ObjectId | string,
    reason: string = 'Contact changes detected'
  ): Promise<IActivityProcessingQueueItem> {
    const opportunityObjectId = typeof opportunityId === 'string' 
      ? new mongoose.Types.ObjectId(opportunityId) 
      : opportunityId;

    console.log(chalk.blue(`[QUEUE] Scheduling opportunity reprocessing for ${opportunityObjectId}`));

    // Get opportunity details
    const opportunity = await Opportunity.findById(opportunityObjectId);
    if (!opportunity) {
      throw new Error(`Opportunity ${opportunityObjectId} not found`);
    }

    const debounceTimeout = this.getDebounceTimeout();
    const scheduledFor = new Date(Date.now() + debounceTimeout);

    // Priority for opportunity reprocessing (process after all current activities)
    const priority = Date.now() + 1000000; // Future timestamp to ensure it runs after current activities

    // Check if already scheduled (regardless of status to avoid unique constraint violations)
    const existingQueueItem = await ActivityProcessingQueue.findOne({
      opportunity: opportunityObjectId,
      queueItemType: 'opportunity_reprocessing',
    });

    if (existingQueueItem) {
      // Handle different scenarios based on existing item status
      if (existingQueueItem.status === 'pending') {
        // Update the scheduled time to debounce
        const updatedItem = await ActivityProcessingQueue.findByIdAndUpdate(
          existingQueueItem._id,
          {
            scheduledFor,
            debounceReason: reason,
            addedAt: new Date(),
          },
          { new: true }
        );
        
        console.log(chalk.yellow(`[QUEUE] Debounced existing opportunity reprocessing for ${opportunityObjectId}, new scheduled time: ${scheduledFor.toISOString()}`));
        return updatedItem!;
      } else if (existingQueueItem.status === 'processing') {
        // Already processing, log and return existing item
        console.log(chalk.cyan(`[QUEUE] Opportunity ${opportunityObjectId} is already being processed, skipping new scheduling`));
        return existingQueueItem;
      } else if (existingQueueItem.status === 'completed' || existingQueueItem.status === 'failed') {
        // Previous processing completed/failed, create new scheduled item by updating the existing one
        const updatedItem = await ActivityProcessingQueue.findByIdAndUpdate(
          existingQueueItem._id,
          {
            status: 'pending',
            scheduledFor,
            debounceReason: reason,
            addedAt: new Date(),
            priority,
            // Clear previous processing metadata
            processingStartedAt: undefined,
            processingCompletedAt: undefined,
            processingNode: undefined,
            errorMessage: undefined,
            retryCount: 0,
          },
          { new: true }
        );
        
        console.log(chalk.green(`[QUEUE] Rescheduled opportunity reprocessing for ${opportunityObjectId} (previous status: ${existingQueueItem.status}), will execute at: ${scheduledFor.toISOString()}`));
        return updatedItem!;
      }
    }

    // Create new queue item (only if no existing item found)
    try {
      const queueItem = new ActivityProcessingQueue({
        prospect: opportunity.prospect,
        organization: opportunity.organization,
        opportunity: opportunityObjectId,
        queueItemType: 'opportunity_reprocessing',
        priority,
        status: 'pending',
        scheduledFor,
        debounceReason: reason,
      });

      await queueItem.save();
      console.log(chalk.green(`[QUEUE] Successfully scheduled opportunity reprocessing for ${opportunityObjectId}, will execute at: ${scheduledFor.toISOString()}`));

      return queueItem;
    } catch (error: any) {
      // Handle race condition where another process created the item between our check and save
      if (error.code === 11000 && error.message.includes('duplicate key error')) {
        console.log(chalk.yellow(`[QUEUE] Race condition detected for opportunity ${opportunityObjectId}, refetching existing item`));
        
        // Refetch the item that was created by the other process
        const raceConditionItem = await ActivityProcessingQueue.findOne({
          opportunity: opportunityObjectId,
          queueItemType: 'opportunity_reprocessing',
        });
        
        if (raceConditionItem) {
          console.log(chalk.yellow(`[QUEUE] Using existing queue item created by concurrent process for opportunity ${opportunityObjectId}`));
          return raceConditionItem;
        }
      }
      
      // Re-throw if it's not a duplicate key error or we couldn't find the item
      throw error;
    }
  }

  /**
   * Get the next activity to process for a specific prospect.
   * Returns the oldest unprocessed activity.
   */
  public static async getNextActivityForProspect(
    prospectId: mongoose.Types.ObjectId | string
  ): Promise<IActivityProcessingQueueItem | null> {
    const queueItem = await ActivityProcessingQueue.findOne({
      prospect: prospectId,
      queueItemType: 'activity',
      status: 'pending',
    })
      .sort({ priority: 1 }) // Earlier activities first (lower priority number)
      .exec();

    return queueItem;
  }

  /**
   * Get the next opportunity reprocessing item that is ready to be processed.
   */
  public static async getNextOpportunityReprocessingItem(): Promise<IActivityProcessingQueueItem | null> {
    const now = new Date();
    
    const queueItem = await ActivityProcessingQueue.findOne({
      queueItemType: 'opportunity_reprocessing',
      status: 'pending',
      scheduledFor: { $lte: now },
    })
      .sort({ scheduledFor: 1 }) // Process oldest scheduled items first
      .exec();

    return queueItem;
  }

  /**
   * Get all pending activities for a prospect in chronological order.
   */
  public static async getPendingActivitiesForProspect(
    prospectId: mongoose.Types.ObjectId | string
  ): Promise<IActivityProcessingQueueItem[]> {
    return await ActivityProcessingQueue.find({
      prospect: prospectId,
      queueItemType: 'activity',
      status: 'pending',
    })
      .sort({ priority: 1 })
      .exec();
  }

  /**
   * Get all pending opportunity reprocessing items that are ready.
   */
  public static async getPendingOpportunityReprocessingItems(): Promise<IActivityProcessingQueueItem[]> {
    const now = new Date();
    
    return await ActivityProcessingQueue.find({
      queueItemType: 'opportunity_reprocessing',
      status: 'pending',
      scheduledFor: { $lte: now },
    })
      .sort({ scheduledFor: 1 })
      .exec();
  }

  /**
   * Mark an item as being processed.
   */
  public static async markAsProcessing(
    queueItemId: mongoose.Types.ObjectId | string
  ): Promise<IActivityProcessingQueueItem | null> {
    const queueItem = await ActivityProcessingQueue.findByIdAndUpdate(
      queueItemId,
      {
        status: 'processing',
        processingStartedAt: new Date(),
        processingNode: this.NODE_ID,
      },
      { new: true }
    );

    if (queueItem) {
      const itemType = queueItem.queueItemType === 'activity' 
        ? `activity ${queueItem.activity}` 
        : `opportunity reprocessing ${queueItem.opportunity}`;
      console.log(chalk.cyan(`[QUEUE] Marked ${itemType} as processing`));
    }

    return queueItem;
  }

  /**
   * Mark an item as completed.
   */
  public static async markAsCompleted(
    queueItemId: mongoose.Types.ObjectId | string
  ): Promise<IActivityProcessingQueueItem | null> {
    const queueItem = await ActivityProcessingQueue.findByIdAndUpdate(
      queueItemId,
      {
        status: 'completed',
        processingCompletedAt: new Date(),
      },
      { new: true }
    );

    if (queueItem) {
      const itemType = queueItem.queueItemType === 'activity' 
        ? `activity ${queueItem.activity}` 
        : `opportunity reprocessing ${queueItem.opportunity}`;
      console.log(chalk.green(`[QUEUE] Marked ${itemType} as completed`));
    }

    return queueItem;
  }

  /**
   * Mark an item as failed and increment retry count.
   */
  public static async markAsFailed(
    queueItemId: mongoose.Types.ObjectId | string,
    errorMessage: string
  ): Promise<IActivityProcessingQueueItem | null> {
    const queueItem = await ActivityProcessingQueue.findById(queueItemId);
    if (!queueItem) {
      return null;
    }

    const newRetryCount = queueItem.retryCount + 1;
    const shouldRetry = newRetryCount <= queueItem.maxRetries;

    const updatedQueueItem = await ActivityProcessingQueue.findByIdAndUpdate(
      queueItemId,
      {
        status: shouldRetry ? 'pending' : 'failed',
        retryCount: newRetryCount,
        errorMessage,
        processingStartedAt: undefined, // Clear processing timestamp
        processingNode: undefined,
      },
      { new: true }
    );

    if (updatedQueueItem) {
      const itemType = updatedQueueItem.queueItemType === 'activity' 
        ? `activity ${updatedQueueItem.activity}` 
        : `opportunity reprocessing ${updatedQueueItem.opportunity}`;
        
      if (shouldRetry) {
        console.log(chalk.yellow(`[QUEUE] Marked ${itemType} for retry (${newRetryCount}/${updatedQueueItem.maxRetries})`));
      } else {
        console.log(chalk.red(`[QUEUE] Marked ${itemType} as permanently failed after ${newRetryCount} attempts`));
      }
    }

    return updatedQueueItem;
  }

  /**
   * Load the actual activity object from the queue item.
   */
  public static async loadActivity(
    queueItem: IActivityProcessingQueueItem
  ): Promise<IActivity | IEmailActivity | ICalendarActivity | null> {
    if (queueItem.queueItemType !== 'activity' || !queueItem.activity || !queueItem.activityType) {
      return null;
    }

    let activity: IActivity | IEmailActivity | ICalendarActivity | null = null;

    try {
      switch (queueItem.activityType) {
        case 'EmailActivity':
          activity = await EmailActivity.findById(queueItem.activity);
          break;
        case 'CalendarActivity':
          activity = await CalendarActivity.findById(queueItem.activity);
          break;
        case 'Activity':
          activity = await Activity.findById(queueItem.activity);
          break;
        default:
          throw new Error(`Unknown activity type: ${queueItem.activityType}`);
      }
    } catch (error) {
      console.error(chalk.red(`[QUEUE] Error loading activity ${queueItem.activity}: ${error}`));
    }

    return activity;
  }

  /**
   * Check if a prospect has any activities currently being processed.
   */
  public static async isProspectProcessing(
    prospectId: mongoose.Types.ObjectId | string
  ): Promise<boolean> {
    const processingCount = await ActivityProcessingQueue.countDocuments({
      prospect: prospectId,
      status: 'processing',
    });

    return processingCount > 0;
  }

  /**
   * Check if an opportunity has reprocessing scheduled or running.
   */
  public static async isOpportunityProcessing(
    opportunityId: mongoose.Types.ObjectId | string
  ): Promise<{ isScheduled: boolean; isRunning: boolean; scheduledFor?: Date }> {
    const opportunityObjectId = typeof opportunityId === 'string' 
      ? new mongoose.Types.ObjectId(opportunityId) 
      : opportunityId;

    const [scheduledItem, runningItem] = await Promise.all([
      ActivityProcessingQueue.findOne({
        opportunity: opportunityObjectId,
        queueItemType: 'opportunity_reprocessing',
        status: 'pending',
      }),
      ActivityProcessingQueue.findOne({
        opportunity: opportunityObjectId,
        queueItemType: 'opportunity_reprocessing',
        status: 'processing',
      }),
    ]);

    return {
      isScheduled: !!scheduledItem,
      isRunning: !!runningItem,
      scheduledFor: scheduledItem?.scheduledFor,
    };
  }

  /**
   * Cancel scheduled opportunity reprocessing.
   */
  public static async cancelOpportunityReprocessing(
    opportunityId: mongoose.Types.ObjectId | string
  ): Promise<boolean> {
    const opportunityObjectId = typeof opportunityId === 'string' 
      ? new mongoose.Types.ObjectId(opportunityId) 
      : opportunityId;

    const result = await ActivityProcessingQueue.deleteOne({
      opportunity: opportunityObjectId,
      queueItemType: 'opportunity_reprocessing',
      status: 'pending',
    });

    const cancelled = result.deletedCount > 0;
    if (cancelled) {
      console.log(chalk.yellow(`[QUEUE] Cancelled scheduled opportunity reprocessing for ${opportunityObjectId}`));
    }

    return cancelled;
  }

  /**
   * Check if there are any opportunities with scheduled or running reprocessing for a given prospect.
   * This is used to determine if we should skip processing activities for this prospect.
   */
  public static async hasOpportunityReprocessingForProspect(
    prospectId: mongoose.Types.ObjectId | string
  ): Promise<{
    hasScheduledOrRunning: boolean;
    opportunities: Array<{
      opportunityId: mongoose.Types.ObjectId;
      status: 'pending' | 'processing';
      scheduledFor?: Date;
    }>;
  }> {
    const prospectObjectId = typeof prospectId === 'string' 
      ? new mongoose.Types.ObjectId(prospectId) 
      : prospectId;
    
    // Find all opportunity reprocessing items for this prospect that are either:
    // 1. Pending (regardless of scheduledFor time) - ALL pending items should block activity processing
    // 2. Currently processing
    const opportunityItems = await ActivityProcessingQueue.find({
      prospect: prospectObjectId,
      queueItemType: 'opportunity_reprocessing',
      status: { $in: ['pending', 'processing'] }
    }).select('opportunity status scheduledFor');

    const opportunities = opportunityItems.map(item => ({
      opportunityId: item.opportunity!,
      status: item.status as 'pending' | 'processing',
      scheduledFor: item.scheduledFor
    }));

    return {
      hasScheduledOrRunning: opportunities.length > 0,
      opportunities
    };
  }

  /**
   * Get queue statistics for monitoring.
   */
  public static async getQueueStats(): Promise<{
    activities: {
      pending: number;
      processing: number;
      completed: number;
      failed: number;
    };
    opportunityReprocessing: {
      pending: number;
      scheduled: number;
      processing: number;
      completed: number;
      failed: number;
    };
    total: number;
  }> {
    const [
      activitiesPending,
      activitiesProcessing,
      activitiesCompleted,
      activitiesFailed,
      oppPending,
      oppScheduled,
      oppProcessing,
      oppCompleted,
      oppFailed,
      total,
    ] = await Promise.all([
      ActivityProcessingQueue.countDocuments({ queueItemType: 'activity', status: 'pending' }),
      ActivityProcessingQueue.countDocuments({ queueItemType: 'activity', status: 'processing' }),
      ActivityProcessingQueue.countDocuments({ queueItemType: 'activity', status: 'completed' }),
      ActivityProcessingQueue.countDocuments({ queueItemType: 'activity', status: 'failed' }),
      ActivityProcessingQueue.countDocuments({ 
        queueItemType: 'opportunity_reprocessing', 
        status: 'pending',
        scheduledFor: { $lte: new Date() }
      }),
      ActivityProcessingQueue.countDocuments({ 
        queueItemType: 'opportunity_reprocessing', 
        status: 'pending',
        scheduledFor: { $gt: new Date() }
      }),
      ActivityProcessingQueue.countDocuments({ queueItemType: 'opportunity_reprocessing', status: 'processing' }),
      ActivityProcessingQueue.countDocuments({ queueItemType: 'opportunity_reprocessing', status: 'completed' }),
      ActivityProcessingQueue.countDocuments({ queueItemType: 'opportunity_reprocessing', status: 'failed' }),
      ActivityProcessingQueue.countDocuments(),
    ]);

    return {
      activities: {
        pending: activitiesPending,
        processing: activitiesProcessing,
        completed: activitiesCompleted,
        failed: activitiesFailed,
      },
      opportunityReprocessing: {
        pending: oppPending,
        scheduled: oppScheduled,
        processing: oppProcessing,
        completed: oppCompleted,
        failed: oppFailed,
      },
      total,
    };
  }

  /**
   * Clean up old completed queue items (for maintenance).
   */
  public static async cleanupCompletedItems(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await ActivityProcessingQueue.deleteMany({
      status: 'completed',
      processingCompletedAt: { $lt: cutoffDate },
    });

    console.log(chalk.gray(`[QUEUE] Cleaned up ${result.deletedCount} completed queue items older than ${olderThanDays} days`));
    return result.deletedCount || 0;
  }

  /**
   * Reset stuck processing items (for recovery after system restart).
   */
  public static async resetStuckProcessingItems(): Promise<number> {
    const stuckTimeout = new Date(Date.now() - this.STUCK_PROCESSING_TIMEOUT);

    const result = await ActivityProcessingQueue.updateMany(
      {
        status: 'processing',
        processingStartedAt: { $lt: stuckTimeout },
      },
      {
        status: 'pending',
        processingStartedAt: undefined,
        processingNode: undefined,
      }
    );

    if (result.modifiedCount > 0) {
      console.log(chalk.yellow(`[QUEUE] Reset ${result.modifiedCount} stuck processing items to pending status`));
    }

    return result.modifiedCount || 0;
  }

  /**
   * Get prospects with pending activities (for worker scheduling).
   */
  public static async getProspectsWithPendingActivities(): Promise<mongoose.Types.ObjectId[]> {
    const prospects = await ActivityProcessingQueue.distinct('prospect', {
      status: 'pending',
    });

    return prospects;
  }

  /**
   * Check if there are any historical activities in queue for a prospect.
   * Used to determine if we should defer current processing until historical activities are done.
   */
  public static async hasHistoricalActivitiesInQueue(
    prospectId: mongoose.Types.ObjectId | string,
    currentActivityDate: Date
  ): Promise<boolean> {
    const historicalCount = await ActivityProcessingQueue.countDocuments({
      prospect: prospectId,
      status: { $in: ['pending', 'processing'] },
      activityDate: { $lt: currentActivityDate },
    });

    return historicalCount > 0;
  }

  /**
   * Mark all pending activities for a prospect as completed when batch processing handles them.
   * This prevents duplicate processing when historical activities trigger batch reprocessing.
   */
  public static async markProspectActivitiesAsProcessedByBatch(
    prospectId: mongoose.Types.ObjectId | string,
    reason: string = 'Processed by batch reprocessing'
  ): Promise<number> {
    const result = await ActivityProcessingQueue.updateMany(
      {
        prospect: prospectId,
        status: 'pending',
      },
      {
        status: 'completed',
        processingCompletedAt: new Date(),
        errorMessage: reason,
      }
    );

    const updatedCount = result.modifiedCount || 0;
    if (updatedCount > 0) {
      console.log(chalk.blue(`[QUEUE] Marked ${updatedCount} pending activities for prospect ${prospectId} as completed (batch processed)`));
    }

    return updatedCount;
  }

  /**
   * Add a real-time activity to the batch processing queue.
   * This is used when a real-time activity arrives during ongoing batch processing.
   * The activity will be processed as part of the batch's re-fetch mechanism.
   * @param activity - The activity to add to the batch queue
   * @param reason - Reason for adding to batch
   */
  public static async addActivityToBatchQueue(
    activity: IActivity | IEmailActivity | ICalendarActivity,
    reason: string = 'Real-time activity during batch processing'
  ): Promise<void> {
    console.log(chalk.cyan(`[QUEUE] Adding real-time activity ${activity._id} to batch queue - ${reason}`));
    
    // Simply enqueue the activity normally - the batch's re-fetch mechanism will pick it up
    await this.enqueueActivity(activity);
    
    console.log(chalk.green(`[QUEUE] Successfully added activity ${activity._id} to batch queue`));
  }
} 