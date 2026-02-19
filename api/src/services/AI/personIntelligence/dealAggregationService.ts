import mongoose from 'mongoose';
import Contact, { IContact } from '../../../models/Contact';
import Opportunity, { DealHealthTrend, MomentumDirection, IOpportunity } from '../../../models/Opportunity';
import { personRoleEnum, IOpportunityIntelligence } from '../../../types/contactIntelligence.types';
import chalk from 'chalk';

const roleWeights: { [key: string]: number } = {
  'Economic Buyer': 3,
  'Champion': 2,
  'User': 1,
  'Influencer': 1.5, // Assumption: Influencer has a neutral weight if not specified
  'Decision Maker': 1,
  'Blocker': -2,
  'Other': 0.5,
  ...Object.fromEntries(personRoleEnum.filter(role => !['Economic Buyer', 'Champion', 'User', 'Influencer', 'Blocker', 'Decision Maker', 'Other'].includes(role)).map(role => [role, 0]))
};

// Define the return type for deal health updates
export interface ProposedDealHealthUpdate {
  opportunityId: mongoose.Types.ObjectId;
  dealTemperatureEntry: {
    temperature: number;
    date: Date;
  };
  dealHealthTrend: DealHealthTrend;
  momentumDirection: MomentumDirection;
}

export interface DealHealthResult {
  proposedHealthUpdate: ProposedDealHealthUpdate | null;
}

export class DealAggregationService {
  /**
   * Calculates the total weighted influence score using in-memory contact data.
   * @param contacts Array of contact documents with their intelligence data
   * @param opportunityId The ID of the opportunity
   */
  public static calculateTotalWeightedInfluenceFromMemory(
    contacts: Array<{ contact: IContact; intelligence: IOpportunityIntelligence }>,
    opportunityId: mongoose.Types.ObjectId
  ): number {
    console.log(chalk.blue.bold(`      [+] Calculating total weighted influence for opportunity ${opportunityId} from in-memory data...`));
    
    let totalInfluence = 0;

    for (const { contact, intelligence } of contacts) {
      // Use the most recent role assignment
      const latestRoleAssignment = intelligence.roleAssignments.length > 0
        ? [...intelligence.roleAssignments].sort(
          (a, b) => b.assignedAt.getTime() - a.assignedAt.getTime()
        )[0]
        : undefined;

      const weight = latestRoleAssignment ? (roleWeights[latestRoleAssignment.role] ?? 1) : 1;
      const role = latestRoleAssignment ? latestRoleAssignment.role : 'N/A';
      
      if (!latestRoleAssignment) {
        console.log(chalk.yellow(`      [!] No role assignment found for contact ${contact._id}, using neutral weight of 1.`));
      }

      const weightedScore = intelligence.engagementScore * weight;
      console.log(chalk.gray(`      -> Contact ${contact._id}: score=${intelligence.engagementScore}, role=${role}, weight=${weight}, weightedScore=${weightedScore}`));
      totalInfluence += weightedScore;
    }

    console.log(chalk.green(`      -> Total weighted influence for opportunity ${opportunityId}: ${totalInfluence}`));
    return totalInfluence;
  }

  /**
   * Calculates the deal temperature using in-memory data.
   * @param contacts Array of contact documents with their intelligence data
   * @param opportunityId The ID of the opportunity
   */
  public static calculateDealTemperatureFromMemory(
    contacts: Array<{ contact: IContact; intelligence: IOpportunityIntelligence }>,
    opportunityId: mongoose.Types.ObjectId
  ): number {
    console.log(chalk.blue.bold(`      [+] Calculating deal temperature for opportunity ${opportunityId} from in-memory data...`));
    
    const totalInfluence = this.calculateTotalWeightedInfluenceFromMemory(contacts, opportunityId);
    
    // Normalize the influence score to a 0-100 temperature scale.
    // We'll cap the influence score at a certain value to prevent extreme scores from skewing the temperature.
    // A value of 300 is chosen as a reasonable cap for a hot deal.
    const NORMALIZATION_CAP = 300;
    
    // Scale the influence to be between -1 and 1
    const normalizedInfluence = Math.max(-1, Math.min(1, totalInfluence / NORMALIZATION_CAP));
    
    // Convert to a 0-100 scale
    const temperature = (normalizedInfluence + 1) * 50;
    
    console.log(chalk.green(`      -> Deal temperature for opportunity ${opportunityId}: ${temperature} (from influence ${totalInfluence})`));
    return Math.round(temperature);
  }

  /**
   * Calculates deal momentum using in-memory data.
   * @param contacts Array of contact documents with their intelligence data
   * @param opportunityId The ID of the opportunity
   * @param activityDate The date to calculate momentum relative to
   */
  public static calculateDealMomentumFromMemory(
    contacts: Array<{ contact: IContact; intelligence: IOpportunityIntelligence }>,
    opportunityId: mongoose.Types.ObjectId,
    activityDate: Date
  ): number {
    console.log(chalk.blue.bold(`      [+] Calculating deal momentum for opportunity ${opportunityId} from in-memory data...`));
    
    let totalMomentum = 0;

    const now = activityDate;
    const fourteen_days_ago = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const twenty_eight_days_ago = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    for (const { contact, intelligence } of contacts) {
      if (intelligence.scoreHistory.length < 2) {
        console.log(chalk.yellow(`      [!] Insufficient score history for contact ${contact._id}, skipping momentum calculation...`));
        continue;
      }

      const recentScoreHistory = intelligence.scoreHistory.filter(h => h.date > fourteen_days_ago);
      const previousScoreHistory = intelligence.scoreHistory.filter(h => h.date <= fourteen_days_ago && h.date > twenty_eight_days_ago);

      const getScoreChange = (history: typeof intelligence.scoreHistory) => {
        if (history.length < 2) return 0;

        const sortedHistory = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
        
        const startScore = sortedHistory[0].score;
        const endScore = sortedHistory[sortedHistory.length - 1].score;
        
        return endScore - startScore;
      };

      const recentChange = getScoreChange(recentScoreHistory);
      const previousChange = getScoreChange(previousScoreHistory);

      const contactMomentum = recentChange - previousChange;
      
      const latestRoleAssignment = [...intelligence.roleAssignments].sort(
        (a, b) => b.assignedAt.getTime() - a.assignedAt.getTime()
      )[0];
      
      const weight = latestRoleAssignment ? (roleWeights[latestRoleAssignment.role] ?? 1) : 1;
      totalMomentum += contactMomentum * weight;
    }

    console.log(chalk.green(`      -> Total momentum for opportunity ${opportunityId}: ${totalMomentum}`));
    return totalMomentum;
  }

  /**
   * Calculates deal health indicators using in-memory data and returns proposed updates.
   * @param opportunity The opportunity document (in-memory)
   * @param contacts Array of contact documents with their intelligence data
   * @param activityDate The date of the activity being processed
   */
  public static calculateDealHealthIndicators(
    opportunity: IOpportunity,
    contacts: Array<{ contact: IContact; intelligence: IOpportunityIntelligence }>,
    activityDate: Date
  ): DealHealthResult {
    console.log(chalk.blue.bold(`    [+] Calculating deal health indicators for opportunity ${opportunity._id} using in-memory data...`));
    
    console.log(chalk.cyan(`    -> Calculating current temperature...`));
    const currentTemperature = this.calculateDealTemperatureFromMemory(contacts, opportunity._id as mongoose.Types.ObjectId);
    
    console.log(chalk.cyan(`    -> Determining health trend based on temperature history...`));
    const dealHealthTrend: DealHealthTrend = this.determineDealHealthTrendFromHistory(
      opportunity.dealTemperatureHistory || [],
      currentTemperature,
      activityDate
    );

    console.log(chalk.cyan(`    -> Determining momentum direction...`));
    const momentum = this.calculateDealMomentumFromMemory(contacts, opportunity._id as mongoose.Types.ObjectId, activityDate);
    let momentumDirection: MomentumDirection = MomentumDirection.STABLE;
    
    if (momentum > 5) momentumDirection = MomentumDirection.ACCELERATING;
    else if (momentum < -5) momentumDirection = MomentumDirection.DECELERATING;
    
    const proposedHealthUpdate: ProposedDealHealthUpdate = {
      opportunityId: opportunity._id as mongoose.Types.ObjectId,
      dealTemperatureEntry: {
        temperature: currentTemperature,
        date: activityDate
      },
      dealHealthTrend,
      momentumDirection
    };
    
    console.log(chalk.green(`    -> Calculated health indicators for ${opportunity._id}: Trend=${dealHealthTrend}, Momentum=${momentumDirection}, Temperature=${currentTemperature}`));
    
    console.log(chalk.green.bold(`    [+] Successfully calculated deal health indicators for opportunity ${opportunity._id}`));
    
    return {
      proposedHealthUpdate
    };
  }

  /**
   * Determines the deal health trend using the historical temperature series.
   * Uses a regression slope over a recent window and a start-vs-today delta to avoid
   * reacting to small, short-term fluctuations.
   */
  private static determineDealHealthTrendFromHistory(
    history: Array<{ temperature: number; date: Date }>,
    currentTemperature: number,
    activityDate: Date
  ): DealHealthTrend {
    const extendedHistory = [...history, { temperature: currentTemperature, date: activityDate }];
    if (extendedHistory.length === 0) return DealHealthTrend.STABLE;

    // If limited data, compare start vs today with a stronger threshold
    if (extendedHistory.length < 5) {
      const firstTemp = extendedHistory[0].temperature;
      const delta = currentTemperature - firstTemp;
      const deltaThreshold = 5; // degrees
      if (delta > deltaThreshold) return DealHealthTrend.IMPROVING;
      if (delta < -deltaThreshold) return DealHealthTrend.DECLINING;
      return DealHealthTrend.STABLE;
    }

    // Use a recent window for trend analysis to balance recency and stability
    const WINDOW_SIZE = 30;
    const window = extendedHistory.slice(-Math.min(WINDOW_SIZE, extendedHistory.length));

    // Regress temperature against time (in days) to account for irregular sampling
    const startTime = window[0].date.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const xs = window.map(p => (p.date.getTime() - startTime) / oneDayMs);
    const ys = window.map(p => p.temperature);

    const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < xs.length; i++) {
      const dx = xs[i] - xMean;
      numerator += dx * (ys[i] - yMean);
      denominator += dx * dx;
    }
    const slopePerDay = denominator === 0 ? 0 : numerator / denominator; // degrees/day

    // Thresholds: require a meaningful slope or overall delta
    const slopeThreshold = 0.25; // ~7.5 degrees over a 30-day month
    if (slopePerDay > slopeThreshold) return DealHealthTrend.IMPROVING;
    if (slopePerDay < -slopeThreshold) return DealHealthTrend.DECLINING;

    // If slope is inconclusive, fall back to overall delta across the window
    const deltaOverall = ys[ys.length - 1] - ys[0];
    const deltaThreshold = 5; // degrees across the window
    if (deltaOverall > deltaThreshold) return DealHealthTrend.IMPROVING;
    if (deltaOverall < -deltaThreshold) return DealHealthTrend.DECLINING;
    return DealHealthTrend.STABLE;
  }

  // Legacy methods below for backward compatibility
  /**
   * Calculates the total weighted influence score for a given opportunity.
   * This score is the sum of each contact's engagement score multiplied by their role-based weight.
   * @param opportunityId The ID of the opportunity to calculate the score for.
   * @returns The total weighted influence score for the deal, or 0 if the opportunity is not found.
   * @deprecated Use calculateTotalWeightedInfluenceFromMemory with in-memory data instead.
   */
  public static async calculateTotalWeightedInfluence(
    opportunityId: mongoose.Types.ObjectId
  ): Promise<number> {
    console.log(chalk.blue.bold(`      [+] Calculating total weighted influence for opportunity ${opportunityId}...`));
    
    const opportunity = await Opportunity.findById(opportunityId);

    if (!opportunity) {
      console.warn(chalk.yellow(`      [!] Opportunity with ID ${opportunityId} not found.`));
      return 0;
    }

    console.log(chalk.cyan(`      -> Fetching contacts for influence calculation...`));
    const contacts = await Contact.find({ _id: { $in: opportunity.contacts } });

    let totalInfluence = 0;

    for (const contact of contacts) {
      const intel = await contact.getOrCreateOpportunityIntelligence(opportunityId);
      
      // Use the most recent role assignment
      const latestRoleAssignment = intel.roleAssignments.length > 0
        ? [...intel.roleAssignments].sort(
          (a, b) => b.assignedAt.getTime() - a.assignedAt.getTime()
        )[0]
        : undefined;

      const weight = latestRoleAssignment ? (roleWeights[latestRoleAssignment.role] ?? 1) : 1;
      const role = latestRoleAssignment ? latestRoleAssignment.role : 'N/A';
      
      if (!latestRoleAssignment) {
        console.log(chalk.yellow(`      [!] No role assignment found for contact ${contact.id}, using neutral weight of 1.`));
      }

      const weightedScore = intel.engagementScore * weight;
      console.log(chalk.gray(`      -> Contact ${contact.id}: score=${intel.engagementScore}, role=${role}, weight=${weight}, weightedScore=${weightedScore}`));
      totalInfluence += weightedScore;
    }

    console.log(chalk.green(`      -> Total weighted influence for opportunity ${opportunityId}: ${totalInfluence}`));
    return totalInfluence;
  }

  /**
   * Calculates the deal temperature on a scale of 0-100 based on the aggregated contact scores.
   * A temperature of 100 indicates a very hot deal, 50 is neutral, and 0 is very cold.
   * @param opportunityId The ID of the opportunity to calculate the temperature for.
   * @returns The deal temperature, a value between 0 and 100.
   * @deprecated Use calculateDealTemperatureFromMemory with in-memory data instead.
   */
  public static async calculateDealTemperature(
    opportunityId: mongoose.Types.ObjectId
  ): Promise<number> {
    console.log(chalk.blue.bold(`      [+] Calculating deal temperature for opportunity ${opportunityId}...`));
    
    const totalInfluence = await this.calculateTotalWeightedInfluence(opportunityId);
    
    // Normalize the influence score to a 0-100 temperature scale.
    // We'll cap the influence score at a certain value to prevent extreme scores from skewing the temperature.
    // A value of 300 is chosen as a reasonable cap for a hot deal.
    const NORMALIZATION_CAP = 300;
    
    // Scale the influence to be between -1 and 1
    const normalizedInfluence = Math.max(-1, Math.min(1, totalInfluence / NORMALIZATION_CAP));
    
    // Convert to a 0-100 scale
    const temperature = (normalizedInfluence + 1) * 50;
    
    console.log(chalk.green(`      -> Deal temperature for opportunity ${opportunityId}: ${temperature} (from influence ${totalInfluence})`));
    return Math.round(temperature);
  }

  /**
   * Calculates deal momentum based on contact score trends.
   * Momentum is determined by comparing score changes over the last 14 days
   * with the changes over the preceding 14 days.
   * @param opportunityId The ID of the opportunity to calculate momentum for.
   * @returns A momentum score. Positive indicates acceleration, negative indicates deceleration.
   * @deprecated Use calculateDealMomentumFromMemory with in-memory data instead.
   */
  public static async calculateDealMomentum(
    opportunityId: mongoose.Types.ObjectId,
    activityDate?: Date
  ): Promise<number> {
    console.log(chalk.blue.bold(`      [+] Calculating deal momentum for opportunity ${opportunityId}...`));
    
    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      console.warn(chalk.yellow(`      [!] Opportunity with ID ${opportunityId} not found for momentum calculation.`));
      return 0;
    }

    console.log(chalk.cyan(`      -> Analyzing contact score trends...`));
    const contacts = await Contact.find({ _id: { $in: opportunity.contacts } });
    let totalMomentum = 0;

    const now = activityDate || new Date();
    const fourteen_days_ago = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const twenty_eight_days_ago = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    for (const contact of contacts) {
      const intel = await contact.getOrCreateOpportunityIntelligence(opportunityId);
      if (intel.scoreHistory.length < 2) {
        console.log(chalk.yellow(`      [!] Insufficient score history for contact ${contact.id}, skipping momentum calculation...`));
        continue;
      }

      const recentScoreHistory = intel.scoreHistory.filter(h => h.date > fourteen_days_ago);
      const previousScoreHistory = intel.scoreHistory.filter(h => h.date <= fourteen_days_ago && h.date > twenty_eight_days_ago);

      const getScoreChange = (history: typeof intel.scoreHistory) => {
        if (history.length < 2) return 0;

        const sortedHistory = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
        
        const startScore = sortedHistory[0].score;
        const endScore = sortedHistory[sortedHistory.length - 1].score;
        
        return endScore - startScore;
      };

      const recentChange = getScoreChange(recentScoreHistory);
      const previousChange = getScoreChange(previousScoreHistory);

      const contactMomentum = recentChange - previousChange;
      
      const latestRoleAssignment = [...intel.roleAssignments].sort(
        (a, b) => b.assignedAt.getTime() - a.assignedAt.getTime()
      )[0];
      
      const weight = latestRoleAssignment ? (roleWeights[latestRoleAssignment.role] ?? 1) : 1;
      totalMomentum += contactMomentum * weight;
    }

    console.log(chalk.green(`      -> Total momentum for opportunity ${opportunityId}: ${totalMomentum}`));
    return totalMomentum;
  }

  /**
   * @deprecated Use calculateDealHealthIndicators with in-memory data instead.
   */
  public static async updateDealHealthIndicators(
    opportunityId: mongoose.Types.ObjectId,
    activityDate?: Date
  ): Promise<void> {
    console.log(chalk.blue.bold(`    [+] Updating deal health indicators for opportunity ${opportunityId}...`));
    
    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity) {
      console.warn(chalk.yellow(`    [!] Opportunity with ID ${opportunityId} not found for updating health indicators.`));
      return;
    }

    console.log(chalk.cyan(`    -> Calculating and recording current temperature...`));
    // 1. Calculate and record current temperature
    const currentTemperature = await this.calculateDealTemperature(opportunityId);
    opportunity.dealTemperatureHistory = opportunity.dealTemperatureHistory || [];
    opportunity.dealTemperatureHistory.push({ temperature: currentTemperature, date: activityDate || new Date() });
    console.log(chalk.gray(`    -> Deal temperature history for opportunity ${opportunityId}:`, JSON.stringify(opportunity.dealTemperatureHistory, null, 2)));

    console.log(chalk.cyan(`    -> Determining health trend based on temperature change...`));
    // 2. Determine health trend based on temperature change
    if (opportunity.dealTemperatureHistory && opportunity.dealTemperatureHistory.length >= 2) {
      const recentHistory = opportunity.dealTemperatureHistory.slice(-2);
      const tempChange = recentHistory[1].temperature - recentHistory[0].temperature;
      if (tempChange > 3) opportunity.dealHealthTrend = DealHealthTrend.IMPROVING;
      else if (tempChange < -3) opportunity.dealHealthTrend = DealHealthTrend.DECLINING;
      else opportunity.dealHealthTrend = DealHealthTrend.STABLE;
    } else {
      opportunity.dealHealthTrend = DealHealthTrend.STABLE;
    }

    console.log(chalk.cyan(`    -> Determining momentum direction...`));
    // 3. Determine momentum direction
    const momentum = await this.calculateDealMomentum(opportunityId, activityDate);
    if (momentum > 5) opportunity.momentumDirection = MomentumDirection.ACCELERATING;
    else if (momentum < -5) opportunity.momentumDirection = MomentumDirection.DECELERATING;
    else opportunity.momentumDirection = MomentumDirection.STABLE;
    
    console.log(chalk.green(`    -> Updated health indicators for ${opportunityId}: Trend=${opportunity.dealHealthTrend}, Momentum=${opportunity.momentumDirection}`));
    await opportunity.save();
    
    console.log(chalk.green.bold(`    [+] Successfully updated deal health indicators for opportunity ${opportunityId}`));
  }
} 