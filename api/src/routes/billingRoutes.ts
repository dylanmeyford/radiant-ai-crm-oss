import express from 'express';
import {
  setupBilling,
  createSubscription,
  updateSubscription,
  getBillingStatus,
  createBillingPortal,
} from '../controllers/billingController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All billing routes require authentication
router.use(protect);

/**
 * POST /api/billing/setup-billing
 * Initialize billing - creates Stripe customer and setup intent
 */
router.post('/setup-billing', setupBilling);

/**
 * POST /api/billing/create-subscription
 * Create a subscription based on connected account count
 */
router.post('/create-subscription', createSubscription);

/**
 * POST /api/billing/update-subscription
 * Update subscription when accounts are added/removed
 */
router.post('/update-subscription', updateSubscription);

/**
 * GET /api/billing/status
 * Get current billing status for the organization
 */
router.get('/status', getBillingStatus);

/**
 * POST /api/billing/portal
 * Generate Stripe billing portal session URL
 */
router.post('/portal', createBillingPortal);

export default router;

