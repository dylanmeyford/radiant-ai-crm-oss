import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Create a limiter specifically for the Nylas callback endpoint
export const nylasCallbackLimiter = rateLimit({
  windowMs: 30 * 1000, // 30 seconds
  max: 1, // Limit each IP to 1 request per windowMs
  message: 'Too many Nylas callback attempts. Please try again after 30 seconds.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req: Request) => {
    // Use a combination of IP and user ID as the key to prevent duplicate requests
    return `${req.ip}-${req.user?._id || 'anonymous'}`;
  }
}); 