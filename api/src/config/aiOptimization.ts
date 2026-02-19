/**
 * Configuration for AI model optimization and context management
 */

export interface ModelConfig {
  name: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  safeInputLimit: number;
  activityDataBudget: number;
}

/**
 * Predefined model configurations
 */
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'o3': {
    name: 'o3',
    inputTokenLimit: 200000,
    outputTokenLimit: 100000,
    safeInputLimit: 180000,
    activityDataBudget: 150000
  },
  'o3-mini': {
    name: 'o3-mini',
    inputTokenLimit: 4000,
    outputTokenLimit: 2000,
    safeInputLimit: 3500,
    activityDataBudget: 2800
  },
  'gpt-4o': {
    name: 'gpt-4o',
    inputTokenLimit: 128000,
    outputTokenLimit: 16384,
    safeInputLimit: 115000,
    activityDataBudget: 100000
  },
  'gpt-4o-mini': {
    name: 'gpt-4o-mini',
    inputTokenLimit: 128000,
    outputTokenLimit: 16384,
    safeInputLimit: 115000,
    activityDataBudget: 100000
  }
};

/**
 * Get the current model configuration based on environment or default
 */
export function getCurrentModelConfig(): ModelConfig {
  const modelName = process.env.AI_MODEL_NAME || 'o3';
  const config = MODEL_CONFIGS[modelName];
  
  if (!config) {
    console.warn(`Unknown model: ${modelName}, falling back to o3 configuration`);
    return MODEL_CONFIGS['o3'];
  }
  
  return config;
}

/**
 * Responsiveness analysis specific configurations
 */
export interface ResponsivenessOptimizationConfig {
  maxEmailActivities: number;
  maxCalendarActivities: number;
  maxTokensPerEmail: number;
  maxTokensPerMeeting: number;
  emergencyMaxEmailActivities: number;
  emergencyMaxCalendarActivities: number;
  emergencyMaxTokensPerEmail: number;
  emergencyMaxTokensPerMeeting: number;
  prioritizeRecent: boolean;
  includeAttendeeDetails: boolean;
}

/**
 * Get responsiveness optimization config based on model capabilities
 */
export function getResponsivenessOptimizationConfig(modelConfig?: ModelConfig): ResponsivenessOptimizationConfig {
  const config = modelConfig || getCurrentModelConfig();
  
  // Adjust limits based on model capacity
  if (config.activityDataBudget < 10000) {
    // Very limited models (o3-mini)
    return {
      maxEmailActivities: 5,
      maxCalendarActivities: 3,
      maxTokensPerEmail: 300,
      maxTokensPerMeeting: 200,
      emergencyMaxEmailActivities: 3,
      emergencyMaxCalendarActivities: 2,
      emergencyMaxTokensPerEmail: 150,
      emergencyMaxTokensPerMeeting: 100,
      prioritizeRecent: true,
      includeAttendeeDetails: false
    };
  } else if (config.activityDataBudget < 50000) {
    // Medium capacity models
    return {
      maxEmailActivities: 10,
      maxCalendarActivities: 8,
      maxTokensPerEmail: 500,
      maxTokensPerMeeting: 300,
      emergencyMaxEmailActivities: 6,
      emergencyMaxCalendarActivities: 4,
      emergencyMaxTokensPerEmail: 250,
      emergencyMaxTokensPerMeeting: 150,
      prioritizeRecent: true,
      includeAttendeeDetails: true
    };
  } else {
    // High capacity models (o3, gpt-4o)
    return {
      maxEmailActivities: 15,
      maxCalendarActivities: 10,
      maxTokensPerEmail: 800,
      maxTokensPerMeeting: 400,
      emergencyMaxEmailActivities: 8,
      emergencyMaxCalendarActivities: 5,
      emergencyMaxTokensPerEmail: 400,
      emergencyMaxTokensPerMeeting: 200,
      prioritizeRecent: true,
      includeAttendeeDetails: true
    };
  }
}

/**
 * Environment-based configuration overrides
 */
export function getOptimizationConfigWithOverrides(): ResponsivenessOptimizationConfig {
  const baseConfig = getResponsivenessOptimizationConfig();
  
  return {
    ...baseConfig,
    maxEmailActivities: parseInt(process.env.AI_MAX_EMAIL_ACTIVITIES || baseConfig.maxEmailActivities.toString()),
    maxCalendarActivities: parseInt(process.env.AI_MAX_CALENDAR_ACTIVITIES || baseConfig.maxCalendarActivities.toString()),
    maxTokensPerEmail: parseInt(process.env.AI_MAX_TOKENS_PER_EMAIL || baseConfig.maxTokensPerEmail.toString()),
    maxTokensPerMeeting: parseInt(process.env.AI_MAX_TOKENS_PER_MEETING || baseConfig.maxTokensPerMeeting.toString()),
    prioritizeRecent: process.env.AI_PRIORITIZE_RECENT !== 'false',
    includeAttendeeDetails: process.env.AI_INCLUDE_ATTENDEE_DETAILS !== 'false'
  };
}
