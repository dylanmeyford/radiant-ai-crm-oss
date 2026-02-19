import mongoose from 'mongoose';
import MediaProcessingQueue, { IMediaProcessingQueueItem } from '../models/MediaProcessingQueue';
import CalendarActivity from '../models/CalendarActivity';
import { downloadAndStoreNylasMediaStreaming } from './NylasService';
import { IntelligenceProcessor } from './AI/personIntelligence/intelligenceProcessor';
import { ActionPipelineTriggerService } from './activityProcessingService/actionPipelineTriggerService';
import chalk from 'chalk';
import os from 'os';

/**
 * Service to manage media processing queues for Nylas notetaker recordings and transcripts.
 * Handles downloading and storing media files asynchronously to prevent webhook timeouts and memory issues.
 */
export class MediaProcessingService {
  private static readonly NODE_ID = `${os.hostname()}-${process.pid}`;
  private static readonly STUCK_PROCESSING_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  private static readonly POLL_INTERVAL = 5000; // 5 seconds
  private static readonly MAX_CONCURRENT_JOBS = 2; // Limit concurrent downloads to manage memory
  private static workers: Map<string, NodeJS.Timeout> = new Map();
  private static isShuttingDown = false;

  /**
   * Add a media processing job to the queue.
   */
  public static async enqueueMediaProcessing(
    organizationId: string,
    calendarActivityId: string,
    nylasNotetakerId: string,
    grantId: string,
    mediaUrls: {
      recordingUrl?: string;
      transcriptUrl?: string;
      actionItemsUrl?: string;
      summaryUrl?: string;
      thumbnailUrl?: string;
    },
    recordingDuration?: number
  ): Promise<IMediaProcessingQueueItem> {
    console.log(chalk.blue(`[MEDIA-QUEUE] Enqueueing media processing for notetaker ${nylasNotetakerId}`));

    // Check if already queued
    const existingQueueItem = await MediaProcessingQueue.findOne({
      nylasNotetakerId,
    });

    if (existingQueueItem) {
      console.log(chalk.yellow(`[MEDIA-QUEUE] Media processing for notetaker ${nylasNotetakerId} already queued with status: ${existingQueueItem.status}`));
      return existingQueueItem;
    }

    // Calculate priority based on recording duration (shorter recordings get higher priority)
    // Default priority is current timestamp, shorter recordings get earlier timestamp
    const basePriority = Date.now();
    const durationPenalty = recordingDuration ? Math.min(recordingDuration * 1000, 3600000) : 0; // Max 1 hour penalty
    const priority = basePriority + durationPenalty;

    // Create queue item
    const queueItem = new MediaProcessingQueue({
      organization: new mongoose.Types.ObjectId(organizationId),
      calendarActivity: new mongoose.Types.ObjectId(calendarActivityId),
      nylasNotetakerId,
      grantId,
      recordingUrl: mediaUrls.recordingUrl,
      transcriptUrl: mediaUrls.transcriptUrl,
      actionItemsUrl: mediaUrls.actionItemsUrl,
      summaryUrl: mediaUrls.summaryUrl,
      thumbnailUrl: mediaUrls.thumbnailUrl,
      recordingDuration,
      priority,
      status: 'pending',
    });

    await queueItem.save();
    console.log(chalk.green(`[MEDIA-QUEUE] Successfully enqueued media processing for notetaker ${nylasNotetakerId} with priority ${priority}`));

    return queueItem;
  }

  /**
   * Start the media processing worker system.
   */
  public static async start(): Promise<void> {
    console.log(chalk.blue.bold('[MEDIA-WORKER] Starting media processing worker system...'));

    // Reset any stuck processing items from previous runs
    await this.resetStuckProcessingItems();

    // Start the main worker loop
    this.startMainWorkerLoop();

    console.log(chalk.green('[MEDIA-WORKER] Media processing worker system started'));
  }

  /**
   * Stop the media processing worker system gracefully.
   */
  public static async stop(): Promise<void> {
    console.log(chalk.yellow('[MEDIA-WORKER] Stopping media processing worker system...'));
    this.isShuttingDown = true;

    // Clear all timers
    for (const [jobId, timer] of this.workers) {
      clearTimeout(timer);
      console.log(chalk.yellow(`[MEDIA-WORKER] Cleared timer for job ${jobId}`));
    }
    this.workers.clear();

    console.log(chalk.red('[MEDIA-WORKER] Media processing worker system stopped'));
  }

  /**
   * Reset processing items that have been stuck for too long.
   */
  private static async resetStuckProcessingItems(): Promise<void> {
    const stuckThreshold = new Date(Date.now() - this.STUCK_PROCESSING_TIMEOUT);
    
    const stuckItems = await MediaProcessingQueue.updateMany(
      {
        status: 'processing',
        processingStartedAt: { $lt: stuckThreshold },
      },
      {
        $set: {
          status: 'pending',
          processingStartedAt: undefined,
          processingNode: undefined,
          errorMessage: 'Reset due to stuck processing (possible server restart)',
        },
        $inc: { retryCount: 1 },
      }
    );

    if (stuckItems.modifiedCount > 0) {
      console.log(chalk.yellow(`[MEDIA-WORKER] Reset ${stuckItems.modifiedCount} stuck processing items`));
    }
  }

  /**
   * Start the main worker loop that processes media jobs.
   */
  private static startMainWorkerLoop(): void {
    const processNextBatch = async () => {
      if (this.isShuttingDown) return;

      try {
        // Check how many jobs are currently processing
        const processingCount = this.workers.size;
        const availableSlots = this.MAX_CONCURRENT_JOBS - processingCount;

        if (availableSlots <= 0) {
          // No available slots, check again later
          setTimeout(processNextBatch, this.POLL_INTERVAL);
          return;
        }

        // Get pending jobs up to available slots
        const pendingJobs = await MediaProcessingQueue.find({
          status: 'pending',
        })
          .sort({ priority: 1 }) // Lower priority number = higher priority
          .limit(availableSlots);

        if (pendingJobs.length === 0) {
          // No pending jobs, check again later
          setTimeout(processNextBatch, this.POLL_INTERVAL);
          return;
        }

        // Start processing each job
        for (const job of pendingJobs) {
          this.startMediaWorker(job._id.toString());
        }

        // Schedule next batch check
        setTimeout(processNextBatch, this.POLL_INTERVAL);
      } catch (error) {
        console.error(chalk.red('[MEDIA-WORKER] Error in main worker loop:'), error);
        setTimeout(processNextBatch, this.POLL_INTERVAL);
      }
    };

    processNextBatch();
  }

  /**
   * Start a worker for a specific media processing job.
   */
  private static startMediaWorker(jobId: string): void {
    if (this.workers.has(jobId)) {
      return; // Already processing
    }

    const timer = setTimeout(async () => {
      try {
        await this.processMediaJob(jobId);
      } catch (error) {
        console.error(chalk.red(`[MEDIA-WORKER] Error processing job ${jobId}:`), error);
      } finally {
        this.workers.delete(jobId);
      }
    }, 0);

    this.workers.set(jobId, timer);
  }

  /**
   * Process a single media job.
   */
  private static async processMediaJob(jobId: string): Promise<void> {
    console.log(chalk.cyan(`[MEDIA-WORKER] Processing media job ${jobId}`));

    try {
      // Mark as processing
      const job = await MediaProcessingQueue.findByIdAndUpdate(
        jobId,
        {
          status: 'processing',
          processingStartedAt: new Date(),
          processingNode: this.NODE_ID,
        },
        { new: true }
      );

      if (!job) {
        console.warn(chalk.yellow(`[MEDIA-WORKER] Job ${jobId} not found`));
        return;
      }

      // Load the calendar activity
      const calendarActivity = await CalendarActivity.findById(job.calendarActivity);
      if (!calendarActivity) {
        throw new Error(`CalendarActivity ${job.calendarActivity} not found`);
      }

      // Download and store the media using streaming approach
      const mediaStorageResult = await downloadAndStoreNylasMediaStreaming(
        job.organization.toString(),
        job.calendarActivity.toString(),
        job.nylasNotetakerId,
        job.recordingUrl,
        job.transcriptUrl,
        undefined, // actionItemsUrl intentionally skipped
        undefined, // summaryUrl intentionally skipped
        job.thumbnailUrl
      );

      // Update calendar activity with media results
      if (mediaStorageResult.savedRecordingPath) {
        calendarActivity.savedRecordingPath = mediaStorageResult.savedRecordingPath;
      }
      if (mediaStorageResult.recordingStorageUrl) {
        calendarActivity.recordingUrl = mediaStorageResult.recordingStorageUrl;
      }
      if (mediaStorageResult.savedTranscriptPath) {
        calendarActivity.savedTranscriptPath = mediaStorageResult.savedTranscriptPath;
      }
      if (mediaStorageResult.transcriptStorageUrl) {
        calendarActivity.transcriptUrl = mediaStorageResult.transcriptStorageUrl;
      }
      if (mediaStorageResult.transcriptText) {
        calendarActivity.transcriptionText = mediaStorageResult.transcriptText;
      }
      // if (mediaStorageResult.actionItemsText) {
      //   calendarActivity.actionItems = mediaStorageResult.actionItemsText;
      // }
      // if (mediaStorageResult.summaryText) {
      //   calendarActivity.summary = mediaStorageResult.summaryText;
      // }

      // Determine media status based on error severity
      // - 'available': No errors, all media downloaded successfully
      // - 'partial': Only non-critical errors (thumbnail, action items, summary)
      // - 'error': Critical errors (transcript failure)
      if (mediaStorageResult.criticalError) {
        console.error(chalk.red(`[MEDIA-WORKER] Critical error storing media for job ${jobId}: ${mediaStorageResult.criticalError}`));
        calendarActivity.mediaStatus = 'error';
      } else if (mediaStorageResult.nonCriticalErrors && mediaStorageResult.nonCriticalErrors.length > 0) {
        console.warn(chalk.yellow(`[MEDIA-WORKER] Non-critical errors for job ${jobId}: ${mediaStorageResult.nonCriticalErrors.join('; ')}`));
        calendarActivity.mediaStatus = 'partial';
      } else {
        calendarActivity.mediaStatus = 'available';
      }

      await calendarActivity.save();

      // Mark job as completed
      await MediaProcessingQueue.findByIdAndUpdate(jobId, {
        status: 'completed',
        processingCompletedAt: new Date(),
        errorMessage: mediaStorageResult.error,
      });

      // Always attempt AI processing - the summarizer handles missing transcripts gracefully
      // Even with transcript failure, we can generate actions from meeting metadata
      // Use processActivityDirect to bypass historical checks and avoid full opportunity reprocessing
      // The activity has already been processed once; we're just updating it with the new transcript data
      const hasUsableData = mediaStorageResult.transcriptText || calendarActivity.title || calendarActivity.nylasEventId;
      
      if (hasUsableData) {
        if (mediaStorageResult.criticalError) {
          console.log(chalk.yellow(`[MEDIA-WORKER] Processing activity ${calendarActivity._id} with degraded data (transcript unavailable) - will use meeting metadata`));
        } else {
          console.log(chalk.cyan(`[MEDIA-WORKER] Processing activity ${calendarActivity._id} with new media using direct processing to avoid opportunity reprocessing`));
        }
        
        try {
          await IntelligenceProcessor.processActivityDirect(calendarActivity);
        } catch (aiError) {
          console.error(chalk.red(`[MEDIA-WORKER] AI processing failed for activity ${calendarActivity._id}:`), aiError);
          // Continue to action pipeline - it may still work with existing intelligence
        }

        // Trigger action pipeline after intelligence processing with media
        console.log(chalk.cyan(`[MEDIA-WORKER] Triggering action pipeline for calendar activity ${calendarActivity._id} after media processing`));
        try {
          const opportunityId = await ActionPipelineTriggerService.getOpportunityIdForActivity(
            calendarActivity._id as mongoose.Types.ObjectId,
            'CalendarActivity'
          );

          if (opportunityId) {
            await ActionPipelineTriggerService.triggerAfterActivityProcessing(
              calendarActivity._id as mongoose.Types.ObjectId,
              'CalendarActivity',
              opportunityId
            );
            console.log(chalk.green(`[MEDIA-WORKER] Successfully triggered action pipeline for calendar activity ${calendarActivity._id}`));
          } else {
            console.warn(chalk.yellow(`[MEDIA-WORKER] Could not find opportunity for calendar activity ${calendarActivity._id}, skipping action pipeline trigger`));
          }
        } catch (error) {
          console.error(chalk.red(`[MEDIA-WORKER] Error triggering action pipeline for calendar activity ${calendarActivity._id}:`), error);
          // Don't throw - we don't want action pipeline errors to break media processing
        }
      } else {
        console.warn(chalk.yellow(`[MEDIA-WORKER] Skipping AI processing for activity ${calendarActivity._id} - no usable data available`));
      }

      console.log(chalk.green(`[MEDIA-WORKER] Successfully processed media job ${jobId}`));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`[MEDIA-WORKER] Failed to process media job ${jobId}:`), error);

      // Update job with error and increment retry count
      const job = await MediaProcessingQueue.findById(jobId);
      if (job) {
        job.retryCount += 1;
        job.errorMessage = errorMessage;
        job.processingStartedAt = undefined;
        job.processingNode = undefined;

        if (job.retryCount >= job.maxRetries) {
          job.status = 'failed';
          job.processingCompletedAt = new Date();
          
          // Also update the calendar activity to reflect the failure
          await CalendarActivity.findByIdAndUpdate(job.calendarActivity, {
            mediaStatus: 'error',
          });
        } else {
          job.status = 'pending'; // Retry
        }

        await job.save();
      }
    }
  }

  /**
   * Get queue statistics.
   */
  public static async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const stats = await MediaProcessingQueue.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    stats.forEach(stat => {
      if (stat._id in result) {
        result[stat._id as keyof typeof result] = stat.count;
      }
    });

    return result;
  }
}
