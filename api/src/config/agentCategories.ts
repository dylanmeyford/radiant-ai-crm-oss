import { AgentCategory } from '../models/AgentRates';

/**
 * Agent categorization for usage tracking and billing
 */
export const AGENT_CATEGORIES: Record<string, AgentCategory> = {
  // Processing (Intelligence Pipeline - 14 agents)
  summariseActivityAgent: 'processing',
  activityImpactAgent: 'processing',
  behavioralSignalAgent: 'processing',
  communicationPatternAgent: 'processing',
  relationshipStoryAgent: 'processing',
  dealSummaryAgent: 'processing',
  roleExtractionAgent: 'processing',
  responsivenessAgent: 'processing',
  meddpiccAgent: 'processing',
  scoreReasoningAgent: 'processing',
  titleMeetingAgent: 'processing',
  opportunityContextAgent: 'processing',
  fileProcessingAgent: 'processing',
  basicAgent: 'processing',
  playbookSummaryAgent: 'processing',
  dealQualificationAgent: 'processing',
  domainValidationAgent: 'processing',

  // Actions (Action Pipeline - 6 agents)
  nextActionAgent: 'actions',
  actionEvaluationAgent: 'actions',
  enhancedContentAgent: 'actions',
  playbookSelectionAgent: 'actions',
  decideOnlineResearchAgent: 'actions',
  evaluationAgent: 'actions',

  // Research (3 agents)
  researchAgent: 'research',
  contactResearchAgent: 'research',
  meetingPrepAgent: 'research',
};

/**
 * Get the category for a given agent name
 * @param agentName The name of the agent
 * @returns The category or undefined if not found
 */
export function getAgentCategory(agentName: string): AgentCategory | undefined {
  return AGENT_CATEGORIES[agentName];
}

/**
 * Get all agents in a specific category
 * @param category The category to filter by
 * @returns Array of agent names in that category
 */
export function getAgentsByCategory(category: AgentCategory): string[] {
  return Object.entries(AGENT_CATEGORIES)
    .filter(([_, cat]) => cat === category)
    .map(([name, _]) => name);
}

