import { Request, Response } from 'express';
import { AIUsageTrackingService } from '../services/aiUsageTrackingService';
import mongoose from 'mongoose';

export class AIUsageController {
  /**
   * GET /api/ai-usage/current
   * Get current month's AI usage for the requesting user's organization
   */
  public static async getCurrentMonthUsage(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user || !user.organization) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const usage = await AIUsageTrackingService.getCurrentMonthUsage(user.organization);

      if (!usage) {
        // No usage data for current month - return empty structure
        const now = new Date();
        res.json({
          period: { year: now.getFullYear(), month: now.getMonth() + 1 },
          totalTokens: { input: 0, output: 0 },
          totalCost: 0,
          breakdown: {
            actions: { inputTokens: 0, outputTokens: 0, callCount: 0, cost: 0 },
            processing: { inputTokens: 0, outputTokens: 0, callCount: 0, cost: 0 },
            research: { inputTokens: 0, outputTokens: 0, callCount: 0, cost: 0 },
          },
          topAgents: [],
        });
        return;
      }

      res.json(usage);
    } catch (error) {
      console.error('[AI Usage Controller] Error fetching current month usage:', error);
      res.status(500).json({ error: 'Failed to fetch usage data' });
    }
  }

  /**
   * GET /api/ai-usage/:year/:month
   * Get AI usage for a specific month
   */
  public static async getMonthlyUsage(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user || !user.organization) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);

      // Validate year and month
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        res.status(400).json({ error: 'Invalid year or month' });
        return;
      }

      // Don't allow querying future months
      const now = new Date();
      const requestedDate = new Date(year, month - 1);
      if (requestedDate > now) {
        res.status(400).json({ error: 'Cannot query future months' });
        return;
      }

      const usage = await AIUsageTrackingService.getMonthlyUsage(user.organization, year, month);

      if (!usage) {
        // No usage data for this month - return empty structure
        res.json({
          period: { year, month },
          totalTokens: { input: 0, output: 0 },
          totalCost: 0,
          breakdown: {
            actions: { inputTokens: 0, outputTokens: 0, callCount: 0, cost: 0 },
            processing: { inputTokens: 0, outputTokens: 0, callCount: 0, cost: 0 },
            research: { inputTokens: 0, outputTokens: 0, callCount: 0, cost: 0 },
          },
          topAgents: [],
        });
        return;
      }

      res.json(usage);
    } catch (error) {
      console.error('[AI Usage Controller] Error fetching monthly usage:', error);
      res.status(500).json({ error: 'Failed to fetch usage data' });
    }
  }

  /**
   * GET /api/ai-usage/history?months=6
   * Get AI usage history for multiple months
   */
  public static async getUsageHistory(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user || !user.organization) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const months = parseInt(req.query.months as string) || 6;

      // Limit to reasonable range
      if (months < 1 || months > 24) {
        res.status(400).json({ error: 'Months parameter must be between 1 and 24' });
        return;
      }

      const history = await AIUsageTrackingService.getUsageHistory(user.organization, months);

      res.json({
        requestedMonths: months,
        history,
      });
    } catch (error) {
      console.error('[AI Usage Controller] Error fetching usage history:', error);
      res.status(500).json({ error: 'Failed to fetch usage history' });
    }
  }
}

