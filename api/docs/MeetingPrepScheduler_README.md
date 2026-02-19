# Meeting Preparation Scheduler

This document describes the automated meeting preparation system that generates AI-powered meeting agendas for upcoming meetings.

## Overview

The `MeetingPrepSchedulerService` automatically monitors CalendarActivity records and generates comprehensive meeting agendas using the MeetingPrepAgent for meetings in the next 24 hours that don't already have agendas.

## How It Works

### Scheduler Configuration
- **Schedule**: Runs every hour (`0 * * * *`)
- **Location**: `/src/schedulers/MeetingPrepSchedulerService.ts`
- **Auto-start**: Automatically starts when the application boots up
- **Graceful shutdown**: Properly stops when the application shuts down

### Meeting Selection Criteria
The scheduler finds CalendarActivity records where:
- `startTime` is between now and 24 hours from now
- `agenda` field does not exist (no existing agenda)
- `status` is 'scheduled' or 'to_do' (not cancelled/completed)
- Has either a `title` or `description` (basic meeting information available)

### Agenda Generation Process
For each qualifying meeting:

1. **Context Gathering**: Collects comprehensive meeting context including:
   - Meeting details (title, description, attendees, duration, location)
   - Contact information and roles
   - Related prospect and opportunity data
   - Recent interaction history (emails and meetings from last 30 days)
   - MEDDPICC insights from active opportunities

2. **AI Processing**: Uses MeetingPrepAgent to generate:
   - Structured meeting agenda with time allocations
   - Pre-meeting preparation tasks
   - Key questions to ask
   - Success metrics and desired outcomes
   - Follow-up action templates

3. **Storage**: Updates the CalendarActivity record with:
   - Generated agenda content
   - Generation timestamp
   - Agent version information

## AI Agent Integration

### MeetingPrepAgent Capabilities
- **Context Analysis**: Analyzes meeting participants and business relationships
- **Strategic Preparation**: Identifies key discussion points and potential objections
- **Personalization**: Adapts content based on meeting type and attendee profiles
- **Outcome Focus**: Ensures every agenda item advances business objectives

### Agenda Structure
Generated agendas include:
- **Meeting Overview**: Purpose, attendees, and primary objectives
- **Pre-Meeting Preparation**: Research and materials to review
- **Detailed Agenda**: Time-boxed discussion points with specific objectives
- **Key Questions**: Strategic questions to advance relationships and opportunities
- **Success Metrics**: Criteria for measuring meeting effectiveness
- **Follow-up Actions**: Template for next steps and accountability

## API Endpoints

### Admin Routes
The scheduler provides admin endpoints for monitoring and manual control:

#### Get Scheduler Status
```http
GET /api/admin/meeting-prep-scheduler/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "scheduler": {
      "running": true,
      "processing": false
    },
    "description": {
      "running": "Whether the scheduler is active and will run on schedule",
      "processing": "Whether a job is currently being processed",
      "schedule": "Runs every hour to check for meetings in the next 24 hours needing agenda preparation",
      "lookAhead": "24 hours from current time",
      "agendaGeneration": "Uses MeetingPrepAgent to create comprehensive meeting agendas"
    }
  }
}
```

#### Manual Trigger
```http
POST /api/admin/meeting-prep-scheduler/trigger
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Meeting preparation process completed successfully",
  "triggeredBy": "user@example.com",
  "triggeredAt": "2025-01-27T10:30:00.000Z",
  "processedCount": 5,
  "errorCount": 0
}
```

## Data Model Updates

### CalendarActivity Schema
Added optional `agenda` property:

```typescript
agenda?: {
  content: string;           // AI-generated agenda content
  generatedAt: Date;         // When the agenda was created
  generatedBy: 'MeetingPrepAgent';  // Which agent generated it
  version?: string;          // Agent version for tracking
}
```

## Error Handling & Edge Cases

### Robust Error Handling
- **Individual Meeting Errors**: If processing fails for one meeting, it logs the error and continues with the next meeting
- **Service-Level Errors**: If the entire service fails, it logs the error and marks the run as complete
- **Concurrency Protection**: Prevents multiple scheduler runs from overlapping using an `isRunning` flag

### Edge Case Management
- **Missing Context**: Handles meetings with minimal context gracefully
- **No Participants**: Skips meetings without attendee information
- **Duplicate Prevention**: Only generates agendas for meetings that don't already have them
- **Timezone Handling**: Properly handles meeting times across different timezones

### Logging
The scheduler provides detailed logging:
- Start/stop of scheduler runs
- Number of meetings found for processing
- Individual meeting processing results
- Performance metrics (processing time)
- Error details for troubleshooting

## Integration Points

### Application Startup
- Automatically started in `src/index.ts` during server initialization
- Gracefully stopped during application shutdown

### Mastra AI Framework
- MeetingPrepAgent registered in `src/mastra/index.ts`
- Uses OpenAI o3 model with high reasoning effort for comprehensive agenda generation

### Database Integration
- Reads from CalendarActivity, Contact, Prospect, Opportunity, and EmailActivity collections
- Updates CalendarActivity records with generated agendas
- Uses proper MongoDB queries with population for related data

## Performance Considerations

### Optimization Strategies
- **Efficient Queries**: Uses targeted MongoDB queries with proper indexing
- **Batch Processing**: Processes multiple meetings in a single scheduler run
- **Context Limiting**: Limits recent activity history to prevent excessive data processing
- **Error Isolation**: Individual meeting failures don't break the entire batch

### Resource Management
- **Rate Limiting**: Respects AI service rate limits through proper error handling
- **Memory Efficiency**: Uses lean queries and limits data retrieval
- **Concurrent Protection**: Prevents multiple scheduler instances from running simultaneously

## Monitoring & Maintenance

### Key Metrics to Monitor
- **Processing Success Rate**: Percentage of meetings successfully processed
- **Average Processing Time**: Time taken per meeting and per batch
- **Error Frequency**: Rate of processing failures and common error types
- **Agenda Quality**: Effectiveness of generated meeting agendas

### Maintenance Tasks
- **Log Review**: Regular review of scheduler logs for optimization opportunities
- **Performance Tuning**: Adjust query limits and processing strategies as needed
- **Agent Updates**: Update MeetingPrepAgent instructions based on user feedback
- **Schema Evolution**: Handle CalendarActivity schema changes gracefully

This scheduler enhances meeting productivity by ensuring every upcoming meeting has a comprehensive, context-aware agenda prepared in advance, leveraging the full power of the CRM's relationship and opportunity intelligence.
