import express from 'express';
import { getProviders } from '../controllers/directoryController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All directory routes are protected
router.use(protect);

// GET /api/directory/providers
router.get('/providers', getProviders);

export default router;
