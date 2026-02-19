import express from 'express';
import { 
  createCompetitor, 
  getCompetitors, 
  getCompetitor, 
  updateCompetitor, 
  deleteCompetitor 
} from '../controllers/competitorController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All routes are protected
router.use(protect);

// Competitor routes
router.post('/', createCompetitor);
router.get('/', getCompetitors);
router.get('/:id', getCompetitor);
router.put('/:id', updateCompetitor);
router.delete('/:id', deleteCompetitor);

export default router; 