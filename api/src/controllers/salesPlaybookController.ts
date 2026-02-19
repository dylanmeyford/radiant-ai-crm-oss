import { Request, Response } from 'express';
import mongoose from 'mongoose';
import SalesPlaybook from '../models/SalesPlaybook';
import { Document, Version } from '../models/DigitalSalesRoom';
import fileStorageService from '../services/fileStorageService';
import { queueFileProcessing } from '../services/fileProcessingQueue';
import { queueContentSummary } from '../services/contentSummaryQueue';
import path from 'path';

// Import Multer types for proper file typing
import multer from 'multer';

// Extend Express Request to include Multer file
interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

// Create a new sales playbook item
export const createPlaybookItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      type,
      title,
      content,
      tags,
      keywords
    } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const playbookItem = await SalesPlaybook.create({
      type,
      title,
      content,
      tags,
      keywords,
      organization: user.organization,
      createdBy: user._id
    });

    // Generate a summary when no files are attached (async, non-blocking)
    if (!playbookItem.files || playbookItem.files.length === 0) {
      queueContentSummary({
        playbookId: String(playbookItem._id),
        organizationId: user.organization.toString(),
        initiatedBy: user._id?.toString(),
      });
    }

    res.status(201).json({
      success: true,
      data: playbookItem
    });
  } catch (error) {
    console.error('Create playbook item error:', error);
    res.status(500).json({ success: false, message: 'Error creating playbook item' });
  }
};

// Get all playbook items for the organization
export const getPlaybookItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { type } = req.query;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const query: any = { organization: user.organization };
    
    // Filter by type if provided
    if (type) {
      query.type = type;
    }

    const playbookItems = await SalesPlaybook.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('files', 'name description fileType fileSize uploadedAt versions currentVersion filePath url')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: playbookItems
    });
  } catch (error) {
    console.error('Get playbook items error:', error);
    res.status(500).json({ success: false, message: 'Error fetching playbook items' });
  }
};

// Get a single playbook item
export const getPlaybookItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const playbookItem = await SalesPlaybook.findOne({
      _id: id,
      organization: user.organization
    }).populate('createdBy', 'firstName lastName email').populate('files', 'name description fileType fileSize uploadedAt');

    if (!playbookItem) {
      res.status(404).json({ success: false, message: 'Playbook item not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: playbookItem
    });
  } catch (error) {
    console.error('Get playbook item error:', error);
    res.status(500).json({ success: false, message: 'Error fetching playbook item' });
  }
};

// Update a playbook item
export const updatePlaybookItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const playbookItem = await SalesPlaybook.findOneAndUpdate(
      { _id: id, organization: user.organization },
      updates,
      { new: true, runValidators: true }
    );

    if (!playbookItem) {
      res.status(404).json({ success: false, message: 'Playbook item not found' });
      return;
    }

    // Regenerate summary when no files are attached
    if (!playbookItem.files || playbookItem.files.length === 0) {
      queueContentSummary({
        playbookId: String(playbookItem._id),
        organizationId: user.organization.toString(),
        initiatedBy: user._id?.toString(),
      });
    }

    res.status(200).json({
      success: true,
      data: playbookItem
    });
  } catch (error) {
    console.error('Update playbook item error:', error);
    res.status(500).json({ success: false, message: 'Error updating playbook item' });
  }
};

// Delete a playbook item
export const deletePlaybookItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const playbookItem = await SalesPlaybook.findOneAndDelete({
      _id: id,
      organization: user.organization
    });

    if (!playbookItem) {
      res.status(404).json({ success: false, message: 'Playbook item not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Delete playbook item error:', error);
    res.status(500).json({ success: false, message: 'Error deleting playbook item' });
  }
};

// Search playbook items
export const searchPlaybookItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, type } = req.query;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const searchQuery: any = { 
      organization: user.organization,
      $text: { $search: query as string }
    };
    
    // Filter by type if provided
    if (type) {
      searchQuery.type = type;
    }

    const playbookItems = await SalesPlaybook.find(searchQuery)
      .populate('createdBy', 'firstName lastName email')
      .sort({ score: { $meta: 'textScore' } });

    res.status(200).json({
      success: true,
      data: playbookItems
    });
  } catch (error) {
    console.error('Search playbook items error:', error);
    res.status(500).json({ success: false, message: 'Error searching playbook items' });
  }
};

// Upload file to playbook
export const uploadFileToPlaybook = async (req: RequestWithFile, res: Response): Promise<void> => {
  try {
    const { id: playbookId } = req.params;
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

    // Find the sales playbook
    const playbook = await SalesPlaybook.findOne({
      _id: playbookId,
      organization: user.organization
    });

    if (!playbook) {
      res.status(404).json({ success: false, message: 'Sales playbook not found' });
      return;
    }

    // Save the file using the new upload method specifically for playbook files
    const { filePath, url, mimeType } = await fileStorageService.upload(
      file.buffer,
      file.originalname,
      user.organization.toString(),
      playbookId,
    );

    // Create a document record
    const document = await Document.create({
      name: name || file.originalname,
      description,
      fileType: path.extname(file.originalname).toLowerCase().substring(1),
      fileSize: file.size,
      filePath,
      url,
      uploadedBy: user._id,
      mimeType
    });

    // Create initial version record
    const version = await Version.create({
      versionNumber: 1,
      timestamp: new Date(),
      uploadedBy: user._id,
      fileSize: file.size,
      filePath,
      url
    });

    // Update document with version information
    document.versions = [version._id as mongoose.Types.ObjectId];
    document.currentVersion = version._id as mongoose.Types.ObjectId;
    await document.save();

    // Associate the document with the sales playbook
    await SalesPlaybook.findByIdAndUpdate(
      playbookId,
      { $push: { files: document._id } }
    );

    // Queue the file for asynchronous AI processing
    queueFileProcessing({
      documentId: (document._id as mongoose.Types.ObjectId).toString(),
      playbookId: playbookId,
      s3Key: filePath, // This is the S3 key from fileStorageService.upload
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      orgId: user.organization.toString(),
      uploadedBy: (user._id as mongoose.Types.ObjectId).toString()
    });

    console.log(`📄 File uploaded and queued for processing: ${file.originalname}`);

    res.status(201).json({
      success: true,
      data: {
        document,
        version,
        playbook: {
          id: playbook._id,
          title: playbook.title,
          type: playbook.type
        }
      },
      message: 'File uploaded successfully. AI processing will begin shortly to extract keywords and tags.'
    });
  } catch (error) {
    console.error('Upload file to playbook error:', error);
    res.status(500).json({ success: false, message: 'Error uploading file to playbook' });
  }
};

// List all files in the playbook
export const listPlaybookFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { type, tags, keywords, playbookType } = req.query;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Build query for sales playbooks
    const playbookQuery: any = { 
      organization: user.organization,
      files: { $exists: true, $not: { $size: 0 } } // Only playbooks with files
    };
    
    // Filter by playbook type if provided
    if (playbookType) {
      playbookQuery.type = playbookType;
    }

    // Find all playbooks with files for the organization
    const playbooks = await SalesPlaybook.find(playbookQuery)
      .populate({
        path: 'files',
        populate: [
          {
            path: 'uploadedBy',
            select: 'firstName lastName email'
          },
          {
            path: 'currentVersion',
            select: 'versionNumber timestamp uploadedBy'
          },
          {
            path: 'versions',
            select: 'versionNumber timestamp uploadedBy',
            options: { sort: { versionNumber: -1 } }
          }
        ]
      })
      .populate('createdBy', 'firstName lastName email')
      .select('title type tags keywords files createdBy createdAt updatedAt');

    // Flatten files from all playbooks into a single array with context
    let allFiles: any[] = [];
    
    playbooks.forEach(playbook => {
      if (playbook.files && playbook.files.length > 0) {
        playbook.files.forEach((file: any) => {
          allFiles.push({
            ...file.toObject(),
            playbookContext: {
              id: playbook._id,
              title: playbook.title,
              type: playbook.type,
              tags: playbook.tags,
              keywords: playbook.keywords,
              createdBy: playbook.createdBy
            }
          });
        });
      }
    });

    // Apply additional filtering if specified
    if (type) {
      allFiles = allFiles.filter(file => 
        file.fileType && file.fileType.toLowerCase().includes(type.toString().toLowerCase())
      );
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      allFiles = allFiles.filter(file => 
        file.playbookContext.tags && 
        file.playbookContext.tags.some((tag: string) => 
          tagArray.some((searchTag: any) => 
            tag.toLowerCase().includes(searchTag.toString().toLowerCase())
          )
        )
      );
    }

    if (keywords) {
      const keywordArray = Array.isArray(keywords) ? keywords : [keywords];
      allFiles = allFiles.filter(file => 
        file.playbookContext.keywords && 
        file.playbookContext.keywords.some((keyword: string) => 
          keywordArray.some((searchKeyword: any) => 
            keyword.toLowerCase().includes(searchKeyword.toString().toLowerCase())
          )
        ) ||
        file.name && keywordArray.some((searchKeyword: any) => 
          file.name.toLowerCase().includes(searchKeyword.toString().toLowerCase())
        ) ||
        file.description && keywordArray.some((searchKeyword: any) => 
          file.description.toLowerCase().includes(searchKeyword.toString().toLowerCase())
        )
      );
    }

    // Sort files by most recently uploaded
    allFiles.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    res.status(200).json({
      success: true,
      data: {
        files: allFiles,
        totalFiles: allFiles.length,
        totalPlaybooks: playbooks.length,
        filters: {
          type: type || null,
          tags: tags || null,
          keywords: keywords || null,
          playbookType: playbookType || null
        }
      }
    });
  } catch (error) {
    console.error('List playbook files error:', error);
    res.status(500).json({ success: false, message: 'Error listing playbook files' });
  }
}; 

// Download a file from a playbook
export const downloadPlaybookFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { playbookId, fileId } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Find the playbook to verify access
    const playbook = await SalesPlaybook.findOne({
      _id: playbookId,
      organization: user.organization
    });

    if (!playbook) {
      res.status(404).json({ success: false, message: 'Sales playbook not found' });
      return;
    }

    // Find the document and verify it belongs to this playbook
    const document = await Document.findById(fileId)
      .populate('uploadedBy', 'firstName lastName email organization');

    if (!document || !playbook.files?.some(pFileId => pFileId.toString() === fileId)) {
      res.status(404).json({ success: false, message: 'File not found in this playbook' });
      return;
    }



    // Verify the document belongs to the same organization
    const documentUploader = document.uploadedBy as any;
    if (documentUploader.organization.toString() !== user.organization.toString()) {
      res.status(403).json({ success: false, message: 'Access denied: File belongs to a different organization' });
      return;
    }

    // Extract filename from file path
    const fileName = path.basename(document.filePath);

    // Get the file from storage
    const fileData = await fileStorageService.getPlaybookFile(
      user.organization.toString(),
      playbookId,
      fileName
    );

    // Set headers for download
    res.setHeader('Content-Type', fileData.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.name || fileData.fileName}"`);
    res.send(fileData.buffer);
  } catch (error) {
    console.error('Download playbook file error:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ success: false, message: 'File not found in storage' });
    } else {
      res.status(500).json({ success: false, message: 'Error downloading file' });
    }
  }
};

// Update a file in a playbook (creates new version)
export const updatePlaybookFile = async (req: RequestWithFile, res: Response): Promise<void> => {
  try {
    const { playbookId, fileId } = req.params;
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

    // Find the playbook to verify access
    const playbook = await SalesPlaybook.findOne({
      _id: playbookId,
      organization: user.organization
    });

    if (!playbook) {
      res.status(404).json({ success: false, message: 'Sales playbook not found' });
      return;
    }

    // Find the existing document and verify it belongs to this playbook
    const existingDocument = await Document.findById(fileId)
      .populate('uploadedBy', 'firstName lastName email organization')
      .populate('versions', 'versionNumber timestamp uploadedBy')
      .populate('currentVersion', 'versionNumber timestamp uploadedBy');

    if (!existingDocument || !playbook.files?.some(pFileId => pFileId.toString() === fileId)) {
      res.status(404).json({ success: false, message: 'File not found in this playbook' });
      return;
    }



    // Verify the document belongs to the same organization
    const documentUploader = existingDocument.uploadedBy as any;
    if (documentUploader.organization.toString() !== user.organization.toString()) {
      res.status(403).json({ success: false, message: 'Access denied: File belongs to a different organization' });
      return;
    }

    // Upload the new file version
    const { filePath, url, mimeType } = await fileStorageService.upload(
      file.buffer,
      file.originalname,
      user.organization.toString(),
      playbookId
    );

    // Get the next version number
    const versions = existingDocument.versions as any[];
    const nextVersionNumber = versions.length > 0 
      ? Math.max(...versions.map(v => v.versionNumber)) + 1 
      : 1;

    // Create new version record
    const newVersion = await Version.create({
      versionNumber: nextVersionNumber,
      timestamp: new Date(),
      uploadedBy: user._id,
      fileSize: file.size,
      filePath,
      url,
      mimeType
    });

    // Update document with new version
    existingDocument.name = name || existingDocument.name;
    existingDocument.description = description || existingDocument.description;
    existingDocument.fileType = path.extname(file.originalname).toLowerCase().substring(1);
    existingDocument.fileSize = file.size;
    existingDocument.filePath = filePath;
    existingDocument.url = url;
    existingDocument.versions = [...(existingDocument.versions || []), newVersion._id] as mongoose.Types.ObjectId[];
    existingDocument.currentVersion = newVersion._id as mongoose.Types.ObjectId;
    
    await existingDocument.save();

    // Populate the response
    await existingDocument.populate('currentVersion', 'versionNumber timestamp uploadedBy');
    await existingDocument.populate('versions', 'versionNumber timestamp uploadedBy');

    res.status(200).json({
      success: true,
      data: {
        document: existingDocument,
        newVersion,
        playbook: {
          id: playbook._id,
          title: playbook.title,
          type: playbook.type
        }
      }
    });
  } catch (error) {
    console.error('Update playbook file error:', error);
    res.status(500).json({ success: false, message: 'Error updating file' });
  }
}; 

// Delete a file from a playbook
export const deletePlaybookFile = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { playbookId, fileId } = req.params;
      const { removeFromSalesRooms = 'true' } = req.query; // Optional: remove from sales rooms too
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Find the playbook to verify access
      const playbook = await SalesPlaybook.findOne({
        _id: playbookId,
        organization: user.organization
      }).session(session);

      if (!playbook) {
        throw new Error('Sales playbook not found');
      }

      // Find the document and verify it belongs to this playbook
      const document = await Document.findById(fileId).session(session);

      if (!document || !playbook.files?.some(pFileId => pFileId.toString() === fileId)) {
        throw new Error('File not found in this playbook');
      }

      // Verify organization access
      const documentUploader = await mongoose.model('User').findById(document.uploadedBy).session(session);
      if (!documentUploader || documentUploader.organization.toString() !== user.organization.toString()) {
        throw new Error('Access denied: File belongs to a different organization');
      }

      // Remove file from playbook
      await SalesPlaybook.findByIdAndUpdate(
        playbookId,
        { $pull: { files: fileId } },
        { session }
      );

      let salesRoomsAffected = 0;

      if (removeFromSalesRooms === 'true') {
        // Find all sales rooms that contain this document
        const salesRoomsWithFile = await mongoose.model('DigitalSalesRoom').find({
          documents: fileId,
          organization: user.organization
        }).session(session);

        salesRoomsAffected = salesRoomsWithFile.length;

        // Remove document from all sales rooms
        await mongoose.model('DigitalSalesRoom').updateMany(
          { documents: fileId, organization: user.organization },
          { $pull: { documents: fileId } },
          { session }
        );

        // Delete document access records
        await mongoose.model('DocumentAccess').deleteMany({ 
          document: fileId 
        }, { session });

        // Delete all version records
        if (document.versions && document.versions.length > 0) {
          await Version.deleteMany({ 
            _id: { $in: document.versions } 
          }, { session });
        }

        // Delete the document record
        await Document.findByIdAndDelete(fileId, { session });

        // Delete the physical file from storage
        const fileName = path.basename(document.filePath);
        try {
          await fileStorageService.deletePlaybookFile(
            user.organization.toString(),
            playbookId,
            fileName
          );
        } catch (fileError) {
          console.error('Error deleting file from storage:', fileError);
          // Continue with transaction as DB operations are more critical
        }
      } else {
        // Only remove from playbook, but keep the document for existing sales rooms
        // Just remove the reference from the playbook
        console.log(`File removed from playbook but kept in ${await mongoose.model('DigitalSalesRoom').countDocuments({ documents: fileId })} sales rooms`);
      }

      res.status(200).json({
        success: true,
        message: removeFromSalesRooms === 'true' 
          ? 'File deleted from playbook and all sales rooms'
          : 'File removed from playbook (kept in existing sales rooms)',
        data: {
          fileId,
          playbookId,
          salesRoomsAffected: removeFromSalesRooms === 'true' ? salesRoomsAffected : 0,
          completelyDeleted: removeFromSalesRooms === 'true'
        }
      });
    });
  } catch (error) {
    console.error('Delete playbook file error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error deleting file';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Sales playbook not found') statusCode = 404;
    if (errorMessage === 'File not found in this playbook') statusCode = 404;
    if (errorMessage === 'Access denied: File belongs to a different organization') statusCode = 403;

    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
}; 