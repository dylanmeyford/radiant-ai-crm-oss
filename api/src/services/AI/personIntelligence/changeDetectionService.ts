import { IOpportunityIntelligence } from '../../../types/contactIntelligence.types';

const SIGNIFICANT_SCORE_SHIFT = 15;
const TWO_WEEKS_IN_MS = 14 * 24 * 60 * 60 * 1000;

export interface IScoreChangeAlert {
  startDate: Date;
  endDate: Date;
  startScore: number;
  endScore: number;
  change: number;
  periodMs: number;
}

export class ChangeDetectionService {
  /**
   * Detects significant score changes (>15 points) within a 2-week period.
   * @param opportunityIntelligence The intelligence object for a specific opportunity.
   * @returns An array of detected score change alerts.
   */
  static detectSignificantScoreChanges(
    opportunityIntelligence: IOpportunityIntelligence
  ): IScoreChangeAlert[] {
    const alerts: IScoreChangeAlert[] = [];
    const { scoreHistory } = opportunityIntelligence;

    if (scoreHistory.length < 2) {
      return alerts;
    }

    // Ensure score history is sorted by date ascending
    const sortedHistory = [...scoreHistory].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    for (let i = 0; i < sortedHistory.length; i++) {
      for (let j = i + 1; j < sortedHistory.length; j++) {
        const startDate = sortedHistory[i].date;
        const endDate = sortedHistory[j].date;
        const periodMs = endDate.getTime() - startDate.getTime();

        if (periodMs > 0 && periodMs <= TWO_WEEKS_IN_MS) {
          const startScore = sortedHistory[i].score;
          const endScore = sortedHistory[j].score;
          const change = endScore - startScore;

          if (Math.abs(change) > SIGNIFICANT_SCORE_SHIFT) {
            alerts.push({
              startDate,
              endDate,
              startScore,
              endScore,
              change,
              periodMs,
            });
          }
        }
      }
    }
    
    // Future optimization: This is O(n^2), could be O(n log n) or O(n) with a sliding window approach
    // For now, with typical score history sizes, this is acceptable.
    return alerts;
  }
  
  /**
   * Detects when a contact who was once a "Champion" (score > 20) has gone "cold" (score < 5).
   * @param opportunityIntelligence The intelligence object for a specific opportunity.
   * @returns An alert if the pattern is detected, otherwise null.
   */
  static detectChampionToCold(
    opportunityIntelligence: IOpportunityIntelligence
  ): { championDate: Date; championScore: number; coldDate: Date; coldScore: number } | null {
    const { scoreHistory } = opportunityIntelligence;

    if (scoreHistory.length < 2) {
      return null;
    }

    const sortedHistory = [...scoreHistory].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    let lastChampionState: { score: number; date: Date } | null = null;

    // Find the last time the contact was considered a champion
    for (let i = sortedHistory.length - 1; i >= 0; i--) {
        if (sortedHistory[i].score > 20) {
            lastChampionState = sortedHistory[i];
            break;
        }
    }
    
    // If they were never a champion, no alert
    if (!lastChampionState) {
        return null;
    }

    // Check if score has dropped below 5 since they were a champion
    for (let i = sortedHistory.length - 1; i >= 0; i--) {
        const entry = sortedHistory[i];
        if (entry.date > lastChampionState.date && entry.score < 5) {
            return {
                championDate: lastChampionState.date,
                championScore: lastChampionState.score,
                coldDate: entry.date,
                coldScore: entry.score,
            };
        }
    }

    return null;
  }

  /**
   * Detects the emergence of a new champion, defined as a score increase of >25 points.
   * It finds the most recent occurrence of such a jump in the entire score history.
   * @param opportunityIntelligence The intelligence object for a specific opportunity.
   * @returns An alert object if the pattern is detected, otherwise null.
   */
  static detectNewChampionEmergence(
    opportunityIntelligence: IOpportunityIntelligence
  ): { startDate: Date; startScore: number; endDate: Date; endScore: number; increase: number } | null {
    const { scoreHistory } = opportunityIntelligence;
    const SCORE_INCREASE_THRESHOLD = 25;

    if (scoreHistory.length < 2) {
      return null;
    }

    const sortedHistory = [...scoreHistory].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    let mostRecentEmergence: {
      startDate: Date;
      startScore: number;
      endDate: Date;
      endScore: number;
      increase: number;
    } | null = null;

    // This O(n^2) approach finds the most recent qualifying jump.
    for (let i = 0; i < sortedHistory.length; i++) {
      for (let j = i + 1; j < sortedHistory.length; j++) {
        const increase = sortedHistory[j].score - sortedHistory[i].score;

        if (increase > SCORE_INCREASE_THRESHOLD) {
          mostRecentEmergence = {
            startDate: sortedHistory[i].date,
            startScore: sortedHistory[i].score,
            endDate: sortedHistory[j].date,
            endScore: sortedHistory[j].score,
            increase,
          };
        }
      }
    }

    return mostRecentEmergence;
  }

  /**
   * Calculates deal momentum by comparing the net score change over the last two weeks
   * with the net score change from the two weeks prior.
   * @param opportunityIntelligence The intelligence object for a specific opportunity.
   * @returns An object containing the momentum score and the changes from both periods.
   */
  static calculateMomentum(
    opportunityIntelligence: IOpportunityIntelligence
  ): { momentum: number; recentPeriodChange: number; priorPeriodChange: number } {
    const { scoreHistory } = opportunityIntelligence;
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    const getPeriodChange = (startDate: Date, endDate: Date): number => {
      const periodEntries = scoreHistory
        .filter(entry => entry.date >= startDate && entry.date < endDate)
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      if (periodEntries.length < 2) {
        return 0; // Not enough data for a change
      }

      const startScore = periodEntries[0].score;
      const endScore = periodEntries[periodEntries.length - 1].score;
      return endScore - startScore;
    };

    const recentPeriodChange = getPeriodChange(twoWeeksAgo, now);
    const priorPeriodChange = getPeriodChange(fourWeeksAgo, twoWeeksAgo);

    return {
      momentum: recentPeriodChange - priorPeriodChange,
      recentPeriodChange,
      priorPeriodChange,
    };
  }

  /**
   * Analyzes the trend in communication frequency over two consecutive 2-week periods.
   * @param opportunityIntelligence The intelligence object for a specific opportunity.
   * @returns An object containing the trend and counts for both periods.
   */
  static analyzeCommunicationFrequencyTrend(
    opportunityIntelligence: IOpportunityIntelligence
  ): { trend: 'increasing' | 'decreasing' | 'stable'; recentPeriodCount: number; priorPeriodCount: number } {
    const { communicationPatterns } = opportunityIntelligence;
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    const getPeriodCount = (startDate: Date, endDate: Date): number => {
      return communicationPatterns.filter(
        entry => entry.analyzedAt >= startDate && entry.analyzedAt < endDate
      ).length;
    };

    const recentPeriodCount = getPeriodCount(twoWeeksAgo, now);
    const priorPeriodCount = getPeriodCount(fourWeeksAgo, twoWeeksAgo);
    
    let trend: 'increasing' | 'decreasing' | 'stable';
    if (recentPeriodCount > priorPeriodCount) {
      trend = 'increasing';
    } else if (recentPeriodCount < priorPeriodCount) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }

    return {
      trend,
      recentPeriodCount,
      priorPeriodCount,
    };
  }

  /**
   * Detects a change in engagement depth between the two most recent communication analyses.
   * @param opportunityIntelligence The intelligence object for a specific opportunity.
   * @returns An object describing the change, or null if no change is detected.
   */
  static detectEngagementDepthChange(
    opportunityIntelligence: IOpportunityIntelligence
  ): { from: string; to: string; change: 'deepened' | 'shallowed' } | null {
    const { communicationPatterns } = opportunityIntelligence;

    if (communicationPatterns.length < 2) {
      return null;
    }

    const sortedPatterns = [...communicationPatterns].sort(
      (a, b) => a.analyzedAt.getTime() - b.analyzedAt.getTime()
    );

    const last = sortedPatterns[sortedPatterns.length - 1];
    const secondLast = sortedPatterns[sortedPatterns.length - 2];

    if (!last.messageDepth || !secondLast.messageDepth || last.messageDepth === secondLast.messageDepth) {
      return null;
    }

    const depthMap = { Shallow: 1, Medium: 2, Deep: 3 };
    const lastDepthValue = depthMap[last.messageDepth] || 0;
    const secondLastDepthValue = depthMap[secondLast.messageDepth] || 0;

    let change: 'deepened' | 'shallowed';
    if (lastDepthValue > secondLastDepthValue) {
      change = 'deepened';
    } else {
      change = 'shallowed';
    }

    return {
      from: secondLast.messageDepth,
      to: last.messageDepth,
      change,
    };
  }
} 