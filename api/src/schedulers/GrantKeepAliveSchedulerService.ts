import cron from 'node-cron';
import chalk from 'chalk';
import NylasConnection, { INylasConnection } from '../models/NylasConnection';
import { performKeepAliveForGrant } from '../services/NylasService';

/**
 * GrantKeepAliveSchedulerService
 * 
 * Handles scheduling lightweight keep-alive API calls to prevent Nylas grants from expiring due to inactivity.
 * Runs every 8 hours (3 times daily) to:
 * - List messages (limit=1) - maintains email access
 * - List calendars (limit=1) - maintains calendar access
 * 
 * Only processes grants with syncStatus: 'active' to avoid wasting API calls.
 */

class GrantKeepAliveSchedulerService {
  private schedulerTask: cron.ScheduledTask;
  private isRunning: boolean = false;
  private isSchedulerRunning: boolean = false;

  constructor() {
    // Schedule a task to run every 8 hours (3 times daily)
    // Cron pattern: '0 */8 * * *' means "at minute 0 of every 8th hour"
    this.schedulerTask = cron.schedule('0 */8 * * *', this.processGrantKeepAlive.bind(this), {
      scheduled: false // Don't start automatically, will be started manually
    });
  }

  /**
   * Start the scheduler
   */
  public start(): void {
    console.log(chalk.blue.bold('[GRANT KEEP-ALIVE] Starting scheduler...'));
    this.schedulerTask.start();
    this.isSchedulerRunning = true;
    console.log(chalk.green('[GRANT KEEP-ALIVE] Scheduler started (runs every 8 hours)'));
  }

  /**
   * Stop the scheduler
   */
  public stop(): void {
    console.log(chalk.yellow('[GRANT KEEP-ALIVE] Stopping scheduler...'));
    this.schedulerTask.stop();
    this.isSchedulerRunning = false;
    console.log(chalk.red('[GRANT KEEP-ALIVE] Scheduler stopped'));
  }

  /**
   * Process keep-alive operations for all active grants
   */
  private async processGrantKeepAlive(): Promise<void> {
    if (this.isRunning) {
      console.log(chalk.yellow('[GRANT KEEP-ALIVE] Previous job still running, skipping...'));
      return;
    }

    this.isRunning = true;
    console.log(chalk.blue.bold('[GRANT KEEP-ALIVE] Starting keep-alive check for active grants...'));

    try {
      const now = new Date();
      
      // Fetch all active Nylas connections
      const activeGrants = await NylasConnection.find({
        syncStatus: 'active'
      }).select('grantId email user organization lastKeepAliveAt');

      if (activeGrants.length === 0) {
        console.log(chalk.cyan('[GRANT KEEP-ALIVE] No active grants found'));
        return;
      }

      console.log(chalk.cyan(`[GRANT KEEP-ALIVE] Found ${activeGrants.length} active grants to process`));

      let successCount = 0;
      let failureCount = 0;

      // Process each grant
      for (const grant of activeGrants) {
        try {
          await this.performKeepAliveForSingleGrant(grant, now);
          successCount++;
        } catch (error) {
          failureCount++;
          console.error(
            chalk.red(`[GRANT KEEP-ALIVE] Failed to keep-alive grant ${grant.grantId} (${grant.email}):`),
            error instanceof Error ? error.message : 'Unknown error'
          );
          // Continue processing other grants even if one fails
        }
      }

      console.log(
        chalk.green(
          `[GRANT KEEP-ALIVE] Completed keep-alive check - Success: ${successCount}, Failed: ${failureCount}`
        )
      );

    } catch (error) {
      console.error(chalk.red('[GRANT KEEP-ALIVE] Error during processing:'), error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Perform keep-alive operations for a single grant
   */
  private async performKeepAliveForSingleGrant(
    grant: INylasConnection,
    timestamp: Date
  ): Promise<void> {
    const lastKeepAlive = grant.lastKeepAliveAt;
    const lastKeepAliveStr = lastKeepAlive ? lastKeepAlive.toISOString() : 'never';

    console.log(
      chalk.blue(`[GRANT KEEP-ALIVE] Processing grant: ${grant.email} (grantId: ${grant.grantId})`)
    );
    console.log(chalk.gray(`  -> Last keep-alive: ${lastKeepAliveStr}`));

    // Perform the keep-alive API calls (list messages + list calendars)
    await performKeepAliveForGrant(grant.grantId);

    // Update the lastKeepAliveAt timestamp
    await NylasConnection.findByIdAndUpdate(
      grant._id,
      { lastKeepAliveAt: timestamp },
      { new: true }
    );

    console.log(chalk.green(`[GRANT KEEP-ALIVE] Successfully kept alive grant: ${grant.email}`));
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
    console.log(chalk.blue.bold('[GRANT KEEP-ALIVE] Manual trigger requested...'));
    await this.processGrantKeepAlive();
  }
}

// Export a singleton instance
export const grantKeepAliveScheduler = new GrantKeepAliveSchedulerService();
export default GrantKeepAliveSchedulerService;

