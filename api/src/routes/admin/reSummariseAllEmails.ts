import { Request, Response } from 'express';
import EmailActivity from '../../models/EmailActivity';
import { summariseActivity } from '../../services/AI/personIntelligence/summariseActivity';

export const reSummariseAllEmails = async (req: Request, res: Response): Promise<void> => {
    try {
      const activities = await EmailActivity.find({ organization: "68413d035519d5b605db9cae"}).lean();
    
    if (!activities) {
      throw new Error('Activity not found');
    }
  
      for (const activity of activities) {
        console.log(`Summarising email ${activity._id}`);
        try {
          await summariseActivity(activity._id.toString());
        } catch (error: any) {
          console.error(`Error summarising email ${activity._id}:`, error);
        }
      }
      
      res.status(200).json({ message: 'All emails summarised successfully' });
      return
    } catch (error: any) {
      console.error('Error in manualSummariseActivity:', error);
      res.status(500).json({ message: 'Error summarizing activity', error: error.message });
    }
  }; 