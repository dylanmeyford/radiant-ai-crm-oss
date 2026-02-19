import express from 'express';
import { protect, isAdmin } from '../middleware/auth';
import { listApiKeys, createApiKey, setApiKeyActive } from '../controllers/apiKeyController';

const router = express.Router();

router.use(protect, isAdmin);

router.get('/', listApiKeys);
router.post('/', createApiKey);
router.patch('/:id', setApiKeyActive);

export default router;


