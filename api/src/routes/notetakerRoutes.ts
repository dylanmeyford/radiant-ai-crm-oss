import express from 'express';
import * as notetakerController from '../controllers/notetakerController';
import { protect } from '../middleware/auth'; // Assuming auth middleware exists

const router = express.Router();

// All routes below will be protected
router.use(protect);

router.post('/invite', notetakerController.inviteNotetaker);
router.delete('/meetings/:notetakerId/cancel', notetakerController.cancelNotetaker);
router.post('/meetings/:notetakerId/leave', notetakerController.makeNotetakerLeaveMeeting);

export default router; 