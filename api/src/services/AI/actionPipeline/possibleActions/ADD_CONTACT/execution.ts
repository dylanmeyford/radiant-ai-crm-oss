import mongoose from 'mongoose';
import chalk from 'chalk';
import { IProposedAction } from '../../../../../models/ProposedAction';
import Opportunity from '../../../../../models/Opportunity';
import Contact from '../../../../../models/Contact';
import { executeContactResearch } from '../../../../contactResearchService';
import { personRoleEnum } from '../../../../../types/contactIntelligence.types';

type AddContactDetails = {
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string | null;
  contactTitle: string | null;
  suggestedRole: (typeof personRoleEnum)[number];
};

function buildEmptyOpportunityIntelligence(opportunityId: mongoose.Types.ObjectId) {
  return {
    opportunity: opportunityId,
    engagementScore: 0,
    scoreHistory: [],
    behavioralIndicators: [],
    communicationPatterns: [],
    roleAssignments: [],
    relationshipStory: '',
    responsiveness: [],
    sentDocuments: []
  };
}

export async function execute(
  action: IProposedAction,
  _executingUserId: mongoose.Types.ObjectId,
  session: mongoose.ClientSession
): Promise<any> {
  console.log(chalk.cyan(`    -> Executing add-contact action via handler...`));

  const details = action.details as AddContactDetails;
  const normalizedEmail = details.contactEmail?.trim().toLowerCase() || null;

  const opportunity = await Opportunity.findById(action.opportunity).session(session);
  if (!opportunity) {
    throw new Error(`Opportunity ${action.opportunity} not found`);
  }

  let contact = null;

  if (normalizedEmail) {
    contact = await Contact.findOne({
      organization: opportunity.organization,
      'emails.address': normalizedEmail,
    }).session(session);
  }

  if (!contact) {
    contact = await Contact.findOne({
      organization: opportunity.organization,
      prospect: opportunity.prospect,
      firstName: new RegExp(`^${details.contactFirstName.trim()}$`, 'i'),
      lastName: new RegExp(`^${details.contactLastName.trim()}$`, 'i'),
    }).session(session);
  }

  let createdNewContact = false;
  if (!contact) {
    const emailEntries = normalizedEmail
      ? [{ address: normalizedEmail, category: 'work' as const, isPrimary: true }]
      : [];

    contact = new Contact({
      firstName: details.contactFirstName.trim(),
      lastName: details.contactLastName.trim(),
      emails: emailEntries,
      title: details.contactTitle || undefined,
      prospect: opportunity.prospect,
      organization: opportunity.organization,
      isPrimary: false,
      opportunities: [opportunity._id],
    });

    await contact.save({ session });
    createdNewContact = true;
  } else {
    if (details.contactTitle && !contact.title) {
      contact.title = details.contactTitle;
    }

    if (normalizedEmail && !(contact.emails || []).some((email) => email.address === normalizedEmail)) {
      contact.emails.push({
        address: normalizedEmail,
        category: 'work',
        isPrimary: (contact.emails || []).length === 0,
      } as any);
    }

    if (!contact.opportunities.some((id) => id.toString() === opportunity._id.toString())) {
      contact.opportunities.push(opportunity._id);
    }

    await contact.save({ session });
  }

  if (!opportunity.contacts.some((id) => id.toString() === (contact!._id as mongoose.Types.ObjectId).toString())) {
    opportunity.contacts.push(contact!._id as mongoose.Types.ObjectId);
  }

  if (!opportunity.personRoles) {
    opportunity.personRoles = [];
  }

  const existingRoleIndex = opportunity.personRoles.findIndex(
    (personRole) => personRole.contact.toString() === (contact!._id as mongoose.Types.ObjectId).toString()
  );
  if (existingRoleIndex >= 0) {
    opportunity.personRoles[existingRoleIndex].role = details.suggestedRole;
  } else {
    opportunity.personRoles.push({
      contact: contact!._id as mongoose.Types.ObjectId,
      role: details.suggestedRole,
    });
  }

  await opportunity.save({ session });

  // Mirror the suggested role into the contact's opportunity intelligence so future action context sees it immediately.
  const contactOpportunityIntelligence = (contact as any).opportunityIntelligence || [];
  let opportunityIntel = contactOpportunityIntelligence.find(
    (intel: any) => intel.opportunity.toString() === opportunity._id.toString()
  );
  if (!opportunityIntel) {
    opportunityIntel = buildEmptyOpportunityIntelligence(opportunity._id as mongoose.Types.ObjectId);
    contactOpportunityIntelligence.push(opportunityIntel);
  }

  const latestRole = opportunityIntel.roleAssignments?.[opportunityIntel.roleAssignments.length - 1];
  if (!latestRole || latestRole.role !== details.suggestedRole) {
    opportunityIntel.roleAssignments.push({
      role: details.suggestedRole,
      assignedAt: new Date(),
    });
  }

  (contact as any).opportunityIntelligence = contactOpportunityIntelligence;
  await contact.save({ session });

  // Trigger (or re-trigger) background contact research so the stakeholder profile is enriched.
  executeContactResearch((contact._id as mongoose.Types.ObjectId).toString()).catch((error) => {
    console.error(chalk.yellow(`    -> Failed to trigger contact research for ${contact?._id}:`), error);
  });

  console.log(
    chalk.green(
      `    -> ${createdNewContact ? 'Created and linked' : 'Linked'} contact ${(contact._id as mongoose.Types.ObjectId).toString()} to opportunity ${(opportunity._id as mongoose.Types.ObjectId).toString()}`
    )
  );

  return {
    type: 'contact_added_to_opportunity',
    contactId: contact._id,
    opportunityId: opportunity._id,
    suggestedRole: details.suggestedRole,
    createdNewContact,
  };
}
