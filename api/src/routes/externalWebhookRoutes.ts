import express from 'express';
import { createOpportunityWebhook, ingestTranscriptFromWebhook } from '../controllers/externalWebhookController';
import { apiKeyAuth } from '../middleware/apiKeyAuth';

const router = express.Router();

router.post('/opportunities', apiKeyAuth, createOpportunityWebhook);
router.post('/transcripts', apiKeyAuth, ingestTranscriptFromWebhook);

export default router;


