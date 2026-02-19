import { Router, Request, Response } from 'express';
import { protect } from '../../middleware/auth';
import meetingPrepSchedulerService from '../../schedulers/MeetingPrepSchedulerService';

const router = Router();

/**
 * Get meeting preparation scheduler status
 */
router.get('/status', protect, async (req: Request, res: Response) => {
  try {
    const status = meetingPrepSchedulerService.getStatus();
    res.json({
      success: true,
      data: {
        scheduler: status,
        description: {
          running: 'Whether the scheduler is active and will run on schedule',
          processing: 'Whether a job is currently being processed',
          schedule: 'Runs every hour to check for meetings in the next 24 hours needing agenda preparation',
          lookAhead: '24 hours from current time',
          agendaGeneration: 'Uses MeetingPrepAgent to create comprehensive meeting agendas'
        }
      }
    });
  } catch (error) {
    console.error('Error getting meeting preparation scheduler status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting scheduler status'
    });
  }
});

/**
 * Manually trigger the meeting preparation process
 */
router.post('/trigger', protect, async (req: Request, res: Response) => {
  try {
    console.log(`Meeting preparation process triggered manually by user: ${req.user?.email}`);
    
    const result = await meetingPrepSchedulerService.triggerMeetingPreparation();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        triggeredBy: req.user?.email,
        triggeredAt: new Date().toISOString(),
        processedCount: result.processedCount,
        errorCount: result.errorCount
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('Error triggering meeting preparation process:', error);
    res.status(500).json({
      success: false,
      message: 'Error triggering meeting preparation process'
    });
  }
});

/**
 * Generate meeting agenda for a specific meeting
 */
router.post('/generate-agenda/:meetingId', protect, async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;
    
    if (!meetingId) {
      res.status(400).json({
        success: false,
        message: 'Meeting ID is required'
      });
      return;
    }

    console.log(`Meeting agenda generation triggered for meeting ${meetingId} by user: ${req.user?.email}`);
    
    const result = await meetingPrepSchedulerService.generateMeetingAgendaById(meetingId);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        agenda: result.agenda,
        meetingId,
        triggeredBy: req.user?.email,
        triggeredAt: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        meetingId
      });
    }
  } catch (error) {
    console.error('Error generating meeting agenda:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating meeting agenda'
    });
  }
});

export default router;
