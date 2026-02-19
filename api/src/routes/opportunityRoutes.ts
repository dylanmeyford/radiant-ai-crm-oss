import express from 'express';
import { 
  createOpportunity, 
  getOpportunities,
  getProspectOpportunities,
  getOpportunity, 
  updateOpportunity, 
  deleteOpportunity,
  removeContactFromOpportunity,
  getOpportunityProcessingStatus
} from '../controllers/opportunityController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All routes are protected
router.use(protect);

// Opportunity routes
router.post('/', createOpportunity);
router.get('/', getOpportunities);
router.get('/prospect/:prospectId', getProspectOpportunities);
router.get('/:id', getOpportunity);
router.get('/:id/processing-status', getOpportunityProcessingStatus);
router.put('/:id', updateOpportunity);
router.delete('/:id', deleteOpportunity);
router.delete('/:id/contacts/:contactId', removeContactFromOpportunity);

export default router; 