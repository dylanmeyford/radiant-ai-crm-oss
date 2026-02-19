import express from 'express';
import { getNotetakerSettings, updateNotetakerSettings } from '../controllers/userSettingsController';
import { protect } from '../middleware/auth'; // Assuming you have an auth middleware

const router = express.Router();

// Route to get notetaker settings
router.get('/notetaker', protect, getNotetakerSettings);

// Route to update notetaker settings
router.patch('/notetaker/:id', protect, updateNotetakerSettings);

export default router; 