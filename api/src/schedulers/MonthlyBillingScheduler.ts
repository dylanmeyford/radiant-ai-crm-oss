import cron from 'node-cron';
import Organization from '../models/Organization';
import * as StripeService from '../services/StripeService';

/**
 * Monthly Billing Scheduler
 * 
 * Runs on the 1st of each month at 2:00 AM
 * Creates invoices for AI usage from the previous month
 */

class MonthlyBillingScheduler {
  private cronJob: cron.ScheduledTask | null = null;

  /**
   * Start the monthly billing scheduler
   */
  public start() {
    // Run on the 1st day of every month at 2:00 AM
    // Cron format: minute hour day month dayOfWeek
    this.cronJob = cron.schedule('0 2 1 * *', async () => {
      console.log('[MONTHLY-BILLING] Starting monthly AI usage billing...');
      await this.processMonthlyBilling();
    });

    console.log('[MONTHLY-BILLING] Monthly billing scheduler started (runs 1st of month at 2 AM)');
  }

  /**
   * Stop the scheduler
   */
  public stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('[MONTHLY-BILLING] Monthly billing scheduler stopped');
    }
  }

  /**
   * Process monthly billing for all organizations
   */
  private async processMonthlyBilling() {
    try {
      // Calculate previous month
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = lastMonth.getFullYear();
      const month = lastMonth.getMonth() + 1; // 1-indexed

      console.log(`[MONTHLY-BILLING] Processing AI usage for ${year}-${month}`);

      // Find all organizations with active subscriptions
      const organizations = await Organization.find({
        stripeCustomerId: { $exists: true, $ne: null },
        stripeSubscriptionId: { $exists: true, $ne: null },
        subscriptionStatus: 'active',
      });

      console.log(`[MONTHLY-BILLING] Found ${organizations.length} organizations with active subscriptions`);

      let successCount = 0;
      let errorCount = 0;
      let totalRevenue = 0;

      // Process each organization
      for (const org of organizations) {
        try {
          const invoiceId = await StripeService.createUsageInvoice(
            org.stripeCustomerId!,
            org.id,
            year,
            month
          );

          if (invoiceId) {
            successCount++;
            
            // Calculate revenue for logging
            const { totalCost } = await StripeService.calculateMonthlyAIUsage(
              org.id,
              year,
              month
            );
            totalRevenue += totalCost;

            console.log(
              `[MONTHLY-BILLING] Created invoice ${invoiceId} for org ${org.name} ($${totalCost.toFixed(2)})`
            );
          }
        } catch (error: any) {
          errorCount++;
          console.error(
            `[MONTHLY-BILLING] Error creating invoice for org ${org.name}:`,
            error.message
          );
        }

        // Add small delay between organizations to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(
        `[MONTHLY-BILLING] Completed! Created ${successCount} invoices, ${errorCount} errors, total revenue: $${totalRevenue.toFixed(2)}`
      );
    } catch (error: any) {
      console.error('[MONTHLY-BILLING] Error in monthly billing process:', error);
    }
  }

  /**
   * Manually trigger monthly billing (for testing)
   * @param year - Year to bill for
   * @param month - Month to bill for (1-12)
   */
  public async runManual(year: number, month: number) {
    console.log(`[MONTHLY-BILLING] Manual run for ${year}-${month}`);
    
    const organizations = await Organization.find({
      stripeCustomerId: { $exists: true, $ne: null },
      stripeSubscriptionId: { $exists: true, $ne: null },
      subscriptionStatus: 'active',
    });

    for (const org of organizations) {
      try {
        const invoiceId = await StripeService.createUsageInvoice(
          org.stripeCustomerId!,
          org.id,
          year,
          month
        );

        if (invoiceId) {
          console.log(`[MONTHLY-BILLING] Created invoice ${invoiceId} for org ${org.name}`);
        }
      } catch (error: any) {
        console.error(`[MONTHLY-BILLING] Error for org ${org.name}:`, error.message);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('[MONTHLY-BILLING] Manual run completed');
  }
}

// Export singleton instance
export const monthlyBillingScheduler = new MonthlyBillingScheduler();
export default monthlyBillingScheduler;

