import mongoose from 'mongoose';
import AIUsageTracking, { IAIUsageTracking, ICategoryUsage, IAgentUsage } from '../models/AIUsageTracking';
import AgentRate, { AgentCategory, IAgentRate } from '../models/AgentRates';
import { getAgentCategory } from '../config/agentCategories';
import chalk from 'chalk';

export interface UsageRecord {
  organizationId: mongoose.Types.ObjectId;
  agentName: string;
  category: AgentCategory;
  inputTokens: number;
  outputTokens: number;
  timestamp: Date;
}

export interface UsageStatistics {
  period: {
    year: number;
    month: number;
  };
  totalTokens: {
    input: number;
    output: number;
  };
  totalCost: number;
  breakdown: {
    actions: CategoryStats;
    processing: CategoryStats;
    research: CategoryStats;
  };
  topAgents: AgentStats[];
}

export interface CategoryStats {
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  cost: number;
}

export interface AgentStats {
  name: string;
  category: AgentCategory;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  cost: number;
}

export class AIUsageTrackingService {
  /**
   * Record AI usage for an organization asynchronously
   * This method is non-blocking and logs errors without throwing
   */
  public static async recordUsage(
    organizationId: mongoose.Types.ObjectId | string,
    agentName: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    try {
      const orgId = typeof organizationId === 'string' 
        ? new mongoose.Types.ObjectId(organizationId) 
        : organizationId;

      const category = getAgentCategory(agentName);
      if (!category) {
        console.warn(chalk.yellow(`[AI Usage] Unknown agent: ${agentName}, skipping usage tracking`));
        return;
      }

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1; // 1-12

      // Use atomic operations to update usage
      await this.atomicUsageUpdate(orgId, year, month, category, agentName, inputTokens, outputTokens);

      console.log(chalk.gray(`[AI Usage] Recorded: ${agentName} (${category}) - Input: ${inputTokens}, Output: ${outputTokens}`));
    } catch (error) {
      // Log error but don't throw - usage tracking should never block AI operations
      console.error(chalk.red('[AI Usage] Failed to record usage:'), error);
    }
  }

  /**
   * Atomically update usage statistics for a given month
   * Uses MongoDB atomic operations to handle concurrent updates
   */
  private static async atomicUsageUpdate(
    organizationId: mongoose.Types.ObjectId,
    year: number,
    month: number,
    category: AgentCategory,
    agentName: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    const update: any = {
      $inc: {
        [`usage.${category}.inputTokens`]: inputTokens,
        [`usage.${category}.outputTokens`]: outputTokens,
        [`usage.${category}.callCount`]: 1,
        [`usage.${category}.agents.${agentName}.inputTokens`]: inputTokens,
        [`usage.${category}.agents.${agentName}.outputTokens`]: outputTokens,
        [`usage.${category}.agents.${agentName}.callCount`]: 1,
      },
      $setOnInsert: {
        organization: organizationId,
        year,
        month,
      },
    };

    await AIUsageTracking.findOneAndUpdate(
      { organization: organizationId, year, month },
      update,
      { upsert: true, new: true }
    );
  }

  /**
   * Get usage statistics for a specific month
   */
  public static async getMonthlyUsage(
    organizationId: mongoose.Types.ObjectId | string,
    year: number,
    month: number
  ): Promise<UsageStatistics | null> {
    const orgId = typeof organizationId === 'string' 
      ? new mongoose.Types.ObjectId(organizationId) 
      : organizationId;

    const usage = await AIUsageTracking.findOne({
      organization: orgId,
      year,
      month,
    });

    if (!usage) {
      return null;
    }

    // Get all active rates
    const rates = await this.getActiveRates();
    const rateMap = new Map(rates.map(r => [r.agentName, r]));

    return this.calculateStatistics(usage, rateMap);
  }

  /**
   * Get current month's usage statistics
   */
  public static async getCurrentMonthUsage(
    organizationId: mongoose.Types.ObjectId | string
  ): Promise<UsageStatistics | null> {
    const now = new Date();
    return this.getMonthlyUsage(organizationId, now.getFullYear(), now.getMonth() + 1);
  }

  /**
   * Get usage history for multiple months
   */
  public static async getUsageHistory(
    organizationId: mongoose.Types.ObjectId | string,
    months: number = 6
  ): Promise<UsageStatistics[]> {
    const orgId = typeof organizationId === 'string' 
      ? new mongoose.Types.ObjectId(organizationId) 
      : organizationId;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Calculate date range
    const periods: Array<{ year: number; month: number }> = [];
    for (let i = 0; i < months; i++) {
      let month = currentMonth - i;
      let year = currentYear;
      
      if (month <= 0) {
        month += 12;
        year -= 1;
      }
      
      periods.push({ year, month });
    }

    const usageRecords = await AIUsageTracking.find({
      organization: orgId,
      $or: periods.map(p => ({ year: p.year, month: p.month })),
    }).sort({ year: -1, month: -1 });

    const rates = await this.getActiveRates();
    const rateMap = new Map(rates.map(r => [r.agentName, r]));

    return usageRecords.map(usage => this.calculateStatistics(usage, rateMap));
  }

  /**
   * Get all active agent rates
   */
  private static async getActiveRates(): Promise<IAgentRate[]> {
    return AgentRate.find({ isActive: true }).sort({ effectiveDate: -1 });
  }

  /**
   * Calculate statistics and costs from usage data
   */
  private static calculateStatistics(
    usage: IAIUsageTracking,
    rateMap: Map<string, IAgentRate>
  ): UsageStatistics {
    const calculateCategoryCost = (category: ICategoryUsage, categoryName: AgentCategory): CategoryStats => {
      let cost = 0;
      const agents = category.agents as Map<string, IAgentUsage>;

      agents.forEach((agentUsage, agentName) => {
        const rate = rateMap.get(agentName);
        if (rate) {
          const inputCost = (agentUsage.inputTokens / 1_000_000) * rate.inputTokenRate;
          const outputCost = (agentUsage.outputTokens / 1_000_000) * rate.outputTokenRate;
          cost += inputCost + outputCost;
        }
      });

      return {
        inputTokens: category.inputTokens,
        outputTokens: category.outputTokens,
        callCount: category.callCount,
        cost,
      };
    };

    const actionsStats = calculateCategoryCost(usage.usage.actions, 'actions');
    const processingStats = calculateCategoryCost(usage.usage.processing, 'processing');
    const researchStats = calculateCategoryCost(usage.usage.research, 'research');

    // Calculate top agents across all categories
    const allAgents: AgentStats[] = [];
    
    ['actions', 'processing', 'research'].forEach((categoryName) => {
      const category = usage.usage[categoryName as AgentCategory];
      const agents = category.agents as Map<string, IAgentUsage>;
      
      agents.forEach((agentUsage, agentName) => {
        const rate = rateMap.get(agentName);
        const cost = rate
          ? (agentUsage.inputTokens / 1_000_000) * rate.inputTokenRate +
            (agentUsage.outputTokens / 1_000_000) * rate.outputTokenRate
          : 0;

        allAgents.push({
          name: agentName,
          category: categoryName as AgentCategory,
          inputTokens: agentUsage.inputTokens,
          outputTokens: agentUsage.outputTokens,
          callCount: agentUsage.callCount,
          cost,
        });
      });
    });

    // Sort by cost and take top 10
    const topAgents = allAgents.sort((a, b) => b.cost - a.cost).slice(0, 10);

    return {
      period: {
        year: usage.year,
        month: usage.month,
      },
      totalTokens: {
        input: actionsStats.inputTokens + processingStats.inputTokens + researchStats.inputTokens,
        output: actionsStats.outputTokens + processingStats.outputTokens + researchStats.outputTokens,
      },
      totalCost: actionsStats.cost + processingStats.cost + researchStats.cost,
      breakdown: {
        actions: actionsStats,
        processing: processingStats,
        research: researchStats,
      },
      topAgents,
    };
  }
}

