export interface ActivityStatsPeriod {
  year: number;
  month: number; // 1-12
}

export interface ActivityStatsMetrics {
  activitiesProcessedThisMonth: number;
  opportunitiesManaged: number;
  nextStepsCreatedThisMonth: number;
}

export interface ActivityStatsLive {
  activitiesBeingProcessed: number;
  nextStepsBeingMade: number;
  isActive: boolean;
}

export interface ActivityStatsResponse {
  period: ActivityStatsPeriod;
  metrics: ActivityStatsMetrics;
  live: ActivityStatsLive;
}


