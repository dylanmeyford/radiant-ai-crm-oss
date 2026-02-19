import { Router } from 'express';
import { AIUsageController } from '../controllers/aiUsageController';
import { protect } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(protect);

/**
 * @route GET /api/ai-usage/current
 * @desc Get current month's AI usage for the authenticated user's organization
 * @access Private
 */
router.get('/current', AIUsageController.getCurrentMonthUsage);

/**
 * @route GET /api/ai-usage/history
 * @desc Get AI usage history for multiple months
 * @query months - Number of months to retrieve (default: 6, max: 24)
 * @access Private
 */
router.get('/history', AIUsageController.getUsageHistory);

/**
 * @route GET /api/ai-usage/:year/:month
 * @desc Get AI usage for a specific month
 * @param year - Year (e.g., 2025)
 * @param month - Month (1-12)
 * @access Private
 */
router.get('/:year/:month', AIUsageController.getMonthlyUsage);

export default router;

