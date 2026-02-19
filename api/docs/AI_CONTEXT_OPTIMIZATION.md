# AI Context Length Optimization Guide

This document explains how to ensure your AI model calls don't exceed context length limits, specifically for the ResponsivenessService and other AI intelligence services.

## Overview

The ResponsivenessService has been optimized to work with different AI models (o3, o3-mini, gpt-4o) by implementing smart data optimization and context length monitoring.

## Key Components

### 1. Token Estimation Utilities (`src/utils/tokenUtils.ts`)

- **`estimateTokenCount(text: string)`**: Estimates token count for text content
- **`estimateJsonTokenCount(obj: any)`**: Estimates tokens for JSON objects
- **`truncateToTokenLimit(text: string, maxTokens: number)`**: Truncates text to fit token limits
- **`exceedsSafeLimit(content: string)`**: Checks if content exceeds safe limits
- **`getTokenStats(content: string)`**: Provides detailed token usage statistics

### 2. Activity Data Optimizer (`src/services/AI/personIntelligence/ActivityDataOptimizer.ts`)

Optimizes email and calendar activity data for AI analysis:

- **Smart filtering**: Prioritizes recent and relevant activities
- **Content truncation**: Reduces email bodies and meeting content to fit token budgets
- **Progressive reduction**: Multiple optimization levels for different scenarios
- **Token budgeting**: Allocates tokens between emails (70%) and meetings (30%)

### 3. Model Configuration (`src/config/aiOptimization.ts`)

Defines model-specific configurations:

```typescript
MODEL_CONFIGS = {
  'o3': {
    inputTokenLimit: 200000,
    safeInputLimit: 180000,
    activityDataBudget: 150000
  },
  'o3-mini': {
    inputTokenLimit: 4000,
    safeInputLimit: 3500,
    activityDataBudget: 2800
  }
  // ... other models
}
```

## How It Works

### 1. Automatic Model Detection

The system automatically detects the AI model being used and applies appropriate limits:

```typescript
const optimizationConfig = getOptimizationConfigWithOverrides();
```

### 2. Progressive Data Optimization

1. **Primary optimization**: Uses model-specific limits for emails and meetings
2. **Emergency fallback**: If prompt still exceeds limits, applies more aggressive reduction
3. **Token monitoring**: Continuously tracks token usage throughout the process

### 3. Smart Content Selection

- **Recent first**: Prioritizes most recent activities when `prioritizeRecent: true`
- **Quality filtering**: Removes unnecessary fields and optimizes data structures
- **Content truncation**: Intelligently truncates long email bodies and meeting content

## Configuration Options

### Environment Variables

Set these in your `.env` file to override defaults:

```bash
# Model configuration
AI_MODEL_NAME=o3                    # o3, o3-mini, gpt-4o, gpt-4o-mini

# Activity limits
AI_MAX_EMAIL_ACTIVITIES=15          # Maximum number of emails to include
AI_MAX_CALENDAR_ACTIVITIES=10       # Maximum number of meetings to include
AI_MAX_TOKENS_PER_EMAIL=800         # Token limit per email
AI_MAX_TOKENS_PER_MEETING=400       # Token limit per meeting

# Behavior flags
AI_PRIORITIZE_RECENT=true           # Whether to prioritize recent activities
AI_INCLUDE_ATTENDEE_DETAILS=true    # Whether to include attendee information
```

### Model-Specific Defaults

The system automatically adjusts limits based on the model:

| Model | Max Emails | Max Meetings | Tokens/Email | Tokens/Meeting |
|-------|------------|--------------|--------------|----------------|
| o3 | 15 | 10 | 800 | 400 |
| o3-mini | 5 | 3 | 300 | 200 |
| gpt-4o | 15 | 10 | 800 | 400 |

## Monitoring and Debugging

### Token Usage Logs

The service provides detailed logging:

```
-> Using optimization config: 15 emails, 10 meetings
-> Optimization results:
   Original: 50 emails, 25 meetings
   Optimized: 15 emails, 10 meetings
   Total tokens: 45000 (30.0% of budget)
-> Prompt token analysis: 47500 tokens (26.4% of limit)
```

### Emergency Fallback

If the prompt exceeds safe limits, the system automatically:

1. **Logs a warning**: `WARNING: Prompt exceeds safe token limit!`
2. **Applies emergency reduction**: Uses more aggressive limits
3. **Retries**: Attempts to fit within limits using emergency configuration

## Best Practices

### 1. Monitor Token Usage

Always check the logs for token usage statistics:
- Look for "% of budget" and "% of limit" percentages
- Watch for emergency fallback warnings
- Adjust configuration if consistently hitting limits

### 2. Tune for Your Use Case

- **High-volume prospects**: Reduce `maxEmailActivities` and `maxCalendarActivities`
- **Detailed analysis**: Increase `maxTokensPerEmail` and `maxTokensPerMeeting`
- **Recent focus**: Keep `prioritizeRecent: true`

### 3. Test with Real Data

Use the token estimation utilities to test with your actual data:

```typescript
import { getTokenStats } from '../utils/tokenUtils';

const stats = getTokenStats(yourPromptContent);
console.log(`Tokens: ${stats.estimatedTokens} (${stats.percentOfLimit}% of limit)`);
```

## Extending to Other Services

To apply similar optimizations to other AI services:

1. **Import the utilities**:
   ```typescript
   import { ActivityDataOptimizer } from './ActivityDataOptimizer';
   import { getOptimizationConfigWithOverrides } from '../../config/aiOptimization';
   ```

2. **Optimize your data**:
   ```typescript
   const config = getOptimizationConfigWithOverrides();
   const optimizedData = ActivityDataOptimizer.optimizeEmailActivities(rawData, config);
   ```

3. **Monitor token usage**:
   ```typescript
   const stats = getTokenStats(promptContent);
   if (!stats.withinLimit) {
     // Apply emergency reduction
   }
   ```

## Troubleshooting

### Common Issues

1. **"Prompt exceeds safe token limit"**
   - Check your data volume
   - Reduce `maxEmailActivities` or `maxCalendarActivities`
   - Increase token limits per item if content is dense

2. **"Emergency reduction activated"**
   - Your regular limits are too high for the data volume
   - Consider more aggressive primary optimization
   - Check if you're using the right model configuration

3. **Poor AI analysis quality**
   - Limits might be too restrictive
   - Increase `maxTokensPerEmail` or `maxTokensPerMeeting`
   - Consider including more activities if token budget allows

### Performance Considerations

- Token estimation is fast but not 100% accurate
- Emergency fallback adds processing overhead
- Consider caching optimization results for repeated analyses

## Migration Notes

If you're upgrading from the original ResponsivenessService:

1. **No breaking changes**: The API remains the same
2. **Automatic optimization**: Data is automatically optimized
3. **Better logging**: More detailed token usage information
4. **Configurable**: Can be tuned via environment variables

The optimized service is backward compatible and should work with existing code without modifications.
