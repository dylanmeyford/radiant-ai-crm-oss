import { mastra } from '../../../../../mastra';
import { ActionPipelineContext, MainAction } from '../index.js';
import chalk from 'chalk';
import mongoose from 'mongoose';

function buildTaskContentPrompt(action: any, context: ActionPipelineContext, parentAction?: any): string {
  const { opportunity, recentActivities } = context;
  
  const isSubAction = !!parentAction;
  const sourceActivityIds = isSubAction ? (parentAction.sourceActivityIds || []) : (action.sourceActivityIds || []);
  
  const sourceActivities = recentActivities.filter(activity => 
    sourceActivityIds.includes((activity._id as mongoose.Types.ObjectId).toString())
  );

  const subActionsSummary = (action.subActions || []).map((subAction: any) => `
  - **${subAction.type}** (Priority: ${subAction.priority})
    - Reasoning: ${subAction.reasoning}
    - Details: ${JSON.stringify(subAction.details, null, 2)}
    - Status: ${subAction.status || 'Pending'}`).join('\n')

  return `
# Task Content Composition Request

## CONTEXT
**Opportunity:** ${opportunity.name || 'Unnamed Opportunity'} (${opportunity.stage})
**Value:** $${opportunity.amount || 'Not specified'}
**Action Type:** ${isSubAction ? `Sub-action of ${parentAction.type}` : 'Main action'}
**Action Task Title:** ${action.details.title}
**Action Task Description:** ${action.details.description}
**Action Reasoning:** ${action.reasoning}
${isSubAction ? `**Parent Action Reasoning:** ${parentAction.reasoning}` : ''}
**Due Date:** ${action.details.dueDate}

## SOURCE ACTIVITIES CONTEXT
${sourceActivities.length > 0 ? sourceActivities.map(activity => `
- **${activity.date.toISOString()}**: ${activity.aiSummary?.summary || activity.title || 'Activity'}
`).join('\n') : 'No specific source activities referenced'}

${isSubAction && action.dependsOn ? `
## SUB-ACTION DEPENDENCIES
This sub-action depends on completion of: ${action.dependsOn.join(', ')}
` : ''}

${!isSubAction && action.dependsOn ? `
## MAIN ACTION DEPENDENCIES
This main action depends on completion of sub-actions: ${action.dependsOn.join(', ')}
` : ''}

${!isSubAction && action.subActions && action.subActions.length > 0 ? `
  ## COMPLETED SUB-ACTIONS OVERVIEW
  This main action is supported by the following sub-actions. Their content should be synthesized and leveraged in the main email.
  ${subActionsSummary}
  ` : ''}

  ## STRICT DIVISION OF LABOR
- Use ONLY the results from COMPLETED SUB-ACTIONS for factual information (e.g., ROI data, case studies).
- For composition, search playbooks ONLY for sales methodology, tone guidelines, structure templates, and best practices (e.g., how to phrase CTAs, email structure).
- NEVER re-search for information already handled by sub-actions.

## INSTRUCTIONS
Create a detailed task description that:
1. Clearly explains what needs to be done for the task: ${action.description}
2. ${isSubAction ? 'Supports the completion of the parent action' : 'References the specific activities that triggered this task'}
3. Provides actionable steps to complete the task
4. Includes success criteria or expected outcomes
5. Considers the opportunity stage and context
${isSubAction ? `6. Aligns with the parent action strategy: ${parentAction.type}` : ''}

${isSubAction ? `**Parent Action Priority:** ${parentAction.priority}` : ''}
**This Action Priority:** ${action.priority}

Generate a comprehensive task description that will help advance this sales opportunity.
`;
}

export async function composeContent(
  action: MainAction,
  context: ActionPipelineContext,
  parentAction?: MainAction
): Promise<any | null> {
  const contentWorkflow = await mastra.getWorkflow('contentCompositionWorkflow').createRunAsync();
  if (!contentWorkflow) {
    throw new Error('Content Composition Workflow not found in mastra configuration');
  }

  const prompt = buildTaskContentPrompt(action, context, parentAction);
  const isSubAction = !!parentAction;
  const mode = isSubAction ? 'lookup' : 'composition';

  try {
    const result = await contentWorkflow.start({
      inputData: {
        organizationId: context.opportunity.organization?.toString() || 'unknown',
        prompt: prompt,
        context: {
          contentType: 'task',
          audienceType: 'internal_user',
          dealStage: (context.opportunity.stage as any)?.name || 'Unknown',
          customerInfo: `Opportunity: ${context.opportunity.name || 'Unnamed'}, Value: $${context.opportunity.amount || 'Not specified'}`
        },
        actionMode: mode
      }
    });

    return result;
  } catch (error) {
    console.error(chalk.red(`      -> Error generating task content:`), error);
    return null;
  }
}

