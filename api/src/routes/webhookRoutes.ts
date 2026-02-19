import express from 'express';
import { receiveNylasWebhook } from '../controllers/nylasController';


const router = express.Router();

router.get('/nylas', receiveNylasWebhook);
router.post('/nylas', receiveNylasWebhook);

export default router;
