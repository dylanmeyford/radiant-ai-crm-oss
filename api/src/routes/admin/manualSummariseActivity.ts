import { Request, Response } from 'express';
import { summariseActivity } from "../../services/AI/personIntelligence/summariseActivity";

export const manualSummariseActivity = async (req: Request, res: Response): Promise<void> => {
    try {
      const { activityId } = req.params;
      
      if (!activityId) {
        res.status(400).json({ message: 'Activity ID is required' });
        return;
      }
  
      const summary = await summariseActivity(activityId);
      
      res.status(200).json({ summary });
      return
    } catch (error: any) {
      console.error('Error in manualSummariseActivity:', error);
      res.status(500).json({ message: 'Error summarizing activity', error: error.message });
    }
  }; 