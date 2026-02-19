import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Opportunity from '../models/Opportunity';
import Prospect from '../models/Prospect';
import Contact from '../models/Contact';
import PipelineStage from '../models/PipelineStage';
import Pipeline from '../models/Pipeline';
import { DigitalSalesRoom, Document, DocumentAccess, Link, LinkAccess } from '../models/DigitalSalesRoom';
import fileStorageService from '../services/fileStorageService';
import path from 'path';
import { opportunityBatchProcessingService } from '../services/activityProcessingService/opportunityBatchProcessingService';
import ActivityProcessingQueue from '../models/ActivityProcessingQueue';
import { scheduleOpportunityResearch } from '../services/opportunityResearchService';
import { getDefaultPipeline } from '../services/pipelineService';

// Create a new opportunity
export const createOpportunity = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  let opportunityId: string | null = null;
  let shouldScheduleProcessing = false;
  
  try {
    await session.withTransaction(async () => {
      const {
        name,
        description,
        amount,
        stage,
        pipeline: pipelineId,
        probability,
        expectedCloseDate,
        prospect,
        tags,
        metadata,
        createdAt,
        createdDate
      } = req.body;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Verify prospect exists and belongs to organization
      const prospectDoc = await Prospect.findOne({
        _id: prospect,
        organization: user.organization
      }).session(session);

      if (!prospectDoc) {
        throw new Error('Prospect not found');
      }

      // Determine the pipeline to use
      let targetPipeline: typeof Pipeline.prototype | null = null;
      if (pipelineId) {
        targetPipeline = await Pipeline.findOne({
          _id: pipelineId,
          organization: user.organization
        }).session(session);

        if (!targetPipeline) {
          throw new Error('Pipeline not found');
        }
      } else {
        // Get default pipeline
        targetPipeline = await getDefaultPipeline(user.organization);
        if (!targetPipeline) {
          throw new Error('No pipeline found for organization');
        }
      }

      // Verify stage exists and belongs to the pipeline if provided
      let stageDoc = null;
      if (stage) {
        stageDoc = await PipelineStage.findOne({
          _id: stage,
          pipeline: targetPipeline._id,
          organization: user.organization
        }).session(session);

        if (!stageDoc) {
          throw new Error('Pipeline stage not found or does not belong to the specified pipeline');
        }
      } else {
        // Get the first stage (Lead) from the pipeline
        stageDoc = await PipelineStage.findOne({
          pipeline: targetPipeline._id,
          order: 1
        }).session(session);

        if (!stageDoc) {
          throw new Error('No stages found in pipeline');
        }
      }

      // add all prospect contacts to the opportunity
      const contacts = await Contact.find({
        prospect,
        organization: user.organization
      }).session(session);

      const opportunity = new Opportunity({
        name,
        description,
        amount,
        stage: stageDoc._id,
        pipeline: targetPipeline._id,
        probability,
        expectedCloseDate,
        prospect,
        contacts,
        tags,
        metadata,
        organization: user.organization,
        createdBy: user._id,
        owner: user._id,
        createdAt,
        opportunityStartDate: createdDate || new Date()
      });
      await opportunity.save({ session });
      
      // Store opportunity ID for scheduling after transaction
      opportunityId = opportunity._id.toString();

      // Update contacts with the new opportunity
      if (contacts && contacts.length > 0) {
        await Contact.updateMany(
          { _id: { $in: contacts }, organization: user.organization },
          { $addToSet: { opportunities: opportunity._id } },
          { session }
        );
      }

      // Mark that we should schedule processing after transaction commits
      shouldScheduleProcessing = true;

      if (prospectDoc) {
        await Prospect.findByIdAndUpdate(prospectDoc._id, { $addToSet: { opportunities: opportunity._id } }, { session });
      }

      res.status(201).json({
        success: true,
        data: opportunity
      });
    });

    // Schedule reprocessing after transaction commits successfully
    if (shouldScheduleProcessing && opportunityId) {
      opportunityBatchProcessingService.scheduleOpportunityReprocessing(opportunityId);
    }

    // Schedule research for the new opportunity
    if (opportunityId) {
      scheduleOpportunityResearch(opportunityId);
    }
  } catch (error) {
    console.error('Create opportunity error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error creating opportunity';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Prospect not found') statusCode = 404;
    if (errorMessage === 'Pipeline not found') statusCode = 404;
    if (errorMessage === 'No pipeline found for organization') statusCode = 404;
    if (errorMessage === 'Pipeline stage not found or does not belong to the specified pipeline') statusCode = 404;
    if (errorMessage === 'No stages found in pipeline') statusCode = 404;
    if (errorMessage === 'One or more contacts not found') statusCode = 404;

    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
};

// Get all opportunities for the organization
export const getOpportunities = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const opportunities = await Opportunity.find(
      { organization: user.organization },
      { _id: 1, name: 1, stage: 1, amount: 1 }
    )
    .populate('stage')
    .populate({path: 'prospect', select: 'name'})
    .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: opportunities
    });
  } catch (error) {
    console.error('Get opportunities error:', error);
    res.status(500).json({ success: false, message: 'Error fetching opportunities' });
  }
};

// Get a single opportunity
export const getOpportunity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const opportunity = await Opportunity.findOne({
      _id: id,
      organization: user.organization
    })
    .populate('stage')
    .populate({path: 'contacts'})
    .populate('createdBy', 'name email')
    .populate('salesRooms')
    .sort({ createdAt: -1 });

    if (!opportunity) {
      res.status(404).json({ success: false, message: 'Opportunity not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: opportunity
    });
  } catch (error) {
    console.error('Get opportunity error:', error);
    res.status(500).json({ success: false, message: 'Error fetching opportunity' });
  }
};

// Get all opportunities for a prospect
export const getProspectOpportunities = async (req: Request, res: Response): Promise<void> => {
  try {
    const { prospectId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const opportunities = await Opportunity.find({
      prospect: prospectId,
      organization: user.organization
    })
      .populate('stage')
      .populate('contacts')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: opportunities
    });
  } catch (error) {
    console.error('Get prospect opportunities error:', error);
    res.status(500).json({ success: false, message: 'Error fetching opportunities' });
  }
};

// Update an opportunity
export const updateOpportunity = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const updates = req.body;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Fetch the original opportunity to get the list of contacts before the update
      const originalOpportunity = await Opportunity.findOne({
        _id: id,
        organization: user.organization
      }).session(session);

      if (!originalOpportunity) {
        throw new Error('Opportunity not found');
      }

      // If updating contacts, verify they exist and belong to the organization
      if (updates.contacts && updates.contacts.length > 0) {
        const contactsExist = await Contact.find({
          _id: { $in: updates.contacts },
          organization: user.organization
        }).session(session);

        if (contactsExist.length !== updates.contacts.length) {
          throw new Error('One or more contacts not found');
        }
      }

      // If updating stage, verify it exists and belongs to the opportunity's pipeline
      if (updates.stage) {
        const stageDoc = await PipelineStage.findOne({
          _id: updates.stage,
          pipeline: originalOpportunity.pipeline,
          organization: user.organization
        }).session(session);

        if (!stageDoc) {
          throw new Error('Pipeline stage not found or does not belong to the opportunity\'s pipeline');
        }
      }

      const opportunity = await Opportunity.findOneAndUpdate(
        { _id: id, organization: user.organization },
        updates,
        { new: true, runValidators: true, session }
      )
        .populate('stage')
        .populate('prospect')
        .populate('contacts')
        .populate('createdBy', 'name email');

      if (!opportunity) {
        // This case should ideally be caught by originalOpportunity check, but as a safeguard:
        throw new Error('Opportunity not found during update'); 
      }

      // Update contacts' opportunities array
      if (updates.contacts) {
        const oldContacts = originalOpportunity.contacts.map(c => c.toString());
        const newContacts = updates.contacts.map((c: string) => c.toString());

        const contactsToRemove = oldContacts.filter(c => !newContacts.includes(c));
        const contactsToAdd = newContacts.filter((c: string) => !oldContacts.includes(c));

        // Remove opportunity from contacts that are no longer associated
        if (contactsToRemove.length > 0) {
          await Contact.updateMany(
            { _id: { $in: contactsToRemove }, organization: user.organization },
            { $pull: { opportunities: opportunity._id } },
            { session }
          );
          
          // Schedule reprocessing for the opportunity since contacts were removed
          opportunityBatchProcessingService.scheduleOpportunityReprocessing(opportunity._id.toString());
        }

        // Add opportunity to new contacts
        if (contactsToAdd.length > 0) {
          await Contact.updateMany(
            { _id: { $in: contactsToAdd }, organization: user.organization },
            { $addToSet: { opportunities: opportunity._id } },
            { session }
          );
          
          // Schedule reprocessing for the opportunity since new contacts were added
          opportunityBatchProcessingService.scheduleOpportunityReprocessing(opportunity._id.toString());
        }
      } else if (updates.contacts === null || (Array.isArray(updates.contacts) && updates.contacts.length === 0)) {
        // If updates.contacts is explicitly set to empty or null, remove from all previously associated contacts
        const oldContacts = originalOpportunity.contacts.map(c => c.toString());
        if (oldContacts.length > 0) {
          await Contact.updateMany(
            { _id: { $in: oldContacts }, organization: user.organization },
            { $pull: { opportunities: opportunity._id } },
            { session }
          );
          
          // Schedule reprocessing for the opportunity since all contacts were removed
          opportunityBatchProcessingService.scheduleOpportunityReprocessing(opportunity._id.toString());
        }
      }

      res.status(200).json({
        success: true,
        data: opportunity
      });
    });
  } catch (error) {
    console.error('Update opportunity error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error updating opportunity';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Opportunity not found') statusCode = 404;
    if (errorMessage === 'Opportunity not found during update') statusCode = 404;
    if (errorMessage === 'One or more contacts not found') statusCode = 404;
    
    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
};

// Delete an opportunity
export const deleteOpportunity = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      const opportunity = await Opportunity.findOne({
        _id: id,
        organization: user.organization
      }).session(session);

      if (!opportunity) {
        throw new Error('Opportunity not found');
      }

      // Remove opportunity from contacts' opportunities array
      await Contact.updateMany(
        { opportunities: opportunity._id, organization: user.organization },
        { $pull: { opportunities: opportunity._id } },
        { session }
      );

      // Remove opportunity from the prospect's opportunities array
      if (opportunity.prospect) {
        await Prospect.findByIdAndUpdate(
          opportunity.prospect,
          { $pull: { opportunities: opportunity._id } },
          { session }
        );
      }

      // Find all sales rooms associated with this opportunity
      const salesRooms = await DigitalSalesRoom.find({ opportunity: opportunity._id, organization: user.organization }).session(session);

      // For each sales room, clean up associated resources
      for (const salesRoom of salesRooms) {
        const salesRoomId = (salesRoom._id as mongoose.Types.ObjectId).toString();
        
        // Clean up documents
        if (salesRoom.documents && salesRoom.documents.length > 0) {
          // Get all documents
          const documents = await Document.find({ _id: { $in: salesRoom.documents } }).session(session);
          
          // Delete document files and records
          for (const document of documents) {
            // Delete the file from storage
            const fileName = path.basename(document.filePath);
            try {
              // Note: File system operations are not part of the MongoDB transaction
              // and will not be rolled back automatically. Consider strategies for handling this.
              await fileStorageService.deleteFile(
                user.organization.toString(),
                salesRoomId,
                fileName
              );
            } catch (fileError) {
              // Log the error, but allow the transaction to continue if appropriate
              // Or, throw an error here to roll back the DB operations if file deletion is critical
              console.error('Error deleting file during opportunity deletion, continuing transaction:', fileError);
            }
            
            // Delete document access records
            await DocumentAccess.deleteMany({ document: document._id }, { session });
          }
          
          // Delete all document records
          await Document.deleteMany({ _id: { $in: salesRoom.documents } }, { session });
        }
        
        // Delete all link access records and links
        if (salesRoom.links && salesRoom.links.length > 0) {
          await LinkAccess.deleteMany({ link: { $in: salesRoom.links } }, { session });
          await Link.deleteMany({ _id: { $in: salesRoom.links } }, { session });
        }
      }

      // Delete all sales rooms
      await DigitalSalesRoom.deleteMany({ opportunity: opportunity._id, organization: user.organization }, { session });

      // Delete the opportunity
      await Opportunity.deleteOne({ _id: opportunity._id, organization: user.organization }, { session });

      res.status(200).json({
        success: true,
        data: {}
      });
    });
  } catch (error) {
    console.error('Delete opportunity error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error deleting opportunity';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Opportunity not found') statusCode = 404;
    
    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
};

// Remove a contact from an opportunity
export const removeContactFromOpportunity = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { id, contactId } = req.params;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Find the opportunity
      const opportunity = await Opportunity.findOne({
        _id: id,
        organization: user.organization
      }).session(session);

      if (!opportunity) {
        throw new Error('Opportunity not found');
      }

      // Verify the contact exists
      const contact = await Contact.findOne({
        _id: contactId,
        organization: user.organization
      }).session(session);

      if (!contact) {
        throw new Error('Contact not found');
      }

      // Remove the contact from the opportunity
      await Opportunity.findByIdAndUpdate(
        id,
        { $pull: { contacts: contactId } },
        { new: true, session }
      );

      // Remove the opportunity from the contact
      await Contact.findByIdAndUpdate(
        contactId,
        { $pull: { opportunities: id } },
        { session }
      );

      // Schedule reprocessing for the opportunity since a contact was removed
      opportunityBatchProcessingService.scheduleOpportunityReprocessing(id);

      // Fetch the updated opportunity to return in the response
      // It's important to do this within the transaction if you need transactional consistency for the read,
      // or after the transaction if you want to see the committed state.
      // For this API response, seeing the committed state is usually fine and might be slightly more performant.
      // However, to ensure the populated data is consistent with the transaction, we can fetch it here.
      const updatedOpportunity = await Opportunity.findById(id)
        .populate('stage')
        .populate('prospect')
        .populate('contacts')
        .populate('createdBy', 'name email')
        // .populate('activities') // Assuming 'activities' might be on opportunity, ensure it's populated if needed
        .session(session); 

      res.status(200).json({
        success: true,
        data: updatedOpportunity
      });
    });
  } catch (error) {
    console.error('Remove contact from opportunity error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error removing contact from opportunity';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Opportunity not found') statusCode = 404;
    if (errorMessage === 'Contact not found') statusCode = 404;

    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
};

// Get the processing status of an opportunity
export const getOpportunityProcessingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Verify the opportunity exists and belongs to the organization
    const opportunity = await Opportunity.findOne({
      _id: id,
      organization: user.organization
    }).select('prospect processingStatus');

    if (!opportunity) {
      res.status(404).json({ success: false, message: 'Opportunity not found' });
      return;
    }

    // Get batch processing status
    const batchStatus = await opportunityBatchProcessingService.getProcessingStatus(id);

    // Check if this is batch processing (has batch status and either running/scheduled or has activity counts)
    if (batchStatus && (batchStatus.isRunning || batchStatus.isScheduled || batchStatus.totalActivities !== undefined)) {
      let status = batchStatus.status;
      if (batchStatus.isScheduled && (status === 'idle' || status === 'completed' || status === 'failed')) {
        status = 'scheduled' as any;
      }

      res.status(200).json({
        success: true,
        data: {
          type: 'batch',
          status: status,
          processed: batchStatus.processedActivities || 0,
          total: batchStatus.totalActivities || 0,
          isScheduled: batchStatus.isScheduled,
          isRunning: batchStatus.isRunning
        }
      });
      return;
    }

    // Check for individual activity processing - only show pending/processing activities
    const prospectId = opportunity.prospect;
    const pendingActivityItems = await ActivityProcessingQueue.find({
      prospect: prospectId,
      queueItemType: 'activity',
      status: { $in: ['pending', 'processing'] }
    }).select('status').lean();

    if (pendingActivityItems.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          type: 'individual',
          status: 'idle',
          pending: 0,
          total: 0,
        }
      });
      return;
    }
    
    const processingCount = pendingActivityItems.filter(item => item.status === 'processing').length;
    const pendingCount = pendingActivityItems.filter(item => item.status === 'pending').length;
    const total = pendingActivityItems.length;

    let status = 'pending';
    if (processingCount > 0) {
      status = 'processing';
    }

    res.status(200).json({
      success: true,
      data: {
        type: 'individual',
        status,
        pending: pendingCount,
        processing: processingCount,
        total
      }
    });
  } catch (error) {
    console.error('Get opportunity processing status error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error retrieving processing status';
    res.status(500).json({ success: false, message: errorMessage });
  }
}; 