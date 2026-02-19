import mongoose from 'mongoose';
import Contact from '../models/Contact';

export interface SentDocument {
  documentId: string;
  documentType: string;
  sentAt?: Date;
}

/**
 * Fetches sent playbooks for multiple contacts within a specific opportunity
 * @param contactIds Array of contact IDs to check
 * @param opportunityId The opportunity ID to scope the search
 * @returns Map of contactId to array of sent documents
 */
export async function getSentPlaybooksByContact(
  contactIds: string[],
  opportunityId: string
): Promise<Record<string, SentDocument[]>> {
  try {
    // Find all contacts in one query
    const contacts = await Contact.find({
      _id: { $in: contactIds }
    });

    // Build the result map
    const sentPlaybooksByContact: Record<string, SentDocument[]> = {};

    for (const contact of contacts) {
      const contactId = (contact._id as mongoose.Types.ObjectId).toString();
      sentPlaybooksByContact[contactId] = [];

      // Find the opportunity intelligence for this specific opportunity
      const oppIntel = contact.opportunityIntelligence?.find(
        intel => intel.opportunity.toString() === opportunityId
      );

      if (oppIntel && oppIntel.sentDocuments) {
        // Only include collateral and case_study types as per requirements
        sentPlaybooksByContact[contactId] = oppIntel.sentDocuments
          .filter(doc => doc.documentType === 'collateral' || doc.documentType === 'case_study')
          .map(doc => ({
            documentId: doc.documentId.toString(),
            documentType: doc.documentType,
            sentAt: doc.sentAt
          }));
      }
    }

    // Ensure all requested contact IDs are in the result, even if not found
    for (const contactId of contactIds) {
      if (!sentPlaybooksByContact[contactId]) {
        sentPlaybooksByContact[contactId] = [];
      }
    }

    console.log(`[SentPlaybookService] Retrieved sent playbooks for ${contactIds.length} contacts in opportunity ${opportunityId}`);
    
    return sentPlaybooksByContact;
  } catch (error) {
    console.error('[SentPlaybookService] Error getting sent playbooks by contact:', error);
    throw error;
  }
}

/**
 * Records that playbooks have been sent to multiple contacts for an opportunity
 * @param contactIds Array of contact IDs who received the playbooks
 * @param opportunityId The opportunity ID
 * @param playbooksToRecord Array of playbooks that were sent
 */
export async function recordSentPlaybooks(
  contactIds: string[],
  opportunityId: string,
  playbooksToRecord: SentDocument[]
): Promise<void> {
  try {
    // Filter to only record collateral and case_study types
    const filteredPlaybooks = playbooksToRecord.filter(
      pb => pb.documentType === 'collateral' || pb.documentType === 'case_study'
    );

    if (filteredPlaybooks.length === 0) {
      console.log('[SentPlaybookService] No collateral or case_study playbooks to record');
      return;
    }

    const opportunityObjectId = new mongoose.Types.ObjectId(opportunityId);

    // Update each contact
    const updatePromises = contactIds.map(async (contactId) => {
      const contact = await Contact.findById(contactId);
      
      if (!contact) {
        console.warn(`[SentPlaybookService] Contact ${contactId} not found, skipping`);
        return;
      }

      // Get or create opportunity intelligence
      const oppIntel = await contact.getOrCreateOpportunityIntelligence(opportunityObjectId);

      if (!oppIntel.sentDocuments) {
        oppIntel.sentDocuments = [];
      }

      // Add new sent documents, avoiding duplicates
      for (const playbook of filteredPlaybooks) {
        const exists = oppIntel.sentDocuments.some(
          doc => doc.documentId.toString() === playbook.documentId
        );

        if (!exists) {
          oppIntel.sentDocuments.push({
            documentId: new mongoose.Types.ObjectId(playbook.documentId),
            documentType: playbook.documentType,
            sentAt: playbook.sentAt || new Date()
          });
        }
      }

      await contact.save();
      console.log(`[SentPlaybookService] Recorded ${filteredPlaybooks.length} playbooks for contact ${contact.firstName} ${contact.lastName} (${contactId})`);
    });

    await Promise.all(updatePromises);
    console.log(`[SentPlaybookService] Successfully recorded playbooks for ${contactIds.length} contacts in opportunity ${opportunityId}`);
    
  } catch (error) {
    console.error('[SentPlaybookService] Error recording sent playbooks:', error);
    throw error;
  }
}

/**
 * Checks if any of the given contacts have already received a specific playbook
 * @param contactIds Array of contact IDs to check
 * @param opportunityId The opportunity ID
 * @param playbookId The playbook ID to check
 * @returns True if any contact has already received the playbook
 */
export async function hasAnyContactReceivedPlaybook(
  contactIds: string[],
  opportunityId: string,
  playbookId: string
): Promise<boolean> {
  try {
    const sentPlaybooksByContact = await getSentPlaybooksByContact(contactIds, opportunityId);
    
    for (const contactId of contactIds) {
      const sentDocs = sentPlaybooksByContact[contactId] || [];
      if (sentDocs.some(doc => doc.documentId === playbookId)) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('[SentPlaybookService] Error checking if playbook was sent:', error);
    throw error;
  }
}
