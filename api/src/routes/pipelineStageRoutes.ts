import express from 'express';
import { 
  getPipelineStages,
  createPipelineStage,
  updatePipelineStage,
  deletePipelineStage,
  reorderPipelineStages
} from '../controllers/pipelineStageController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All routes are protected
router.use(protect);

// Pipeline stage routes
router.get('/', getPipelineStages);
router.post('/', createPipelineStage);
router.put('/:id', updatePipelineStage);
router.delete('/:id', deletePipelineStage);
router.patch('/reorder', reorderPipelineStages);

export default router;

