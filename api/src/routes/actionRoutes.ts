import express from 'express';
import { 
  getOpportunityActions,
  getActions,
  getAction,
  approveAction,
  rejectAction,
  updateAction,
  executeAction,
  generateActions,
  reGenerateActions
} from '../controllers/actionController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All routes are protected
router.use(protect);

// Action routes - more specific routes come first

// Generate new actions for an opportunity
router.post('/opportunities/:opportunityId/generate', generateActions);
router.post('/opportunities/:opportunityId/re-generate', reGenerateActions);

// Get actions for a specific opportunity
router.get('/opportunities/:opportunityId', getOpportunityActions);

// Get all actions (with filtering and pagination)
router.get('/', getActions);

// Action-specific routes - these use actionId parameter
router.get('/:actionId', getAction);
router.put('/:actionId', updateAction);

// Action workflow routes
router.post('/:actionId/approve', approveAction);
router.post('/:actionId/reject', rejectAction);
router.post('/:actionId/execute', executeAction);

export default router; 