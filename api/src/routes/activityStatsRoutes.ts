import { Router } from 'express';
import { protect } from '../middleware/auth';
import { getActivityStats } from '../controllers/activityStatsController';

const router = Router();

// GET /api/activity-stats
router.get('/', protect, getActivityStats);

export default router;


