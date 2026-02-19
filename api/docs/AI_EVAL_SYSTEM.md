# AI Evaluation System

## Overview

The AI Evaluation System enables you to test and compare different prompts and models across your AI agents. It captures production agent runs with their full input context, stores them for replay, and lets you experiment with template changes without deploying code.

**Key Capabilities:**
- Capture agent inputs/outputs automatically during production runs
- Store prompts with native JS template literal syntax (copy-paste compatible with your code)
- Re-run captured scenarios with modified prompts or different models
- Compare results using Mastra scorers (built-in + custom)
- Test before deploying - no code changes needed

## Architecture

### Two-Layer Capture System

The system captures data at two levels to enable complete replay:

#### Layer 1: Service-Level Variable Capture
Captures raw input variables **before** prompt interpolation in agent service methods (e.g., `NextBestActionAgent.decideNextActions()`).

**What's captured:**
- Raw context objects (opportunity, contacts, activities, etc.)
- Database query results (playbooks, pipeline stages, etc.)
- Runtime values (attempt number, current date, etc.)

**Why:** Without this, we'd only see the final rendered prompt string and couldn't re-render it with a different template.

#### Layer 2: Wrapper-Level Execution Capture
Captures execution metadata in the `mastraUsageWrapper` after the agent runs.

**What's captured:**
- Rendered prompt string
- Agent output (text + structured)
- Token usage
- Latency
- Model used

**Why:** Provides execution metrics and the actual output for comparison.

```
Service Layer                    Wrapper Layer
     ↓                                ↓
[Raw Variables] ────────────> [Execution Data]
     ↓                                ↓
  context.opportunity           renderedPrompt
  context.contacts              output.actions
  businessInformation           tokenUsage
  productOverview               latencyMs
  pipelineStages                modelName
     ↓                                ↓
     └──────────────┬─────────────────┘
                    ↓
            [EvalRun in MongoDB]
```

## Data Models

### EvalRun
Stores a single captured agent execution.

```typescript
{
  organization: ObjectId,
  agentName: string,              // e.g., "nextActionAgent"
  status: 'pending' | 'completed' | 'failed',
  capturedAt: Date,
  
  // SERVICE LAYER CAPTURE
  inputVariables: {
    // All variables that go into the prompt template
    opportunity: Object,
    contacts: Array,
    recentActivities: Array,
    businessInformation: Array,
    // ... etc
  },
  promptTemplate: ObjectId,       // Reference to PromptTemplate (optional)
  promptTemplateVersion: string,  // e.g., "v1.0"
  
  // WRAPPER LAYER CAPTURE
  fullPrompt: string,             // Final rendered prompt
  inputMessages: Array,           // Messages sent to LLM
  outputText: string,             // Raw text output
  parsedOutput: Object,           // Structured output (e.g., NextBestActionsResult)
  
  // Execution metadata
  usage: {
    inputTokens: number,
    outputTokens: number,
    totalTokens: number
  },
  latencyMs: number,
  modelName: string,              // e.g., "gpt-5"
  
  // Eval management
  expectedOutput: Object,         // Human-verified expected result
  expectedNotes: string,          // Why this is the expected output
  tags: Array<string>,
  metadata: Object,               // Additional context
}
```

### EvalDataset
Groups EvalRuns into reusable test sets.

```typescript
{
  organization: ObjectId,
  agentName: string,
  name: string,                   // e.g., "NextAction Golden Set"
  description: string,
  runs: Array<ObjectId>,          // References to EvalRun
  createdBy: ObjectId,
  createdAt: Date,
}
```

### PromptTemplate
Stores versioned prompt templates using native JS template literal syntax.

```typescript
{
  organization: ObjectId,         // null for system-wide templates
  agentName: string,
  version: string,                // e.g., "v1.0", "v1.1-shorter"
  description: string,
  template: string,               // Using ${variable} syntax
  variableSchema: Object,         // JSON Schema for variables
  isActive: boolean,              // Is this the production template?
  createdBy: ObjectId,
  createdAt: Date,
}
```

## How Capture Works

### Automatic Capture (Production)

When an instrumented agent runs, it automatically captures if sampling allows:

1. **Agent service calls `EvalCaptureService.startCapture()`**
   - Passes raw input variables
   - Gets back a `captureId`
   
2. **Service builds prompt and calls agent**
   - Passes `captureId` in metadata
   
3. **Wrapper intercepts `generateLegacy()`**
   - Executes agent normally
   - Calls `EvalCaptureService.recordExecution()` with captureId
   - Stores execution results

### Sampling Control

Controlled by `EVAL_CAPTURE_SAMPLE_RATE` environment variable (0-1):
- `1.0` = Capture every run (100%)
- `0.1` = Capture 10% of runs
- `0.0` = Disable capture

Can also pass `samplingRate` per agent call to override the default.

### Currently Instrumented Agents

- ✅ `nextActionAgent` - Full service-level + wrapper capture

To instrument additional agents, follow the same pattern as `NextBestActionAgent.decideNextActions()`.

## Template Management

### Template Syntax: Native JS Template Literals

Templates use **exactly the same syntax** as your production code:

```typescript
// Your production code in NextBestActionAgent.ts
const prompt = `
<role>
  You are an elite B2B sales strategist...
</role>
<opportunity>
  <name>${opportunity.name || 'Unnamed'}</name>
  <contacts>
    ${contacts.map(({ contact }) => `
      - ${contact.firstName} ${contact.lastName}
        Email: ${contact.emails?.[0]?.address}
    `).join('\n')}
  </contacts>
</opportunity>
`;
```

**Same template in eval system** - just stored as a string in MongoDB:

```typescript
// POST /api/evals/templates
{
  "agentName": "nextActionAgent",
  "version": "v1.1-experiment",
  "template": "<role>...</role>\n<opportunity>\n  <name>${opportunity.name || 'Unnamed'}</name>\n  <contacts>\n    ${contacts.map(({ contact }) => `\n      - ${contact.firstName} ${contact.lastName}\n    `).join('\\n')}\n  </contacts>\n</opportunity>"
}
```

### Rendering Templates

The `TemplateRenderer` service uses `new Function()` to evaluate template strings with variables in scope:

```typescript
import { renderTemplate } from '../services/AI/evals/TemplateRenderer';

const template = `<role>You are...</role>\n<name>${opportunity.name}</name>`;
const variables = { opportunity: { name: 'Acme Corp Deal' } };

const rendered = renderTemplate(template, variables);
// Output: "<role>You are...</role>\n<name>Acme Corp Deal</name>"
```

This gives you full JS expression support: `.map()`, `.filter()`, ternaries, `||` defaults, etc.

## API Endpoints

All endpoints require authentication via the `protect` middleware.

### Captured Runs

#### List Captured Runs
```bash
GET /api/evals/runs?agentName=nextActionAgent&status=completed&limit=50

Response:
{
  "success": true,
  "data": {
    "runs": [
      {
        "_id": "...",
        "agentName": "nextActionAgent",
        "status": "completed",
        "capturedAt": "2026-01-15T10:30:00Z",
        "inputVariables": { ... },
        "parsedOutput": { ... },
        "usage": { inputTokens: 12500, outputTokens: 850 },
        "latencyMs": 4200,
        "modelName": "gpt-5"
      },
      // ...
    ],
    "total": 127
  }
}
```

#### Mark Run as Expected Output
```bash
POST /api/evals/runs/:runId/mark-golden

Body:
{
  "expectedOutput": { 
    "actions": [
      {
        "type": "EMAIL",
        "details": { ... },
        // ... the validated correct output
      }
    ]
  },
  "notes": "Verified by sales team - correct next action for this scenario"
}

Response:
{
  "success": true,
  "message": "Run marked with expected output"
}
```

### Datasets

#### Create Dataset
```bash
POST /api/evals/datasets

Body:
{
  "name": "NextAction Golden Set v1",
  "description": "50 representative runs across different opportunity types and scenarios",
  "agentName": "nextActionAgent",
  "runIds": ["run1", "run2", "run3", ...]
}

Response:
{
  "success": true,
  "data": {
    "_id": "dataset123",
    "name": "NextAction Golden Set v1",
    "runs": ["run1", "run2", ...]
  }
}
```

### Templates

#### List Templates
```bash
GET /api/evals/templates?agentName=nextActionAgent

Response:
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "agentName": "nextActionAgent",
      "version": "v1.0",
      "description": "Production template",
      "isActive": true,
      "createdAt": "..."
    },
    {
      "_id": "...",
      "version": "v1.1-shorter",
      "description": "Reduced instructions by 40%",
      "isActive": false,
      "createdAt": "..."
    }
  ]
}
```

#### Create Template Version
```bash
POST /api/evals/templates

Body:
{
  "agentName": "nextActionAgent",
  "version": "v1.1-shorter-instructions",
  "description": "Removed redundant examples, simplified step framework",
  "template": "<role>\n  You are an elite B2B sales strategist...\n</role>\n<opportunity>\n  <name>${opportunity.name}</name>\n  <contacts>\n    ${contacts.map(({ contact }) => `- ${contact.firstName}`).join('\\n')}\n  </contacts>\n</opportunity>"
}

Response:
{
  "success": true,
  "data": {
    "_id": "template456",
    "version": "v1.1-shorter-instructions",
    // ...
  }
}
```

#### Activate Template (Deploy to Production)
```bash
POST /api/evals/templates/:templateId/activate

Response:
{
  "success": true,
  "message": "Template activated. Deactivated previous version."
}
```

### Experiments

#### Run Experiment
```bash
POST /api/evals/experiments

Body:
{
  "name": "Test Shorter Instructions",
  "datasetId": "dataset123",
  "variants": [
    {
      "name": "baseline",
      "templateId": "template-v1.0",
      "modelName": "gpt-5"
    },
    {
      "name": "experiment",
      "templateId": "template-v1.1-shorter",
      "modelName": "gpt-5"
    }
  ],
  "scorers": ["actionTypeMatch", "reasoningQuality"],
  "concurrency": 3
}

Response:
{
  "success": true,
  "data": {
    "experimentId": "exp789",
    "results": {
      "baseline": {
        "avgScores": {
          "actionTypeMatch": 0.92,
          "reasoningQuality": 0.78
        },
        "avgLatency": 4200,
        "avgTokens": { input: 12500, output: 850 }
      },
      "experiment": {
        "avgScores": {
          "actionTypeMatch": 0.94,
          "reasoningQuality": 0.82
        },
        "avgLatency": 3100,
        "avgTokens": { input: 8200, output: 780 }
      }
    },
    "comparison": {
      "winner": "experiment",
      "improvements": [
        "actionTypeMatch: +2.2%",
        "reasoningQuality: +5.1%",
        "latency: -26%",
        "tokens: -34%"
      ],
      "regressions": []
    }
  }
}
```

## Usage Workflows

### Workflow 1: Testing a Prompt Change

```
┌─────────────────────────────────────────┐
│ 1. View Captured Runs                   │
│    GET /api/evals/runs                  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│ 2. Create Dataset from Good Examples    │
│    POST /api/evals/datasets             │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│ 3. Mark Expected Outputs (Optional)     │
│    POST /api/evals/runs/:id/mark-golden│
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│ 4. Copy Current Template from Code      │
│    From: NextBestActionAgent.ts         │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│ 5. Create New Template Version          │
│    POST /api/evals/templates            │
│    (Modify: shorter, clearer, etc.)     │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│ 6. Run Experiment                        │
│    POST /api/evals/experiments          │
│    (Compare baseline vs new template)   │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│ 7. Review Results                        │
│    Scores, latency, token usage         │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│ 8. If Winner: Copy Back to Code         │
│    Paste template into production       │
│    OR: Activate template via API        │
└─────────────────────────────────────────┘
```

### Workflow 2: Testing a Model Change

Same as above, but in step 5, keep the same template and change the `modelName` in the experiment variants:

```bash
POST /api/evals/experiments
{
  "variants": [
    { "templateId": "current-template", "modelName": "gpt-5" },
    { "templateId": "current-template", "modelName": "gpt-4o" },
    { "templateId": "current-template", "modelName": "claude-3-opus" }
  ]
}
```

### Workflow 3: Local Quick Testing

For rapid iteration without the full API workflow:

```bash
npx ts-node src/scripts/testPromptChange.ts
```

Example script:

```typescript
// src/scripts/testPromptChange.ts
import { renderTemplate } from '../services/AI/evals/TemplateRenderer';
import EvalRun from '../models/EvalRun';
import { mastra } from '../mastra';
import { NextBestActionsSchema } from '../services/AI/actionPipeline/NextBestActionAgent';

const newTemplate = `
<role>
  Your MODIFIED prompt here...
</role>
<opportunity>
  <name>\${opportunity.name}</name>
  <contacts>
    \${contacts.map(({ contact }) => \`- \${contact.firstName} \${contact.lastName}\`).join('\\n')}
  </contacts>
</opportunity>
`;

async function testPromptChange() {
  // Load a few captured runs
  const testRuns = await EvalRun.find({ 
    agentName: 'nextActionAgent',
    status: 'completed' 
  }).limit(5);
  
  const agent = mastra.getAgent('nextActionAgent');
  
  for (const run of testRuns) {
    console.log(`\n--- Testing Run ${run.id} ---`);
    
    // Re-render with new template
    const newPrompt = renderTemplate(newTemplate, run.inputVariables);
    
    // Call agent with new prompt
    const result = await agent.generateLegacy(
      [{ role: 'user', content: newPrompt }],
      { output: NextBestActionsSchema }
    );
    
    // Compare
    console.log('Original action:', run.parsedOutput?.actions?.[0]?.type);
    console.log('New action:', result.object?.actions?.[0]?.type);
    console.log('Match:', run.parsedOutput?.actions?.[0]?.type === result.object?.actions?.[0]?.type);
  }
}

testPromptChange()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
```

## Custom Scorers

Scorers evaluate agent outputs. You can use Mastra's built-in scorers or create custom ones specific to your use case.

### Built-in Scorers (from `@mastra/evals`)

```bash
npm install @mastra/evals@latest
```

| Scorer | What It Measures |
|--------|------------------|
| `answerRelevancy` | How well output addresses the input |
| `promptAlignment` | How well output follows instructions |
| `faithfulness` | Factual accuracy vs context |
| `completeness` | Coverage of key elements |
| `contentSimilarity` | Textual similarity (regression testing) |

```typescript
import { createAnswerRelevancyScorer } from '@mastra/evals/scorers/llm';
import { createCompletenessScorer } from '@mastra/evals/scorers/code';
import { openai } from '@ai-sdk/openai';

const relevancy = createAnswerRelevancyScorer({ model: openai('gpt-4o-mini') });
const completeness = createCompletenessScorer();
```

### Custom Scorers

Create scorers specific to your agents using `createScorer` from `@mastra/core/scorers`:

```typescript
// src/services/AI/evals/scorers/actionTypeMatchScorer.ts
import { createScorer } from '@mastra/core/scorers';

/**
 * Checks if the new output produces the same action TYPE as the original
 * (regression testing: EMAIL should still be EMAIL)
 */
export const actionTypeMatchScorer = createScorer({
  name: 'Action Type Match',
  description: 'Verifies action types match between original and new output',
})
  .generateScore(({ run }) => {
    const originalActions = run.groundTruth?.actions || [];
    const newActions = run.output?.actions || [];
    
    if (originalActions.length === 0) return 1.0;
    
    // Check if primary action type matches
    const originalType = originalActions[0]?.type;
    const newType = newActions[0]?.type;
    
    return originalType === newType ? 1.0 : 0.0;
  })
  .generateReason(({ score, run }) => {
    const originalType = run.groundTruth?.actions?.[0]?.type;
    const newType = run.output?.actions?.[0]?.type;
    
    if (score === 1.0) {
      return `✓ Action types match: both recommend ${newType}`;
    }
    return `✗ Action type changed from ${originalType} to ${newType}`;
  });
```

```typescript
// src/services/AI/evals/scorers/reasoningQualityScorer.ts
import { createScorer } from '@mastra/core/scorers';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

/**
 * Uses LLM to judge if the reasoning quality improved or degraded
 */
export const reasoningQualityScorer = createScorer({
  name: 'Reasoning Quality',
  description: 'Evaluates the quality and clarity of action reasoning',
  judge: {
    model: openai('gpt-4o-mini'),
    instructions: 'You are an expert evaluator of sales action reasoning.',
  },
})
  .analyze({
    description: 'Analyze reasoning quality across multiple dimensions',
    outputSchema: z.object({
      clarity: z.number().min(0).max(1),
      specificity: z.number().min(0).max(1),
      salesLogic: z.number().min(0).max(1),
      reasoning: z.string(),
    }),
    createPrompt: ({ run }) => `
      Evaluate this sales action reasoning on a scale of 0-1:
      
      Action Type: ${run.output?.actions?.[0]?.type}
      Reasoning: ${run.output?.actions?.[0]?.reasoning}
      
      Score each dimension:
      - clarity: Is the reasoning clear and understandable?
      - specificity: Does it reference specific context (activity IDs, contacts)?
      - salesLogic: Does it follow sound sales methodology?
      
      Provide scores and brief reasoning.
    `,
  })
  .generateScore(({ results }) => {
    const { clarity, specificity, salesLogic } = results.analyzeStepResult;
    return (clarity + specificity + salesLogic) / 3;
  })
  .generateReason(({ results }) => {
    return results.analyzeStepResult.reasoning;
  });
```

```typescript
// src/services/AI/evals/scorers/contactTargetingScorer.ts
import { createScorer } from '@mastra/core/scorers';

/**
 * Validates that the action targets a valid contact from the input
 */
export const contactTargetingScorer = createScorer({
  name: 'Contact Targeting Valid',
  description: 'Checks if action targets a contact that exists in the input',
})
  .generateScore(({ run }) => {
    const action = run.output?.actions?.[0];
    if (!action?.details?.recipientEmail) return 1.0; // N/A
    
    // Get valid emails from input variables
    const validEmails = new Set(
      (run.input?.contacts || []).flatMap((c: any) => 
        (c.contact?.emails || []).map((e: any) => e.address)
      )
    );
    
    return validEmails.has(action.details.recipientEmail) ? 1.0 : 0.0;
  })
  .generateReason(({ score, run }) => {
    if (score === 1.0) return '✓ Contact targeting is valid';
    return `✗ Invalid recipient: ${run.output?.actions?.[0]?.details?.recipientEmail}`;
  });
```

### Scorer Registry

Register all scorers in one place:

```typescript
// src/services/AI/evals/scorers/index.ts
import { createAnswerRelevancyScorer, createPromptAlignmentScorer } from '@mastra/evals/scorers/llm';
import { createCompletenessScorer } from '@mastra/evals/scorers/code';
import { openai } from '@ai-sdk/openai';

// Custom scorers
import { actionTypeMatchScorer } from './actionTypeMatchScorer';
import { reasoningQualityScorer } from './reasoningQualityScorer';
import { contactTargetingScorer } from './contactTargetingScorer';

// Built-in scorers (configured)
const answerRelevancy = createAnswerRelevancyScorer({ model: openai('gpt-4o-mini') });
const promptAlignment = createPromptAlignmentScorer({ model: openai('gpt-4o-mini') });
const completeness = createCompletenessScorer();

export const scorerRegistry = {
  // Custom (domain-specific)
  actionTypeMatch: actionTypeMatchScorer,
  reasoningQuality: reasoningQualityScorer,
  contactTargeting: contactTargetingScorer,
  
  // Built-in (general purpose)
  answerRelevancy,
  promptAlignment,
  completeness,
};

export type ScorerName = keyof typeof scorerRegistry;
```

## Instrumentation Guide

To add eval capture to other agents, follow this pattern:

### Step 1: Extract Input Variables

Create a helper method that captures all variables used in the prompt:

```typescript
// In YourAgent.ts
private static async captureInputVariables(
  /* your agent's input params */
): Promise<{ inputVariables: Record<string, any>, captureId: string | null }> {
  
  // Fetch the same data that your buildPrompt() method fetches
  const data1 = await Model1.find({ ... });
  const data2 = await Model2.find({ ... });
  
  const inputVariables = {
    // All variables used in your prompt
    param1: yourParam1,
    param2: yourParam2,
    data1,
    data2,
    currentDate: new Date().toISOString(),
  };
  
  const captureId = await EvalCaptureService.startCapture({
    organizationId: yourOrgId,
    agentName: 'yourAgentName',
    inputVariables,
    promptTemplateVersion: 'v1.0',
    metadata: { /* optional context */ },
  });
  
  return { inputVariables, captureId };
}
```

### Step 2: Wire Capture into Agent Call

```typescript
public static async yourAgentMethod(/* params */) {
  // Capture variables BEFORE building prompt
  const { inputVariables, captureId } = await this.captureInputVariables(/* params */);
  
  // Build prompt (uses the same variables)
  const prompt = await this.buildPrompt(/* params */);
  
  // Call agent with captureId in metadata
  const agent = mastra.getAgent('yourAgentName');
  const result = await agent.generateLegacy(
    [{ content: prompt, role: 'user' }],
    {
      output: YourSchema,
      providerOptions: {
        openai: {
          metadata: {
            agent: 'yourAgentName',
            orgId: yourOrgId,
            ...(captureId ? { evalCaptureId: captureId } : {}),
          }
        }
      }
    }
  );
  
  return result.object;
}
```

### Step 3: Update buildPrompt to Return Variables

Modify your prompt builder to return both the prompt and the variables:

```typescript
private static async buildPrompt(/* params */): Promise<{
  prompt: string;
  inputVariables: Record<string, any>;
}> {
  // Fetch data
  const data1 = await Model1.find({ ... });
  const data2 = await Model2.find({ ... });
  
  // Store variables
  const inputVariables = {
    param1: yourParam1,
    data1,
    data2,
    currentDate: new Date().toISOString(),
  };
  
  // Build prompt using template literal
  const prompt = `
    <role>Your prompt here</role>
    <data>
      ${data1.map(d => d.field).join('\n')}
    </data>
  `;
  
  return { prompt, inputVariables };
}
```

## Copy-Paste Workflow

The system is designed for seamless copy-paste between eval and production:

### From Production → Eval System

1. Open `NextBestActionAgent.ts`
2. Find the `buildContextPrompt()` method
3. Copy the template literal (the big backtick string)
4. POST to `/api/evals/templates` with the copied template
5. Modify as needed, test via experiments

### From Eval System → Production

1. Experiment shows the new template wins
2. GET the template from `/api/evals/templates/:id`
3. Copy the `template` field
4. Paste back into `NextBestActionAgent.buildContextPrompt()`
5. Deploy

**No syntax conversion needed** - templates use identical `${variable}` syntax.

## Example: Complete Prompt Testing Session

```bash
# 1. View recent captures
curl -X GET http://localhost:3001/api/evals/runs?agentName=nextActionAgent&limit=100 \
  -H "Authorization: Bearer $TOKEN"

# 2. Create test dataset from good runs
curl -X POST http://localhost:3001/api/evals/datasets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NextAction Test Set Jan 2026",
    "agentName": "nextActionAgent",
    "runIds": ["run1", "run2", "run3", ...],
    "description": "30 runs covering various opportunity scenarios"
  }'
# Response: { "data": { "_id": "dataset_abc123" } }

# 3. Create new template version
# (Copy from NextBestActionAgent.ts, modify, paste here)
curl -X POST http://localhost:3001/api/evals/templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "nextActionAgent",
    "version": "v1.1-shorter",
    "description": "Reduced instructions by 40%, simplified steps",
    "template": "<role>...\${opportunity.name}...</role>"
  }'
# Response: { "data": { "_id": "template_xyz789" } }

# 4. Run experiment
curl -X POST http://localhost:3001/api/evals/experiments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Shorter Instructions Test",
    "datasetId": "dataset_abc123",
    "variants": [
      {
        "name": "baseline",
        "templateId": "template_v1.0",
        "modelName": "gpt-5"
      },
      {
        "name": "shorter",
        "templateId": "template_xyz789",
        "modelName": "gpt-5"
      }
    ],
    "scorers": ["actionTypeMatch", "reasoningQuality"],
    "concurrency": 3
  }'

# Response shows comparison:
# {
#   "results": {
#     "baseline": { "avgScores": { "actionTypeMatch": 0.92 }, "avgLatency": 4200 },
#     "shorter": { "avgScores": { "actionTypeMatch": 0.94 }, "avgLatency": 3100 }
#   },
#   "comparison": {
#     "winner": "shorter",
#     "improvements": ["latency: -26%", "tokens: -34%"]
#   }
# }

# 5. If winner: Activate template (optional - or just copy to code)
curl -X POST http://localhost:3001/api/evals/templates/template_xyz789/activate \
  -H "Authorization: Bearer $TOKEN"
```

## Configuration

### Environment Variables

```bash
# Sampling rate for automatic capture (0.0 - 1.0)
EVAL_CAPTURE_SAMPLE_RATE=1.0    # Capture 100% of runs (default)

# Or set to 0.1 to capture 10% of production runs
EVAL_CAPTURE_SAMPLE_RATE=0.1
```

### Per-Agent Sampling Override

```typescript
const captureId = await EvalCaptureService.startCapture({
  agentName: 'yourAgent',
  inputVariables,
  samplingRate: 0.5,  // Override env var for this specific call
});
```

## Best Practices

### 1. Build Your Golden Dataset Gradually

Don't try to create the perfect dataset on day 1:
- Start with 10-20 representative runs
- Mark expected outputs for critical scenarios
- Add edge cases as you discover them
- Grow to 50-100 runs over time

### 2. Test Incrementally

Don't make massive prompt changes all at once:
- Change one section at a time
- Test each change against your dataset
- Keep what works, revert what doesn't
- Build up improvements gradually

### 3. Use Multiple Scorers

Different scorers catch different issues:
- `actionTypeMatch` - Regression testing (did behavior change?)
- `reasoningQuality` - Quality improvement
- `promptAlignment` - Instruction following
- `contactTargeting` - Data validation

### 4. Monitor Latency + Tokens

Prompt changes can affect cost and speed:
- Shorter prompts = faster + cheaper
- But don't sacrifice quality for brevity
- Experiments show both quality AND efficiency metrics

### 5. Version Your Templates

Use semantic versioning:
- `v1.0` - Production baseline
- `v1.1-shorter` - Experiment (shorter instructions)
- `v1.2-simplified-steps` - Experiment (restructured steps)
- `v2.0` - Major rewrite

### 6. Document Why Changes Work

When you promote a new template, add notes:
```typescript
{
  "description": "v1.1: Reduced instructions by 40%. Removed redundant examples in step_2. Simplified backoff_policy. Result: +5% accuracy, -26% latency, -34% tokens."
}
```

