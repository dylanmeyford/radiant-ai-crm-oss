import express from 'express';
import {
  getMinedDeals,
  getPendingCount,
  acceptMinedDeal,
  dismissMinedDeal,
  snoozeMinedDeal,
  triggerMining,
} from '../controllers/minedDealController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All routes are protected
router.use(protect);

// Get all pending/snoozed mined deals
router.get('/', getMinedDeals);

// Get count of pending deals (for notification badge)
router.get('/count', getPendingCount);

// Accept a mined deal (creates prospect + opportunity)
router.post('/:id/accept', acceptMinedDeal);

// Dismiss a mined deal permanently
router.post('/:id/dismiss', dismissMinedDeal);

// Snooze a mined deal (check again later)
router.post('/:id/snooze', snoozeMinedDeal);

// Manually trigger deal mining
router.post('/mine-now', triggerMining);

export default router;
