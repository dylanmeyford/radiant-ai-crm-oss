/**
 * Rate limiting configuration for Nylas API calls
 * Based on provider-specific limits and Nylas recommendations
 */

export interface ProviderRateLimit {
  maxConcurrent: number;
  minTime: number; // Minimum time between requests in ms
  reservoir: number; // Initial number of requests allowed
  reservoirRefreshAmount: number; // Number of requests to add back
  reservoirRefreshInterval: number; // Time interval to refresh reservoir in ms
  maxRetries: number;
  initialRetryDelay: number; // Initial delay for exponential backoff in ms
  maxRetryDelay: number; // Maximum delay for exponential backoff in ms
}

/**
 * Default rate limits based on provider documentation
 * These can be overridden by environment variables
 */
export const DEFAULT_PROVIDER_LIMITS: Record<string, ProviderRateLimit> = {
  gmail: {
    maxConcurrent: 4, // Gmail allows max 4 concurrent requests
    minTime: 100, // ~600 requests/min = 100ms between requests
    reservoir: 600, // 600 requests per minute
    reservoirRefreshAmount: 600,
    reservoirRefreshInterval: 60 * 1000, // 1 minute
    maxRetries: 5,
    initialRetryDelay: 1000, // 1 second
    maxRetryDelay: 30000, // 30 seconds
  },
  google: {
    // Same as gmail
    maxConcurrent: 4,
    minTime: 100,
    reservoir: 600,
    reservoirRefreshAmount: 600,
    reservoirRefreshInterval: 60 * 1000,
    maxRetries: 5,
    initialRetryDelay: 1000,
    maxRetryDelay: 30000,
  },
  outlook: {
    maxConcurrent: 4, // Microsoft recommends max 4 concurrent
    minTime: 60, // ~10,000 requests per 10 minutes = 60ms between requests
    reservoir: 1000, // 1000 requests per 10 minutes (conservative)
    reservoirRefreshAmount: 1000,
    reservoirRefreshInterval: 10 * 60 * 1000, // 10 minutes
    maxRetries: 5,
    initialRetryDelay: 1000,
    maxRetryDelay: 30000,
  },
  microsoft: {
    // Same as outlook
    maxConcurrent: 4,
    minTime: 60,
    reservoir: 1000,
    reservoirRefreshAmount: 1000,
    reservoirRefreshInterval: 10 * 60 * 1000,
    maxRetries: 5,
    initialRetryDelay: 1000,
    maxRetryDelay: 30000,
  },
  yahoo: {
    maxConcurrent: 2, // Conservative for Yahoo
    minTime: 200, // 300 requests/min = 200ms between requests
    reservoir: 300,
    reservoirRefreshAmount: 300,
    reservoirRefreshInterval: 60 * 1000,
    maxRetries: 5,
    initialRetryDelay: 1000,
    maxRetryDelay: 30000,
  },
  icloud: {
    maxConcurrent: 2, // Very conservative for iCloud
    minTime: 500, // ~120 requests/min = 500ms between requests
    reservoir: 120,
    reservoirRefreshAmount: 120,
    reservoirRefreshInterval: 60 * 1000,
    maxRetries: 5,
    initialRetryDelay: 1000,
    maxRetryDelay: 30000,
  },
  other: {
    // Default conservative limits for unknown providers
    maxConcurrent: 2,
    minTime: 1000, // 1 second between requests
    reservoir: 60,
    reservoirRefreshAmount: 60,
    reservoirRefreshInterval: 60 * 1000,
    maxRetries: 5,
    initialRetryDelay: 1000,
    maxRetryDelay: 30000,
  },
};

/**
 * Get rate limiting configuration for a provider
 * Allows environment variable overrides
 */
export function getProviderRateLimit(provider: string): ProviderRateLimit {
  const normalizedProvider = provider.toLowerCase();
  const defaultLimit = DEFAULT_PROVIDER_LIMITS[normalizedProvider] || DEFAULT_PROVIDER_LIMITS.other;
  
  // Allow environment variable overrides
  const envPrefix = `NYLAS_RATE_LIMIT_${normalizedProvider.toUpperCase()}`;
  
  return {
    maxConcurrent: parseInt(process.env[`${envPrefix}_MAX_CONCURRENT`] || '') || defaultLimit.maxConcurrent,
    minTime: parseInt(process.env[`${envPrefix}_MIN_TIME`] || '') || defaultLimit.minTime,
    reservoir: parseInt(process.env[`${envPrefix}_RESERVOIR`] || '') || defaultLimit.reservoir,
    reservoirRefreshAmount: parseInt(process.env[`${envPrefix}_REFRESH_AMOUNT`] || '') || defaultLimit.reservoirRefreshAmount,
    reservoirRefreshInterval: parseInt(process.env[`${envPrefix}_REFRESH_INTERVAL`] || '') || defaultLimit.reservoirRefreshInterval,
    maxRetries: parseInt(process.env[`${envPrefix}_MAX_RETRIES`] || '') || defaultLimit.maxRetries,
    initialRetryDelay: parseInt(process.env[`${envPrefix}_INITIAL_RETRY_DELAY`] || '') || defaultLimit.initialRetryDelay,
    maxRetryDelay: parseInt(process.env[`${envPrefix}_MAX_RETRY_DELAY`] || '') || defaultLimit.maxRetryDelay,
  };
}

/**
 * Global rate limiting settings
 */
export const GLOBAL_RATE_LIMIT_CONFIG = {
  // Maximum number of rate limiters to keep in memory
  maxCachedLimiters: parseInt(process.env.NYLAS_MAX_CACHED_LIMITERS || '100'),
  
  // Time to keep unused limiters in cache (ms)
  limiterCacheTimeout: parseInt(process.env.NYLAS_LIMITER_CACHE_TIMEOUT || '') || 30 * 60 * 1000, // 30 minutes
  
  // Enable detailed rate limit logging
  enableDetailedLogging: process.env.NYLAS_RATE_LIMIT_DETAILED_LOGGING === 'true',
  
  // Enable rate limit monitoring
  enableMonitoring: process.env.NYLAS_RATE_LIMIT_MONITORING !== 'false', // Default enabled
};
