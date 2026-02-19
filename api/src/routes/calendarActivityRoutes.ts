import express from 'express';
import { 
  getCalendarActivities, 
  getCalendarActivity, 
  updateCalendarActivity, 
  deleteCalendarActivity,
  updateCalendarActivityStatus,
  getUpcomingCalendarActivities,
  getRecordedActivities,
  getRecordedActivity,
  getRecordedActivityMediaFile,
  getOpportunityCalendarActivities,
  upsertTranscriptForActivity,
} from '../controllers/calendarActivityController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All routes are protected
router.use(protect);

// Calendar Activity routes
router.get('/', getCalendarActivities);
router.get('/opportunity/:id', getOpportunityCalendarActivities);
router.get('/upcoming', getUpcomingCalendarActivities);
router.get('/recorded', getRecordedActivities);
router.get('/recorded/:id', getRecordedActivity);
router.get('/recorded/:id/media/:mediaType', getRecordedActivityMediaFile);

router.get('/:id', getCalendarActivity);
router.put('/:id', updateCalendarActivity);
router.patch('/:id/status', updateCalendarActivityStatus);
router.put('/:id/transcript', upsertTranscriptForActivity);
router.delete('/:id', deleteCalendarActivity);

export default router; 