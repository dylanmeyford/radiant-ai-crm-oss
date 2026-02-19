import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Opportunity from '../models/Opportunity';
import { ProposedAction } from '../models/ProposedAction';
import ActivityProcessingQueue from '../models/ActivityProcessingQueue';

/**
 * Helper to get the start of the current month
 */
function getMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  // End exclusive: first ms of next month
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

/**
 * GET /api/activity-stats
 * Returns four key metrics + live processing snapshot for the authenticated organization.
 */
export async function getActivityStats(req: Request, res: Response): Promise<void> {
  try {
    const user: any = (req as any).user;
    if (!user || !user.organization) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const organizationId = new mongoose.Types.ObjectId(user.organization);
    const { start, end } = getMonthRange();

    // Build queries
    const activitiesProcessedThisMonthQuery = ActivityProcessingQueue.countDocuments({
      organization: organizationId,
      queueItemType: 'activity',
      status: 'completed',
      processingCompletedAt: { $gte: start, $lt: end },
    });

    const opportunitiesManagedQuery = Opportunity.countDocuments({
      organization: organizationId,
    });

    const nextStepsCreatedThisMonthQuery = ProposedAction.countDocuments({
      organization: organizationId,
      createdAt: { $gte: start, $lt: end },
    });

    const activitiesBeingProcessedQuery = ActivityProcessingQueue.countDocuments({
      organization: organizationId,
      queueItemType: 'activity',
      status: 'processing',
    });

    const nextStepsBeingMadeQuery = ProposedAction.countDocuments({
      organization: organizationId,
      status: 'PROCESSING UPDATES',
    });

    // Execute in parallel
    const [
      activitiesProcessedThisMonth,
      opportunitiesManaged,
      nextStepsCreatedThisMonth,
      activitiesBeingProcessed,
      nextStepsBeingMade,
    ] = await Promise.all([
      activitiesProcessedThisMonthQuery,
      opportunitiesManagedQuery,
      nextStepsCreatedThisMonthQuery,
      activitiesBeingProcessedQuery,
      nextStepsBeingMadeQuery,
    ]);

    const response = {
      period: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
      metrics: {
        activitiesProcessedThisMonth,
        opportunitiesManaged,
        nextStepsCreatedThisMonth,
      },
      live: {
        activitiesBeingProcessed,
        nextStepsBeingMade,
        isActive: activitiesBeingProcessed > 0 || nextStepsBeingMade > 0,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('[ActivityStatsController] Error building stats:', error);
    res.status(500).json({ error: 'Failed to fetch activity stats' });
  }
}


