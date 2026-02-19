# Contact Research System

This document describes the AI-powered contact research system that automatically analyzes new contacts to gather professional intelligence for sales teams.

## Overview

The contact research system automatically triggers when new contacts are added to the CRM (both manually and through auto-population). It uses AI to research the contact's professional background, role, LinkedIn profile, and potential conversation starters.

## Features

### Automatic Research Triggers
- **Manual Contact Creation**: Research triggers when contacts are manually added via the API
- **Auto-Population**: Research triggers when contacts are auto-created from:
  - Email activities (Nylas integration)
  - Calendar activities (meeting participants)
  - Digital Sales Room visitors
  - Contact auto-population from email discovery

### Research Intelligence Gathered
- **Personal Summary**: Brief professional overview of the contact
- **Role at Company**: Specific responsibilities and position
- **LinkedIn Profile**: Direct link to their LinkedIn profile (if found)
- **Background Information**: Education, career history, achievements
- **Connection Opportunities**: Conversation starters and common ground
- **Contact Score**: 1-10 relevance score for sales outreach priority
- **Debug Information**: Search queries attempted and information sources

## Technical Implementation

### Database Schema

The contact research data is stored in the `contactResearch` field of the Contact model:

```typescript
interface IContactResearch {
  personalSummary?: string;
  roleAtCompany?: string;
  linkedInProfile?: string;
  backgroundInfo?: string;
  connectionOpportunities?: string[];
  contactScore?: number;
  researchedAt?: Date;
  debug?: {
    noInformationFound: boolean;
    searchQueries: string[];
    informationSources: string[];
  };
}
```

### AI Agent

The `contactResearchAgent` uses GPT-4o with web search capabilities to:
1. Search for the contact using multiple query combinations
2. Focus on finding LinkedIn profiles
3. Gather professional background information
4. Identify conversation starters
5. Score the contact's sales relevance

### Research Process

1. **Contact Creation**: New contact is saved to database
2. **Middleware Trigger**: Post-save middleware detects new contact
3. **Background Research**: AI agent researches the contact asynchronously
4. **Data Storage**: Research results are saved back to the contact record
5. **Logging**: Comprehensive logging tracks the research process

## Usage Examples

### Accessing Research Data

```typescript
// Get a contact with research data
const contact = await Contact.findById(contactId);

if (contact.contactResearch) {
  console.log('Personal Summary:', contact.contactResearch.personalSummary);
  console.log('LinkedIn Profile:', contact.contactResearch.linkedInProfile);
  console.log('Contact Score:', contact.contactResearch.contactScore);
  console.log('Connection Opportunities:', contact.contactResearch.connectionOpportunities);
  
  // Check if research found information
  if (contact.contactResearch.debug?.noInformationFound) {
    console.log('Limited information available for this contact');
  }
}
```

### Manual Research Trigger

```typescript
import { researchContact } from '../services/contactResearchService';

// Manually trigger research for a specific contact
const result = await researchContact(contactId);
if (result) {
  console.log('Research completed:', result);
}
```

## Contact Scoring System

The AI agent scores contacts from 1-10 based on their potential value for sales outreach:

- **9-10**: C-level executives, VPs, key decision makers
- **7-8**: Directors, senior managers, department heads  
- **5-6**: Mid-level managers, team leads, specialists
- **3-4**: Individual contributors, junior roles
- **1-2**: Administrative or support roles

## Research Strategy

The AI agent uses a multi-layered search approach:

### Primary Searches
- "[First Name] [Last Name] [Company Name]"
- "[First Name] [Last Name] [Job Title] [Company Name]"
- "[First Name] [Last Name] LinkedIn [Company Name]"
- "[Job Title] [Company Name] [First Name]"

### Secondary Searches (if primary yields little)
- "[First Name] [Last Name] [Industry/Domain]"
- "[Company Name] [Department] [First Name] [Last Name]"
- "[First Name] [Last Name] [Location if known]"

## Performance Considerations

### Asynchronous Processing
- Research runs in the background without blocking contact creation
- Failed research attempts don't prevent contact creation
- Research results are cached to avoid duplicate work

### Rate Limiting
- Research only triggers for new contacts
- Existing contacts are only re-researched if >30 days old
- Comprehensive error handling prevents system disruption

### Resource Management
- Research tasks are logged for monitoring
- Failed research attempts are tracked in debug information
- System gracefully handles AI agent timeouts or failures

## Monitoring and Debugging

### Logging
All research activities are logged with the prefix `[CONTACT-RESEARCH]`:
- Research initiation and completion
- Contact information quality assessment
- AI agent response parsing
- Error conditions and fallbacks

### Debug Information
Each research result includes debug data:
- `noInformationFound`: Boolean indicating if meaningful research was completed
- `searchQueries`: Array of search terms attempted
- `informationSources`: Types of sources where information was found

### Error Handling
- Invalid contact data: Graceful fallback with debug flag
- AI agent failures: Error state saved to contact record
- Parsing errors: Text extraction fallback mechanism
- Network issues: Logged and retried on next contact update

## Configuration

### Required Environment Variables
- OpenAI API credentials (for GPT-4o)
- Web search API access (for research capabilities)

### Dependencies
- `@mastra/core`: AI agent framework
- `@ai-sdk/openai`: OpenAI integration
- `zod`: Schema validation
- `mongoose`: Database operations

## Future Enhancements

### Planned Features
- Integration with additional data sources (company databases, news APIs)
- Real-time research updates based on contact activity
- Batch research for existing contact databases
- Research quality scoring and feedback loops
- Custom research templates per industry/role

### Optimization Opportunities
- Caching of company-level research data
- Parallel processing of multiple contacts
- Integration with CRM activity scoring
- Automated research refresh based on contact engagement

## Troubleshooting

### Common Issues

1. **No Research Data**: Check if contact has sufficient information (name + email/title + company)
2. **Research Failed**: Check logs for AI agent errors or network issues
3. **Incomplete Research**: Review debug.searchQueries to see what was attempted
4. **Performance Issues**: Monitor research queue and consider rate limiting

### Support Commands

```bash
# Check recent research activity
grep "\[CONTACT-RESEARCH\]" logs/application.log | tail -50

# Find contacts with failed research
db.contacts.find({"contactResearch.debug.noInformationFound": true})

# Manually trigger research for a contact
# (Use the researchContact service function)
```

## Privacy and Compliance

### Data Sources
- Only uses publicly available professional information
- Focuses on business-relevant data (LinkedIn, company websites, news)
- Avoids personal or private information

### Data Retention
- Research data is stored indefinitely unless manually deleted
- Re-research only occurs if >30 days old or manually triggered
- Debug information helps track data sources for compliance

### GDPR Considerations
- Research data can be deleted on contact deletion
- Data sources are tracked for transparency
- Processing is based on legitimate business interests
