import { AgentCategory } from '../models/AgentRates';

/**
 * Default pricing rates for AI agents
 * Rates are in dollars per 1 million tokens
 * 
 * Based on OpenAI pricing (as of October 2024):
 * - GPT-5 (o1): $15 per 1M input tokens, $60 per 1M output tokens
 * - GPT-5-mini (o1-mini): $3 per 1M input tokens, $12 per 1M output tokens
 * - GPT-4o: $2.50 per 1M input tokens, $10 per 1M output tokens
 * - GPT-4o-mini: $0.150 per 1M input tokens, $0.600 per 1M output tokens
 * - GPT-5-nano: $0.100 per 1M input tokens, $0.400 per 1M output tokens (estimated)
 */

export interface AgentRateConfig {
  agentName: string;
  category: AgentCategory;
  inputTokenRate: number;
  outputTokenRate: number;
  modelName: string;
}

export const DEFAULT_AGENT_RATES: AgentRateConfig[] = [
  // Processing agents (Intelligence Pipeline) - Using gpt-5-mini for most
  {
    agentName: 'summariseActivityAgent',
    category: 'processing',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'activityImpactAgent',
    category: 'processing',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'behavioralSignalAgent',
    category: 'processing',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'communicationPatternAgent',
    category: 'processing',
    inputTokenRate: 0.1,
    outputTokenRate: 0.4,
    modelName: 'gpt-5-nano',
  },
  {
    agentName: 'relationshipStoryAgent',
    category: 'processing',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'dealSummaryAgent',
    category: 'processing',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'roleExtractionAgent',
    category: 'processing',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'responsivenessAgent',
    category: 'processing',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'meddpiccAgent',
    category: 'processing',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'scoreReasoningAgent',
    category: 'processing',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'titleMeetingAgent',
    category: 'processing',
    inputTokenRate: 2.5,
    outputTokenRate: 10.0,
    modelName: 'gpt-4o',
  },
  {
    agentName: 'opportunityContextAgent',
    category: 'processing',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'fileProcessingAgent',
    category: 'processing',
    inputTokenRate: 0.15,
    outputTokenRate: 0.6,
    modelName: 'gpt-4o-mini',
  },
  {
    agentName: 'basicAgent',
    category: 'processing',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'dealQualificationAgent',
    category: 'processing',
    inputTokenRate: 0.15,
    outputTokenRate: 0.6,
    modelName: 'gpt-4o-mini',
  },
  {
    agentName: 'domainValidationAgent',
    category: 'processing',
    inputTokenRate: 0.15,
    outputTokenRate: 0.6,
    modelName: 'gpt-4o-mini',
  },
  {
    agentName: 'playbookSummaryAgent',
    category: 'processing',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },

  // Action agents (Action Pipeline) - Using higher-powered models
  {
    agentName: 'nextActionAgent',
    category: 'actions',
    inputTokenRate: 2.5,
    outputTokenRate: 20.0,
    modelName: 'gpt-5',
  },
  {
    agentName: 'actionEvaluationAgent',
    category: 'actions',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'enhancedContentAgent',
    category: 'actions',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'playbookSelectionAgent',
    category: 'actions',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'decideOnlineResearchAgent',
    category: 'actions',
    inputTokenRate: 2.5,
    outputTokenRate: 10.0,
    modelName: 'gpt-4o',
  },
  {
    agentName: 'evaluationAgent',
    category: 'actions',
    inputTokenRate: 0.5,
    outputTokenRate: 4.0,
    modelName: 'gpt-5-mini',
  },

  // Research agents - Using higher-powered models with web search
  {
    agentName: 'researchAgent',
    category: 'research',
    inputTokenRate: 1.1,
    outputTokenRate: 1.8,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'contactResearchAgent',
    category: 'research',
    inputTokenRate: 1.1,
    outputTokenRate: 1.8,
    modelName: 'gpt-5-mini',
  },
  {
    agentName: 'meetingPrepAgent',
    category: 'research',
    inputTokenRate: 0.1,
    outputTokenRate: 0.8,
    modelName: 'gpt-5-mini',
  },
];

