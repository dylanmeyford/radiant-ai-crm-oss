import { ActivityProcessingQueueService } from './activityProcessingQueueService';
import { HistoricalActivityService } from '../AI/personIntelligence/historicalActivityService';
import { IActivityProcessingQueueItem } from '../../models/ActivityProcessingQueue';
import { opportunityBatchProcessingService } from './opportunityBatchProcessingService';
import { ActionPipelineTriggerService } from './actionPipelineTriggerService';
import chalk from 'chalk';

/**
 * Background worker service that processes both activities and opportunity reprocessing from the unified queue.
 * Processes activities in chronological order per prospect and handles opportunity reprocessing with debouncing.
 */
export class QueueWorkerService {
  private static workers: Map<string, NodeJS.Timeout> = new Map();
  private static opportunityWorkers: Map<string, NodeJS.Timeout> = new Map();
  private static isShuttingDown = false;
  private static readonly POLL_INTERVAL = 5000; // 5 seconds
  private static readonly MAX_CONCURRENT_PROSPECTS = 10; // Limit concurrent prospect processing
  private static readonly MAX_CONCURRENT_OPPORTUNITIES = 5; // Limit concurrent opportunity processing

  /**
   * Start the queue worker system.
   */
  public static async start(): Promise<void> {
    console.log(chalk.blue.bold('[QUEUE-WORKER] Starting unified queue worker system...'));

    // Reset any stuck processing items from previous runs
    await ActivityProcessingQueueService.resetStuckProcessingItems();

    // Start the main worker loops
    this.startMainWorkerLoop();
    this.startOpportunityWorkerLoop();

    console.log(chalk.green('[QUEUE-WORKER] Unified queue worker system started'));
  }

  /**
   * Stop the queue worker system gracefully.
   */
  public static async stop(): Promise<void> {
    console.log(chalk.yellow('[QUEUE-WORKER] Stopping unified queue worker system...'));
    
    this.isShuttingDown = true;

    // Stop all prospect workers
    for (const [prospectId, timer] of this.workers.entries()) {
      clearTimeout(timer);
      console.log(chalk.gray(`[QUEUE-WORKER] Stopped activity worker for prospect ${prospectId}`));
    }
    this.workers.clear();

    // Stop all opportunity workers
    for (const [opportunityId, timer] of this.opportunityWorkers.entries()) {
      clearTimeout(timer);
      console.log(chalk.gray(`[QUEUE-WORKER] Stopped opportunity worker for ${opportunityId}`));
    }
    this.opportunityWorkers.clear();

    console.log(chalk.green('[QUEUE-WORKER] Unified queue worker system stopped'));
  }

  /**
   * Main worker loop that manages prospect-specific activity workers.
   */
  private static startMainWorkerLoop(): void {
    const runMainLoop = async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        // Get prospects with pending activities
        const prospectsWithWork = await ActivityProcessingQueueService.getProspectsWithPendingActivities();
        
        // Start workers for prospects that don't have them yet and don't have opportunity reprocessing
        for (const prospectId of prospectsWithWork) {
          const prospectIdStr = prospectId.toString();
          
          if (!this.workers.has(prospectIdStr) && this.workers.size < this.MAX_CONCURRENT_PROSPECTS) {
            // Check if this prospect has opportunity reprocessing before starting a worker
            const opportunityReprocessingStatus = await ActivityProcessingQueueService.hasOpportunityReprocessingForProspect(prospectId);
            
            if (opportunityReprocessingStatus.hasScheduledOrRunning) {
              // Skip starting a worker for this prospect
              console.log(chalk.yellow(`[QUEUE-WORKER] Skipping worker creation for prospect ${prospectIdStr} - opportunity reprocessing is scheduled/running`));
              continue;
            }
            
            this.startProspectWorker(prospectIdStr);
          }
        }

        // Clean up workers for prospects that no longer have work OR have opportunity reprocessing
        for (const [prospectIdStr, timer] of this.workers.entries()) {
          const hasWork = prospectsWithWork.some(id => id.toString() === prospectIdStr);
          
          if (!hasWork) {
            clearTimeout(timer);
            this.workers.delete(prospectIdStr);
            console.log(chalk.gray(`[QUEUE-WORKER] Stopped activity worker for prospect ${prospectIdStr} (no pending activities)`));
          } else {
            // Check if this prospect now has opportunity reprocessing
            const opportunityReprocessingStatus = await ActivityProcessingQueueService.hasOpportunityReprocessingForProspect(prospectIdStr);
            
            if (opportunityReprocessingStatus.hasScheduledOrRunning) {
              clearTimeout(timer);
              this.workers.delete(prospectIdStr);
              console.log(chalk.yellow(`[QUEUE-WORKER] Stopped activity worker for prospect ${prospectIdStr} due to opportunity reprocessing`));
            }
          }
        }

        // Log current status
        if (this.workers.size > 0) {
          console.log(chalk.blue(`[QUEUE-WORKER] Active activity workers: ${this.workers.size}, Prospects with pending work: ${prospectsWithWork.length}`));
        }

      } catch (error) {
        console.error(chalk.red('[QUEUE-WORKER] Error in main activity worker loop:'), error);
      }

      // Schedule next iteration
      if (!this.isShuttingDown) {
        setTimeout(runMainLoop, this.POLL_INTERVAL);
      }
    };

    // Start the loop
    runMainLoop();
  }

  /**
   * Opportunity worker loop that processes opportunity reprocessing tasks.
   */
  public static startOpportunityWorkerLoop(): void {
    const runOpportunityLoop = async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        // Get pending opportunity reprocessing items that are ready
        const pendingOpportunityItems = await ActivityProcessingQueueService.getPendingOpportunityReprocessingItems();
        
        // Start workers for opportunities that are ready and don't have workers yet
        for (const queueItem of pendingOpportunityItems) {
          const opportunityId = queueItem.opportunity!.toString();
          
          if (!this.opportunityWorkers.has(opportunityId) && this.opportunityWorkers.size < this.MAX_CONCURRENT_OPPORTUNITIES) {
            this.startOpportunityWorker(opportunityId);
          }
        }

        // Log current status
        if (this.opportunityWorkers.size > 0 || pendingOpportunityItems.length > 0) {
          console.log(chalk.magenta(`[QUEUE-WORKER] Active opportunity workers: ${this.opportunityWorkers.size}, Ready opportunity items: ${pendingOpportunityItems.length}`));
        }

      } catch (error) {
        console.error(chalk.red('[QUEUE-WORKER] Error in opportunity worker loop:'), error);
      }

      // Schedule next iteration
      if (!this.isShuttingDown) {
        setTimeout(runOpportunityLoop, this.POLL_INTERVAL);
      }
    };

    // Start the loop
    runOpportunityLoop();
  }

  /**
   * Start a worker for a specific prospect (activity processing).
   */
  private static startProspectWorker(prospectId: string): void {
    console.log(chalk.cyan(`[QUEUE-WORKER] Starting activity worker for prospect ${prospectId}`));

    const processProspectQueue = async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        // Check if this prospect has any opportunities with scheduled or running reprocessing
        const opportunityReprocessingStatus = await ActivityProcessingQueueService.hasOpportunityReprocessingForProspect(prospectId);
        
        if (opportunityReprocessingStatus.hasScheduledOrRunning) {
          // Skip processing activities for this prospect since opportunity reprocessing will handle them
          console.log(chalk.yellow(`[QUEUE-WORKER] Skipping activity processing for prospect ${prospectId} - opportunity reprocessing is scheduled/running`));
          
          // Log details about which opportunities are being reprocessed
          for (const opp of opportunityReprocessingStatus.opportunities) {
            const statusText = opp.status === 'processing' ? 'currently processing' : 'scheduled for processing';
            const scheduleText = opp.scheduledFor ? ` at ${opp.scheduledFor.toISOString()}` : '';
            console.log(chalk.cyan(`  -> Opportunity ${opp.opportunityId} is ${statusText}${scheduleText}`));
          }
          
          // Stop this worker since we're skipping activities
          this.workers.delete(prospectId);
          console.log(chalk.gray(`[QUEUE-WORKER] Stopped activity worker for prospect ${prospectId} due to opportunity reprocessing`));
          return;
        }

        // Check if this prospect is already being processed by another node
        const isProcessing = await ActivityProcessingQueueService.isProspectProcessing(prospectId);
        
        if (isProcessing) {
          // Another activity for this prospect is being processed, wait
          setTimeout(processProspectQueue, this.POLL_INTERVAL);
          return;
        }

        // Get the next activity to process for this prospect
        const queueItem = await ActivityProcessingQueueService.getNextActivityForProspect(prospectId);
        
        if (!queueItem) {
          // No more work for this prospect, stop the worker
          this.workers.delete(prospectId);
          console.log(chalk.gray(`[QUEUE-WORKER] No more activity work for prospect ${prospectId}, stopping worker`));
          return;
        }

        // Process the activity
        await this.processActivityQueueItem(queueItem);

        // Schedule next item processing immediately
        setTimeout(processProspectQueue, 100); // Small delay to prevent tight loops

      } catch (error) {
        console.error(chalk.red(`[QUEUE-WORKER] Error processing activities for prospect ${prospectId}:`), error);
        
        // Continue processing after a delay even if there was an error
        setTimeout(processProspectQueue, this.POLL_INTERVAL);
      }
    };

    // Start processing
    const timer = setTimeout(processProspectQueue, 0);
    this.workers.set(prospectId, timer);
  }

  /**
   * Start a worker for a specific opportunity (reprocessing).
   */
  private static startOpportunityWorker(opportunityId: string): void {
    console.log(chalk.magenta(`[QUEUE-WORKER] Starting opportunity worker for ${opportunityId}`));

    const processOpportunityReprocessing = async () => {
      if (this.isShuttingDown) {
        this.opportunityWorkers.delete(opportunityId);
        return;
      }

      try {
        // Get the next opportunity reprocessing item for this opportunity
        const queueItem = await ActivityProcessingQueueService.getNextOpportunityReprocessingItem();
        
        // Check if this specific opportunity is in the queue and ready
        if (!queueItem || queueItem.opportunity!.toString() !== opportunityId) {
          // No more work for this opportunity or it's not ready yet, stop the worker
          this.opportunityWorkers.delete(opportunityId);
          console.log(chalk.gray(`[QUEUE-WORKER] No ready opportunity work for ${opportunityId}, stopping worker`));
          return;
        }

        // Check if another worker is already processing this opportunity
        const processingStatus = await ActivityProcessingQueueService.isOpportunityProcessing(opportunityId);
        if (processingStatus.isRunning) {
          // Another worker is processing this opportunity, stop this worker
          this.opportunityWorkers.delete(opportunityId);
          console.log(chalk.gray(`[QUEUE-WORKER] Opportunity ${opportunityId} already being processed, stopping duplicate worker`));
          return;
        }

        // Process the opportunity reprocessing
        await this.processOpportunityQueueItem(queueItem);

        // Remove worker after processing (opportunity reprocessing is typically one-shot)
        this.opportunityWorkers.delete(opportunityId);
        console.log(chalk.gray(`[QUEUE-WORKER] Completed opportunity worker for ${opportunityId}`));

      } catch (error) {
        console.error(chalk.red(`[QUEUE-WORKER] Error processing opportunity ${opportunityId}:`), error);
        
        // Remove worker on error
        this.opportunityWorkers.delete(opportunityId);
      }
    };

    // Start processing
    const timer = setTimeout(processOpportunityReprocessing, 0);
    this.opportunityWorkers.set(opportunityId, timer);
  }

  /**
   * Process a single activity queue item.
   */
  private static async processActivityQueueItem(queueItem: IActivityProcessingQueueItem): Promise<void> {
    console.log(chalk.cyan(`[QUEUE-WORKER] Processing activity ${queueItem.activity} for prospect ${queueItem.prospect}`));

    try {
      // Mark as processing
      await ActivityProcessingQueueService.markAsProcessing(queueItem._id);

      // Load the activity
      const activity = await ActivityProcessingQueueService.loadActivity(queueItem);
      
      if (!activity) {
        throw new Error(`Activity ${queueItem.activity} not found`);
      }

      // Process the activity using the existing intelligence system
      await HistoricalActivityService.processActivityWithHistoricalCheck(activity);

      // Mark as completed
      await ActivityProcessingQueueService.markAsCompleted(queueItem._id);

      console.log(chalk.green(`[QUEUE-WORKER] Successfully processed activity ${queueItem.activity}`));

      // Trigger action pipeline after successful activity processing
      if (queueItem.activity && queueItem.activityType) {
        // Get the opportunity ID for this activity
        const opportunityId = await ActionPipelineTriggerService.getOpportunityIdForActivity(
          queueItem.activity,
          queueItem.activityType
        );

        if (opportunityId) {
          // Trigger action pipeline (only if no batch processing is active)
          await ActionPipelineTriggerService.triggerAfterActivityProcessing(
            queueItem.activity,
            queueItem.activityType,
            opportunityId
          );
        } else {
          console.warn(chalk.yellow(`[QUEUE-WORKER] Could not find opportunity for activity ${queueItem.activity}, skipping action pipeline trigger`));
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`[QUEUE-WORKER] Failed to process activity ${queueItem.activity}:`), error);

      // Mark as failed (this will handle retry logic)
      await ActivityProcessingQueueService.markAsFailed(queueItem._id, errorMessage);
    }
  }

  /**
   * Process a single opportunity reprocessing queue item.
   */
  private static async processOpportunityQueueItem(queueItem: IActivityProcessingQueueItem): Promise<void> {
    try {
      // Mark as processing
      await ActivityProcessingQueueService.markAsProcessing(queueItem._id);

      if (!queueItem.opportunity) {
        throw new Error('No opportunity ID in queue item');
      }

      const opportunityId = queueItem.opportunity;

      // Use the OpportunityBatchProcessingService to handle processing and status updates
      await opportunityBatchProcessingService.processOpportunity(opportunityId.toString());

      // Mark as completed
      await ActivityProcessingQueueService.markAsCompleted(queueItem._id);

      console.log(chalk.green(`[QUEUE-WORKER] Successfully processed opportunity reprocessing ${opportunityId}`));

      // Trigger action pipeline after successful opportunity processing
      await ActionPipelineTriggerService.triggerAfterOpportunityProcessing(opportunityId);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`[QUEUE-WORKER] Failed to process opportunity reprocessing ${queueItem.opportunity}:`), error);

      // Mark as failed (this will handle retry logic)
      await ActivityProcessingQueueService.markAsFailed(queueItem._id, errorMessage);
    }
  }

  /**
   * Get current worker statistics.
   */
  public static getWorkerStats(): {
    activeActivityWorkers: number;
    activeOpportunityWorkers: number;
    isRunning: boolean;
    maxConcurrentProspects: number;
    maxConcurrentOpportunities: number;
  } {
    return {
      activeActivityWorkers: this.workers.size,
      activeOpportunityWorkers: this.opportunityWorkers.size,
      isRunning: !this.isShuttingDown,
      maxConcurrentProspects: this.MAX_CONCURRENT_PROSPECTS,
      maxConcurrentOpportunities: this.MAX_CONCURRENT_OPPORTUNITIES,
    };
  }

  /**
   * Force process all pending activities for a specific prospect (for manual intervention).
   */
  public static async forceProcessProspect(prospectId: string): Promise<void> {
    console.log(chalk.yellow(`[QUEUE-WORKER] Force processing all activities for prospect ${prospectId}`));

    const pendingActivities = await ActivityProcessingQueueService.getPendingActivitiesForProspect(prospectId);
    
    console.log(chalk.cyan(`[QUEUE-WORKER] Found ${pendingActivities.length} pending activities for prospect ${prospectId}`));

    for (const queueItem of pendingActivities) {
      try {
        await this.processActivityQueueItem(queueItem);
      } catch (error) {
        console.error(chalk.red(`[QUEUE-WORKER] Error in force processing activity ${queueItem.activity}:`), error);
        // Continue with next activity even if one fails
      }
    }

    console.log(chalk.green(`[QUEUE-WORKER] Completed force processing for prospect ${prospectId}`));
  }

  /**
   * Force process opportunity reprocessing (for manual intervention).
   */
  public static async forceProcessOpportunity(opportunityId: string): Promise<void> {
    console.log(chalk.yellow(`[QUEUE-WORKER] Force processing opportunity reprocessing for ${opportunityId}`));

    try {
      // Use the OpportunityBatchProcessingService directly for immediate processing
      await opportunityBatchProcessingService.processOpportunity(opportunityId);
      console.log(chalk.green(`[QUEUE-WORKER] Completed force processing opportunity ${opportunityId}`));
    } catch (error) {
      console.error(chalk.red(`[QUEUE-WORKER] Error in force processing opportunity ${opportunityId}:`), error);
      throw error; // Re-throw so tests can catch it
    }
  }

  /**
   * Stop activity workers for a specific prospect (called when opportunity reprocessing is scheduled).
   */
  public static stopActivityWorkersForProspect(prospectId: string): void {
    const timer = this.workers.get(prospectId);
    if (timer) {
      clearTimeout(timer);
      this.workers.delete(prospectId);
      console.log(chalk.yellow(`[QUEUE-WORKER] Stopped activity worker for prospect ${prospectId} due to opportunity reprocessing being scheduled`));
    }
  }

  /**
   * Get queue status for monitoring/debugging.
   */
  public static async getQueueStatus(): Promise<{
    queueStats: Awaited<ReturnType<typeof ActivityProcessingQueueService.getQueueStats>>;
    workerStats: ReturnType<typeof QueueWorkerService.getWorkerStats>;
    prospectsWithWork: number;
    readyOpportunityItems: number;
  }> {
    const [queueStats, prospectsWithWork, readyOpportunityItems] = await Promise.all([
      ActivityProcessingQueueService.getQueueStats(),
      ActivityProcessingQueueService.getProspectsWithPendingActivities(),
      ActivityProcessingQueueService.getPendingOpportunityReprocessingItems(),
    ]);

    return {
      queueStats,
      workerStats: this.getWorkerStats(),
      prospectsWithWork: prospectsWithWork.length,
      readyOpportunityItems: readyOpportunityItems.length,
    };
  }
} 