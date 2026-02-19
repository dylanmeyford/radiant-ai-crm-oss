import { Router } from 'express';
import { EvalController } from '../controllers/evalController';
import { protect } from '../middleware/auth';
import { requireRadiantAdmin } from '../middleware/requireRadiantAdmin';

const router = Router();

// All routes require authentication
router.use(protect);
router.use(requireRadiantAdmin);

// Runs
router.get('/runs', EvalController.getRuns);
router.get('/runs/:runId', EvalController.getRunById);
router.delete('/runs/:runId', EvalController.deleteRun);
router.post('/runs/:runId/mark-golden', EvalController.markGoldenRun);

// Datasets
router.get('/datasets', EvalController.getDatasets);
router.post('/datasets', EvalController.createDataset);
router.get('/datasets/:datasetId', EvalController.getDatasetById);
router.put('/datasets/:datasetId', EvalController.updateDataset);

// Templates
router.get('/templates', EvalController.listTemplates);
router.post('/templates', EvalController.createTemplate);
router.get('/templates/:templateId', EvalController.getTemplateById);
router.put('/templates/:templateId', EvalController.updateTemplate);
router.post('/templates/:templateId/activate', EvalController.activateTemplate);

// Scorers
router.get('/scorers', EvalController.listScorers);

// Experiments
router.post('/experiments', EvalController.runExperiment);
router.get('/experiments/:experimentId', EvalController.getExperiment);

export default router;
