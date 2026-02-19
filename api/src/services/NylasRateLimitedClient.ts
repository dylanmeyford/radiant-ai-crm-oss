/**
 * Rate-limited wrapper for Nylas API calls
 * Implements per-grantId rate limiting with provider-specific limits
 */

import Nylas from 'nylas';
import Bottleneck from 'bottleneck';
import { getProviderRateLimit, GLOBAL_RATE_LIMIT_CONFIG } from '../config/rateLimits';
import NylasConnection, { INylasConnection } from '../models/NylasConnection';

export interface RateLimitError extends Error {
  isRateLimit: boolean;
  retryAfter?: number;
  grantId?: string;
  provider?: string;
}

export interface RateLimitEvent {
  type: 'limited' | 'queued' | 'executing' | 'failed' | 'retry';
  grantId: string;
  provider: string;
  operation: string;
  timestamp: Date;
  retryCount?: number;
  retryAfter?: number;
  queueSize?: number;
}

/**
 * Manages rate limiters for each grantId with provider-specific limits
 */
class RateLimiterManager {
  private limiters = new Map<string, Bottleneck>();
  private providers = new Map<string, string>();
  private lastAccess = new Map<string, number>();
  
  constructor() {
    // Cleanup unused limiters periodically
    setInterval(() => this.cleanup(), GLOBAL_RATE_LIMIT_CONFIG.limiterCacheTimeout / 2);
  }

  /**
   * Get or create a rate limiter for a specific grantId
   */
  async getLimiter(grantId: string): Promise<Bottleneck> {
    this.lastAccess.set(grantId, Date.now());
    
    if (this.limiters.has(grantId)) {
      return this.limiters.get(grantId)!;
    }

    // Get provider for this grantId
    const provider = await this.getProviderForGrant(grantId);
    const rateLimitConfig = getProviderRateLimit(provider);
    
    const limiter = new Bottleneck({
      maxConcurrent: rateLimitConfig.maxConcurrent,
      minTime: rateLimitConfig.minTime,
      reservoir: rateLimitConfig.reservoir,
      reservoirRefreshAmount: rateLimitConfig.reservoirRefreshAmount,
      reservoirRefreshInterval: rateLimitConfig.reservoirRefreshInterval,
      id: `nylas-${grantId}`,
    });

    // Add event listeners for monitoring
    this.setupLimiterEvents(limiter, grantId, provider);
    
    this.limiters.set(grantId, limiter);
    this.providers.set(grantId, provider);
    
    if (GLOBAL_RATE_LIMIT_CONFIG.enableDetailedLogging) {
      console.log(`[RATE-LIMITER] Created new limiter for grantId: ${grantId}, provider: ${provider}`);
    }
    
    return limiter;
  }

  /**
   * Get provider for a grantId from database
   */
  private async getProviderForGrant(grantId: string): Promise<string> {
    try {
      const connection = await NylasConnection.findOne({ grantId }).select('provider');
      return connection?.provider || 'other';
    } catch (error) {
      console.warn(`[RATE-LIMITER] Failed to get provider for grantId ${grantId}, using 'other':`, error);
      return 'other';
    }
  }

  /**
   * Setup event listeners for rate limiter monitoring
   */
  private setupLimiterEvents(limiter: Bottleneck, grantId: string, provider: string) {
    if (!GLOBAL_RATE_LIMIT_CONFIG.enableMonitoring) return;

    limiter.on('dropped', (dropped) => {
      this.logRateLimitEvent({
        type: 'failed',
        grantId,
        provider,
        operation: 'unknown',
        timestamp: new Date(),
      });
    });

    limiter.on('depleted', () => {
      this.logRateLimitEvent({
        type: 'limited',
        grantId,
        provider,
        operation: 'reservoir_depleted',
        timestamp: new Date(),
      });
    });

    limiter.on('queued', () => {
      const queueSize = limiter.counts().QUEUED;
      this.logRateLimitEvent({
        type: 'queued',
        grantId,
        provider,
        operation: 'queued',
        timestamp: new Date(),
        queueSize,
      });
    });
  }

  /**
   * Log rate limit events
   */
  private logRateLimitEvent(event: RateLimitEvent) {
    if (GLOBAL_RATE_LIMIT_CONFIG.enableDetailedLogging) {
      console.log(`[RATE-LIMIT-EVENT] ${JSON.stringify(event)}`);
    } else {
      // Simple logging for production
      console.log(`[RATE-LIMIT] ${event.type.toUpperCase()}: ${event.grantId} (${event.provider}) - ${event.operation}`);
    }
  }

  /**
   * Cleanup unused limiters
   */
  private cleanup() {
    const now = Date.now();
    const timeout = GLOBAL_RATE_LIMIT_CONFIG.limiterCacheTimeout;
    
    for (const [grantId, lastAccess] of this.lastAccess.entries()) {
      if (now - lastAccess > timeout) {
        const limiter = this.limiters.get(grantId);
        if (limiter) {
          limiter.stop();
          this.limiters.delete(grantId);
          this.providers.delete(grantId);
          this.lastAccess.delete(grantId);
          
          if (GLOBAL_RATE_LIMIT_CONFIG.enableDetailedLogging) {
            console.log(`[RATE-LIMITER] Cleaned up unused limiter for grantId: ${grantId}`);
          }
        }
      }
    }

    // Also cleanup if we have too many limiters
    if (this.limiters.size > GLOBAL_RATE_LIMIT_CONFIG.maxCachedLimiters) {
      const sortedByAccess = Array.from(this.lastAccess.entries())
        .sort(([,a], [,b]) => a - b);
      
      const toRemove = sortedByAccess.slice(0, this.limiters.size - GLOBAL_RATE_LIMIT_CONFIG.maxCachedLimiters);
      
      for (const [grantId] of toRemove) {
        const limiter = this.limiters.get(grantId);
        if (limiter) {
          limiter.stop();
          this.limiters.delete(grantId);
          this.providers.delete(grantId);
          this.lastAccess.delete(grantId);
        }
      }
    }
  }

  /**
   * Get stats for monitoring
   */
  getStats() {
    const stats = {
      totalLimiters: this.limiters.size,
      limiterStats: {} as Record<string, any>,
    };

    for (const [grantId, limiter] of this.limiters.entries()) {
      const provider = this.providers.get(grantId);
      stats.limiterStats[grantId] = {
        provider,
        counts: limiter.counts(),
        running: limiter.running(),
        queued: limiter.queued(),
      };
    }

    return stats;
  }
}

/**
 * Rate-limited Nylas client wrapper
 */
export class NylasRateLimitedClient {
  private nylas: Nylas;
  private rateLimiterManager: RateLimiterManager;

  constructor(nylas: Nylas) {
    this.nylas = nylas;
    this.rateLimiterManager = new RateLimiterManager();
  }

  /**
   * Execute a Nylas API call with rate limiting and retry logic
   */
  async executeWithRateLimit<T>(
    grantId: string,
    operation: string,
    apiCall: () => Promise<T>
  ): Promise<T> {
    const limiter = await this.rateLimiterManager.getLimiter(grantId);
    const provider = await this.getProviderForGrant(grantId);
    const rateLimitConfig = getProviderRateLimit(provider);
    
    return limiter.schedule({ id: `${operation}-${Date.now()}-${Math.random()}` }, async () => {
      let lastError: any;
      
      for (let attempt = 0; attempt <= rateLimitConfig.maxRetries; attempt++) {
        try {
          this.logRateLimitEvent({
            type: 'executing',
            grantId,
            provider,
            operation,
            timestamp: new Date(),
            retryCount: attempt,
          });

          const result = await apiCall();
          return result;
          
        } catch (error: any) {
          lastError = error;
          
          // Check if it's a rate limit error
          const isRateLimit = this.isRateLimitError(error);
          const retryAfter = this.getRetryAfter(error);
          
          if (isRateLimit) {
            this.logRateLimitEvent({
              type: 'limited',
              grantId,
              provider,
              operation,
              timestamp: new Date(),
              retryCount: attempt,
              retryAfter,
            });
          }
          
          // Don't retry on last attempt or non-retryable errors
          if (attempt === rateLimitConfig.maxRetries || !this.shouldRetry(error)) {
            this.logRateLimitEvent({
              type: 'failed',
              grantId,
              provider,
              operation,
              timestamp: new Date(),
              retryCount: attempt,
            });
            
            // Enhance error with rate limit info
            if (isRateLimit) {
              const rateLimitError: RateLimitError = error;
              rateLimitError.isRateLimit = true;
              rateLimitError.grantId = grantId;
              rateLimitError.provider = provider;
              if (retryAfter) rateLimitError.retryAfter = retryAfter;
            }
            
            throw error;
          }
          
          // Calculate retry delay
          const delay = this.calculateRetryDelay(attempt, retryAfter, rateLimitConfig);
          
          this.logRateLimitEvent({
            type: 'retry',
            grantId,
            provider,
            operation,
            timestamp: new Date(),
            retryCount: attempt + 1,
            retryAfter: delay,
          });
          
          console.log(`[RATE-LIMITER] Retrying ${operation} for ${grantId} in ${delay}ms (attempt ${attempt + 1}/${rateLimitConfig.maxRetries})`);
          
          await this.sleep(delay);
        }
      }
      
      throw lastError;
    });
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    return error?.status === 429 || 
           error?.statusCode === 429 || 
           error?.code === 429 ||
           error?.message?.toLowerCase().includes('rate limit') ||
           error?.message?.toLowerCase().includes('too many requests');
  }

  /**
   * Extract retry-after value from error
   */
  private getRetryAfter(error: any): number | undefined {
    // Check for Retry-After header
    const retryAfter = error?.headers?.['retry-after'] || 
                      error?.response?.headers?.['retry-after'];
    
    if (retryAfter) {
      const parsed = parseInt(retryAfter);
      return isNaN(parsed) ? undefined : parsed * 1000; // Convert to ms
    }
    
    return undefined;
  }

  /**
   * Determine if error should be retried
   */
  private shouldRetry(error: any): boolean {
    const status = error?.status || error?.statusCode;
    
    // Retry on rate limits, server errors, and timeouts
    return status === 429 || 
           status === 503 || 
           status === 502 || 
           status === 504 ||
           error?.code === 'ECONNRESET' ||
           error?.code === 'ETIMEDOUT' ||
           error?.message?.includes('timeout');
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number, retryAfter: number | undefined, config: any): number {
    // Use Retry-After if provided
    if (retryAfter) {
      return Math.min(retryAfter, config.maxRetryDelay);
    }
    
    // Exponential backoff: initialDelay * (2 ^ attempt) + jitter
    const exponentialDelay = config.initialRetryDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000; // Add up to 1 second jitter
    
    return Math.min(exponentialDelay + jitter, config.maxRetryDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get provider for grantId
   */
  private async getProviderForGrant(grantId: string): Promise<string> {
    try {
      const connection = await NylasConnection.findOne({ grantId }).select('provider');
      return connection?.provider || 'other';
    } catch (error) {
      return 'other';
    }
  }

  /**
   * Log rate limit events
   */
  private logRateLimitEvent(event: RateLimitEvent) {
    if (GLOBAL_RATE_LIMIT_CONFIG.enableDetailedLogging) {
      console.log(`[RATE-LIMIT-EVENT] ${JSON.stringify(event)}`);
    }
  }

  // Wrapper methods for common Nylas operations
  
  /**
   * Rate-limited threads.list
   */
  async listThreads(params: { identifier: string; queryParams?: any }) {
    return this.executeWithRateLimit(
      params.identifier,
      'threads.list',
      () => this.nylas.threads.list(params)
    );
  }

  /**
   * Rate-limited messages.list
   */
  async listMessages(params: { identifier: string; queryParams?: any }) {
    return this.executeWithRateLimit(
      params.identifier,
      'messages.list',
      () => this.nylas.messages.list(params)
    );
  }

  /**
   * Rate-limited messages.find
   */
  async findMessage(params: { identifier: string; messageId: string }) {
    return this.executeWithRateLimit(
      params.identifier,
      'messages.find',
      () => this.nylas.messages.find(params)
    );
  }

  /**
   * Rate-limited messages.send
   */
  async sendMessage(params: { identifier: string; requestBody: any }) {
    return this.executeWithRateLimit(
      params.identifier,
      'messages.send',
      () => this.nylas.messages.send(params)
    );
  }

  /**
   * Rate-limited events.list
   */
  async listEvents(params: { identifier: string; queryParams?: any }) {
    return this.executeWithRateLimit(
      params.identifier,
      'events.list',
      () => this.nylas.events.list({
        identifier: params.identifier,
        queryParams: params.queryParams || {}
      })
    );
  }

  /**
   * Rate-limited events.find
   */
  async findEvent(params: { identifier: string; eventId: string; queryParams?: { calendarId?: string } }) {
    return this.executeWithRateLimit(
      params.identifier,
      'events.find',
      () => this.nylas.events.find({
        identifier: params.identifier,
        eventId: params.eventId,
        queryParams: {
          calendarId: params.queryParams?.calendarId || 'primary'
        }
      })
    );
  }

  /**
   * Rate-limited events.create
   */
  async createEvent(params: { identifier: string; requestBody: any; queryParams?: any }) {
    return this.executeWithRateLimit(
      params.identifier,
      'events.create',
      () => this.nylas.events.create({
        identifier: params.identifier,
        requestBody: params.requestBody,
        queryParams: params.queryParams || {}
      })
    );
  }

  /**
   * Rate-limited events.update
   */
  async updateEvent(params: { identifier: string; eventId: string; requestBody: any; queryParams?: any }) {
    return this.executeWithRateLimit(
      params.identifier,
      'events.update',
      () => this.nylas.events.update({
        identifier: params.identifier,
        eventId: params.eventId,
        requestBody: params.requestBody,
        queryParams: params.queryParams || {}
      })
    );
  }

  /**
   * Rate-limited events.destroy
   */
  async destroyEvent(params: { identifier: string; eventId: string; queryParams?: any }) {
    return this.executeWithRateLimit(
      params.identifier,
      'events.destroy',
      () => this.nylas.events.destroy({
        identifier: params.identifier,
        eventId: params.eventId,
        queryParams: params.queryParams || {}
      })
    );
  }

  /**
   * Rate-limited calendars.list
   */
  async listCalendars(params: { identifier: string; limit?: number }) {
    return this.executeWithRateLimit(
      params.identifier,
      'calendars.list',
      () => this.nylas.calendars.list(params)
    );
  }

  /**
   * Rate-limited calendars.find
   */
  async findCalendar(params: { identifier: string; calendarId: string }) {
    return this.executeWithRateLimit(
      params.identifier,
      'calendars.find',
      () => this.nylas.calendars.find(params)
    );
  }

  /**
   * Rate-limited calendars.update
   */
  async updateCalendar(params: { identifier: string; calendarId: string; requestBody: any }) {
    return this.executeWithRateLimit(
      params.identifier,
      'calendars.update',
      () => this.nylas.calendars.update(params)
    );
  }

  /**
   * Rate-limited notetakers.create
   */
  async createNotetaker(params: { identifier: string; requestBody: any }) {
    return this.executeWithRateLimit(
      params.identifier,
      'notetakers.create',
      () => this.nylas.notetakers.create(params)
    );
  }

  /**
   * Rate-limited notetakers.cancel
   */
  async cancelNotetaker(params: { identifier: string; notetakerId: string; requestBody?: any }) {
    return this.executeWithRateLimit(
      params.identifier,
      'notetakers.cancel',
      () => this.nylas.notetakers.cancel(params)
    );
  }

  /**
   * Rate-limited notetakers.leave
   */
  async leaveNotetaker(params: { identifier: string; notetakerId: string; requestBody?: any }) {
    return this.executeWithRateLimit(
      params.identifier,
      'notetakers.leave',
      () => this.nylas.notetakers.leave(params)
    );
  }

  /**
   * Rate-limited notetakers.list
   */
  async listNotetakers(params: { identifier: string; queryParams?: any }) {
    return this.executeWithRateLimit(
      params.identifier,
      'notetakers.list',
      () => this.nylas.notetakers.list(params)
    );
  }

  /**
   * Rate-limited notetakers.find
   */
  async findNotetaker(params: { identifier: string; notetakerId: string }) {
    return this.executeWithRateLimit(
      params.identifier,
      'notetakers.find',
      () => this.nylas.notetakers.find(params)
    );
  }

  /**
   * Get rate limiter statistics
   */
  getStats() {
    return this.rateLimiterManager.getStats();
  }

  /**
   * Access to original Nylas client for operations that don't need rate limiting
   */
  get auth() {
    return this.nylas.auth;
  }
}
