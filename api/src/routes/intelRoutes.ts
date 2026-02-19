import express from 'express';
import { 
  createIntel, 
  getAllIntel, 
  getIntel, 
  updateIntel, 
  deleteIntel 
} from '../controllers/intelController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All routes are protected
router.use(protect);

// Intel routes
router.post('/', createIntel);
router.get('/', getAllIntel);
router.get('/:id', getIntel);
router.put('/:id', updateIntel);
router.delete('/:id', deleteIntel);

export default router; 