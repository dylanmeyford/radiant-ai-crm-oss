import mongoose from 'mongoose';
import Contact, { IContact } from '../../../models/Contact';
import { mastra } from '../../../mastra';
import { z } from 'zod';
import { personRoleEnum } from '../../../types/contactIntelligence.types';
import chalk from 'chalk';

// Define the return type for role assignments
export interface ProposedRoleAssignment {
  opportunityId: mongoose.Types.ObjectId;
  role: string;
  reasoning?: string;
  assignedAt: Date;
}

export interface RoleAssignmentResult {
  contactId: mongoose.Types.ObjectId;
  proposedRoleAssignment: ProposedRoleAssignment | null;
}

export class RoleAssignmentService {
  /**
   * Analyzes a contact's recent activities and relationship narrative to extract and assign a role.
   * @param contactId The ID of the contact to analyze.
   * @param opportunityId The ID of the opportunity context.
   * @param activitySummary The summary of the latest activity involving the contact.
   * @param contact The contact document for analysis (passed to avoid refetching).
   */
  public static async extractAndAssignContactRole(
    contactId: mongoose.Types.ObjectId,
    opportunityId: mongoose.Types.ObjectId,
    activitySummary: string,
    contact?: IContact
  ): Promise<RoleAssignmentResult> {
    const roleExtractionAgent = mastra.getAgent('roleExtractionAgent');
    // Use provided contact or fetch if not provided
    const targetContact = contact || await Contact.findById(contactId);
    if (!targetContact) {
      console.error(chalk.red(`    [!] Contact with ID ${contactId} not found for role assignment.`));
      return {
        contactId,
        proposedRoleAssignment: null
      };
    }
    console.log(chalk.blue(`    [+] Analyzing role for contact ${targetContact._id} on opportunity ${opportunityId}...`));

    const intel = await targetContact.getOrCreateOpportunityIntelligence(opportunityId);

    const prompt = `
      Based on the following information, what is the most likely role of "${targetContact.firstName} ${targetContact.lastName}" in this deal?

      Contact Research:
      ${JSON.stringify(targetContact?.contactResearch)}

      Activity Summary:
      ${activitySummary}

      Relationship Story:
      ${intel.relationshipStory || 'No relationship story available.'}

      Previous Roles:
      ${intel.roleAssignments.map(r => `${r.role} (Assigned on ${r.assignedAt.toISOString()})`).join(', ') || 'No prior roles assigned.'}

      Analyze the data and determine the single most accurate role for this person right now. 
      When looking at email signitures etc consider the industry they operate in too, as this can give titles different meanings.
      If in doubt, assign the role of "Other".
    `;

    try {
      const result = await roleExtractionAgent.generateLegacy(
        [{ role: 'user', content: prompt }],
        {
          output: z.object({
            role: z.enum(personRoleEnum),
            reasoning: z.string().optional(),
          }),
          providerOptions: {
            openai: {
              metadata: {
                contactId: (targetContact as any)?._id?.toString() || '',
                opportunityId: opportunityId.toString() || '',
                file: 'role-assignment-service',
                agent: 'roleExtractionAgent',
                orgId: (targetContact?.organization as any)?._id?.toString() || '',
              }
            }
          }
        }
      );

      const { role, reasoning } = result.object;

      if (role) {
        console.log(chalk.cyan(`    -> Extracted Role: ${role}. Reasoning: ${reasoning}`));
        
        const proposedRoleAssignment: ProposedRoleAssignment = {
          opportunityId,
          role,
          reasoning,
          assignedAt: new Date()
        };

        console.log(chalk.green(`    -> Successfully prepared role assignment "${role}" for in-memory processing`));
        
        return {
          contactId,
          proposedRoleAssignment
        };
      } else {
        console.log(chalk.yellow(`    [!] Could not determine a definitive role for contact ${targetContact._id}.`));
        return {
          contactId,
          proposedRoleAssignment: null
        };
      }
    } catch (error) {
      console.error(chalk.red(`    [!] Error assigning role to contact ${targetContact._id}:`), error);
      return {
        contactId,
        proposedRoleAssignment: null
      };
    }
  }
} 