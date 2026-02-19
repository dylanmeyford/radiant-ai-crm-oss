import { mastra } from '../../../../../mastra';
import { ActionPipelineContext, MainAction } from '../index.js';
import chalk from 'chalk';
import mongoose from 'mongoose';
import { serializeWorkflowRun } from '../../../../../utils/mastraWorkflowSerializer';

function buildLinkedInMessageContentPrompt(action: any, context: ActionPipelineContext, parentAction?: any): string {
  const { opportunity, contacts, recentActivities } = context;
  
  const isSubAction = !!parentAction;
  const sourceActivityIds = isSubAction ? (parentAction.sourceActivityIds || []) : (action.sourceActivityIds || []);
  
  const sourceActivities = recentActivities.filter(activity => 
    sourceActivityIds.includes((activity._id as mongoose.Types.ObjectId).toString())
  );

  const contactInfo = contacts.find(({ contact }) => 
    contact.emails?.[0]?.address === action.details.contactEmail
  );

  const subActionsSummary = (action.subActions || []).map((subAction: any) => `
  - **${subAction.type}** (Priority: ${subAction.priority})
    - Reasoning: ${subAction.reasoning}
    - Details: ${JSON.stringify(subAction.details, null, 2)}
    - Status: ${subAction.status || 'Pending'}`).join('\n')

  return `
# LinkedIn Message Composition Request

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
Create a professional LinkedIn message that:
1. Opens with appropriate context or connection
2. ${isSubAction ? 'Supports the parent action strategy' : 'References relevant recent activities or interactions'}
3. Provides value or insight to the recipient
4. Includes a clear but soft call-to-action
5. Maintains professional LinkedIn etiquette
6. Keeps within appropriate length limits
${isSubAction ? `7. Aligns with the parent action: ${parentAction.type}` : ''}

${isSubAction ? `**Parent Action Priority:** ${parentAction.priority}` : ''}
**This Action Priority:** ${action.priority}

Generate a LinkedIn message that will effectively advance this sales opportunity.
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

  const prompt = buildLinkedInMessageContentPrompt(action, context, parentAction);
  const isSubAction = !!parentAction;
  const mode = isSubAction ? 'lookup' : 'composition';

  // Gather contact ID for the LinkedIn message recipient
  const contactInfo = context.contacts.find(({ contact }) => 
    contact.emails?.[0]?.address === action.details.contactEmail
  );
  const uniqueContactIds = contactInfo ? [(contactInfo.contact._id as mongoose.Types.ObjectId).toString()] : [];

  try {
    const result = await contentWorkflow.start({
      inputData: {
        organizationId: context.opportunity.organization?.toString() || 'unknown',
        prompt: prompt,
        originalDraft: action.details.message,
        context: {
          contentType: 'linkedin_message',
          audienceType: 'sales_prospect',
          dealStage: (context.opportunity.stage as any)?.name || 'Unknown',
          customerInfo: `Opportunity: ${context.opportunity.name || 'Unnamed'}, Value: $${context.opportunity.amount || 'Not specified'}`
        },
        actionMode: mode,
        // Add contact ID and opportunity ID for tracking sent documents
        contactIds: uniqueContactIds,
        opportunityId: context.opportunity._id.toString()
      }
    });

    // Store workflow metadata in the result for later use during execution
    if (result && result.status === 'success' && uniqueContactIds.length > 0) {
      const workflowMetadata = {
        sourcesUsed: result.result.sourcesUsed || [],
        contactIds: uniqueContactIds,
        opportunityId: context.opportunity._id.toString(),
        workflowResult: serializeWorkflowRun(result)
      };
      
      // Add the metadata to the result so it gets stored in action.details
      if (result.result.result?.schemaResult) {
        result.result.result.schemaResult.workflowMetadata = workflowMetadata;
      } else if (result.result.result) {
        result.result.result.workflowMetadata = workflowMetadata;
      }
    }

    return result;
  } catch (error) {
    console.error(chalk.red(`      -> Error generating LinkedIn message content:`), error);
    return null;
  }
}

