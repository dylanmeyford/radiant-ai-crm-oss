# AI Usage Tracking System

## Overview

The AI Usage Tracking System monitors and records all AI agent calls made through Mastra, tracking token usage (input/output) per organization and categorizing usage by type (Actions, Processing, Research). This enables billing, cost analysis, and usage monitoring.

## Architecture

### Components

1. **Models**
   - `AIUsageTracking` - Stores monthly usage data per organization
   - `AgentRates` - Stores pricing rates for each agent

2. **Services**
   - `AIUsageTrackingService` - Core service for recording and querying usage
   - `mastraUsageWrapper` - Wraps Mastra agents to intercept and track calls

3. **API**
   - `aiUsageController` - REST API handlers
   - `aiUsageRoutes` - API endpoints

4. **Configuration**
   - `agentCategories.ts` - Maps agents to categories
   - `defaultAgentRates.ts` - Default pricing configuration

## Data Model

### AIUsageTracking Schema

```typescript
{
  organization: ObjectId,           // Reference to organization
  year: number,                     // Year (e.g., 2025)
  month: number,                    // Month (1-12)
  usage: {
    actions: {
      inputTokens: number,
      outputTokens: number,
      callCount: number,
      agents: Map<agentName, {
        inputTokens: number,
        outputTokens: number,
        callCount: number
      }>
    },
    processing: { ... },            // Same structure
    research: { ... }               // Same structure
  },
  createdAt: Date,
  updatedAt: Date
}
```

**Key Features:**
- One document per organization per month
- Historical data preserved indefinitely
- Atomic updates using MongoDB $inc operations
- Indexed on (organization, year, month) for fast queries

### AgentRates Schema

```typescript
{
  agentName: string,                // Name of the agent
  category: 'actions' | 'processing' | 'research',
  inputTokenRate: number,           // Cost per 1M input tokens ($)
  outputTokenRate: number,          // Cost per 1M output tokens ($)
  effectiveDate: Date,              // When rate becomes active
  isActive: boolean,                // Whether rate is current
  modelName: string,                // OpenAI model (e.g., 'gpt-5')
  createdAt: Date,
  updatedAt: Date
}
```

## Agent Categories

### Processing (14 agents)
Intelligence pipeline agents that analyze activities and build deal intelligence:
- `summariseActivityAgent`, `activityImpactAgent`, `behavioralSignalAgent`
- `communicationPatternAgent`, `relationshipStoryAgent`, `dealSummaryAgent`
- `roleExtractionAgent`, `responsivenessAgent`, `meddpiccAgent`
- `scoreReasoningAgent`, `titleMeetingAgent`, `opportunityContextAgent`
- `fileProcessingAgent`, `basicAgent`

### Actions (6 agents)
Action pipeline agents that generate recommendations and content:
- `nextActionAgent`, `actionEvaluationAgent`, `enhancedContentAgent`
- `playbookSelectionAgent`, `decideOnlineResearchAgent`, `evaluationAgent`

### Research (3 agents)
Research agents that perform web searches and contact research:
- `researchAgent`, `contactResearchAgent`, `meetingPrepAgent`

## How It Works

### 1. Agent Wrapping

When the application starts, all Mastra agents are wrapped with tracking functionality:

```typescript
// src/mastra/index.ts
const baseMastra = new Mastra({ agents: { ... } });
const wrappedAgents = wrapAgents(baseMastra.agents);
const mastra = new Mastra({ agents: wrappedAgents });
```

### 2. Usage Recording

When an agent is called, the wrapper:

1. Calls the original agent's `generate()` method
2. Extracts token usage from the response
3. Extracts organization ID from metadata
4. Records usage asynchronously (non-blocking)
5. Returns the original response unchanged

```typescript
// Usage is recorded automatically
const result = await nextActionAgent.generateLegacy(messages, {
  providerOptions: {
    openai: {
      metadata: {
        orgId: organizationId,  // Required for tracking
        // ... other metadata
      }
    }
  }
});
```

### 3. Data Storage

Usage is stored atomically using MongoDB's `$inc` operator:

```typescript
await AIUsageTracking.findOneAndUpdate(
  { organization: orgId, year: 2025, month: 10 },
  { 
    $inc: { 
      'usage.actions.inputTokens': 1500,
      'usage.actions.outputTokens': 750,
      'usage.actions.callCount': 1,
      'usage.actions.agents.nextActionAgent.inputTokens': 1500,
      // ...
    }
  },
  { upsert: true }
);
```

## API Endpoints

### GET /api/ai-usage/current

Get current month's usage for the authenticated user's organization.

**Response:**
```json
{
  "period": { "year": 2025, "month": 10 },
  "totalTokens": { "input": 1000000, "output": 500000 },
  "totalCost": 125.50,
  "breakdown": {
    "actions": {
      "inputTokens": 200000,
      "outputTokens": 100000,
      "callCount": 50,
      "cost": 45.00
    },
    "processing": { ... },
    "research": { ... }
  },
  "topAgents": [
    {
      "name": "nextActionAgent",
      "category": "actions",
      "inputTokens": 150000,
      "outputTokens": 75000,
      "callCount": 30,
      "cost": 35.25
    },
    // ... top 10 agents by cost
  ]
}
```

### GET /api/ai-usage/:year/:month

Get usage for a specific month (e.g., `/api/ai-usage/2025/9` for September 2025).

**Response:** Same format as current month endpoint.

### GET /api/ai-usage/history?months=6

Get usage history for multiple months (default: 6, max: 24).

**Response:**
```json
{
  "requestedMonths": 6,
  "history": [
    { /* October 2025 data */ },
    { /* September 2025 data */ },
    // ... up to 6 months
  ]
}
```

## Setup & Configuration

### 1. Seed Agent Rates

Before using the system, seed the default pricing rates:

```bash
npm run seed:agent-rates
```

This creates default rates for all 23 agents based on their underlying models:
- GPT-5 (o1): $15/$60 per 1M tokens
- GPT-5-mini (o1-mini): $3/$12 per 1M tokens
- GPT-4o: $2.50/$10 per 1M tokens
- GPT-4o-mini: $0.15/$0.60 per 1M tokens
- GPT-5-nano: $0.10/$0.40 per 1M tokens

### 2. Ensure Organization ID in Metadata

For tracking to work, all AI agent calls MUST include the organization ID in metadata:

```typescript
const result = await agent.generateLegacy(messages, {
  providerOptions: {
    openai: {
      metadata: {
        orgId: organizationId.toString(),  // REQUIRED
        // ... other metadata
      }
    }
  }
});
```

### 3. Update Existing Code (If Needed)

Most existing code already includes `orgId` in metadata. If you add new agent calls, ensure you include it.

## Cost Calculation

Costs are calculated using the formula:

```typescript
cost = (inputTokens / 1_000_000) * inputTokenRate + 
       (outputTokens / 1_000_000) * outputTokenRate
```

For example, with GPT-5 rates ($15 input, $60 output):
- 100,000 input tokens = $1.50
- 50,000 output tokens = $3.00
- Total = $4.50

## Performance Considerations

### Non-Blocking Recording
Usage recording is fully asynchronous and never blocks AI operations:
- If recording fails, it logs an error but doesn't throw
- AI calls proceed normally regardless of tracking status
- Failed recordings don't affect application functionality

### Atomic Updates
MongoDB's atomic operations prevent race conditions:
- Multiple concurrent calls to the same agent are handled correctly
- No need for application-level locking
- Consistent counts even under high load

### Efficient Queries
Indexes ensure fast queries:
- `(organization, year, month)` unique index for upserts
- `(organization, year, month)` descending index for history queries

## Monitoring & Maintenance

### Viewing Logs

Usage recording logs appear in the console:

```
[AI Usage] Recorded: nextActionAgent (actions) - Input: 1500, Output: 750
```

### Updating Rates

To update pricing rates:

1. Modify `src/config/defaultAgentRates.ts`
2. Run `npm run seed:agent-rates`
3. Old rates are deactivated, new rates become active

### Data Retention

Monthly documents are preserved indefinitely. To implement retention:

1. Create a cleanup script to archive old documents
2. Schedule it to run monthly
3. Archive documents older than your retention period (e.g., 24 months)

## Testing

### Manual Testing

1. Make an AI call with a known organization ID
2. Check the database for usage records
3. Call the API endpoint to verify data
4. Verify cost calculations

### Example Test Flow

```bash
# 1. Seed rates
npm run seed:agent-rates

# 2. Start the application
npm run dev

# 3. Make an AI-tracked API call (e.g., create an activity)
# This will trigger intelligence processing

# 4. Query usage
curl -H "Authorization: TOKEN" \
  http://localhost:4000/api/ai-usage/current

# 5. Verify response shows token usage and costs
```

### Integration Tests

Create tests that:
- Mock AI responses with token usage
- Verify usage is recorded correctly
- Test cost calculations
- Validate API endpoints return correct data

## Troubleshooting

### No Usage Being Recorded

**Check:**
1. Is `orgId` included in metadata?
2. Are agents wrapped correctly? (Check mastra/index.ts)
3. Are there errors in console logs?

**Debug:**
```typescript
console.log('Calling agent with metadata:', options?.providerOptions?.openai?.metadata);
```

### Incorrect Cost Calculations

**Check:**
1. Are agent rates seeded? Query AgentRates collection
2. Is agent categorized correctly? Check agentCategories.ts
3. Are token counts accurate? Check response.usage

### Missing Historical Data

**Check:**
1. Query the AIUsageTracking collection directly
2. Verify organization ID matches
3. Check year/month values are correct

## Future Enhancements

Potential improvements:
- Real-time usage alerts/notifications
- Usage quotas and limits per organization
- Detailed cost breakdown by user within organization
- Usage forecasting and trends
- Integration with billing systems
- Usage dashboards and visualizations
- Export usage data to CSV/Excel
- Webhook notifications for usage thresholds

