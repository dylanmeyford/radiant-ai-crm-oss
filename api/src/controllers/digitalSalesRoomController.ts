import { Request, Response } from 'express';
import { DigitalSalesRoom, Document, DocumentAccess, Visitor, Link, LinkAccess } from '../models/DigitalSalesRoom';
import Opportunity from '../models/Opportunity';
import SalesPlaybook from '../models/SalesPlaybook';
import { 
  Pathway, 
  PathwayStep, 
  IPathwayStep, 
  SalesRoomProgress,
  ISalesRoomProgress 
} from '../models/Pathway';
import fileStorageService from '../services/fileStorageService';
import emailVerificationService from '../services/emailVerificationService';
import { DigitalSalesRoomService } from '../services/digitalSalesRoomService';
import path from 'path';
import 'express-session';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';

// Extend Express Request to include Multer file
interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

// Extend SessionData interface from express-session
declare module 'express-session' {
  interface SessionData {
    visitor?: {
      id: string;
      email: string;
      salesRoomId: string;
    };
  }
}

// Create a new digital sales room
export const createSalesRoom = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { name, description, opportunityId, expiresAt, useDefaultPathway } = req.body;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Verify opportunity exists and belongs to the organization
      const opportunity = await Opportunity.findOne({
        _id: opportunityId,
        organization: user.organization
      }).session(session);

      if (!opportunity) {
        throw new Error('Opportunity not found');
      }

      const salesRoomData: any = {
        name,
        description,
        uniqueId: uuidv4(),
        opportunity: opportunityId,
        createdBy: user._id,
        organization: user.organization,
        expiresAt: expiresAt || undefined,
        isActive: true
      };

      // If useDefaultPathway is true, find and assign the default pathway
      let defaultPathway = null;
      if (useDefaultPathway) {
        defaultPathway = await Pathway.findOne({
          organization: user.organization,
          isDefault: true
        }).populate('steps').session(session);

        if (defaultPathway) {
          salesRoomData.pathway = defaultPathway._id;
        }
      }

      const salesRoom = new DigitalSalesRoom(salesRoomData);
      await salesRoom.save({ session });

      // Add the sales room to the opportunity
      await Opportunity.findByIdAndUpdate(opportunityId, 
        { $push: { salesRooms: salesRoom._id } }, 
        { session }
      );

      // If a default pathway was assigned, initialize the progress entries
      if (defaultPathway) {
        const populatedSteps = defaultPathway.steps as unknown as (IPathwayStep & mongoose.Document)[];
        
        // Create progress entries for each step
        if (populatedSteps && populatedSteps.length > 0) {
          const progressOperations = populatedSteps.map(step => 
            SalesRoomProgress.create([
              {
                salesRoom: salesRoom._id,
                pathwayStep: step._id,
                status: 'not_started',
                updatedBy: user._id
              }
            ], { session }) // Pass session to create within transaction
          );
          
          // Wait for all progress entries to be created
          await Promise.all(progressOperations);
        }
      }

      res.status(201).json({
        success: true,
        data: salesRoom
      });
    });
  } catch (error) {
    console.error('Create sales room error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error creating sales room';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Opportunity not found') statusCode = 404;
    
    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
};

// Get sales room details (admin)
export const getSalesRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const { opportunityId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const salesRoom = await DigitalSalesRoom.findOne({
      opportunity: opportunityId,
      organization: user.organization
    }).populate('documents').populate('links');

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: salesRoom
    });
  } catch (error) {
    console.error('Get sales room error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving sales room' });
  }
};

// Upload a document to a sales room
export const uploadDocument = async (req: RequestWithFile, res: Response): Promise<void> => {
  try {
    const { salesRoomId } = req.params;
    const { name, description } = req.body;
    const file = req.file;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    // Find the sales room
    const salesRoom = await DigitalSalesRoom.findOne({
      _id: salesRoomId,
      organization: user.organization
    });

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found' });
      return;
    }

    // Save the file
    const { filePath, url } = await fileStorageService.saveFile(
      file.buffer,
      file.originalname,
      user.organization.toString(),
      salesRoomId
    );

    // Create a document record
    const document = await Document.create({
      name: name || file.originalname,
      description,
      fileType: path.extname(file.originalname).toLowerCase().substring(1),
      fileSize: file.size,
      filePath,
      url,
      uploadedBy: user._id
    });

    // Add document to the sales room
    await DigitalSalesRoom.findByIdAndUpdate(
      salesRoomId,
      { $push: { documents: document._id } }
    );

    res.status(201).json({
      success: true,
      data: document
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ success: false, message: 'Error uploading document' });
  }
};

// Upload a link to a sales room
export const uploadLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { salesRoomId } = req.params;
    const { name, url, description, type } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Validate required fields
    if (!name || !url) {
      res.status(400).json({ success: false, message: 'Name and URL are required' });
      return;
    }

    // Find the sales room
    const salesRoom = await DigitalSalesRoom.findOne({
      _id: salesRoomId,
      organization: user.organization
    });

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found' });
      return;
    }

    // Create a link record
    const link = await Link.create({
      name,
      description,
      url,
      type: type || 'link',
      uploadedBy: user._id
    });

    // Add link to the sales room
    await DigitalSalesRoom.findByIdAndUpdate(
      salesRoomId,
      { $push: { links: link._id } }
    );

    res.status(201).json({
      success: true,
      data: link
    });
  } catch (error) {
    console.error('Upload link error:', error);
    res.status(500).json({ success: false, message: 'Error uploading link' });
  }
};

// Delete a document from a sales room
export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { salesRoomId, documentId } = req.params;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Find the document and ensure it belongs to the user (indirectly via sales room org)
      const document = await Document.findById(documentId).session(session);

      if (!document) {
        throw new Error('Document not found');
      }

      // Find the sales room and verify organization and document ownership
      const salesRoom = await DigitalSalesRoom.findOne({
        _id: salesRoomId,
        organization: user.organization,
        documents: documentId // Ensure the document is actually in this sales room
      }).session(session);

      if (!salesRoom) {
        // This could mean sales room not found, org mismatch, or document not in this sales room
        throw new Error('Sales room not found, or document does not belong to this sales room/organization');
      }
      
      // Additionally, verify the original uploader if there's a strict ownership model for deletion beyond sales room context
      // For now, we assume if the user has access to delete from the sales room (checked by org), it's fine.
      // if (document.uploadedBy.toString() !== user._id.toString()) {
      //   throw new Error('User not authorized to delete this document');
      // }

      // Remove document from sales room
      await DigitalSalesRoom.findByIdAndUpdate(
        salesRoomId,
        { $pull: { documents: documentId } },
        { session }
      );

      // Delete access records for this document in this specific sales room
      await DocumentAccess.deleteMany({ 
        document: documentId, 
        salesRoom: salesRoomId 
      }, { session });

      // Check if document is still referenced by other sales rooms
      const otherSalesRoomsWithDoc = await DigitalSalesRoom.countDocuments({
        documents: documentId,
        _id: { $ne: salesRoomId }
      }, { session });

      // Check if document is still referenced by any playbooks
      const playbooksWithDoc = await SalesPlaybook.countDocuments({
        files: documentId,
        organization: user.organization
      }, { session });

      // Only delete the document record if it's not used in any other sales rooms AND not used in any playbooks
      if (otherSalesRoomsWithDoc === 0 && playbooksWithDoc === 0) {
        await Document.findByIdAndDelete(documentId, { session });
      }

      // File system operation (outside transaction)
      // Only delete the physical file if the document record was also deleted
      if (otherSalesRoomsWithDoc === 0 && playbooksWithDoc === 0) {
        // Extract filename from the path
        const fileName = path.basename(document.filePath);
        try {
          await fileStorageService.deleteFile(
            user.organization.toString(),
            salesRoomId,
            fileName
          );
        } catch (fileError) {
          // Log the error, but the DB transaction will proceed.
          // Consider if this failure should trigger a compensating transaction or other alerts.
          console.error('Error deleting file from storage, but DB operations were successful:', fileError);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Document deleted successfully'
      });
    });
  } catch (error) {
    console.error('Delete document error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error deleting document';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Document not found') statusCode = 404;
    if (errorMessage === 'Sales room not found, or document does not belong to this sales room/organization') statusCode = 404;
    // if (errorMessage === 'User not authorized to delete this document') statusCode = 403;

    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
};

// Delete a link from a sales room
export const deleteLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { salesRoomId, linkId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Find the link
    const link = await Link.findOne({
      _id: linkId,
      uploadedBy: user._id
    });

    if (!link) {
      res.status(404).json({ success: false, message: 'Link not found' });
      return;
    }

    // Remove link from sales room
    await DigitalSalesRoom.findByIdAndUpdate(
      salesRoomId,
      { $pull: { links: linkId } }
    );

    // Delete link record
    await Link.findByIdAndDelete(linkId);

    res.status(200).json({
      success: true,
      message: 'Link deleted successfully'
    });
  } catch (error) {
    console.error('Delete link error:', error);
    res.status(500).json({ success: false, message: 'Error deleting link' });
  }
};

// Request access to a sales room (visitor)
export const requestAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const { uniqueId } = req.params;
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ success: false, message: 'Email is required' });
      return;
    }

    // Find the sales room
    const salesRoom = await DigitalSalesRoom.findOne({
      uniqueId,
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    });

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found or expired' });
      return;
    }

    // Generate verification code
    const code = await emailVerificationService.createVerificationCode(
      email,
      salesRoom.uniqueId
    );

    // TODO: Send email with verification code
    // This would typically involve an email service integration
    // For now, just return the code in the response (for testing)

    res.status(200).json({
      success: true,
      message: 'Verification code sent to email',
      code // Remove this in production
    });
  } catch (error) {
    console.error('Request access error:', error);
    res.status(500).json({ success: false, message: 'Error processing access request' });
  }
};

// Verify access code (visitor)
export const verifyAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const { uniqueId } = req.params;
    const { email, code } = req.body;

    if (!email || !code) {
      res.status(400).json({ success: false, message: 'Email and verification code are required' });
      return;
    }

    // Find the sales room
    const salesRoom = await DigitalSalesRoom.findOne({
      uniqueId,
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    });

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found or expired' });
      return;
    }

    // Verify the code
    const isValid = await emailVerificationService.verifyCode(
      email,
      code,
      salesRoom.uniqueId
    );

    if (!isValid) {
      res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
      return;
    }

    // --- Add DSR Access Activity ---
    DigitalSalesRoomService.recordVisitorAccess(email, salesRoom);
    // ---------------------------------

    // Create or update visitor record
    const visitor = await Visitor.findOneAndUpdate(
      { email },
      {
        $inc: { totalVisits: 1 },
        lastVisitedAt: new Date(),
        verifiedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // Add visitor to sales room if not already present
    await DigitalSalesRoom.findByIdAndUpdate(
      salesRoom._id,
      { $addToSet: { visitors: visitor._id } }
    );

    // Generate a token for the visitor
    req.session = req.session || {};
    req.session.visitor = {
      id: (visitor._id as unknown as mongoose.Types.ObjectId).toString(),
      email: visitor.email as string,
      salesRoomId: (salesRoom._id as unknown as mongoose.Types.ObjectId).toString()
    };

    req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      res.status(200).json({
        success: true,
        message: 'Access granted',
        salesRoom: {
          id: salesRoom._id,
          name: salesRoom.name,
          description: salesRoom.description
        }
      });
    });
  } catch (error) {
    console.error('Verify access error:', error);
    res.status(500).json({ success: false, message: 'Error verifying access' });
  }
};

// Get sales room content for visitor
export const getSalesRoomForVisitor = async (req: Request, res: Response): Promise<void> => {
  try {

    const { uniqueId } = req.params;
    const visitorSession = req.session?.visitor;

    if (!visitorSession) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Find the sales room
    const salesRoom = await DigitalSalesRoom.findOne({
      uniqueId,
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    }).populate('documents', '-filePath').populate('links').populate('pathway');

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found or expired' });
      return;
    }

    // Get pathway information if it exists
    let pathwayInfo = null;
    if (salesRoom.pathway) {
      const pathway = await Pathway.findById(salesRoom.pathway).populate('steps');
      if (pathway) {
        const populatedSteps = pathway.steps as unknown as (IPathwayStep & mongoose.Document)[];
        pathwayInfo = {
          id: pathway._id,
          name: pathway.name,
          description: pathway.description,
          steps: populatedSteps.map(step => ({
            id: step._id as mongoose.Types.ObjectId,
            name: step.name,
            description: step.description,
            order: step.order
          }))
        };
      }
    }

    res.status(200).json({
      success: true,
      data: {
        id: salesRoom._id,
        name: salesRoom.name,
        description: salesRoom.description,
        documents: salesRoom.documents,
        links: salesRoom.links,
        pathway: pathwayInfo
      }
    });
  } catch (error) {
    console.error('Get sales room for visitor error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving sales room' });
  }
};

// Get a document from a sales room (visitor)
export const getDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { salesRoomId, documentId } = req.params;
    const visitorSession = req.session?.visitor;

    if (!visitorSession) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Find the sales room
    const salesRoom = await DigitalSalesRoom.findOne({
      _id: salesRoomId,
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    });

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found or expired' });
      return;
    }

    // Find the document - fix duplicate properties
    const document = await Document.findOne({
      _id: documentId,
      $and: [{ _id: { $in: salesRoom.documents } }]
    });

    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    // Extract organization ID and filename
    const orgId = salesRoom.organization.toString();
    const fileName = path.basename(document.filePath);

    // Track document access
    const documentAccess = await DocumentAccess.create({
      document: document._id,
      salesRoom: salesRoom._id,
      visitorEmail: visitorSession.email,
      accessedAt: new Date()
    });

    // Get the file using the exact filePath stored in the document
    // This works for files from any source (sales rooms, playbooks, etc.)
    const fileData = await fileStorageService.getFileByPath(document.filePath);

    // Set custom header to return the document access ID
    const documentAccessId = (documentAccess._id as unknown) as mongoose.Types.ObjectId;
    res.setHeader('X-Document-Access-Id', documentAccessId.toString());
    res.setHeader('Content-Type', fileData.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.name || fileData.fileName}"`);
    res.send(fileData.buffer);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving document' });
  }
};

// Track document interaction (time spent, page views)
export const trackDocumentInteraction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { documentAccessId } = req.params;
    const { durationMs, pageViews } = req.body;
    const visitorSession = req.session?.visitor;

    if (!visitorSession) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Find the document access record
    const documentAccess = await DocumentAccess.findById(documentAccessId);

    if (!documentAccess || documentAccess.visitorEmail !== visitorSession.email) {
      res.status(404).json({ success: false, message: 'Document access record not found' });
      return;
    }

    // --- Add DSR Document Interaction Activity ---
    const salesRoom = await DigitalSalesRoom.findOne({ documents: documentAccess.document });
    const document = await Document.findById(documentAccess.document);
    if (salesRoom && document) {
      DigitalSalesRoomService.recordDocumentInteraction(
        visitorSession.email,
        salesRoom,
        document.name,
        durationMs,
        pageViews
      );
    }
    // -----------------------------------------

    // Update with tracking information
    documentAccess.durationMs = durationMs;
    
    if (pageViews && Array.isArray(pageViews)) {
      documentAccess.pageViews = pageViews;
    }
    
    await documentAccess.save();

    res.status(200).json({
      success: true,
      message: 'Document interaction tracked successfully'
    });
  } catch (error) {
    console.error('Track document interaction error:', error);
    res.status(500).json({ success: false, message: 'Error tracking document interaction' });
  }
};

// Track link interaction (clicks, time spent)
export const trackLinkInteraction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { linkId } = req.params;
    const { durationMs, referrer } = req.body;
    const visitorSession = req.session?.visitor;

    if (!visitorSession) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Find the link
    const link = await Link.findById(linkId);

    if (!link) {
      res.status(404).json({ success: false, message: 'Link not found' });
      return;
    }

    // --- Add DSR Link Click Activity ---
    const salesRoom = await DigitalSalesRoom.findOne({ 
      links: linkId,
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    });
    
    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found for this link' });
      return;
    }
    
    DigitalSalesRoomService.recordLinkClick(
      visitorSession.email,
      salesRoom,
      link.name,
      link.url
    );
    // ---------------------------------

    // Create or update link access record
    const linkAccess = await LinkAccess.create({
      link: linkId,
      salesRoom: salesRoom._id,
      visitorEmail: visitorSession.email,
      accessedAt: new Date(),
      durationMs,
      referrer
    });

    res.status(200).json({
      success: true,
      message: 'Link interaction tracked successfully',
      data: {
        linkAccessId: linkAccess._id
      }
    });
  } catch (error) {
    console.error('Track link interaction error:', error);
    res.status(500).json({ success: false, message: 'Error tracking link interaction' });
  }
};

// Get analytics for a sales room
export const getSalesRoomAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { salesRoomId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Find the sales room
    const salesRoom = await DigitalSalesRoom.findOne({
      _id: salesRoomId,
      organization: user.organization
    });

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found' });
      return;
    }

    // Get all documents in the sales room
    const documents = await Document.find({
      _id: { $in: salesRoom.documents }
    });

    // Get all links in the sales room
    const links = await Link.find({
      _id: { $in: salesRoom.links }
    });

    // Get all document access records for this specific sales room
    const documentAccess = await DocumentAccess.find({
      salesRoom: salesRoom._id,
      document: { $in: documents.map(doc => doc._id) }
    });

    // Get all link access records for this specific sales room
    const linkAccess = await LinkAccess.find({
      salesRoom: salesRoom._id,
      link: { $in: links.map(link => link._id) }
    });

    // Get all visitors
    const visitors = await Visitor.find({
      _id: { $in: salesRoom.visitors }
    });

    // Aggregate analytics
    const analytics = {
      totalVisitors: visitors.length,
      totalDocumentViews: documentAccess.length,
      totalLinkClicks: linkAccess.length,
      documentAnalytics: await Promise.all(documents.map(async (doc: any) => {
        const docId = doc._id.toString();
        const accesses = documentAccess.filter(access => 
          access.document.toString() === docId
        );
        
        return {
          documentId: docId,
          documentName: doc.name as string,
          totalViews: accesses.length,
          totalUniqueVisitors: new Set(accesses.map(a => a.visitorEmail)).size,
          averageDurationMs: accesses.reduce((sum, a) => sum + (a.durationMs || 0), 0) / 
                             (accesses.filter(a => a.durationMs).length || 1),
          pageAnalytics: accesses
            .filter(a => a.pageViews && a.pageViews.length > 0)
            .reduce((pages, access) => {
              access.pageViews?.forEach(pv => {
                if (!pages[pv.page]) {
                  pages[pv.page] = { views: 0, totalDurationMs: 0 };
                }
                pages[pv.page].views++;
                pages[pv.page].totalDurationMs += pv.durationMs;
              });
              return pages;
            }, {} as Record<number, { views: number, totalDurationMs: number }>)
        };
      })),
      linkAnalytics: links.map(link => {
        const linkId = (link._id as mongoose.Types.ObjectId).toString();
        const accesses = linkAccess.filter(access => 
          access.link.toString() === linkId
        );

        return {
          linkId: linkId,
          linkName: link.name as string,
          linkUrl: link.url as string,
          totalClicks: accesses.length,
          totalUniqueVisitors: new Set(accesses.map(a => a.visitorEmail)).size,
          averageDurationMs: accesses.reduce((sum, a) => sum + (a.durationMs || 0), 0) /
                           (accesses.filter(a => a.durationMs).length || 1),
          referrers: accesses
            .filter(a => a.referrer)
            .reduce((refs, access) => {
              const referrer = access.referrer || 'unknown';
              if (!refs[referrer]) {
                refs[referrer] = 0;
              }
              refs[referrer]++;
              return refs;
            }, {} as Record<string, number>)
        };
      }),
      visitorAnalytics: visitors.map(visitor => {
        const visitorDocumentAccesses = documentAccess.filter(
          access => access.visitorEmail === visitor.email
        );
        
        const visitorLinkAccesses = linkAccess.filter(
          access => access.visitorEmail === visitor.email
        );
        
        return {
          visitorEmail: visitor.email,
          totalVisits: visitor.totalVisits,
          lastVisitedAt: visitor.lastVisitedAt,
          documentsViewed: visitorDocumentAccesses.length,
          linksClicked: visitorLinkAccesses.length,
          totalTimeSpentMs: visitorDocumentAccesses.reduce(
            (sum, access) => sum + (access.durationMs || 0), 0
          ) + visitorLinkAccesses.reduce(
            (sum, access) => sum + (access.durationMs || 0), 0
          ),
          documentEngagement: visitorDocumentAccesses.map(access => {
            const document = documents.find(doc => (doc._id as mongoose.Types.ObjectId).toString() === access.document.toString());
            return {
              documentId: access.document.toString(),
              documentName: document?.name || 'Unknown Document',
              accessedAt: access.accessedAt,
              durationMs: access.durationMs || 0,
              pageEngagement: access.pageViews?.map(pv => ({
                page: pv.page,
                durationMs: pv.durationMs
              })) || []
            };
          }),
          linkEngagement: visitorLinkAccesses.map(access => {
            const link = links.find(l => (l._id as mongoose.Types.ObjectId).toString() === access.link.toString());
            return {
              linkId: access.link.toString(),
              linkName: link?.name || 'Unknown Link',
              linkUrl: link?.url || '#',
              accessedAt: access.accessedAt,
              durationMs: access.durationMs || 0,
              referrer: access.referrer
            };
          })
        };
      })
    };

    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Get sales room analytics error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving sales room analytics' });
  }
};

// Create a new pathway
export const createPathway = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, steps } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
      res.status(400).json({ success: false, message: 'Name and at least one step are required' });
      return;
    }

    // Create the pathway steps
    const createdSteps = await PathwayStep.insertMany(
      steps.map((step: { name: string; description?: string }, index: number) => ({
        name: step.name,
        description: step.description,
        order: index + 1,
        createdBy: user._id
      }))
    );

    // Create the pathway
    const pathway = await Pathway.create({
      name,
      description,
      steps: createdSteps.map(step => step._id),
      organization: user.organization,
      createdBy: user._id,
      isDefault: false
    });

    res.status(201).json({
      success: true,
      data: pathway
    });
  } catch (error) {
    console.error('Create pathway error:', error);
    res.status(500).json({ success: false, message: 'Error creating pathway' });
  }
};

// Get all pathways for an organization
export const getPathways = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const pathways = await Pathway.find({
      organization: user.organization
    }).populate('steps');

    res.status(200).json({
      success: true,
      data: pathways
    });
  } catch (error) {
    console.error('Get pathways error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving pathways' });
  }
};

// Assign a pathway to a sales room
export const assignPathwayToSalesRoom = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { salesRoomId, pathwayId, setDefault } = req.body;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      if (!salesRoomId || !pathwayId) {
        throw new Error('Sales room ID and pathway ID are required');
      }

      // Verify the pathway exists and belongs to the organization
      const pathway = await Pathway.findOne({
        _id: pathwayId,
        organization: user.organization
      }).populate('steps').session(session);

      if (!pathway) {
        throw new Error('Pathway not found');
      }

      // Verify the sales room exists and belongs to the organization
      const salesRoom = await DigitalSalesRoom.findOne({
        _id: salesRoomId,
        organization: user.organization
      }).session(session);

      if (!salesRoom) {
        throw new Error('Sales room not found');
      }

      // Update the sales room with the pathway
      await DigitalSalesRoom.findByIdAndUpdate(
        salesRoomId,
        { pathway: pathwayId },
        { session }
      );

      // If setDefault is true, make this pathway the default for the organization
      if (setDefault) {
        // First, remove default status from any existing default pathway
        await Pathway.updateMany(
          { organization: user.organization, isDefault: true },
          { isDefault: false },
          { session }
        );

        // Set this pathway as the default
        await Pathway.findByIdAndUpdate(
          pathwayId,
          { isDefault: true },
          { session }
        );
      }
      
      // Initialize sales room progress entries for each step
      const populatedSteps = pathway.steps as unknown as (IPathwayStep & mongoose.Document)[];
      
      if (populatedSteps && populatedSteps.length > 0) {
        // Create/Update progress entries for each step
        const progressOperations = populatedSteps.map(step => 
          SalesRoomProgress.findOneAndUpdate(
            {
              salesRoom: salesRoom._id,
              pathwayStep: step._id
            },
            {
              $setOnInsert: { // Only set these on creation
                status: 'not_started',
                updatedBy: user._id 
              }
            },
            { upsert: true, new: true, session } // pass session
          )
        );
        
        // Wait for all progress entries to be created/updated
        await Promise.all(progressOperations);
      }

      res.status(200).json({
        success: true,
        message: 'Pathway assigned to sales room successfully'
      });
    });
  } catch (error) {
    console.error('Assign pathway error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error assigning pathway to sales room';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Sales room ID and pathway ID are required') statusCode = 400;
    if (errorMessage === 'Pathway not found') statusCode = 404;
    if (errorMessage === 'Sales room not found') statusCode = 404;
    
    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
};

// Set a pathway as the default for an organization
export const setDefaultPathway = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pathwayId } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!pathwayId) {
      res.status(400).json({ success: false, message: 'Pathway ID is required' });
      return;
    }

    // Verify the pathway exists and belongs to the organization
    const pathway = await Pathway.findOne({
      _id: pathwayId,
      organization: user.organization
    });

    if (!pathway) {
      res.status(404).json({ success: false, message: 'Pathway not found' });
      return;
    }

    // First, remove default status from any existing default pathway
    await Pathway.updateMany(
      { organization: user.organization, isDefault: true },
      { isDefault: false }
    );

    // Set this pathway as the default
    await Pathway.findByIdAndUpdate(
      pathwayId,
      { isDefault: true }
    );

    res.status(200).json({
      success: true,
      message: 'Default pathway set successfully'
    });
  } catch (error) {
    console.error('Set default pathway error:', error);
    res.status(500).json({ success: false, message: 'Error setting default pathway' });
  }
};

// Get sales room pathway progress (for visitors)
export const getSalesRoomPathwayProgressPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { salesRoomId } = req.params;
    const visitorSession = req.session?.visitor;

    if (!visitorSession) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Find the sales room
    const salesRoom = await DigitalSalesRoom.findOne({
      _id: salesRoomId,
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    }).populate('pathway');

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found or expired' });
      return;
    }

    if (!salesRoom.pathway) {
      res.status(404).json({ success: false, message: 'No pathway assigned to this sales room' });
      return;
    }

    // Get the visitor
    const visitor = await Visitor.findOne({
      email: visitorSession.email
    });

    if (!visitor) {
      res.status(404).json({ success: false, message: 'Visitor not found' });
      return;
    }

    // Get the pathway with steps
    const pathway = await Pathway.findById(salesRoom.pathway).populate('steps');
    
    if (!pathway) {
      res.status(404).json({ success: false, message: 'Pathway not found' });
      return;
    }

    // Add proper type casting for the populated steps
    const populatedSteps = pathway.steps as unknown as (IPathwayStep & mongoose.Document)[];

    // Get the sales room's progress for all steps
    const progress = await SalesRoomProgress.find({
      salesRoom: salesRoom._id,
      pathwayStep: { $in: populatedSteps.map(step => step._id) }
    });

    // Combine steps with progress
    const stepsWithProgress = populatedSteps.map(step => {
      const stepProgress = progress.find((p: mongoose.Document & ISalesRoomProgress) => 
        p.pathwayStep.toString() === (step._id as mongoose.Types.ObjectId).toString()
      );
      return {
        stepId: step._id as mongoose.Types.ObjectId,
        name: step.name,
        description: step.description,
        order: step.order,
        status: stepProgress ? stepProgress.status : 'not_started',
        updatedAt: stepProgress ? stepProgress.updatedAt : null
      };
    });

    // Sort steps by order
    stepsWithProgress.sort((a, b) => a.order - b.order);

    // Calculate progress metrics
    const totalSteps = stepsWithProgress.length;
    const completedSteps = stepsWithProgress.filter(step => step.status === 'completed').length;
    const percentComplete = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    // Find the current step (first non-completed step)
    const currentStep = stepsWithProgress.find(step => 
      step.status !== 'completed' && step.status !== 'skipped'
    ) || stepsWithProgress[stepsWithProgress.length - 1];

    res.status(200).json({
      success: true,
      data: {
        pathway: {
          id: pathway._id,
          name: pathway.name,
          description: pathway.description
        },
        progress: {
          completedSteps,
          totalSteps,
          percentComplete,
          currentStep: currentStep || null
        },
        steps: stepsWithProgress
      }
    });
  } catch (error) {
    console.error('Get sales room pathway progress error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving sales room pathway progress' });
  }
};

// Update sales room pathway progress
export const updateSalesRoomPathwayProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const { salesRoomId } = req.params;
    const { stepId, status, notes } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!stepId || !status) {
      res.status(400).json({ success: false, message: 'Step ID and status are required' });
      return;
    }

    // Find the sales room
    const salesRoom = await DigitalSalesRoom.findOne({
      _id: salesRoomId,
      organization: user.organization
    }).populate('pathway');

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found' });
      return;
    }

    if (!salesRoom.pathway) {
      res.status(404).json({ success: false, message: 'No pathway assigned to this sales room' });
      return;
    }

    // Get the pathway and verify the step exists
    const pathway = await Pathway.findById(salesRoom.pathway).populate('steps');
    
    if (!pathway) {
      res.status(404).json({ success: false, message: 'Pathway not found' });
      return;
    }

    // Add proper type casting for the populated steps
    const populatedSteps = pathway.steps as unknown as (IPathwayStep & mongoose.Document)[];

    // Use the properly typed array for mappings
    const stepExists = populatedSteps.some(step => 
      (step._id as mongoose.Types.ObjectId).toString() === stepId
    );
    
    if (!stepExists) {
      res.status(404).json({ success: false, message: 'Step not found in pathway' });
      return;
    }

    // Update or create the sales room's progress for this step
    const progress = await SalesRoomProgress.findOneAndUpdate(
      {
        salesRoom: salesRoom._id,
        pathwayStep: stepId
      },
      {
        status,
        notes: notes || undefined,
        updatedBy: user._id,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Sales room pathway progress updated successfully',
      data: progress
    });
  } catch (error) {
    console.error('Update sales room pathway progress error:', error);
    res.status(500).json({ success: false, message: 'Error updating sales room pathway progress' });
  }
};

// Initialize sales room pathway progress
export const initializeSalesRoomPathwayProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const { salesRoomId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Find the sales room
    const salesRoom = await DigitalSalesRoom.findOne({
      _id: salesRoomId,
      organization: user.organization
    }).populate('pathway');

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found' });
      return;
    }

    if (!salesRoom.pathway) {
      res.status(404).json({ success: false, message: 'No pathway assigned to this sales room' });
      return;
    }

    // Get the pathway with steps
    const pathway = await Pathway.findById(salesRoom.pathway).populate('steps');
    
    if (!pathway) {
      res.status(404).json({ success: false, message: 'Pathway not found' });
      return;
    }

    // Add proper type casting for the populated steps
    const populatedSteps = pathway.steps as unknown as (IPathwayStep & mongoose.Document)[];

    // Create progress entries for each step that doesn't already have one
    const progressOperations = populatedSteps.map(async (step) => {
      const existing = await SalesRoomProgress.findOne({
        salesRoom: salesRoom._id,
        pathwayStep: step._id
      });

      if (!existing) {
        return SalesRoomProgress.create({
          salesRoom: salesRoom._id,
          pathwayStep: step._id,
          status: 'not_started',
          updatedBy: user._id
        });
      }
      return existing;
    });

    // Wait for all progress entries to be created
    await Promise.all(progressOperations);

    res.status(200).json({
      success: true,
      message: 'Sales room pathway progress initialized successfully'
    });
  } catch (error) {
    console.error('Initialize sales room pathway progress error:', error);
    res.status(500).json({ success: false, message: 'Error initializing sales room pathway progress' });
  }
};

// Get sales room pathway progress (admin)
export const getSalesRoomPathwayProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const { salesRoomId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Find the sales room
    const salesRoom = await DigitalSalesRoom.findOne({
      _id: salesRoomId,
      organization: user.organization
    }).populate('pathway');

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found' });
      return;
    }

    if (!salesRoom.pathway) {
      res.status(404).json({ success: false, message: 'No pathway assigned to this sales room' });
      return;
    }

    // Get the pathway with steps
    const pathway = await Pathway.findById(salesRoom.pathway).populate('steps');
    
    if (!pathway) {
      res.status(404).json({ success: false, message: 'Pathway not found' });
      return;
    }

    // Add proper type casting for the populated steps
    const populatedSteps = pathway.steps as unknown as (IPathwayStep & mongoose.Document)[];

    // Get the sales room's progress for all steps
    const progress = await SalesRoomProgress.find({
      salesRoom: salesRoom._id,
      pathwayStep: { $in: populatedSteps.map(step => step._id) }
    }).populate('updatedBy', 'name email');

    // Combine steps with progress
    const stepsWithProgress = populatedSteps.map(step => {
      const stepProgress = progress.find((p: mongoose.Document & ISalesRoomProgress) => 
        p.pathwayStep.toString() === (step._id as mongoose.Types.ObjectId).toString()
      );
      return {
        stepId: step._id as mongoose.Types.ObjectId,
        name: step.name,
        description: step.description,
        order: step.order,
        status: stepProgress ? stepProgress.status : 'not_started',
        updatedAt: stepProgress ? stepProgress.updatedAt : null,
        updatedBy: stepProgress ? stepProgress.updatedBy : null,
        notes: stepProgress ? stepProgress.notes : null
      };
    });

    // Sort steps by order
    stepsWithProgress.sort((a, b) => a.order - b.order);

    // Calculate progress metrics
    const totalSteps = stepsWithProgress.length;
    const completedSteps = stepsWithProgress.filter(step => step.status === 'completed').length;
    const percentComplete = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    // Find the current step (first non-completed step)
    const currentStep = stepsWithProgress.find(step => 
      step.status !== 'completed' && step.status !== 'skipped'
    ) || stepsWithProgress[stepsWithProgress.length - 1];

    res.status(200).json({
      success: true,
      data: {
        salesRoom: {
          id: salesRoom._id,
          name: salesRoom.name,
          description: salesRoom.description
        },
        pathway: {
          id: pathway._id,
          name: pathway.name,
          description: pathway.description
        },
        progress: {
          completedSteps,
          totalSteps,
          percentComplete,
          currentStep: currentStep || null
        },
        steps: stepsWithProgress
      }
    });
  } catch (error) {
    console.error('Get sales room pathway progress error:', error);
    res.status(500).json({ success: false, message: 'Error retrieving sales room pathway progress' });
  }
};

// Add a playbook file to a sales room
export const addPlaybookFileToSalesRoom = async (req: Request, res: Response): Promise<void> => {
  try {
    const { salesRoomId } = req.params;
    const { documentId } = req.body; // Task 4.2: Request body contains documentId from playbook
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!documentId) {
      res.status(400).json({ success: false, message: 'Document ID is required' });
      return;
    }

    // Find the sales room
    const salesRoom = await DigitalSalesRoom.findOne({
      _id: salesRoomId,
      organization: user.organization
    });

    if (!salesRoom) {
      res.status(404).json({ success: false, message: 'Sales room not found' });
      return;
    }

    // Find the document to verify it exists and belongs to the organization
    const document = await Document.findById(documentId)
      .populate('uploadedBy', 'firstName lastName email organization')
      .populate('currentVersion', 'versionNumber timestamp uploadedBy');

    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    // Verify the document belongs to the same organization
    const documentUploader = document.uploadedBy as any;
    if (documentUploader.organization.toString() !== user.organization.toString()) {
      res.status(403).json({ success: false, message: 'Access denied: Document belongs to a different organization' });
      return;
    }

    // Check if document is already in the sales room
    const documentIdStr = documentId.toString();
    const existingDocumentIds = salesRoom.documents.map(id => id.toString());
    
    if (existingDocumentIds.includes(documentIdStr)) {
      res.status(400).json({ 
        success: false, 
        message: 'Document is already added to this sales room' 
      });
      return;
    }

    // Task 4.4: Add the document ID to the documents array in the DigitalSalesRoom model
    await DigitalSalesRoom.findByIdAndUpdate(
      salesRoomId,
      { $push: { documents: documentId } },
      { new: true }
    );

    // Get updated sales room with populated documents for response
    const updatedSalesRoom = await DigitalSalesRoom.findById(salesRoomId)
      .populate({
        path: 'documents',
        populate: [
          {
            path: 'uploadedBy',
            select: 'firstName lastName email'
          },
          {
            path: 'currentVersion',
            select: 'versionNumber timestamp uploadedBy'
          }
        ]
      });

    res.status(200).json({
      success: true,
      message: 'Document successfully added to sales room',
      data: {
        salesRoom: {
          id: updatedSalesRoom?._id,
          name: updatedSalesRoom?.name,
          totalDocuments: updatedSalesRoom?.documents.length || 0
        },
        addedDocument: {
          id: document._id,
          name: document.name,
          description: document.description,
          fileType: document.fileType,
          fileSize: document.fileSize,
          url: document.url,
          uploadedBy: document.uploadedBy,
          currentVersion: document.currentVersion,
          uploadedAt: document.uploadedAt
        }
      }
    });
  } catch (error) {
    console.error('Add playbook file to sales room error:', error);
    res.status(500).json({ success: false, message: 'Error adding playbook file to sales room' });
  }
}; 