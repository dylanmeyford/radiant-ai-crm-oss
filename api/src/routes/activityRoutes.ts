import express from 'express';
import { 
  createActivity, 
  getActivities, 
  getActivity, 
  updateActivity, 
  deleteActivity,
  updateActivityStatus,
  getProspectTasks,
  completeTask,
  getOpportunityActivities
} from '../controllers/activityController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All routes are protected
router.use(protect);

// Activity routes
router.post('/', createActivity);
router.get('/', getActivities);
router.get('/opportunity/:id', getOpportunityActivities);
router.get('/:id', getActivity);
router.put('/:id', updateActivity);
router.patch('/:id/status', updateActivityStatus);
router.delete('/:id', deleteActivity);

// Task-specific routes
router.get('/prospect/:prospectId/tasks', getProspectTasks);
router.patch('/tasks/:id/complete', completeTask);

export default router;