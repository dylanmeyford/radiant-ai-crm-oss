import express from 'express';
import { manualSummariseActivity } from './manualSummariseActivity';
import { addHumanSummary } from '../../controllers/emailActivitiesController';
import { protect } from '../../middleware/auth';
import { reSummariseAllEmails } from './reSummariseAllEmails';
import reprocessIntelligenceRoutes from './reprocessIntelligence';
import queueRoutes from './queueRoutes';
import opportunityIntelligenceSchedulerRoutes from './opportunityIntelligenceSchedulerRoutes';
import meetingPrepSchedulerRoutes from './meetingPrepSchedulerRoutes';

const router = express.Router();

router.post('/summarise/all', protect, reSummariseAllEmails);
router.post('/summarise/:activityId', protect, manualSummariseActivity);
router.post('/:activityId/human-summary', protect, addHumanSummary);

// Mount the reprocess intelligence routes
router.use('/reprocess-intelligence', reprocessIntelligenceRoutes);

// Mount the queue management routes
router.use('/queue', queueRoutes);

// Mount the opportunity intelligence scheduler routes
router.use('/opportunity-intelligence-scheduler', opportunityIntelligenceSchedulerRoutes);

// Mount the meeting preparation scheduler routes
router.use('/meeting-prep-scheduler', meetingPrepSchedulerRoutes);

export default router;
