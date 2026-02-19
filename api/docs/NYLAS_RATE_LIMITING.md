# Nylas Rate Limiting Implementation

## Overview

This document describes the comprehensive rate limiting system implemented for Nylas API calls to ensure compliance with provider-specific limits and prevent rate limit errors in production.

## Architecture

### Components

1. **Rate Limiting Configuration** (`src/config/rateLimits.ts`)
   - Provider-specific rate limits (Gmail, Outlook, Yahoo, iCloud)
   - Environment variable overrides
   - Global configuration settings

2. **Rate Limited Client** (`src/services/NylasRateLimitedClient.ts`)
   - Per-grantId rate limiting using Bottleneck
   - Exponential backoff retry logic
   - Provider-aware rate limiting
   - Comprehensive error handling

3. **Updated Nylas Service** (`src/services/NylasService.ts`)
   - All Nylas API calls now use the rate-limited client
   - Enhanced error messages with rate limit context
   - Statistics endpoint for monitoring

## Provider-Specific Limits

### Gmail/Google
- **Concurrent Requests**: 4 max
- **Rate**: 600 requests/minute (100ms between requests)
- **Refresh Interval**: 1 minute

### Outlook/Microsoft
- **Concurrent Requests**: 4 max  
- **Rate**: 1000 requests/10 minutes (60ms between requests)
- **Refresh Interval**: 10 minutes

### Yahoo
- **Concurrent Requests**: 2 max
- **Rate**: 300 requests/minute (200ms between requests)
- **Refresh Interval**: 1 minute

### iCloud
- **Concurrent Requests**: 2 max
- **Rate**: 120 requests/minute (500ms between requests)
- **Refresh Interval**: 1 minute

### Other/Unknown Providers
- **Concurrent Requests**: 2 max
- **Rate**: 60 requests/minute (1000ms between requests)
- **Refresh Interval**: 1 minute

## Configuration

### Environment Variables

You can override default rate limits using environment variables:

```bash
# Gmail overrides
NYLAS_RATE_LIMIT_GMAIL_MAX_CONCURRENT=8
NYLAS_RATE_LIMIT_GMAIL_RESERVOIR=1200
NYLAS_RATE_LIMIT_GMAIL_REFRESH_INTERVAL=60000

# Outlook overrides  
NYLAS_RATE_LIMIT_OUTLOOK_MAX_CONCURRENT=6
NYLAS_RATE_LIMIT_OUTLOOK_RESERVOIR=2000

# Global settings
NYLAS_MAX_CACHED_LIMITERS=200
NYLAS_LIMITER_CACHE_TIMEOUT=1800000
NYLAS_RATE_LIMIT_DETAILED_LOGGING=true
NYLAS_RATE_LIMIT_MONITORING=true
```

### Available Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NYLAS_RATE_LIMIT_{PROVIDER}_MAX_CONCURRENT` | See provider limits | Maximum concurrent requests |
| `NYLAS_RATE_LIMIT_{PROVIDER}_MIN_TIME` | See provider limits | Minimum time between requests (ms) |
| `NYLAS_RATE_LIMIT_{PROVIDER}_RESERVOIR` | See provider limits | Initial request allowance |
| `NYLAS_RATE_LIMIT_{PROVIDER}_REFRESH_AMOUNT` | Same as reservoir | Requests added on refresh |
| `NYLAS_RATE_LIMIT_{PROVIDER}_REFRESH_INTERVAL` | See provider limits | Refresh interval (ms) |
| `NYLAS_RATE_LIMIT_{PROVIDER}_MAX_RETRIES` | 5 | Maximum retry attempts |
| `NYLAS_RATE_LIMIT_{PROVIDER}_INITIAL_RETRY_DELAY` | 1000 | Initial retry delay (ms) |
| `NYLAS_RATE_LIMIT_{PROVIDER}_MAX_RETRY_DELAY` | 30000 | Maximum retry delay (ms) |
| `NYLAS_MAX_CACHED_LIMITERS` | 100 | Max rate limiters in memory |
| `NYLAS_LIMITER_CACHE_TIMEOUT` | 1800000 | Limiter cache timeout (ms) |
| `NYLAS_RATE_LIMIT_DETAILED_LOGGING` | false | Enable detailed logging |
| `NYLAS_RATE_LIMIT_MONITORING` | true | Enable monitoring events |

## Features

### Per-GrantId Rate Limiting
- Each Nylas connection (grantId) gets its own rate limiter
- Provider-specific limits based on NylasConnection.provider field
- Independent rate limiting prevents one account from affecting others

### Intelligent Retry Logic
- **Exponential Backoff**: 1s, 2s, 4s, 8s, 16s, 30s (max)
- **Retry-After Header Support**: Respects server-provided retry delays
- **Jitter**: Adds randomization to prevent thundering herd
- **Circuit Breaker**: Stops retrying on non-retryable errors

### Error Enhancement
```typescript
interface RateLimitError extends Error {
  isRateLimit: boolean;
  retryAfter?: number;
  grantId?: string;
  provider?: string;
}
```

### Monitoring & Logging
- **Rate Limit Events**: queued, limited, executing, failed, retry
- **Statistics API**: Get real-time rate limiter statistics
- **Configurable Logging**: Environment-controlled verbosity

## Usage

### Basic API Calls
The rate limiting is transparent - existing code continues to work:

```typescript
import { getAllEmailThreads, getEmailThread, nylasSendMessage } from '../services/NylasService';

// These calls are now automatically rate-limited
const threads = await getAllEmailThreads(grantId, contacts);
const emails = await getEmailThread(grantId, threadIds, contact, user);
const result = await nylasSendMessage(grantId, subject, to, cc, bcc);
```

### Rate Limit Statistics
```typescript
import { getRateLimitStats } from '../services/NylasService';

const stats = getRateLimitStats();
console.log('Active limiters:', stats.totalLimiters);
console.log('Limiter details:', stats.limiterStats);
```

### Direct Rate Limited Client Usage
```typescript
import { NylasRateLimitedClient } from '../services/NylasRateLimitedClient';

const rateLimitedClient = new NylasRateLimitedClient(nylas);

const threads = await rateLimitedClient.listThreads({
  identifier: grantId,
  queryParams: { anyEmail: contacts }
});
```

## Error Handling

### Rate Limit Errors
```typescript
try {
  const result = await nylasSendMessage(grantId, subject, to);
} catch (error) {
  if (error.isRateLimit) {
    console.log(`Rate limited for ${error.provider}`);
    if (error.retryAfter) {
      console.log(`Retry after ${error.retryAfter}ms`);
    }
  }
}
```

### Enhanced Error Messages
Rate limit errors now include provider context:
- "Rate limit exceeded for gmail. Retry after 2000ms."
- "Rate limit exceeded for outlook. Please try again later."

## Testing

### Unit Tests
```bash
npm test -- src/tests/services/nylasRateLimit.test.ts
```

### Manual Testing
```bash
npx ts-node src/scripts/testRateLimit.ts
```

### Load Testing
The test script simulates various scenarios:
- Single requests
- Concurrent requests for same grantId
- Multiple providers simultaneously  
- Mixed API call types
- Statistics collection

## Migration

### Backward Compatibility
- ✅ All existing function signatures unchanged
- ✅ All existing error handling works
- ✅ No breaking changes to API

### What Changed
- All direct `nylas.*` calls replaced with rate-limited equivalents
- Enhanced error messages with rate limit context
- Added statistics endpoint
- Simplified retry logic (handled by rate limiter)

## Monitoring

### Key Metrics to Monitor

1. **Rate Limit Events**
   - `limited`: When reservoir is depleted
   - `queued`: Requests waiting in queue
   - `retry`: Failed requests being retried

2. **Performance Metrics**
   - Request latency (includes queueing time)
   - Queue sizes per grantId
   - Success/failure rates

3. **Error Patterns**
   - 429 rate limit errors
   - Provider-specific error rates
   - Retry attempt distributions

### Dashboard Queries
```javascript
// Rate limit events by provider
events.filter(event => event.type === 'limited')
      .groupBy('provider')
      .count()

// Average queue size by grantId  
stats.limiterStats.map(stat => ({
  grantId: stat.grantId,
  provider: stat.provider,
  queueSize: stat.counts.QUEUED
}))
```

## Performance Impact

### Benefits
- **Prevented 429 Errors**: Eliminates rate limit failures
- **Better Provider Compliance**: Respects all provider limits
- **Improved Reliability**: Automatic retries with backoff
- **Isolation**: One slow account doesn't affect others

### Overhead
- **Memory**: ~1KB per active grantId rate limiter
- **Latency**: 0-500ms additional delay (depending on rate limits)
- **CPU**: Minimal bottleneck overhead

### Optimization
- **Limiter Caching**: Automatic cleanup of unused limiters
- **Concurrent Processing**: Different grantIds processed in parallel
- **Smart Queuing**: Prioritizes based on provider capabilities

## Troubleshooting

### Common Issues

**High Queue Sizes**
- Check if rate limits are too conservative
- Consider increasing reservoir size for the provider
- Verify provider limits haven't changed

**Slow Performance**  
- Check `minTime` settings for providers
- Monitor concurrent request limits
- Review retry patterns

**Memory Usage**
- Adjust `NYLAS_MAX_CACHED_LIMITERS`
- Reduce `NYLAS_LIMITER_CACHE_TIMEOUT`

### Debug Logging
Enable detailed logging:
```bash
NYLAS_RATE_LIMIT_DETAILED_LOGGING=true
```

This provides JSON logs for all rate limit events:
```json
{
  "type": "limited",
  "grantId": "grant_123",
  "provider": "gmail", 
  "operation": "threads.list",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "queueSize": 5
}
```

## Future Enhancements

### Planned Features
- **Dynamic Rate Limit Adjustment**: Auto-adjust based on 429 responses
- **Provider Detection**: Automatic provider detection from grantId
- **Metrics Dashboard**: Real-time monitoring interface
- **Circuit Breaker**: Temporary disable failing grantIds
- **Priority Queues**: VIP accounts get priority processing

### Integration Points
- **Logging Service**: Send rate limit events to centralized logging
- **Monitoring Service**: Export metrics to monitoring dashboards
- **Alert System**: Notifications for rate limit violations
- **Analytics**: Track usage patterns and optimization opportunities
