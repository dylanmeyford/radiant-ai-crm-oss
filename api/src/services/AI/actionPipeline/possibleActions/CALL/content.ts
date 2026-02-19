import { mastra } from '../../../../../mastra';
import { ActionPipelineContext, MainAction } from '../index.js';
import chalk from 'chalk';
import mongoose from 'mongoose';

function buildCallContentPrompt(action: any, context: ActionPipelineContext, parentAction?: any): string {
  const { opportunity, contacts, recentActivities } = context;
  
  const isSubAction = !!parentAction;
  const sourceActivityIds = isSubAction ? (parentAction.sourceActivityIds || []) : (action.sourceActivityIds || []);
  
  const sourceActivities = recentActivities.filter(activity => 
    sourceActivityIds.includes((activity._id as mongoose.Types.ObjectId).toString())
  );

  const contactInfo = contacts.find(({ contact }) => 
    contact.emails?.[0]?.address === action.details.contactEmail
  );

  return `
# Call Purpose and Talking Points Composition Request

## CONTEXT
**Opportunity:** ${opportunity.name || 'Unnamed Opportunity'} (${opportunity.stage})
**Value:** $${opportunity.amount || 'Not specified'}
**Action Type:** ${isSubAction ? `Sub-action of ${parentAction.type}` : 'Main action'}
**Scheduled For:** ${action.details.scheduledFor}
**Action Reasoning:** ${action.reasoning}
${isSubAction ? `**Parent Action Reasoning:** ${parentAction.reasoning}` : ''}

## CONTACT INFORMATION
${contactInfo ? `
**${contactInfo.contact.firstName} ${contactInfo.contact.lastName}** (${contactInfo.contact.emails?.[0]?.address})
- Role: ${contactInfo.intelligence.roleAssignments?.slice(-1)[0]?.role || 'Unknown'}
- Engagement: ${contactInfo.intelligence.engagementScore || 'Not specified'}
- Relationship: ${contactInfo.intelligence.relationshipStory || 'New contact'}
` : 'Contact information not available'}

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

## INSTRUCTIONS
Create a detailed call purpose that includes:
1. Clear objective for the call
2. Key talking points to address
3. Questions to ask the contact
4. Responses to potential objections
5. Desired outcome and next steps
${isSubAction ? `6. How this call supports the parent action: ${parentAction.type}` : ''}

${isSubAction ? `**Parent Action Priority:** ${parentAction.priority}` : ''}
**This Action Priority:** ${action.priority}

Generate comprehensive call preparation content that will maximize the call's effectiveness.
`;
}

export async function composeContent(
  action: MainAction,
  context: ActionPipelineContext,
  parentAction?: MainAction
): Promise<any | null> {
  const run = await mastra.getWorkflow('contentCompositionWorkflow').createRunAsync();
  if (!run) {
    throw new Error('Content Composition Workflow not found in mastra configuration');
  }

  const prompt = buildCallContentPrompt(action, context, parentAction);
  const isSubAction = !!parentAction;
  const mode = isSubAction ? 'lookup' : 'composition';

  try {
    const result = await run.start({
      inputData: {
        organizationId: context.opportunity.organization?.toString() || 'unknown',
        prompt: prompt,
        context: {
          contentType: 'call_purpose',
          audienceType: 'sales_prospect',
          dealStage: (context.opportunity.stage as any)?.name || 'Unknown',
          customerInfo: `Opportunity: ${context.opportunity.name || 'Unnamed'}, Value: $${context.opportunity.amount || 'Not specified'}`
        },
        actionMode: mode
      }
    });

    return result;
  } catch (error) {
    console.error(chalk.red(`      -> Error generating call content:`), error);
    return null;
  }
}

