# AI File Searching System Guide

## Overview

The AI File Searching System enables sales teams to upload documents to their sales playbooks, automatically extract meaningful content using AI, and then search and discover relevant information during content creation. The system combines secure file storage, intelligent content extraction, and semantic search to enhance sales productivity.

## System Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│ File Upload │ -> │ AI Processing│ -> │ Search Tool │ -> │ Content      │
│ (S3 + DB)   │    │ (LLM Extract)│    │ (Semantic)  │    │ Composition  │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘
```

## 1. File Upload Process

### How It Works

1. **User uploads a file** via the playbook management interface
2. **File validation** checks format (PDF, DOCX, TXT, MD) and size (max 50MB)
3. **S3 storage** saves the file with a unique key: `{orgId}/playbooks/{playbookId}/{uuid}_{filename}`
4. **Database record** created in `Document` collection with metadata
5. **Asynchronous processing** triggered via file processing queue

### Supported File Types
- **PDF**: Technical specs, case studies, presentations
- **DOCX**: Proposals, reports, documentation  
- **TXT**: Simple reference materials
- **MD**: Markdown documentation

### API Endpoint
```http
POST /api/playbooks/{playbookId}/files
Content-Type: multipart/form-data

{
  "file": [binary file data]
}
```

### Response
```json
{
  "success": true,
  "document": {
    "id": "64a1b2c3d4e5f6g7h8i9j0k1",
    "originalFilename": "product_specs.pdf",
    "fileSize": 2048576,
    "mimeType": "application/pdf",
    "s3Key": "org123/playbooks/playbook456/uuid_product_specs.pdf",
    "uploadedAt": "2024-01-15T10:30:00Z"
  }
}
```

## 2. AI Processing Pipeline

### Automatic Content Extraction

When a file is uploaded, the **File Processing Agent** automatically:

1. **Analyzes the file content** using LLM capabilities
2. **Extracts keywords** (5-15 relevant business terms)
3. **Generates tags** (3-8 categorization labels)
4. **Creates summary** (2-3 sentences describing content and sales utility)
5. **Updates the playbook** with extracted metadata

### Processing Agent Capabilities

```typescript
// Example extraction result
{
  "keywords": ["API integration", "security", "enterprise", "scalability"],
  "tags": ["technical-specs", "integration-guide", "enterprise"],
  "contentSummary": "Technical specification document detailing API integrations and security features for enterprise customers evaluating implementation complexity.",
  "confidence": "High",
  "reasoning": "Clear technical documentation with explicit business context"
}
```

### Database Updates

The system updates the `SalesPlaybook` record with:
- `contentSummary`: AI-generated summary of file contents
- `keywords`: Array of extracted keywords  
- `tags`: Array of categorization tags
- `files`: Reference to uploaded document(s)

## 3. Search & Discovery

### Search Tool Capabilities

The `search_playbook` tool provides powerful search across:
- **Title** (highest weight)
- **Keywords** (high weight)
- **Tags** (medium-high weight)  
- **Content Summary** (medium weight)
- **Content** (lower weight)

### Search Parameters

```typescript
{
  query: string,              // Search terms
  organizationId: string,     // Organization scope (required)
  contentType?: ContentType,  // Optional filter
  tags?: string[],           // Optional tag filter
  limit?: number,            // Results limit (1-10, default: 5)
  includeFiles?: boolean     // Include file attachments (default: true)
}
```

### Relevance Scoring

The system uses intelligent relevance scoring based on:
- **Text match score** (MongoDB text index)
- **Recent usage boost** (+2 points if used in last 30 days)
- **High usage boost** (+1 point if used >5 times)
- **Content summary boost** (+1 point if AI-processed)

### Search Results

```json
{
  "results": [
    {
      "playbookId": "64a1b2c3d4e5f6g7h8i9j0k1",
      "type": "technical_specs",
      "title": "API Integration Guide",
      "content": "Detailed technical specifications...",
      "contentSummary": "Technical guide for enterprise API integration...",
      "tags": ["technical-specs", "integration", "enterprise"],
      "keywords": ["API", "integration", "security", "scalability"],
      "relevanceScore": 12.5,
      "matchedFields": ["title", "keywords"],
      "files": [
        {
          "documentId": "64a1b2c3d4e5f6g7h8i9j0k2",
          "originalFilename": "api_specs.pdf",
          "fileSize": 2048576,
          "mimeType": "application/pdf",
          "downloadUrl": "https://s3.amazonaws.com/bucket/presigned-url",
          "uploadedAt": "2024-01-15T10:30:00Z"
        }
      ]
    }
  ],
  "totalResults": 1,
  "searchQuery": "API integration enterprise",
  "executionTime": 145
}
```

## 4. Content Creation Workflow

### ContentCompositionAgent Integration

The enhanced `ContentCompositionAgent` follows a systematic workflow:

1. **ANALYZE REQUEST**: Understand content type, audience, and objectives
2. **SEARCH STRATEGY**: Identify keywords for playbook search
3. **EXECUTE SEARCH**: Use `search_playbook` tool with relevant queries
4. **EVALUATE RESULTS**: Assess relevance and credibility of findings
5. **SYNTHESIZE CONTENT**: Combine search insights with contextual knowledge
6. **CITE & REFERENCE**: Attribute sources and direct users to detailed files

### File Integration Patterns

- **High-Relevance Results** (score >8): Quote directly and build content around insights
- **Medium-Relevance Results** (score 5-8): Use as supporting evidence
- **Multiple Related Results**: Synthesize common themes
- **File-Heavy Results**: Leverage `contentSummary` while directing to full files
- **No Results**: Use general knowledge with transparency about search attempt

### Usage Examples

#### Email Composition
```
User: "Write a follow-up email to TechCorp about our API integration capabilities"

Agent Process:
1. Searches playbook for "API integration enterprise technical"
2. Finds relevant technical specs and case studies
3. Uses contentSummary for key points
4. Creates email incorporating specific capabilities
5. References downloadable technical documentation
```

#### Proposal Creation
```
User: "Create a proposal section addressing security concerns for healthcare client"

Agent Process:
1. Searches for "security healthcare compliance HIPAA"
2. Finds security whitepapers and healthcare case studies
3. Synthesizes compliance information
4. Builds proposal section with specific security features
5. Includes references to detailed security documentation
```

## 5. API Endpoints Reference

### File Management
```http
# Upload file to playbook
POST /api/playbooks/{playbookId}/files

# List playbook files  
GET /api/playbooks/{playbookId}/files

# Download file (generates presigned URL)
GET /api/playbooks/{playbookId}/files/{fileId}/download

# Delete file
DELETE /api/playbooks/{playbookId}/files/{fileId}
```

### Search
```http
# Search playbooks (used by AI agents)
POST /api/playbooks/search
{
  "query": "string",
  "organizationId": "string",
  "contentType": "optional_type",
  "tags": ["optional", "tags"],
  "limit": 5
}
```

### Content Generation
```http
# Generate content using AI agent
POST /api/agents/content-composition/generate
{
  "prompt": "Write email about API integration",
  "context": {
    "organizationId": "64a1b2c3d4e5f6g7h8i9j0k1",
    "audienceType": "technical",
    "contentType": "email"
  }
}
```

## 6. Configuration & Environment

### Required Environment Variables

```bash
# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_PRODUCTION_BUCKET=your-production-bucket
S3_LOCAL_BUCKET=your-local-bucket

# Database
MONGODB_URI=mongodb://localhost:27017/salescrm

# OpenAI for AI Processing
OPENAI_API_KEY=your_openai_key
```

### File Processing Limits

- **Maximum file size**: 50MB
- **Processing token limit**: 2M tokens
- **Supported formats**: PDF, DOCX, TXT, MD
- **Presigned URL expiration**: 1 hour
- **Search result limit**: 10 results max

## 7. Security & Permissions

### Organization Scoping
- All searches automatically scoped to user's organization
- Files stored with organization-specific S3 keys
- Database queries include organization filters

### Secure File Access
- Presigned URLs with 1-hour expiration
- No direct file system access
- S3 bucket permissions restrict access

### Data Privacy
- AI processing happens on encrypted content
- No file content stored in logs
- Extracted metadata only (no raw content)

## 8. Monitoring & Analytics

### Usage Tracking
- Search queries and results logged
- File access patterns tracked
- Agent usage statistics captured

### Performance Metrics
- Search response times
- File processing duration
- Content generation success rates

### Error Handling
- Graceful degradation when files unavailable
- Retry logic for processing failures
- User-friendly error messages

## 9. Troubleshooting

### Common Issues

**File Upload Fails**
- Check file size (<50MB) and format
- Verify S3 credentials and bucket permissions
- Ensure network connectivity

**Search Returns No Results**  
- Verify organization ID is correct
- Check if files have been processed (contentSummary exists)
- Try broader search terms

**AI Processing Stuck**
- Check OpenAI API key and quota
- Verify file format is supported
- Monitor processing queue for errors

**Content Generation Issues**
- Ensure organizationId is provided in context
- Check if relevant playbook content exists
- Verify agent tool configuration

## 10. Best Practices

### File Organization
- Use descriptive filenames
- Organize by content type and use case
- Keep files updated and relevant

### Search Optimization
- Use specific, business-relevant keywords
- Include industry and use case terms
- Test search queries for effectiveness

### Content Creation
- Provide clear context and objectives
- Specify target audience
- Review and customize generated content

### Maintenance
- Regularly review and update playbook content
- Monitor search analytics for optimization opportunities
- Archive outdated materials

---

This AI File Searching System transforms static sales materials into an intelligent, searchable knowledge base that enhances sales productivity and content quality. 