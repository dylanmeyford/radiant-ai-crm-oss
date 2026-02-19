import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

export interface TokenPayload {
  id: string;
  role: string;
  organization: string;
  iat?: number;
  exp?: number;
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}

export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Get token from header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      res.status(401).json({ success: false, message: 'Not authorized to access this route' });
      return;
    }

    // Verify token
    let decoded: TokenPayload;
    
    try {
      decoded = jwt.verify(token, jwtSecret) as TokenPayload;
    } catch (error) {
      // If token is expired, try to refresh
      if (error instanceof jwt.TokenExpiredError) {
        const refreshToken = req.cookies.refreshToken;
        
        if (!refreshToken) {
          res.status(401).json({ success: false, message: 'No refresh token provided' });
          return;
        }

        // Find user with refresh token
        const user = await User.findOne({ refreshToken });
        if (!user) {
          res.status(401).json({ success: false, message: 'Invalid refresh token' });
          return;
        }

        // Generate new access token
        const newAccessToken = jwt.sign(
          { 
            id: user._id, 
            role: user.role,
            organization: user.organization 
          },
          jwtSecret,
          { expiresIn: Number(process.env.JWT_EXPIRES_IN) || 15 * 60 }
        );

        // Set new access token in response header
        res.setHeader('New-Access-Token', newAccessToken);
        
        // Set user in request
        req.user = user;
        next();
        return;
      }
      throw error;
    }

    // Get user from database
    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }

    // Set user in request
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Not authorized to access this route' });
  }
};

// Middleware to restrict access to specific roles
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authorized to access this route' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: `User role ${req.user.role} is not authorized to access this route` });
      return;
    }

    next();
  };
};

// Middleware to restrict access to admin users only
export const isAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authorized to access this route' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
    return;
  }

  next();
}; 