// Types for AI Usage Tracking System
// Based on backend API endpoints defined in AI_USAGE_TRACKING.md

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

export interface CategoryUsage {
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  cost: number;
  agents: Record<string, AgentUsage>;
}

export interface UsageBreakdown {
  actions: CategoryUsage;
  processing: CategoryUsage;
  research: CategoryUsage;
}

export interface TopAgent {
  name: string;
  category: 'actions' | 'processing' | 'research';
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  cost: number;
}

export interface AIUsageResponse {
  period: {
    year: number;
    month: number;
  };
  totalTokens: {
    input: number;
    output: number;
  };
  totalCost: number;
  breakdown: UsageBreakdown;
  topAgents: TopAgent[];
}

export interface AIUsageHistoryResponse {
  requestedMonths: number;
  history: AIUsageResponse[];
}

export interface AIUsageParams {
  year?: number;
  month?: number;
  months?: number;
}

