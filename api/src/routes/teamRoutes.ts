import express from 'express';
import { generateInvitation, getTeamMembers, removeTeamMember } from '../controllers/teamController';
import { protect, isAdmin } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(protect);

// POST /team/invite - Generate invitation link for new team member
router.post('/invite', generateInvitation);

// GET /team/members - Get all team members in the organization
router.get('/members', getTeamMembers);

// DELETE /team/members/:userId - Remove a team member from the organization (admin only)
router.delete('/members/:userId', isAdmin, removeTeamMember);

export default router;

