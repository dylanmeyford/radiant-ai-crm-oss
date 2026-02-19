import express from 'express';
import { handleStripeWebhook } from '../controllers/stripeWebhookController';

const router = express.Router();

/**
 * POST /api/webhooks/stripe
 * Stripe webhook endpoint
 * 
 * IMPORTANT: This endpoint receives the raw body from express.raw() middleware
 * configured in index.ts for signature verification
 */
router.post('/', handleStripeWebhook);

export default router;

