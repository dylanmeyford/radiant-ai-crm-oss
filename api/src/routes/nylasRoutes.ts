import express from 'express';
import { getAuthUrl, handleCallback, getNylasConnections, getAvailableCalendars, subscribeToCalendar, syncAllCalendarEvents, getEmailSignature, updateEmailSignature } from '../controllers/nylasController';
import { protect } from '../middleware/auth';
import { nylasCallbackLimiter } from '../middleware/rateLimiter';


const router = express.Router();

// Protected routes
router.get('/', protect, getNylasConnections);
router.get('/oauth/exchange', protect, getAuthUrl);
router.post('/oauth/callback', protect, nylasCallbackLimiter, handleCallback);
router.post('/calendars', protect, getAvailableCalendars);
router.post('/calendars/subscribe', protect, subscribeToCalendar);
router.post('/events/sync', protect, syncAllCalendarEvents);

// Email signature routes
router.get('/:connectionId/signature', protect, getEmailSignature);
router.put('/:connectionId/signature', protect, updateEmailSignature);

export default router; 