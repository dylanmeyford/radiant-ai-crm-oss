import { mastra } from '../../../../../mastra';
import { ActionPipelineContext, MainAction } from '../index.js';
import chalk from 'chalk';
import mongoose from 'mongoose';

function buildAddContactPrompt(action: MainAction, context: ActionPipelineContext, parentAction?: MainAction): string {
  const { opportunity, contacts, recentActivities } = context;
  const isSubAction = !!parentAction;
  const sourceActivityIds = isSubAction ? (parentAction.sourceActivityIds || []) : (action.sourceActivityIds || []);

  const sourceActivities = recentActivities.filter((activity) =>
    sourceActivityIds.includes((activity._id as mongoose.Types.ObjectId).toString())
  );

  const existingStakeholders = contacts.map(({ contact, intelligence }) => {
    const latestRole = intelligence.roleAssignments?.length
      ? intelligence.roleAssignments[intelligence.roleAssignments.length - 1].role
      : 'Unknown';
    return `- ${contact.firstName || ''} ${contact.lastName || ''} (${contact.getPrimaryEmail?.() || contact.emails?.[0]?.address || 'No email'})
  Role: ${latestRole}
  Title: ${contact.title || contact.contactResearch?.roleAtCompany || 'Unknown'}
  Relationship Story: ${intelligence.relationshipStory || 'No relationship story'}`;
  }).join('\n');

  const details = action.details as {
    contactFirstName: string;
    contactLastName: string;
    contactEmail: string | null;
    contactTitle: string | null;
    suggestedRole: string;
  };

  return `
<role>
You are a B2B sales strategist and contact researcher.
</role>
<todays_date>
Today's Date: ${new Date().toISOString().split('T')[0]}. Time is ${new Date().toISOString().split('T')[1]}.
</todays_date>
<opportunity_context>
Opportunity: ${opportunity.name || 'Unnamed Opportunity'}
Stage: ${(opportunity.stage as any)?.name || opportunity.stage || 'Unknown'}
Value: $${opportunity.amount || 'Not specified'}
Description: ${opportunity.description || 'No description available'}
</opportunity_context>
<proposed_contact>
Name: ${details.contactFirstName} ${details.contactLastName}
Known Email: ${details.contactEmail || 'Unknown'}
Known Title: ${details.contactTitle || 'Unknown'}
Suggested Deal Role: ${details.suggestedRole}
Action Reasoning: ${action.reasoning}
</proposed_contact>
<current_stakeholders>
${existingStakeholders || 'No existing stakeholders'}
</current_stakeholders>
<source_activities>
${sourceActivities.length > 0
    ? sourceActivities.map((activity) => `- ${activity.date.toISOString()}: ${activity.aiSummary?.summary || activity.title || 'Activity'}`).join('\n')
    : 'No specific source activities referenced'}
</source_activities>
<instructions>
Research this proposed stakeholder online and return structured JSON with:
1) rationale: Why this person should be added to the opportunity now, including strategic impact.
2) contactEmail: Best discovered/confirmed business email (or null if not found).
3) contactTitle: Best discovered/confirmed title (or null if not found).
4) linkedInProfile: LinkedIn URL if found (or null).
5) backgroundInfo: A concise professional background summary relevant to the deal.
6) sourceUrls: Array of source URLs used (or null).

IMPORTANT:
- Use web search where needed.
- Never invent facts.
- Keep rationale practical: explain how engaging this person advances the deal.
</instructions>
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

  const prompt = buildAddContactPrompt(action, context, parentAction);

  try {
    const result = await run.start({
      inputData: {
        organizationId: context.opportunity.organization?.toString() || 'unknown',
        prompt,
        context: {
          contentType: 'contact_research',
          audienceType: 'internal_user',
          dealStage: (context.opportunity.stage as any)?.name || 'Unknown',
          customerInfo: `Opportunity: ${context.opportunity.name || 'Unnamed'}, Value: $${context.opportunity.amount || 'Not specified'}`
        },
        actionMode: 'lookup'
      }
    });

    return result;
  } catch (error) {
    console.error(chalk.red(`      -> Error generating add-contact content:`), error);
    return null;
  }
}
