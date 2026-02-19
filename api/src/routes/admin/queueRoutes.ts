import { Router, Request, Response } from 'express';
import { protect } from '../../middleware/auth';
import { ActivityProcessingQueueService } from '../../services/activityProcessingService/activityProcessingQueueService';
import { QueueWorkerService } from '../../services/activityProcessingService/queueWorkerService';

const router = Router();

/**
 * Get queue status and statistics
 */
router.get('/status', protect, async (req: Request, res: Response) => {
  try {
    const status = await QueueWorkerService.getQueueStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting queue status'
    });
  }
});

/**
 * Get pending activities for a specific prospect
 */
router.get('/prospect/:prospectId/pending', protect, async (req: Request, res: Response) => {
  try {
    const { prospectId } = req.params;
    const pendingActivities = await ActivityProcessingQueueService.getPendingActivitiesForProspect(prospectId);
    
    res.json({
      success: true,
      data: {
        prospectId,
        pendingCount: pendingActivities.length,
        activities: pendingActivities
      }
    });
  } catch (error) {
    console.error('Error getting pending activities:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting pending activities'
    });
  }
});

/**
 * Force process all pending activities for a specific prospect
 */
router.post('/prospect/:prospectId/force-process', protect, async (req: Request, res: Response) => {
  try {
    const { prospectId } = req.params;
    
    await QueueWorkerService.forceProcessProspect(prospectId);
    
    res.json({
      success: true,
      message: `Force processing completed for prospect ${prospectId}`
    });
  } catch (error) {
    console.error('Error force processing prospect:', error);
    res.status(500).json({
      success: false,
      message: 'Error force processing prospect'
    });
  }
});

/**
 * Clean up old completed queue items
 */
router.post('/cleanup', protect, async (req: Request, res: Response) => {
  try {
    const { olderThanDays = 7 } = req.body;
    const deletedCount = await ActivityProcessingQueueService.cleanupCompletedItems(olderThanDays);
    
    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} completed queue items`,
      data: { deletedCount, olderThanDays }
    });
  } catch (error) {
    console.error('Error cleaning up queue:', error);
    res.status(500).json({
      success: false,
      message: 'Error cleaning up queue'
    });
  }
});

/**
 * Reset stuck processing items
 */
router.post('/reset-stuck', protect, async (req: Request, res: Response) => {
  try {
    const resetCount = await ActivityProcessingQueueService.resetStuckProcessingItems();
    
    res.json({
      success: true,
      message: `Reset ${resetCount} stuck processing items`,
      data: { resetCount }
    });
  } catch (error) {
    console.error('Error resetting stuck items:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting stuck items'
    });
  }
});

export default router; 