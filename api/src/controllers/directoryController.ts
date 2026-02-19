import { Request, Response } from 'express';
import DirectoryProvider from '../models/DirectoryProvider';

// Get all directory providers (global list)
export const getProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const providers = await DirectoryProvider.find({}).sort({ name: 1 });

    res.status(200).json({
      success: true,
      data: providers,
    });
  } catch (error) {
    console.error('Get directory providers error:', error);
    res.status(500).json({ success: false, message: 'Error fetching directory providers' });
  }
};
