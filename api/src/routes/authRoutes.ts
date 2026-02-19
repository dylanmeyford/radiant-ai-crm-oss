import express from 'express';
import { register, login, getCurrentUser, refreshToken, logout, logoutAll } from '../controllers/authController';
import { protect } from '../middleware/auth';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);

// Protected routes
router.get('/me', protect, getCurrentUser);
router.post('/logout-all', protect, logoutAll);

export default router; 