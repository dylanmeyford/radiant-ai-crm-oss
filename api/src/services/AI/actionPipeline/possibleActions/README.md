# Action Pipeline - Modular Action Handlers

This directory contains the modular action handler system for the AI Action Pipeline. Each action type (EMAIL, TASK, MEETING, etc.) is implemented as a self-contained handler that provides schema validation, content composition, and execution logic.

## 🏗️ Architecture Overview

The action pipeline uses a **Handler Pattern** with a central **Action Registry** that automatically discovers and loads action handlers at runtime. This makes the system highly modular and easily extensible.

```
┌─────────────────────────────────────────────────────────────┐
│                    Core Pipeline Services                   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │NextBestAction   │ │ContentComposition│ │ActionExecution  ││
│  │Agent            │ │Agent             │ │Service          ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────┬───────────────────────────────────┘
                          │
                ┌─────────▼─────────┐
                │  Action Registry  │ (Auto-discovery)
                └─────────┬─────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │ EMAIL   │       │  TASK   │       │MEETING  │  ...
   │Handler  │       │Handler  │       │Handler  │
   └─────────┘       └─────────┘       └─────────┘
```

## 📁 Directory Structure

```
possibleActions/
├── README.md                    # This guide
├── index.ts                     # Action Registry & Type Exports
├── types.ts                     # ActionHandler Interface
│
├── EMAIL/                       # Email action handler
│   ├── handler.ts              # Main handler export
│   ├── schema.ts               # Zod validation schemas
│   ├── validation.ts           # Context validation logic
│   ├── content.ts              # Content composition logic
│   └── execution.ts            # Execution logic
│
├── TASK/                        # Task action handler
│   ├── handler.ts
│   ├── schema.ts
│   ├── validation.ts
│   ├── content.ts
│   └── execution.ts
│
├── MEETING/                     # Meeting action handler
│   ├── handler.ts
│   ├── schema.ts
│   ├── validation.ts
│   ├── content.ts
│   └── execution.ts
│
├── CALL/                        # Call action handler
│   ├── handler.ts
│   ├── schema.ts
│   ├── validation.ts
│   ├── content.ts
│   └── execution.ts
│
├── LINKEDIN MESSAGE/            # LinkedIn message handler
│   ├── handler.ts
│   ├── schema.ts
│   ├── validation.ts
│   ├── content.ts
│   └── execution.ts
│
└── NO_ACTION/                   # No-action handler (special case)
    ├── handler.ts
    ├── schema.ts
    └── validation.ts           # No content/execution needed
```

## 🔧 ActionHandler Interface

Every action handler must implement the `ActionHandler` interface:

```typescript
interface ActionHandler {
  name: string;                  // Action type name (e.g., 'EMAIL')
  detailsSchema: z.ZodObject;    // Zod schema for validation
  validateDetails: Function;     // Context-aware validation
  composeContent: Function;      // AI content composition
  execute: Function;             // Action execution logic
}
```

## 🚀 Adding a New Action Type

### Step 1: Create the Directory Structure

```bash
mkdir src/services/AI/actionPipeline/possibleActions/YOUR_ACTION
cd src/services/AI/actionPipeline/possibleActions/YOUR_ACTION
```

### Step 2: Define the Schema (`schema.ts`)

```typescript
import { z } from 'zod';

export const YourActionDetailsSchema = z.object({
  // Define your action's required fields
  targetField: z.string().describe('Description of this field'),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/).describe('Scheduled date in ISO format'),
  
  // Content fields (to be composed later)
  generatedContent: z.string().optional().describe('Will be composed by content agent')
});

export const ComposedYourActionContentSchema = z.object({
  generatedContent: z.string().min(10).max(1000).describe('Generated content')
});
```

### Step 3: Implement Validation (`validation.ts`)

```typescript
import chalk from 'chalk';
import { ActionPipelineContext, MainAction, SubAction } from '../index';
import { YourActionDetailsSchema } from './schema';

export async function validateDetails(
  action: MainAction | SubAction,
  context: ActionPipelineContext,
  validContactEmails: Set<string>,
  validEmailActivityIds: Set<string>
): Promise<any | null> {
  const validationResult = YourActionDetailsSchema.safeParse(action.details);
  if (!validationResult.success) {
    console.log(chalk.yellow(`          -> Invalid action details: ${validationResult.error.message}`));
    return null;
  }
  
  const details = validationResult.data;
  
  // Add your custom validation logic here
  // For example, validate dates, emails, references, etc.
  
  return details;
}
```

### Step 4: Implement Content Composition (`content.ts`)

```typescript
import { mastra } from '../../../../../mastra';
import { ActionPipelineContext, MainAction, SubAction } from '../index';
import chalk from 'chalk';

function buildYourActionContentPrompt(action: any, context: ActionPipelineContext, parentAction?: any): string {
  const { opportunity, contacts, unhandledActivities } = context;
  
  return `
# Your Action Content Composition Request

## CONTEXT
**Opportunity:** ${opportunity.name || 'Unnamed Opportunity'} (${opportunity.stage})
**Action Reasoning:** ${action.reasoning}

## INSTRUCTIONS
Create content that:
1. Achieves the action's objective
2. Is appropriate for the context
3. Advances the sales opportunity

Generate professional content for this action.
`;
}

export async function composeContent(
  action: MainAction | SubAction,
  context: ActionPipelineContext,
  parentAction?: MainAction
): Promise<any | null> {
  const contentWorkflow = await mastra.getWorkflow('contentCompositionWorkflow').createRunAsync();
  if (!contentWorkflow) {
    throw new Error('Content Composition Workflow not found');
  }

  const prompt = buildYourActionContentPrompt(action, context, parentAction);

  try {
    const result = await contentWorkflow.start({
      inputData: {
        organizationId: context.opportunity.organization?.toString() || 'unknown',
        prompt: prompt,
        context: {
          contentType: 'your_action_type',
          audienceType: 'sales_prospect',
          dealStage: context.opportunity.stage,
        }
      }
    });

    return result;
  } catch (error) {
    console.error(chalk.red(`      -> Error generating content:`), error);
    return null;
  }
}
```

### Step 5: Implement Execution (`execution.ts`)

```typescript
import mongoose from 'mongoose';
import chalk from 'chalk';
import { IProposedAction } from '../../../../../models/ProposedAction';

export async function execute(
  action: IProposedAction,
  executingUserId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession
): Promise<any> {
  console.log(chalk.cyan(`    -> Executing your action via handler...`));

  const details = action.details as {
    targetField: string;
    generatedContent: string;
    scheduledFor: string;
  };

  // Implement your execution logic here
  // This might involve:
  // - Creating database records
  // - Calling external APIs
  // - Scheduling future tasks
  // - etc.

  console.log(chalk.green(`    -> Your action completed successfully`));
  return { type: 'your_action_completed', success: true };
}
```

### Step 6: Create the Handler (`handler.ts`)

```typescript
import { ActionHandler } from '../types';
import { YourActionDetailsSchema } from './schema';
import { validateDetails } from './validation';
import { composeContent } from './content';
import { execute } from './execution';

const YourActionHandler: ActionHandler = {
  name: 'YOUR_ACTION',
  detailsSchema: YourActionDetailsSchema,
  validateDetails,
  composeContent,
  execute,
};

export default YourActionHandler;
```

### Step 7: Test Your Handler

The Action Registry will automatically discover and load your new handler. Test it by:

1. **Build the project:** `npm run build`
2. **Check registration:** Your action should appear in the registry output
3. **Test in the pipeline:** Create a test scenario that triggers your action

## 🔄 How the System Works

### 1. **Registry Initialization**
- On startup, the `ActionRegistry` scans the `possibleActions` directory
- It loads all `handler.ts` files and registers them by name
- The registry provides lookup methods for core services

### 2. **Schema Generation**
- `NextBestActionAgent` dynamically creates union schemas from all registered handlers
- This ensures the AI can only generate valid action types
- New handlers are automatically included in schema validation

### 3. **Pipeline Flow**
```
1. AI generates actions → 2. Validation (via handlers) → 3. Content composition (via handlers) → 4. Execution (via handlers)
```

### 4. **Core Service Integration**
- **NextBestActionAgent:** Uses handlers for validation
- **ContentCompositionAgent:** Delegates content creation to handlers
- **ActionExecutionService:** Delegates execution to handlers
- **ActionEvaluationAgent:** Uses handlers for modified action validation

## 📋 Best Practices

### ✅ Do's
- **Keep handlers focused:** Each handler should only concern itself with its action type
- **Use descriptive schemas:** Include helpful descriptions for all Zod fields
- **Validate thoroughly:** Check all references (emails, IDs, dates) against context
- **Handle errors gracefully:** Return `null` or meaningful errors, don't throw
- **Log appropriately:** Use chalk for consistent, colored logging
- **Follow naming conventions:** Use consistent file and function naming

### ❌ Don'ts
- **Don't add business logic to core services:** Keep it in handlers
- **Don't hardcode action types:** Let the registry discover them dynamically
- **Don't skip validation:** Always validate inputs against context
- **Don't forget error handling:** Every function should handle potential failures
- **Don't break the interface:** All handlers must implement `ActionHandler`

## 🧪 Testing Action Handlers

### Unit Testing
Create tests for each handler component:

```typescript
// Example test structure
describe('YourActionHandler', () => {
  describe('validateDetails', () => {
    it('should validate correct details', async () => {
      // Test validation logic
    });
    
    it('should reject invalid details', async () => {
      // Test error cases
    });
  });
  
  describe('composeContent', () => {
    it('should generate appropriate content', async () => {
      // Test content generation
    });
  });
  
  describe('execute', () => {
    it('should execute the action successfully', async () => {
      // Test execution logic
    });
  });
});
```

### Integration Testing
Test the complete pipeline with your action:

```typescript
describe('Action Pipeline Integration', () => {
  it('should handle YourAction end-to-end', async () => {
    // Create test context
    // Trigger pipeline
    // Verify results
  });
});
```

## 🔍 Debugging and Troubleshooting

### Common Issues

1. **Handler not loading:**
   - Check file naming (`handler.ts`)
   - Verify default export
   - Ensure `name` property matches directory

2. **Schema validation failing:**
   - Check Zod schema definitions
   - Verify field requirements match AI output
   - Test schemas independently

3. **Content composition errors:**
   - Verify Mastra workflow availability
   - Check prompt formatting
   - Test with simpler prompts first

4. **Execution failures:**
   - Check database session usage
   - Verify model imports and availability
   - Test execution logic in isolation

### Debugging Tips

- **Enable verbose logging:** The registry and handlers log extensively
- **Test components separately:** Each file can be tested independently
- **Use the registry test:** Run the registry test to verify loading
- **Check TypeScript compilation:** Ensure no type errors

## 🔧 Advanced Features

### Conditional Logic
Handlers can implement complex conditional logic:

```typescript
export async function validateDetails(action, context, validEmails, validActivityIds) {
  // Different validation based on action context
  if (isSubAction) {
    // Sub-action specific validation
  } else {
    // Main action validation
  }
  
  // Conditional field validation
  if (action.details.specificField) {
    // Additional validation for specific scenarios
  }
  
  return validatedDetails;
}
```

### Dynamic Content Generation
Content composition can adapt to context:

```typescript
function buildContentPrompt(action, context, parentAction) {
  const isReply = !!action.details.replyToMessageId;
  const dealStage = context.opportunity.stage;
  
  // Different prompts based on context
  if (dealStage === 'NEGOTIATION') {
    return buildNegotiationPrompt(action, context);
  } else if (isReply) {
    return buildReplyPrompt(action, context);
  } else {
    return buildStandardPrompt(action, context);
  }
}
```

### Complex Execution Logic
Execution can handle complex scenarios:

```typescript
export async function execute(action, userId, session) {
  const details = action.details;
  
  // Handle different execution paths
  if (details.scheduledFor) {
    return await scheduleAction(action, details, session);
  } else {
    return await executeImmediately(action, details, session);
  }
}
```

---

## 🤝 Contributing

When contributing to the action pipeline:

1. **Follow the established patterns** shown in existing handlers
2. **Test thoroughly** before submitting changes
3. **Update this documentation** if you add new features or patterns
4. **Consider backward compatibility** when modifying existing handlers

The modular architecture makes the action pipeline highly maintainable and extensible. Each action type is completely self-contained, making it easy to add new functionality without affecting existing code.
