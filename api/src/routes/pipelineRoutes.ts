import express from 'express';
import {
  getPipelines,
  getPipeline,
  getDefaultPipelineForOrg,
  createNewPipeline,
  updateExistingPipeline,
  setDefault,
  deleteExistingPipeline
} from '../controllers/pipelineController';
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

// Pipeline routes
router.get('/', getPipelines);
router.get('/default', getDefaultPipelineForOrg);
router.get('/:id', getPipeline);
router.post('/', createNewPipeline);
router.put('/:id', updateExistingPipeline);
router.patch('/:id/set-default', setDefault);
router.delete('/:id', deleteExistingPipeline);

// Pipeline stage routes (nested under pipelines)
router.get('/:pipelineId/stages', getPipelineStages);
router.post('/:pipelineId/stages', createPipelineStage);
router.put('/:pipelineId/stages/:id', updatePipelineStage);
router.delete('/:pipelineId/stages/:id', deletePipelineStage);
router.patch('/:pipelineId/stages/reorder', reorderPipelineStages);

export default router;
