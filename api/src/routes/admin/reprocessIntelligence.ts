import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { HistoricalActivityService } from '../../services/AI/personIntelligence/historicalActivityService';
import chalk from 'chalk';
import Opportunity from '../../models/Opportunity';
import Contact, { IContact } from '../../models/Contact';

const router = express.Router();

/**
 * Reprocess all intelligence for a specific opportunity
 */
export const reprocessOpportunityIntelligence = async (req: Request, res: Response): Promise<void> => {
  try {
    const { opportunityId } = req.params;
    const { fromDate, contactIds } = req.body;

    if (!mongoose.Types.ObjectId.isValid(opportunityId)) {
      res.status(400).json({ error: 'Invalid opportunity ID' });
      return;
    }

    const opportunityObjectId = new mongoose.Types.ObjectId(opportunityId);
    
    console.log(chalk.blue.bold(`[ADMIN] Reprocessing intelligence for opportunity ${opportunityId}...`));

    if (contactIds && Array.isArray(contactIds)) {
      // Reprocess specific contacts
      const contactObjectIds = contactIds.map((id: string) => new mongoose.Types.ObjectId(id));
      await HistoricalActivityService.reprocessActivitiesChronologically(
        opportunityObjectId,
        contactObjectIds,
      );
    } else {
      // Nuclear option - reprocess entire opportunity
      await HistoricalActivityService.reprocessEntireOpportunity(opportunityObjectId);
    }

    res.json({ 
      success: true, 
      message: `Successfully reprocessed intelligence for opportunity ${opportunityId}` 
    });

  } catch (error) {
    console.error(chalk.red('[ADMIN] Error reprocessing intelligence:'), error);
    res.status(500).json({ 
      error: 'Failed to reprocess intelligence', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

/**
 * Check if an activity would be considered historical before adding it
 */
export const checkHistoricalActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { activityDate, contactIds } = req.body;

    if (!activityDate || !contactIds || !Array.isArray(contactIds)) {
      res.status(400).json({ 
        error: 'activityDate and contactIds (array) are required' 
      });
      return;
    }

    const contactObjectIds = contactIds.map((id: string) => new mongoose.Types.ObjectId(id));
    const result = await HistoricalActivityService.checkIfActivityWouldBeHistorical(
      new Date(activityDate),
      contactObjectIds
    );

    res.json(result);

  } catch (error) {
    console.error(chalk.red('[ADMIN] Error checking historical status:'), error);
    res.status(500).json({ 
      error: 'Failed to check historical status', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

/**
 * Get the current intelligence processing status for an opportunity
 */
export const getIntelligenceStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { opportunityId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(opportunityId)) {
      res.status(400).json({ error: 'Invalid opportunity ID' });
      return;
    }
    
    const opportunity = await Opportunity.findById(opportunityId);
    
    if (!opportunity) {
      res.status(404).json({ error: 'Opportunity not found' });
      return;
    }

    const contacts = await Contact.find({ _id: { $in: opportunity.contacts } });
    
    const status = {
      opportunityId,
      opportunityName: opportunity.name,
      lastIntelligenceUpdate: opportunity.lastIntelligenceUpdateTimestamp,
      contactCount: contacts.length,
      contacts: contacts.map((contact: IContact) => {
        const intel = contact.getOpportunityIntelligence(new mongoose.Types.ObjectId(opportunityId));
        return {
          contactId: contact._id,
          name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          hasIntelligence: !!intel,
          engagementScore: intel?.engagementScore || 0,
          scoreHistoryCount: intel?.scoreHistory?.length || 0,
          behavioralIndicatorsCount: intel?.behavioralIndicators?.length || 0,
          roleAssignmentsCount: intel?.roleAssignments?.length || 0,
        };
      })
    };

    res.json(status);

  } catch (error) {
    console.error(chalk.red('[ADMIN] Error getting status:'), error);
    res.status(500).json({ 
      error: 'Failed to get status', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Mount the routes
router.post('/opportunity/:opportunityId', reprocessOpportunityIntelligence);
router.post('/check-historical', checkHistoricalActivity);
router.get('/status/:opportunityId', getIntelligenceStatus);

export default router; 