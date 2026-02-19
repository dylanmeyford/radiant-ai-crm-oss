import { mastra } from '../../../../../mastra';
import { ActionPipelineContext, MainAction } from '../index.js';
import chalk from 'chalk';
import mongoose from 'mongoose';

function buildLookupContentPrompt(action: any, context: ActionPipelineContext, parentAction?: any): string {
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
  # Lookup Request

  ## CONTEXT
  **Opportunity:** ${opportunity.name || 'Unnamed Opportunity'} (${opportunity.stage})
  **Value:** $${opportunity.amount || 'Not specified'}
  **Action Type:** ${isSubAction ? `Sub-action of ${parentAction.type}` : 'Main action'}
  **Action Reasoning:** ${action.reasoning}
  ${isSubAction ? `**Parent Action Reasoning:** ${parentAction.reasoning}` : ''}

  ## SOURCE ACTIVITIES CONTEXT
  ${sourceActivities.length > 0 ? sourceActivities.map(activity => `
  - **${activity.date.toISOString()}**: ${activity.aiSummary?.summary || activity.title || 'Activity'}
  `).join('\n') : 'No specific source activities referenced'}

  ${!isSubAction && action.subActions && action.subActions.length > 0 ? `
  ## COMPLETED SUB-ACTIONS OVERVIEW
  This main action is supported by the following sub-actions. Their content should be synthesized and leveraged in the main email.
  ${subActionsSummary}
  ` : ''}

  ## INSTRUCTIONS
  You are performing a targeted lookup to answer the question:

  """
  ${action.details.query}
  """

  Return:
  1. A concise but complete answer.
  2. A list of source URLs if used (optional).
  3. A confidence score between 0 and 1.

  Respond as JSON conforming to the schema { answer: string, sources?: string[], confidence?: number }.

  **STRICT: Return ONLY the found information or indicate if not found (e.g., "No relevant information found"). Do NOT compose messages, expand on content, or perform any synthesis - that is for main actions.**
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

  const prompt = buildLookupContentPrompt(action, context, parentAction);

  try {
    const result = await contentWorkflow.start({
      inputData: {
        organizationId: context.opportunity.organization?.toString() || 'unknown',
        prompt: prompt,
        context: {
          contentType: 'lookup',
          audienceType: 'internal_user',
          dealStage: (context.opportunity.stage as any)?.name || 'Unknown',
          customerInfo: `Opportunity: ${context.opportunity.name || 'Unnamed'}, Value: $${context.opportunity.amount || 'Not specified'}`,
          customerDescription: context.opportunity.description || 'No description provided',
        },
        actionMode: 'lookup'
      }
    });

    return result;
  } catch (error) {
    console.error(chalk.red(`      -> Error generating lookup content:`), error);
    return null;
  }
}


