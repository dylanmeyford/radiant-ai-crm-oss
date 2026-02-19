import express from 'express';
import { 
  createProspect, 
  getProspects, 
  getProspect, 
  updateProspect, 
  deleteProspect 
} from '../controllers/prospectController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All routes are protected
router.use(protect);

// Prospect routes
router.post('/', createProspect);
router.get('/', getProspects);
router.get('/:id', getProspect);
router.put('/:id', updateProspect);
router.delete('/:id', deleteProspect);

export default router; 