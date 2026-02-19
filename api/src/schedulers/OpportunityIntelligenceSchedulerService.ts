import cron from 'node-cron';
import chalk from 'chalk';
import mongoose from 'mongoose';
import Opportunity, { IOpportunity } from '../models/Opportunity';
import PipelineStage from '../models/PipelineStage';
import { ProposedAction } from '../models/ProposedAction';
import ActivityProcessingQueue from '../models/ActivityProcessingQueue';
import { ActionPipelineService } from '../services/AI/actionPipeline/ActionPipelineService';

/**
 * OpportunityIntelligenceSchedulerService
 * 
 * Handles scheduling intelligence updates for opportunities based on their status:
 * - Active opportunities: trigger generateProposedActions after 7 days from lastIntelligenceUpdateTimestamp
 * - Closed-lost opportunities: trigger generateProposedActions once a quarter (90 days) after lastIntelligenceUpdateTimestamp
 * 
 * Excludes opportunities that already have pending proposed actions (status: 'PROPOSED') to avoid duplicates.
 */

class OpportunityIntelligenceSchedulerService {
  private schedulerTask: cron.ScheduledTask;
  private isRunning: boolean = false;
  private isSchedulerRunning: boolean = false;

  constructor() {
    // Schedule a task to run every hour to check for opportunities needing intelligence updates
    // Running hourly provides good balance between responsiveness and resource usage
    this.schedulerTask = cron.schedule('0 * * * *', this.processOpportunityIntelligenceUpdates.bind(this), {
      scheduled: false // Don't start automatically, will be started manually
    });
  }

  /**
   * Start the scheduler
   */
  public start(): void {
    console.log(chalk.blue.bold('[OPPORTUNITY INTELLIGENCE SCHEDULER] Starting scheduler...'));
    this.schedulerTask.start();
    this.isSchedulerRunning = true;
    console.log(chalk.green('[OPPORTUNITY INTELLIGENCE SCHEDULER] Scheduler started'));
  }

  /**
   * Stop the scheduler
   */
  public stop(): void {
    console.log(chalk.yellow('[OPPORTUNITY INTELLIGENCE SCHEDULER] Stopping scheduler...'));
    this.schedulerTask.stop();
    this.isSchedulerRunning = false;
    console.log(chalk.red('[OPPORTUNITY INTELLIGENCE SCHEDULER] Scheduler stopped'));
  }

  /**
   * Process opportunities that need intelligence updates based on their status and timing
   */
  private async processOpportunityIntelligenceUpdates(): Promise<void> {
    if (this.isRunning) {
      console.log(chalk.yellow('[OPPORTUNITY INTELLIGENCE SCHEDULER] Previous job still running, skipping...'));
      return;
    }

    this.isRunning = true;
    console.log(chalk.blue.bold('[OPPORTUNITY INTELLIGENCE SCHEDULER] Starting opportunity intelligence update check...'));

    try {
      const now = new Date();
      
      // Process opportunities with actions that have dates matching today
      await this.processOpportunitiesByActionDates(now);
      
      // Process active opportunities (7-day threshold)
      await this.processActiveOpportunities(now);
      
      // Process closed-lost opportunities (90-day threshold)
      await this.processClosedLostOpportunities(now);

      console.log(chalk.green('[OPPORTUNITY INTELLIGENCE SCHEDULER] Completed opportunity intelligence update check'));

    } catch (error) {
      console.error(chalk.red('[OPPORTUNITY INTELLIGENCE SCHEDULER] Error during processing:'), error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get opportunity IDs that don't have any pending proposed actions
   */
  private async getOpportunityIdsWithoutPendingActions(opportunityIds: mongoose.Types.ObjectId[]): Promise<mongoose.Types.ObjectId[]> {
    if (opportunityIds.length === 0) {
      return [];
    }

    // Find opportunities that have proposed actions with status 'PROPOSED'
    const opportunitiesWithProposedActions = await ProposedAction.distinct('opportunity', {
      opportunity: { $in: opportunityIds },
      status: 'PROPOSED'
    });

    // Filter out opportunities that have pending proposed actions
    return opportunityIds.filter(id => 
      !opportunitiesWithProposedActions.some(proposedOpportunityId => 
        proposedOpportunityId.toString() === id.toString()
      )
    );
  }

  /**
   * Filter out opportunities that are currently scheduled or processing in the activity processing queue
   * - Excludes opportunities with pending/processing opportunity reprocessing items
   * - Excludes opportunities whose prospect has pending/processing activity items
   */
  private async filterOutQueuedOpportunities(opportunities: IOpportunity[]): Promise<IOpportunity[]> {
    if (!opportunities || opportunities.length === 0) {
      return [];
    }

    const opportunityIds = opportunities.map(opp => opp._id as mongoose.Types.ObjectId);
    const prospectIds = opportunities
      .map(opp => opp.prospect as mongoose.Types.ObjectId)
      .filter(id => !!id);

    const [blockedOpportunityIds, blockedProspectIds] = await Promise.all([
      // Opportunity-level reprocessing queued or processing
      ActivityProcessingQueue.distinct('opportunity', {
        opportunity: { $in: opportunityIds },
        queueItemType: 'opportunity_reprocessing',
        status: { $in: ['pending', 'processing'] },
      }),
      // Prospect-level activity processing queued or processing
      ActivityProcessingQueue.distinct('prospect', {
        prospect: { $in: prospectIds },
        queueItemType: 'activity',
        status: { $in: ['pending', 'processing'] },
      }),
    ]);

    const blockedOppSet = new Set(blockedOpportunityIds.map(id => id.toString()));
    const blockedProspectSet = new Set(blockedProspectIds.map(id => id.toString()));

    return opportunities.filter(opp => {
      const oppId = (opp._id as mongoose.Types.ObjectId).toString();
      const prospectId = (opp.prospect as mongoose.Types.ObjectId)?.toString();
      return !blockedOppSet.has(oppId) && (!prospectId || !blockedProspectSet.has(prospectId));
    });
  }

  /**
   * Process active opportunities that need intelligence updates after 7 days
   */
  private async processActiveOpportunities(now: Date): Promise<void> {
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    
    try {
      // Get all pipeline stages that are closed-won or closed-lost
      const closedStages = await PipelineStage.find({ 
        $or: [{ isClosedWon: true }, { isClosedLost: true }] 
      }).select('_id');
      const closedStageIds = closedStages.map(stage => stage._id);

      // Find active opportunities where lastIntelligenceUpdateTimestamp is older than 7 days
      const candidateOpportunities = await Opportunity.find({
        stage: { $nin: closedStageIds },
        contacts: { $not: { $size: 0 } },
        $or: [
          { lastIntelligenceUpdateTimestamp: { $lt: sevenDaysAgo } },
          { lastIntelligenceUpdateTimestamp: { $exists: false } }
        ]
      }).select('_id name stage lastIntelligenceUpdateTimestamp prospect');

      if (candidateOpportunities.length === 0) {
        console.log(chalk.cyan('[OPPORTUNITY INTELLIGENCE SCHEDULER] No active opportunities need intelligence updates'));
        return;
      }

      // Filter out opportunities that already have pending proposed actions
      const opportunityIds = candidateOpportunities.map(opp => opp._id as mongoose.Types.ObjectId);
      const filteredOpportunityIds = await this.getOpportunityIdsWithoutPendingActions(opportunityIds);

      const afterPendingActions = candidateOpportunities.filter(opp =>
        filteredOpportunityIds.some(id => id.toString() === opp._id.toString())
      );

      // Further filter out opportunities that are queued for activity/opportunity processing
      const activeOpportunities = await this.filterOutQueuedOpportunities(afterPendingActions);

      if (activeOpportunities.length === 0) {
        console.log(chalk.cyan('[OPPORTUNITY INTELLIGENCE SCHEDULER] No active opportunities need intelligence updates (all have pending proposed actions)'));
        return;
      }

      const skippedByPendingActions = candidateOpportunities.length - afterPendingActions.length;
      const skippedByQueue = afterPendingActions.length - activeOpportunities.length;
      const totalSkipped = candidateOpportunities.length - activeOpportunities.length;
      console.log(chalk.cyan(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Found ${activeOpportunities.length} active opportunities needing intelligence updates${totalSkipped > 0 ? ` (${totalSkipped} skipped: ${skippedByPendingActions} due to pending actions, ${skippedByQueue} due to activity/reprocessing queue)` : ''}`));

      // Process each opportunity
      for (const opportunity of activeOpportunities) {
        await this.processOpportunityIntelligenceUpdate(opportunity, 'active');
      }

    } catch (error) {
      console.error(chalk.red('[OPPORTUNITY INTELLIGENCE SCHEDULER] Error processing active opportunities:'), error);
    }
  }

  /**
   * Process closed-lost opportunities that need intelligence updates after 90 days (quarterly)
   */
  private async processClosedLostOpportunities(now: Date): Promise<void> {
    const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    try {
      // First, get all pipeline stages that are closed-lost
      const closedLostStages = await PipelineStage.find({ isClosedLost: true }).select('_id');
      const closedLostStageIds = closedLostStages.map(stage => stage._id);

      if (closedLostStageIds.length === 0) {
        console.log(chalk.cyan('[OPPORTUNITY INTELLIGENCE SCHEDULER] No closed-lost pipeline stages found'));
        return;
      }

      // Find closed-lost opportunities where lastIntelligenceUpdateTimestamp is older than 90 days
      const candidateOpportunities = await Opportunity.find({
        stage: { $in: closedLostStageIds },
        $or: [
          { lastIntelligenceUpdateTimestamp: { $lt: ninetyDaysAgo } },
          { lastIntelligenceUpdateTimestamp: { $exists: false } }
        ]
      }).select('_id name stage lastIntelligenceUpdateTimestamp actualCloseDate prospect');

      if (candidateOpportunities.length === 0) {
        console.log(chalk.cyan('[OPPORTUNITY INTELLIGENCE SCHEDULER] No closed-lost opportunities need intelligence updates'));
        return;
      }

      // Get all pipeline stages that are closed-won or closed-lost for filtering active opportunities
      const closedStages = await PipelineStage.find({ 
        $or: [{ isClosedWon: true }, { isClosedLost: true }] 
      }).select('_id');
      const closedStageIds = closedStages.map(stage => stage._id);

      // Filter out opportunities where the prospect has active opportunities
      const prospectIds = candidateOpportunities.map(opp => opp.prospect);
      const prospectsWithActiveOpportunities = await Opportunity.distinct('prospect', {
        prospect: { $in: prospectIds },
        stage: { $nin: closedStageIds }
      });

      const opportunitiesWithoutActiveProspects = candidateOpportunities.filter(opp => 
        !prospectsWithActiveOpportunities.some(prospectId => 
          prospectId.toString() === opp.prospect.toString()
        )
      );

      if (opportunitiesWithoutActiveProspects.length === 0) {
        const excludedCount = candidateOpportunities.length;
        console.log(chalk.cyan(`[OPPORTUNITY INTELLIGENCE SCHEDULER] No closed-lost opportunities need intelligence updates (all ${excludedCount} excluded because prospects have active opportunities)`));
        return;
      }

      const excludedByActiveProspectsCount = candidateOpportunities.length - opportunitiesWithoutActiveProspects.length;
      if (excludedByActiveProspectsCount > 0) {
        console.log(chalk.cyan(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Excluded ${excludedByActiveProspectsCount} closed-lost opportunities because prospects have active opportunities`));
      }

      // Filter out opportunities that already have pending proposed actions
      const opportunityIds = opportunitiesWithoutActiveProspects.map(opp => opp._id as mongoose.Types.ObjectId);
      const filteredOpportunityIds = await this.getOpportunityIdsWithoutPendingActions(opportunityIds);

      const afterPendingActions = opportunitiesWithoutActiveProspects.filter(opp =>
        filteredOpportunityIds.some(id => id.toString() === opp._id.toString())
      );

      // Further filter out opportunities that are queued for activity/opportunity processing
      const closedLostOpportunities = await this.filterOutQueuedOpportunities(afterPendingActions);

      if (closedLostOpportunities.length === 0) {
        console.log(chalk.cyan('[OPPORTUNITY INTELLIGENCE SCHEDULER] No closed-lost opportunities need intelligence updates (all have pending proposed actions)'));
        return;
      }

      const skippedByPendingActionsCount = opportunitiesWithoutActiveProspects.length - afterPendingActions.length;
      const skippedByQueueCount = afterPendingActions.length - closedLostOpportunities.length;
      const totalSkippedCount = candidateOpportunities.length - closedLostOpportunities.length;
      console.log(chalk.cyan(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Found ${closedLostOpportunities.length} closed-lost opportunities needing intelligence updates${totalSkippedCount > 0 ? ` (${totalSkippedCount} total skipped: ${excludedByActiveProspectsCount} due to active prospects, ${skippedByPendingActionsCount} due to pending actions, ${skippedByQueueCount} due to activity/reprocessing queue)` : ''}`));

      // Process each opportunity
      for (const opportunity of closedLostOpportunities) {
        await this.processOpportunityIntelligenceUpdate(opportunity, 'closed-lost');
      }

    } catch (error) {
      console.error(chalk.red('[OPPORTUNITY INTELLIGENCE SCHEDULER] Error processing closed-lost opportunities:'), error);
    }
  }

  /**
   * Process opportunities that have EXECUTED actions with dates matching today
   * - NO_ACTION with nextReviewDate == today
   * - TASK with dueDate == today
   */
  private async processOpportunitiesByActionDates(now: Date): Promise<void> {
    try {
      // Format today's date as YYYY-MM-DD for comparison
      const todayString = now.toISOString().split('T')[0];
      console.log(chalk.blue(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Checking for actions with dates matching ${todayString}...`));

      // Find all EXECUTED actions where the date matches today
      const actionsWithMatchingDates = await ProposedAction.find({
        status: 'EXECUTED',
        $or: [
          {
            type: 'NO_ACTION',
            'details.nextReviewDate': todayString
          },
          {
            type: 'TASK',
            'details.dueDate': todayString
          }
        ]
      }).select('_id opportunity type details');

      if (actionsWithMatchingDates.length === 0) {
        console.log(chalk.cyan('[OPPORTUNITY INTELLIGENCE SCHEDULER] No actions with dates matching today'));
        return;
      }

      console.log(chalk.cyan(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Found ${actionsWithMatchingDates.length} action(s) with dates matching today`));

      // Group actions by opportunity to avoid duplicate processing
      const opportunityActionMap = new Map<string, mongoose.Types.ObjectId[]>();
      
      for (const action of actionsWithMatchingDates) {
        const oppId = action.opportunity.toString();
        if (!opportunityActionMap.has(oppId)) {
          opportunityActionMap.set(oppId, []);
        }
        opportunityActionMap.get(oppId)!.push(action._id as mongoose.Types.ObjectId);
      }

      console.log(chalk.cyan(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Actions span ${opportunityActionMap.size} unique opportunity/opportunities`));

      // Get the opportunity IDs
      const opportunityIds = Array.from(opportunityActionMap.keys()).map(id => new mongoose.Types.ObjectId(id));

      // Filter out opportunities that already have pending proposed actions
      const filteredOpportunityIds = await this.getOpportunityIdsWithoutPendingActions(opportunityIds);

      if (filteredOpportunityIds.length === 0) {
        console.log(chalk.cyan('[OPPORTUNITY INTELLIGENCE SCHEDULER] No opportunities to process (all have pending proposed actions)'));
        return;
      }

      // Fetch the actual opportunity documents for further filtering
      const candidateOpportunities = await Opportunity.find({
        _id: { $in: filteredOpportunityIds }
      }).select('_id name stage lastIntelligenceUpdateTimestamp prospect');

      // Further filter out opportunities that are queued for activity/opportunity processing
      const opportunitiesToProcess = await this.filterOutQueuedOpportunities(candidateOpportunities);

      if (opportunitiesToProcess.length === 0) {
        const skippedCount = opportunityActionMap.size - opportunitiesToProcess.length;
        console.log(chalk.cyan(`[OPPORTUNITY INTELLIGENCE SCHEDULER] No opportunities to process from date-based actions (${skippedCount} skipped due to pending actions or queue)`));
        return;
      }

      const skippedByPendingActions = opportunityActionMap.size - filteredOpportunityIds.length;
      const skippedByQueue = filteredOpportunityIds.length - opportunitiesToProcess.length;
      const totalSkipped = opportunityActionMap.size - opportunitiesToProcess.length;
      
      console.log(chalk.cyan(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Processing ${opportunitiesToProcess.length} opportunity/opportunities from date-based actions${totalSkipped > 0 ? ` (${totalSkipped} skipped: ${skippedByPendingActions} due to pending actions, ${skippedByQueue} due to queue)` : ''}`));

      // Process each opportunity and mark their associated actions as processed
      for (const opportunity of opportunitiesToProcess) {
        const oppId = opportunity._id.toString();
        const actionIds = opportunityActionMap.get(oppId) || [];
        
        console.log(chalk.blue(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Processing opportunity ${opportunity.name} triggered by ${actionIds.length} action(s) with matching dates`));
        
        try {
          // Process the opportunity
          await this.processOpportunityIntelligenceUpdate(opportunity, 'active');
          
          // Mark the actions as processed
          await this.markActionsAsProcessed(actionIds);
        } catch (error) {
          console.error(chalk.red(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Error processing opportunity ${opportunity.name} from date-based actions:`), error);
          // Continue with other opportunities even if one fails
        }
      }

    } catch (error) {
      console.error(chalk.red('[OPPORTUNITY INTELLIGENCE SCHEDULER] Error processing opportunities by action dates:'), error);
    }
  }

  /**
   * Process intelligence update for a single opportunity
   */
  private async processOpportunityIntelligenceUpdate(
    opportunity: IOpportunity, 
    type: 'active' | 'closed-lost'
  ): Promise<void> {
    const opportunityId = opportunity._id as mongoose.Types.ObjectId;
    const lastUpdate = opportunity.lastIntelligenceUpdateTimestamp;
    const lastUpdateStr = lastUpdate ? lastUpdate.toISOString() : 'never';

    try {
      console.log(chalk.blue(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Processing ${type} opportunity: ${opportunity.name} (ID: ${opportunityId})`));
      console.log(chalk.gray(`  -> Last intelligence update: ${lastUpdateStr}`));

      // Generate proposed actions using the ActionPipelineService
      const proposedActions = await ActionPipelineService.generateProposedActions(opportunityId);

      // Update the lastIntelligenceUpdateTimestamp (use a stable now reference)
      const now = new Date();
      await Opportunity.findByIdAndUpdate(
        opportunityId,
        { lastIntelligenceUpdateTimestamp: now },
        { new: true }
      );

      console.log(chalk.green(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Successfully generated ${proposedActions.length} proposed actions for opportunity: ${opportunity.name}`));

    } catch (error) {
      console.error(chalk.red(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Error processing opportunity ${opportunity.name} (${opportunityId}):`), error);
      
      // Log the specific error but continue processing other opportunities
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`  -> Error details: ${errorMessage}`));
    }
  }

  /**
   * Mark actions as processed by AI after opportunity intelligence update
   */
  private async markActionsAsProcessed(actionIds: mongoose.Types.ObjectId[]): Promise<void> {
    if (actionIds.length === 0) {
      return;
    }

    try {
      const result = await ProposedAction.updateMany(
        { _id: { $in: actionIds } },
        { $set: { status: 'PROCESSED_BY_AI' } }
      );
      
      console.log(chalk.green(`[OPPORTUNITY INTELLIGENCE SCHEDULER] Marked ${result.modifiedCount} action(s) as PROCESSED_BY_AI`));
    } catch (error) {
      console.error(chalk.red('[OPPORTUNITY INTELLIGENCE SCHEDULER] Error marking actions as processed:'), error);
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  public getStatus(): { running: boolean; processing: boolean } {
    return {
      running: this.isSchedulerRunning,
      processing: this.isRunning
    };
  }

  /**
   * Manual trigger for testing purposes
   */
  public async triggerManually(): Promise<void> {
    console.log(chalk.blue.bold('[OPPORTUNITY INTELLIGENCE SCHEDULER] Manual trigger requested...'));
    await this.processOpportunityIntelligenceUpdates();
  }
}

// Export a singleton instance
export const opportunityIntelligenceScheduler = new OpportunityIntelligenceSchedulerService();
export default OpportunityIntelligenceSchedulerService;


