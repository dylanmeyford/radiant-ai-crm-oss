import { Router, Request, Response } from 'express';
import { protect } from '../../middleware/auth';
import { opportunityIntelligenceScheduler } from '../../schedulers/OpportunityIntelligenceSchedulerService';

const router = Router();

/**
 * Get opportunity intelligence scheduler status
 */
router.get('/status', protect, async (req: Request, res: Response) => {
  try {
    const status = opportunityIntelligenceScheduler.getStatus();
    res.json({
      success: true,
      data: {
        scheduler: status,
        description: {
          running: 'Whether the scheduler is active and will run on schedule',
          processing: 'Whether a job is currently being processed',
          schedule: 'Runs every hour to check for opportunities needing intelligence updates',
          activeThreshold: '7 days since last intelligence update',
          closedLostThreshold: '90 days (quarterly) since last intelligence update'
        }
      }
    });
  } catch (error) {
    console.error('Error getting opportunity intelligence scheduler status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting scheduler status'
    });
  }
});

/**
 * Manually trigger the opportunity intelligence update process
 */
router.post('/trigger', protect, async (req: Request, res: Response) => {
  try {
    console.log(`[ADMIN] Manual trigger requested by user: ${req.user?.email}`);
    
    // Trigger the scheduler manually
    await opportunityIntelligenceScheduler.triggerManually();
    
    res.json({
      success: true,
      message: 'Opportunity intelligence update process triggered successfully',
      triggeredBy: req.user?.email,
      triggeredAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error manually triggering opportunity intelligence updates:', error);
    res.status(500).json({
      success: false,
      message: 'Error triggering opportunity intelligence updates',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
