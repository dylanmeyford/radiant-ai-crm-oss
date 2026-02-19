/**
 * OpportunityBatchProcessingService
 * 
 * UPDATED: Now uses the unified ActivityProcessingQueue system for database-backed debouncing.
 * This provides reboot resilience and consistent processing order with activities.
 * 
 * Manages debounced reprocessing of opportunities when contacts are added or removed.
 * Tracks processing status directly on the opportunity object for compatibility.
 * Supports cancellation through the queue system.
 */

import mongoose from 'mongoose';
import { ActivityProcessingQueueService } from './activityProcessingQueueService';
import { HistoricalActivityService } from '../AI/personIntelligence/historicalActivityService';
import Opportunity, { ProcessingStatus } from '../../models/Opportunity';
import ActivityProcessingQueue from '../../models/ActivityProcessingQueue'; // Added import for ActivityProcessingQueue
import { ActionPipelineService } from '../AI/actionPipeline/ActionPipelineService';

class OpportunityBatchProcessingService {
    
    // Registry to store active AbortControllers for running processes
    private static activeControllers = new Map<string, AbortController>();
    
    constructor() {
        console.log('OpportunityBatchProcessingService initialized (using unified queue system)');
    }

    /**
     * Get the debounce timeout from environment variable with fallback
     * @returns The timeout duration in milliseconds
     */
    private getDebounceTimeout(): number {
        const envTimeout = process.env.OPPORTUNITY_REPROCESSING_DEBOUNCE_MS;
        const timeout = envTimeout ? parseInt(envTimeout, 10) : 300000; // Default: 5 minutes
        
        // Validate the timeout value
        if (isNaN(timeout) || timeout <= 0) {
            console.warn(`Invalid OPPORTUNITY_REPROCESSING_DEBOUNCE_MS value: ${envTimeout}. Using default 300000ms`);
            return 300000;
        }
        
        return timeout;
    }

    /**
     * Update opportunity processing status
     * @param opportunityId - The ID of the opportunity to update
     * @param status - The processing status to set
     * @param additionalFields - Additional fields to update (startedAt, completedAt, error, duration)
     */
    private async updateOpportunityProcessingStatus(
        opportunityId: string, 
        status: ProcessingStatus, 
        additionalFields: {
            startedAt?: Date;
            completedAt?: Date;
            error?: string;
            duration?: number;
            processedActivities?: number;
            totalActivities?: number;
        } = {}
    ): Promise<void> {
        try {
            const objectId = new mongoose.Types.ObjectId(opportunityId);
            const updateFields: any = {
                'processingStatus.status': status,
            };

            // Add additional fields if provided
            if (additionalFields.startedAt) {
                updateFields['processingStatus.startedAt'] = additionalFields.startedAt;
            }
            if (additionalFields.completedAt) {
                updateFields['processingStatus.completedAt'] = additionalFields.completedAt;
            }
            if (additionalFields.error !== undefined) {
                updateFields['processingStatus.error'] = additionalFields.error;
            }
            if (additionalFields.duration !== undefined) {
                updateFields['processingStatus.duration'] = additionalFields.duration;
            }
            if (additionalFields.processedActivities !== undefined) {
                updateFields['processingStatus.processedActivities'] = additionalFields.processedActivities;
            }
            if (additionalFields.totalActivities !== undefined) {
                updateFields['processingStatus.totalActivities'] = additionalFields.totalActivities;
            }

            await Opportunity.findByIdAndUpdate(objectId, { $set: updateFields });
            console.log(`[OpportunityBatchProcessing] STATUS UPDATED for opportunity ${opportunityId}: ${status}`);
        } catch (error) {
            console.error(`[OpportunityBatchProcessing] FAILED to update status for opportunity ${opportunityId}:`, error);
        }
    }

    /**
     * Schedule opportunity reprocessing with database-backed debouncing
     * @param opportunityId - The ID of the opportunity to reprocess
     */
    public scheduleOpportunityReprocessing(opportunityId: string): void {
        console.log(`[OpportunityBatchProcessing] SCHEDULING reprocessing for opportunity: ${opportunityId}`);
        
        // Before scheduling, cancel all existing proposed actions for this opportunity
        // This prevents users from actioning stale recommendations while reprocessing is pending
        ActionPipelineService.cancelAllProposedActionsForOpportunity(opportunityId)
            .catch(error => {
                console.error(`[OpportunityBatchProcessing] FAILED to cancel proposed actions for opportunity ${opportunityId}:`, error);
                // We still proceed with scheduling even if cancellation fails
            });

        // Use the unified queue system for scheduling
        ActivityProcessingQueueService.scheduleOpportunityReprocessing(
            opportunityId,
            'Contact changes detected'
        ).then(() => {
            console.log(`[OpportunityBatchProcessing] Successfully scheduled opportunity ${opportunityId} in unified queue`);
            
        }).catch((error) => {
            console.error(`[OpportunityBatchProcessing] Failed to schedule opportunity ${opportunityId}:`, error);
        });
    }

    /**
     * Executes the actual reprocessing logic for a given opportunity.
     * This method maintains the original API but now integrates with the queue status tracking.
     * @param opportunityId - The ID of the opportunity to process.
     */
    public async processOpportunity(opportunityId: string): Promise<void> {
        const executionStartTime = new Date();
        console.log(`[OpportunityBatchProcessing] EXECUTING reprocessing for opportunity: ${opportunityId}`);

        // Always update the opportunity status to show processing started
        await this.updateOpportunityProcessingStatus(opportunityId, ProcessingStatus.PROCESSING, {
            startedAt: executionStartTime,
            error: '',
            processedActivities: 0,
            totalActivities: 0,
        });

        try {
            const objectId = new mongoose.Types.ObjectId(opportunityId);
            
            // Create a simple abort controller for backward compatibility
            const abortController = new AbortController();
            
            // Store the controller so it can be accessed for cancellation
            OpportunityBatchProcessingService.activeControllers.set(opportunityId, abortController);
            
            // Process the opportunity using the historical activity service
            await HistoricalActivityService.reprocessEntireOpportunity(objectId, abortController.signal);
            
            const executionEndTime = new Date();
            const duration = executionEndTime.getTime() - executionStartTime.getTime();
            
            // Always update the opportunity status to show processing completed
            await this.updateOpportunityProcessingStatus(opportunityId, ProcessingStatus.COMPLETED, {
                completedAt: executionEndTime,
                duration: duration,
            });
            console.log(`[OpportunityBatchProcessing] COMPLETED reprocessing for opportunity: ${opportunityId} in ${duration}ms`);

        } catch (error) {
            const executionEndTime = new Date();
            const duration = executionEndTime.getTime() - executionStartTime.getTime();
            
            if (error instanceof Error && error.name === 'AbortError') {
                console.log(`[OpportunityBatchProcessing] CANCELLED reprocessing for opportunity: ${opportunityId} after ${duration}ms`);
                await this.updateOpportunityProcessingStatus(opportunityId, ProcessingStatus.FAILED, {
                    completedAt: executionEndTime,
                    duration: duration,
                    error: 'Process was cancelled due to new changes',
                });
            } else {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                await this.updateOpportunityProcessingStatus(opportunityId, ProcessingStatus.FAILED, {
                    completedAt: executionEndTime,
                    duration: duration,
                    error: errorMessage,
                });
                console.error(`[OpportunityBatchProcessing] FAILED reprocessing for opportunity ${opportunityId} after ${duration}ms:`, error);
            }
        } finally {
            // Always clean up the active controller when processing finishes
            OpportunityBatchProcessingService.activeControllers.delete(opportunityId);
        }
    }

    /**
     * Get the current processing status of an opportunity
     * @param opportunityId - The ID of the opportunity to check
     * @returns The processing status or null if opportunity doesn't exist
     */
    public async getProcessingStatus(opportunityId: string): Promise<{
        status: ProcessingStatus;
        startedAt?: Date;
        completedAt?: Date;
        error?: string;
        duration?: number;
        isScheduled: boolean;
        isRunning: boolean;
        processedActivities?: number;
        totalActivities?: number;
    } | null> {
        try {
            const objectId = new mongoose.Types.ObjectId(opportunityId);
            const [opportunity, queueStatus] = await Promise.all([
                Opportunity.findById(objectId).select('processingStatus').lean(),
                ActivityProcessingQueueService.isOpportunityProcessing(opportunityId),
            ]);
            
            if (!opportunity) {
                return null;
            }

            return {
                status: opportunity.processingStatus?.status || ProcessingStatus.IDLE,
                startedAt: opportunity.processingStatus?.startedAt,
                completedAt: opportunity.processingStatus?.completedAt,
                error: opportunity.processingStatus?.error,
                duration: opportunity.processingStatus?.duration,
                isScheduled: queueStatus.isScheduled,
                isRunning: queueStatus.isRunning,
                processedActivities: opportunity.processingStatus?.processedActivities,
                totalActivities: opportunity.processingStatus?.totalActivities,
            };
        } catch (error) {
            console.error(`[OpportunityBatchProcessing] FAILED to get processing status for opportunity ${opportunityId}:`, error);
            return null;
        }
    }

    /**
     * Check if an opportunity has a scheduled reprocessing job
     * @param opportunityId - The ID of the opportunity to check
     * @returns True if reprocessing is scheduled, false otherwise
     */
    public async isProcessingScheduled(opportunityId: string): Promise<boolean> {
        try {
            const queueStatus = await ActivityProcessingQueueService.isOpportunityProcessing(opportunityId);
            return queueStatus.isScheduled;
        } catch (error) {
            console.error(`[OpportunityBatchProcessing] Failed to check scheduled status for ${opportunityId}:`, error);
            return false;
        }
    }

    /**
     * Check if an opportunity has a running reprocessing job
     * @param opportunityId - The ID of the opportunity to check
     * @returns True if reprocessing is running, false otherwise
     */
    public async isProcessingRunning(opportunityId: string): Promise<boolean> {
        try {
            const queueStatus = await ActivityProcessingQueueService.isOpportunityProcessing(opportunityId);
            return queueStatus.isRunning;
        } catch (error) {
            console.error(`[OpportunityBatchProcessing] Failed to check running status for ${opportunityId}:`, error);
            return false;
        }
    }

    /**
     * Cancel scheduled reprocessing for an opportunity
     * @param opportunityId - The ID of the opportunity to cancel
     * @returns True if a scheduled job was cancelled, false if none was scheduled
     */
    public async cancelScheduledProcessing(opportunityId: string): Promise<boolean> {
        try {
            const cancelled = await ActivityProcessingQueueService.cancelOpportunityReprocessing(opportunityId);
            if (cancelled) {
                console.log(`[OpportunityBatchProcessing] CANCELLED scheduled processing for opportunity: ${opportunityId}`);
            }
            return cancelled;
        } catch (error) {
            console.error(`[OpportunityBatchProcessing] Failed to cancel scheduled processing for ${opportunityId}:`, error);
            return false;
        }
    }

    /**
     * Cancel running reprocessing for an opportunity
     * Note: In the unified queue system, this is handled at the queue level
     * @param opportunityId - The ID of the opportunity to cancel
     * @returns True if a running job was cancelled, false if none was running
     */
    public async cancelRunningProcessing(opportunityId: string): Promise<boolean> {
        try {
            // First, try to abort the running process by calling abort() on the active controller
            const activeController = OpportunityBatchProcessingService.activeControllers.get(opportunityId);
            if (activeController) {
                console.log(`[OpportunityBatchProcessing] Aborting active controller for opportunity: ${opportunityId}`);
                activeController.abort();
                // Controller will be cleaned up in the finally block of processOpportunity
            }

            // Find a queue item that is currently processing for this opportunity
            const processingItem = await ActivityProcessingQueue.findOne({
                opportunity: new mongoose.Types.ObjectId(opportunityId),
                queueItemType: 'opportunity_reprocessing',
                status: 'processing',
            });

            if (processingItem) {
                // Mark the queue item as failed/cancelled
                await ActivityProcessingQueueService.markAsFailed(processingItem._id, 'Cancelled by user');
            }

            // Update the opportunity processing status as failed
            await this.updateOpportunityProcessingStatus(opportunityId, ProcessingStatus.FAILED, {
                completedAt: new Date(),
                duration: 0,
                error: 'Process was cancelled by user',
            });

            console.log(`[OpportunityBatchProcessing] CANCELLED running processing for opportunity: ${opportunityId}`);
            return true; // Return true even if we didn't find a queue item to ensure caller treats this as cancelled
        } catch (error) {
            console.error(`[OpportunityBatchProcessing] Failed to cancel running processing for ${opportunityId}:`, error);
            return false;
        }
    }

    /**
     * Restart batch processing for an opportunity (cancel current and reschedule)
     * This is used when historical activities arrive during ongoing batch processing
     * @param opportunityId - The ID of the opportunity to restart
     * @param reason - Reason for the restart
     * @returns True if restart was successful
     */
    public async restartBatchProcessing(opportunityId: string, reason: string = 'Historical activity detected'): Promise<boolean> {
        console.log(`[OpportunityBatchProcessing] RESTARTING batch processing for opportunity: ${opportunityId} - ${reason}`);
        
        try {
            // First, cancel any running processing
            await this.cancelRunningProcessing(opportunityId);
            
            // Cancel any scheduled processing
            await this.cancelScheduledProcessing(opportunityId);
            
            // Schedule new processing
            this.scheduleOpportunityReprocessing(opportunityId);
            
            console.log(`[OpportunityBatchProcessing] Successfully restarted batch processing for opportunity: ${opportunityId}`);
            return true;
        } catch (error) {
            console.error(`[OpportunityBatchProcessing] Failed to restart batch processing for ${opportunityId}:`, error);
            return false;
        }
    }

    /**
     * Cleanup method - now primarily for backward compatibility
     * The unified queue system handles persistence, so no in-memory cleanup is needed
     */
    public cleanup(): void {
        console.log(`[OpportunityBatchProcessing] CLEANUP called - unified queue system handles persistence automatically`);
    }

    /**
     * Get the number of active timers - now returns queue status instead
     * @returns Number of scheduled opportunity reprocessing items
     */
    public async getActiveTimerCount(): Promise<number> {
        try {
            const queueStats = await ActivityProcessingQueueService.getQueueStats();
            return queueStats.opportunityReprocessing.scheduled + queueStats.opportunityReprocessing.pending;
        } catch (error) {
            console.error(`[OpportunityBatchProcessing] Failed to get active timer count:`, error);
            return 0;
        }
    }

    /**
     * Check if an opportunity has an active abort controller (is currently running)
     * @param opportunityId - The ID of the opportunity to check
     * @returns True if there's an active controller, false otherwise
     */
    public hasActiveController(opportunityId: string): boolean {
        return OpportunityBatchProcessingService.activeControllers.has(opportunityId);
    }

    /**
     * Get the list of opportunity IDs that have active controllers (for debugging)
     * @returns Array of opportunity IDs with active processing
     */
    public getActiveOpportunityIds(): string[] {
        return Array.from(OpportunityBatchProcessingService.activeControllers.keys());
    }

    /**
     * Get count of active controllers (for monitoring)
     * @returns Number of opportunities currently being processed
     */
    public getActiveControllerCount(): number {
        return OpportunityBatchProcessingService.activeControllers.size;
    }
}

// Export singleton instance
export const opportunityBatchProcessingService = new OpportunityBatchProcessingService(); 