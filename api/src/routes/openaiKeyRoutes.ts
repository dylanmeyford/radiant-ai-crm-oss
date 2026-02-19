import express from 'express';
import { protect } from '../middleware/auth';
import {
  deleteOpenAIKey,
  getOpenAIKeyStatus,
  setOpenAIKey,
  validateOpenAIKey,
} from '../controllers/openaiKeyController';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.get('/openai-key/status', getOpenAIKeyStatus);
router.post('/openai-key', setOpenAIKey);
router.delete('/openai-key', deleteOpenAIKey);
router.post('/openai-key/validate', validateOpenAIKey);

export default router;
