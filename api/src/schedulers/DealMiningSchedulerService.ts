import cron from 'node-cron';
import chalk from 'chalk';
import NylasConnection from '../models/NylasConnection';
import { DealMiningService } from '../services/dealMining/DealMiningService';

/**
 * Configuration for deal mining scheduler
 */
const SCHEDULER_CONFIG = {
  // Delay between processing different users to avoid overwhelming Nylas
  delayBetweenUsers: 2000, // 2 seconds
};

/**
 * DealMiningSchedulerService
 * 
 * Handles weekly scheduled deal mining across all users with active Nylas connections.
 * Scans email accounts for potential prospects that haven't been tracked.
 */
class DealMiningSchedulerService {
  private schedulerTask: cron.ScheduledTask;
  private isRunning: boolean = false;
  private isSchedulerRunning: boolean = false;
  
  constructor() {
    // Schedule to run every Sunday at 3am
    // Cron pattern: '0 3 * * 0' means "at 03:00 on Sunday"
    this.schedulerTask = cron.schedule('0 3 * * 0', this.processDealMining.bind(this), {
      scheduled: false, // Don't start automatically, will be started manually
    });
  }
  
  /**
   * Start the scheduler
   */
  public start(): void {
    if (this.isSchedulerRunning) {
      console.log(chalk.yellow('[DEAL-MINING-SCHEDULER] Scheduler already running'));
      return;
    }
    
    console.log(chalk.blue.bold('[DEAL-MINING-SCHEDULER] Starting weekly scheduler (Sunday 3am)...'));
    this.schedulerTask.start();
    this.isSchedulerRunning = true;
  }
  
  /**
   * Stop the scheduler
   */
  public stop(): void {
    if (!this.isSchedulerRunning) {
      return;
    }
    
    console.log(chalk.blue('[DEAL-MINING-SCHEDULER] Stopping scheduler...'));
    this.schedulerTask.stop();
    this.isSchedulerRunning = false;
  }
  
  /**
   * Main processing method - runs weekly
   * Mines deals for all users with active Nylas connections
   */
  private async processDealMining(): Promise<void> {
    if (this.isRunning) {
      console.log(chalk.yellow('[DEAL-MINING-SCHEDULER] Previous job still running, skipping...'));
      return;
    }
    
    this.isRunning = true;
    const startTime = Date.now();
    
    console.log(chalk.blue.bold('[DEAL-MINING-SCHEDULER] Starting weekly deal mining...'));
    
    try {
      // Get all active Nylas connections
      const connections = await NylasConnection.find({
        syncStatus: 'active',
      }).select('user').lean();
      
      // Dedupe by user (a user might have multiple connections)
      const userIds = [...new Set(connections.map(c => c.user.toString()))];
      
      console.log(chalk.cyan(`[DEAL-MINING-SCHEDULER] Mining for ${userIds.length} users with active connections...`));
      
      let totalDealsFound = 0;
      let usersProcessed = 0;
      let usersWithErrors = 0;
      
      for (const userId of userIds) {
        try {
          const deals = await DealMiningService.mineDealsForUser(userId, {
            isNewConnection: false, // Weekly scan uses shorter lookback
          });
          
          totalDealsFound += deals.length;
          usersProcessed++;
          
          // Rate limit: delay between users
          if (usersProcessed < userIds.length) {
            await this.sleep(SCHEDULER_CONFIG.delayBetweenUsers);
          }
          
        } catch (error) {
          usersWithErrors++;
          console.error(chalk.red(`[DEAL-MINING-SCHEDULER] Error processing user ${userId}:`), error);
          // Continue with next user
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(chalk.green.bold('[DEAL-MINING-SCHEDULER] Weekly mining complete:'));
      console.log(chalk.green(`  - Duration: ${Math.round(duration / 1000)}s`));
      console.log(chalk.green(`  - Users processed: ${usersProcessed}/${userIds.length}`));
      console.log(chalk.green(`  - Users with errors: ${usersWithErrors}`));
      console.log(chalk.green(`  - Total new deals found: ${totalDealsFound}`));
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(chalk.red(`[DEAL-MINING-SCHEDULER] Fatal error during weekly mining after ${duration}ms:`), error);
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * Manually trigger deal mining (useful for testing)
   */
  public async triggerManualMining(): Promise<{ usersProcessed: number; totalDeals: number }> {
    if (this.isRunning) {
      throw new Error('Deal mining is already running');
    }
    
    console.log(chalk.blue.bold('[DEAL-MINING-SCHEDULER] Manual mining triggered...'));
    
    // Run the mining process
    await this.processDealMining();
    
    // Return summary (the actual processing logs details)
    return {
      usersProcessed: 0, // Logged in processDealMining
      totalDeals: 0,
    };
  }
  
  /**
   * Helper: sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const dealMiningSchedulerService = new DealMiningSchedulerService();
