import { Request, Response } from 'express';
import crypto from 'crypto';
import { Invitation } from '../models/Invitation';
import User from '../models/User';

/**
 * Generate a unique invitation token
 */
const generateInvitationToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate invitation link for a new team member
 * POST /team/invite
 */
export const generateInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, firstName, lastName } = req.body;

    // Validate required fields
    if (!email || !firstName || !lastName) {
      res.status(400).json({ 
        success: false, 
        message: 'Email, first name, and last name are required' 
      });
      return;
    }

    // Get the authenticated user (set by auth middleware)
    const userId = req.user?.id;
    const userOrganization = req.user?.organization;

    if (!userId || !userOrganization) {
      res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
      return;
    }

    // Check if user with this email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(400).json({ 
        success: false, 
        message: 'A user with this email already exists' 
      });
      return;
    }

    // Check if there's already a pending invitation for this email in this organization
    const existingInvitation = await Invitation.findOne({
      email: email.toLowerCase(),
      organization: userOrganization,
      status: 'pending',
      expiresAt: { $gt: new Date() }
    });

    if (existingInvitation) {
      res.status(400).json({ 
        success: false, 
        message: 'An active invitation already exists for this email' 
      });
      return;
    }

    // Generate unique token
    const token = generateInvitationToken();

    // Set expiration date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Generate registration link
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const registrationLink = `${baseUrl}/register?token=${token}`;

    // Create invitation
    const invitation = await Invitation.create({
      email: email.toLowerCase(),
      firstName,
      lastName,
      token,
      registrationLink,
      organization: userOrganization,
      inviter: userId,
      status: 'pending',
      expiresAt
    });

    res.status(201).json({
      success: true,
      message: 'Invitation created successfully',
      data: {
        invitationId: invitation._id,
        email: invitation.email,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        registrationLink,
        expiresAt: invitation.expiresAt
      }
    });

  } catch (error) {
    console.error('Error generating invitation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

/**
 * Get all team members in the authenticated user's organization
 * GET /team/members
 */
export const getTeamMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get the authenticated user's organization
    const userOrganization = req.user?.organization;

    if (!userOrganization) {
      res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
      return;
    }

    // Fetch all users in the organization
    const teamMembers = await User.find({ organization: userOrganization })
      .select('firstName lastName email role createdAt')
      .sort({ createdAt: -1 });
    
    const invitations = await Invitation.find({ organization: userOrganization, status: 'pending' })
      .select('email firstName lastName createdAt registrationLink')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        teamMembers,
        invitations,
        count: teamMembers.length
      }
    });

  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

/**
 * Remove a team member from the organization
 * DELETE /team/members/:userId
 */
export const removeTeamMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const userOrganization = req.user?.organization;
    const currentUserId = req.user?.id;

    if (!userOrganization || !currentUserId) {
      res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
      return;
    }

    // Validate userId format
    if (!userId) {
      res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
      return;
    }

    // Prevent users from removing themselves
    if (userId === currentUserId.toString()) {
      res.status(400).json({ 
        success: false, 
        message: 'You cannot remove yourself from the organization' 
      });
      return;
    }

    // Find the user to be removed
    const userToRemove = await User.findById(userId);

    if (!userToRemove) {
      res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
      return;
    }

    // Verify the user belongs to the same organization
    if (userToRemove.organization.toString() !== userOrganization.toString()) {
      res.status(403).json({ 
        success: false, 
        message: 'You can only remove users from your own organization' 
      });
      return;
    }

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: 'Team member removed successfully',
      data: {
        removedUserId: userId,
        removedUserEmail: userToRemove.email
      }
    });

  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

