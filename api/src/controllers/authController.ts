import { Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import Organization from '../models/Organization';
import { Invitation } from '../models/Invitation';
import mongoose from 'mongoose';
import { executeSignupResearch } from '../services/researchService';
import { createDefaultPipelineStages } from '../services/pipelineStageService';
import { seedDefaultSalesPlaybooks } from '../services/salesPlaybookSeedService';

// Generate JWT Token
const generateAccessToken = (user: IUser): string => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not defined');
  }
  
  const options: SignOptions = {
    expiresIn: Number(process.env.JWT_EXPIRES_IN) || 15 * 60 // 15 minutes in seconds
  };
  
  return jwt.sign(
    { 
      id: user._id, 
      role: user.role,
      organization: user.organization 
    }, 
    jwtSecret,
    options
  );
};

// Get device info from request
const getDeviceInfo = (req: Request): string => {
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${userAgent} (${ip})`;
};

// Register user and organization
export const register = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { 
      name, email, password, invitationToken 
    } = req.body;

    // Check for invitation token in query params if not in body
    const token = invitationToken || req.query.token;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      await session.abortTransaction();
      res.status(400).json({ success: false, message: 'User already exists' });
      return;
    }

    // Registration with invitation token
    if (token) {
      // Find and validate invitation
      const invitation = await Invitation.findOne({ token }).populate('organization');
      
      if (!invitation) {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: 'Invalid invitation token' });
        return;
      }

      // Check if invitation has expired
      if (invitation.expiresAt < new Date()) {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: 'Invitation has expired' });
        return;
      }

      // Check if invitation is still pending
      if (invitation.status !== 'pending') {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: 'Invitation has already been used' });
        return;
      }

      // Validate email matches invitation
      if (invitation.email.toLowerCase() !== email.toLowerCase()) {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: 'Email does not match invitation' });
        return;
      }

      const firstName = name.split(' ')[0];
      const lastName = name.split(' ')[1];

      // Create user with role 'user' and organization from invitation
      const user = await User.create([{
        firstName,
        lastName,
        email,
        password,
        role: 'user',
        organization: invitation.organization
      }], { session });

      // Update invitation status to 'accepted'
      invitation.status = 'accepted';
      await invitation.save({ session });

      // Generate tokens
      const accessToken = generateAccessToken(user[0]);
      const deviceInfo = getDeviceInfo(req);

      // Commit the transaction
      await session.commitTransaction();

      const refreshToken = await user[0].generateRefreshToken(deviceInfo);

      // Set refresh token in HTTP-only cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.status(201).json({
        success: true,
        accessToken,
        user: {
          id: user[0]._id,
          firstName: user[0].firstName,
          lastName: user[0].lastName,
          email: user[0].email,
          role: user[0].role,
          RadiantAdmin: user[0].RadiantAdmin === true,
          organization: user[0].organization
        }
      });
      return;
    }

    // Standard registration flow (no invitation token)
    const firstName = name.split(' ')[0];
    const lastName = name.split(' ')[1];
    const websiteName = email.split('@')[1];

    // Check if organization already exists
    const existingOrganization = await Organization.findOne({ name: websiteName });
    if (existingOrganization) {
      await session.abortTransaction();
      res.status(400).json({ success: false, message: 'Organization already exists. Please ask your administrator to add you to the organization.' });
      return;
    }

    // Create organization within transaction
    const organization = await Organization.create([{
      name: websiteName,
      website: websiteName
    }], { session });

    // Create default pipeline stages for the new organization
    await createDefaultPipelineStages(organization[0]._id as mongoose.Types.ObjectId, session);

    // Create user with admin role within transaction
    const user = await User.create([{
      firstName,
      lastName,
      email,
      password,
      role: 'admin',
      organization: organization[0]._id
    }], { session });

    // Seed default sales playbooks for the new organization
    await seedDefaultSalesPlaybooks({
      organizationId: organization[0]._id as mongoose.Types.ObjectId,
      createdBy: user[0]._id as mongoose.Types.ObjectId,
      session,
    });

    // Generate tokens
    const accessToken = generateAccessToken(user[0]);
    const deviceInfo = getDeviceInfo(req);

    // Commit the transaction
    await session.commitTransaction();

    const refreshToken = await user[0].generateRefreshToken(deviceInfo);

    // Set refresh token in HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Fire off research agents asynchronously (non-blocking)
    executeSignupResearch(
      websiteName, 
      organization[0]._id as mongoose.Types.ObjectId, 
      user[0]._id as mongoose.Types.ObjectId
    ).catch((error) => {
      console.error('Research agent execution failed for signup:', error);
      // Don't let research failures affect the signup response
    });

    res.status(201).json({
      success: true,
      accessToken,
      user: {
        id: user[0]._id,
        firstName: user[0].firstName,
        lastName: user[0].lastName,
        email: user[0].email,
        role: user[0].role,
        RadiantAdmin: user[0].RadiantAdmin === true,
        organization: organization[0]._id
      }
    });
  } catch (error) {
    // If an error occurred, abort the transaction
    await session.abortTransaction();
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  } finally {
    // End the session
    session.endSession();
  }
};

// Login user
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email }).select('+password').populate('organization');
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const deviceInfo = getDeviceInfo(req);
    const refreshToken = await user.generateRefreshToken(deviceInfo);

    // Set refresh token in HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(200).json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        RadiantAdmin: user.RadiantAdmin === true,
        organization: user.organization
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// Refresh token
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies.refreshToken;
    
    if (!token) {
      res.status(401).json({ success: false, message: 'No refresh token provided' });
      return;
    }

    // Find user with the given refresh token in their sessions
    const user = await User.findOne({ 'sessions.token': token });
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid refresh token' });
      return;
    }

    // Remove the old token
    await user.removeRefreshToken(token);

    // Generate new tokens
    const accessToken = generateAccessToken(user);
    const deviceInfo = getDeviceInfo(req);
    const newRefreshToken = await user.generateRefreshToken(deviceInfo);

    // Set new refresh token in HTTP-only cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(200).json({
      success: true,
      accessToken
    });
  } catch (error: any) {
    console.error('Refresh token error:', error);
    
    // Provide more specific error messages for debugging
    if (error.name === 'VersionError') {
      console.error('Version conflict during refresh token operation - this indicates concurrent session modifications');
      res.status(500).json({ success: false, message: 'Session conflict detected, please try again' });
    } else {
      res.status(500).json({ success: false, message: 'Server error during token refresh' });
    }
  }
};

// Logout
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies.refreshToken;
    
    if (token) {
      // Find user with this token and remove it from sessions
      const user = await User.findOne({ 'sessions.token': token });
      if (user) {
        await user.removeRefreshToken(token);
      }
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('Logout error:', error);
    
    // Provide more specific error messages for debugging
    if (error.name === 'VersionError') {
      console.error('Version conflict during logout operation - this indicates concurrent session modifications');
      res.status(500).json({ success: false, message: 'Session conflict detected, please try again' });
    } else {
      res.status(500).json({ success: false, message: 'Server error during logout' });
    }
  }
};

// Logout from all devices
export const logoutAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    
    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        await user.removeAllRefreshTokens();
      }
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.status(200).json({ success: true, message: 'Logged out from all devices successfully' });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({ success: false, message: 'Server error during logout from all devices' });
  }
};

// Get current user
export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?._id).populate('organization');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        RadiantAdmin: user.RadiantAdmin === true,
        organization: user.organization
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}; 