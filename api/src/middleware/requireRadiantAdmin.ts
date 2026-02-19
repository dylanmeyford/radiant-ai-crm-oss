import { Request, Response, NextFunction } from 'express';

export const requireRadiantAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const user = (req as any).user;
  if (!user || user.RadiantAdmin !== true) {
    res.status(403).json({ success: false, message: 'Radiant admin access required' });
    return;
  }

  next();
};
