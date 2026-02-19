import { mastra } from '../../../../../mastra';
import { ActionPipelineContext, MainAction } from '../index.js';
import chalk from 'chalk';
import mongoose from 'mongoose';

function buildMeetingContentPrompt(action: any, context: ActionPipelineContext, parentAction?: any): string {
  const { opportunity, contacts, recentActivities } = context;
  
  const isSubAction = !!parentAction;
  const sourceActivityIds = isSubAction ? (parentAction.sourceActivityIds || []) : (action.sourceActivityIds || []);
  
  const sourceActivities = recentActivities.filter(activity => 
    sourceActivityIds.includes((activity._id as mongoose.Types.ObjectId).toString())
  );

  const attendeeContacts = contacts.filter(({ contact }) => 
    action.details.attendees.includes(contact.emails?.[0]?.address)
  );

  const subActionsSummary = (action.subActions || []).map((subAction: any) => `
  - **${subAction.type}** (Priority: ${subAction.priority})
    - Reasoning: ${subAction.reasoning}
    - Details: ${JSON.stringify(subAction.details, null, 2)}
    - Status: ${subAction.status || 'Pending'}`).join('\n')

  return `
# Meeting Agenda Composition Request

## CONTEXT
**Opportunity:** ${opportunity.name || 'Unnamed Opportunity'} (${opportunity.stage})
**Value:** $${opportunity.amount || 'Not specified'}
**Action Type:** ${isSubAction ? `Sub-action of ${parentAction.type}` : 'Main action'}
**Meeting Title:** ${action.details.title}
**Duration:** ${action.details.duration} minutes
**Scheduled For:** ${action.details.scheduledFor}
**Action Reasoning:** ${action.reasoning}
${isSubAction ? `**Parent Action Reasoning:** ${parentAction.reasoning}` : ''}

## ATTENDEES
${attendeeContacts.map(({ contact, intelligence }) => `
- **${contact.firstName} ${contact.lastName}** (${contact.emails?.[0]?.address})
  - Role: ${intelligence.roleAssignments?.slice(-1)[0]?.role || 'Unknown'}
  - Engagement: ${intelligence.engagementScore || 'Not specified'}
`).join('\n')}

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
Create a detailed meeting agenda that:
1. Sets clear objectives for the meeting
2. ${isSubAction ? 'Supports the parent action strategy' : 'Addresses topics raised in the source activities'}
3. Structures the meeting for maximum effectiveness
4. Includes time allocations for each agenda item
5. Focuses on advancing the sales opportunity
${isSubAction ? `6. Aligns with the parent action: ${parentAction.type}` : ''}

${isSubAction ? `**Parent Action Priority:** ${parentAction.priority}` : ''}
**This Action Priority:** ${action.priority}

Generate a professional meeting agenda that will drive the deal forward.
`;
}

export async function composeContent(
  action: MainAction,
  context: ActionPipelineContext,
  parentAction?: MainAction
): Promise<any | null> {
  if ((action as any)?.details?.mode === 'cancel') {
    return null;
  }

  const contentWorkflow = await mastra.getWorkflow('contentCompositionWorkflow').createRunAsync();
  if (!contentWorkflow) {
    throw new Error('Content Composition Workflow not found in mastra configuration');
  }

  const prompt = buildMeetingContentPrompt(action, context, parentAction);
  const isSubAction = !!parentAction;
  const mode = isSubAction ? 'lookup' : 'composition';

  try {
    const result = await contentWorkflow.start({
      inputData: {
        organizationId: context.opportunity.organization?.toString() || 'unknown',
        prompt: prompt,
        context: {
          contentType: 'meeting_agenda',
          audienceType: 'sales_prospect',
          dealStage: (context.opportunity.stage as any)?.name || 'Unknown',
          customerInfo: `Opportunity: ${context.opportunity.name || 'Unnamed'}, Value: $${context.opportunity.amount || 'Not specified'}`
        },
        actionMode: mode
      }
    });

    return result;
  } catch (error) {
    console.error(chalk.red(`      -> Error generating meeting content:`), error);
    return null;
  }
}

