import mongoose from 'mongoose';
import { z } from 'zod';
import { IContact } from '../../../models/Contact';
import { mastra } from '../../../mastra';
import Activity from '../../../models/Activity';

const MAX_SCORE = 50;
const MIN_SCORE = -50;

const activityImpactSchema = z.object({
  score: z.number().describe('The numerical impact score, strictly following the guide.'),
  reasoning: z.string().describe('A brief, one-sentence explanation for why this score was given.')
});

const scoreReasoningSchema = z.object({
  reasoning: z.string().describe('A 1-2 sentence narrative explaining the score change.'),
});

/**
 * Calculates the engagement score for a contact based on various factors.
 * The score is capped between -50 and +50.
 *
 * This is the core of the engagement scoring algorithm.
 * Task 2.1: Initial framework.
 * Task 2.2 will introduce LLM-based activity impact weighting.
 * Task 2.3 will add a time decay function.
 *
 * @param baseScore The starting engagement score.
 * @param activities The activities to process for scoring.
 * @returns The new engagement score, clamped between -50 and 50.
 */
export const calculateEngagementScore = async (
  baseScore: number,
  activities: any[] // TODO: Replace 'any' with a proper Activity type from a shared types file
): Promise<number> => {
  const activityImpactAgent = mastra.getAgent('activityImpactAgent');
  if (!activityImpactAgent) {
    throw new Error('Activity Impact Agent not found');
  }

  let totalScoreChange = 0;

  for (const activity of activities) {
    // Assuming activity has a 'summary' field.
    const summary = activity.summary || activity.body || 'No summary available';

    const response = await activityImpactAgent.generateLegacy(
      `Analyze the following activity summary and provide an impact score:\n\n${summary}`,
      {
        output: activityImpactSchema,
        providerOptions: {
          openai: {
            metadata: {
              activityId: (activity as any)?._id?.toString() || '',
              opportunityId: (activity?.opportunity as any)?._id?.toString() || '',
              file: 'engagement-scoring-service',
              agent: 'activityImpactAgent',
              orgId: (activity?.organization as any)?._id?.toString() || '',
            }
          }
        }
      }
    );
      
    if (response.object) {
      const activityScore = response.object.score;
      const activityDate = new Date(activity.date);
      const now = new Date();
      const ageInDays = (now.getTime() - activityDate.getTime()) / (1000 * 3600 * 24);

      let weight = 1.0;
      if (ageInDays > 90) {
        weight = 0;
      } else if (ageInDays > 30) {
        // Linear decay from day 31 to day 90
        weight = 1 - ((ageInDays - 30) / 60);
      }

      totalScoreChange += activityScore * weight;
      // TODO: we could store the reasoning `response.object.reasoning` somewhere
    }
  }

  const newScore = baseScore + totalScoreChange;

  // Clamp the score between MIN_SCORE and MAX_SCORE
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, newScore));
};

/**
 * A service class for managing engagement scoring for a specific contact and opportunity.
 */
export class EngagementScoringService {
  private contact: IContact;
  private opportunityId: mongoose.Types.ObjectId;

  constructor(contact: IContact, opportunityId: mongoose.Types.ObjectId) {
    this.contact = contact;
    this.opportunityId = opportunityId;
  }

  /**
   * Processes new activities and updates the contact's engagement score.
   * @param newActivities A list of new activities to analyze.
   */
  public async processAndSaveScore(newActivities: any[]): Promise<void> {
    for (const activity of newActivities) {
      const intel = await this.contact.getOrCreateOpportunityIntelligence(this.opportunityId);
      const currentScore = intel.engagementScore;

      // We pass a single activity to the calculation function
      const newScore = await calculateEngagementScore(currentScore, [activity]);

      if (newScore !== currentScore) {
        const reasoningAgent = mastra.getAgent('scoreReasoningAgent');
        if (!reasoningAgent) {
          throw new Error('Score Reasoning Agent not found');
        }

        const lastReasoning = intel.scoreHistory?.[intel.scoreHistory.length - 1]?.reasoning || "No previous reasoning.";

        const response = await reasoningAgent.generateLegacy(
          `Previous Score: ${currentScore}\nNew Score: ${newScore}\nActivity Summary: ${activity.summary || activity.body}\nPrevious Reasoning: ${lastReasoning}`,
          {
            output: scoreReasoningSchema,
          }
        );
        
        const reasoning = response.object?.reasoning || "Could not generate reasoning.";

        await this.contact.updateOpportunityScore(
          this.opportunityId,
          newScore,
          activity._id,
          reasoning
        );
      }
    }
  }

  public async recalculateAllScoresForContact(): Promise<void> {
    // Clear existing score history and reset score to 0
    await this.contact.clearScoreHistory(this.opportunityId);

    // Fetch all activities for this contact related to any opportunity they are a part of
    const allActivities = await Activity.find({
      contacts: this.contact._id,
    }).sort({ date: 'asc' });

    // Process activities chronologically
    await this.processAndSaveScore(allActivities);
  }
} 