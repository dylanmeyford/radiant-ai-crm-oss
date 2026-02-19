import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Intel from '../models/Intel';
import Competitor from '../models/Competitor';

// Create new intel
export const createIntel = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { type, title, content, source, url, importance, status, prospect, competitor } = req.body;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      if (!title || !content || !type) {
        throw new Error('Please provide title, content and type');
      }

      // Validate type-specific fields and existence of related entities
      if (type === 'prospect' && !prospect) {
        throw new Error('Please provide a prospect ID for prospect intel');
      }
      // Add validation if prospect exists if prospect is provided

      if (type === 'competitor' && !competitor) {
        throw new Error('Please provide a competitor ID for competitor intel');
      }
      if (type === 'competitor' && competitor) {
        const competitorDoc = await Competitor.findOne({
          _id: competitor,
          organization: user.organization
        }).session(session);
        if (!competitorDoc) {
          throw new Error('Competitor not found or does not belong to the organization');
        }
      }

      const intelDoc = new Intel({
        type,
        title,
        content,
        source,
        url,
        importance: importance || 'medium',
        status: status || 'active',
        prospect: type === 'prospect' ? prospect : undefined,
        competitor: type === 'competitor' ? competitor : undefined,
        organization: user.organization,
        createdBy: user._id
      });
      await intelDoc.save({ session });

      // If this is competitor intel, add this intel to the competitor's intel array
      if (type === 'competitor' && competitor) {
        await Competitor.findByIdAndUpdate(
          competitor,
          { $push: { intel: intelDoc._id } },
          { session }
        );
      }

      res.status(201).json({
        success: true,
        data: intelDoc
      });
    });
  } catch (error) {
    console.error('Create intel error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error creating intel';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Please provide title, content and type') statusCode = 400;
    if (errorMessage === 'Please provide a prospect ID for prospect intel') statusCode = 400;
    if (errorMessage === 'Please provide a competitor ID for competitor intel') statusCode = 400;
    if (errorMessage === 'Competitor not found or does not belong to the organization') statusCode = 404;

    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
};

// Get all intel for the organization
export const getAllIntel = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    
    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const filters: any = { organization: user.organization };
    
    // Apply filters from query params if provided
    const { type, importance, prospect, competitor, status } = req.query;
    
    if (type) filters.type = type;
    if (importance) filters.importance = importance;
    if (prospect) filters.prospect = prospect;
    if (competitor) filters.competitor = competitor;
    if (status) filters.status = status;

    const intel = await Intel.find(filters)
      .populate('prospect', 'name website')
      .populate('competitor', 'name website')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: intel.length,
      data: intel
    });
  } catch (error) {
    console.error('Get all intel error:', error);
    res.status(500).json({ success: false, message: 'Error fetching intel' });
  }
};

// Get single intel
export const getIntel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const intel = await Intel.findOne({
      _id: id,
      organization: user.organization
    })
      .populate('prospect', 'name website industry size')
      .populate('competitor', 'name website industry size')
      .populate('createdBy', 'name email');

    if (!intel) {
      res.status(404).json({ success: false, message: 'Intel not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: intel
    });
  } catch (error) {
    console.error('Get intel error:', error);
    res.status(500).json({ success: false, message: 'Error fetching intel' });
  }
};

// Update intel
export const updateIntel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Find the existing intel to check if the competitor reference changed
    const existingIntel = await Intel.findOne({
      _id: id,
      organization: user.organization
    });

    if (!existingIntel) {
      res.status(404).json({ success: false, message: 'Intel not found' });
      return;
    }

    // Don't allow changing the type or related entities
    delete updates.type;
    delete updates.prospect;
    delete updates.competitor;
    delete updates.organization;
    delete updates.createdBy;

    const intel = await Intel.findOneAndUpdate(
      { _id: id, organization: user.organization },
      updates,
      { new: true, runValidators: true }
    )
      .populate('prospect', 'name website industry size')
      .populate('competitor', 'name website industry size')
      .populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      data: intel
    });
  } catch (error) {
    console.error('Update intel error:', error);
    res.status(500).json({ success: false, message: 'Error updating intel' });
  }
};

// Delete intel
export const deleteIntel = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Find the intel first to get competitor reference
      const intelDoc = await Intel.findOne({
        _id: id,
        organization: user.organization
      }).session(session);

      if (!intelDoc) {
        throw new Error('Intel not found');
      }

      // If this intel is linked to a competitor, remove the reference
      if (intelDoc.type === 'competitor' && intelDoc.competitor) {
        await Competitor.findByIdAndUpdate(
          intelDoc.competitor,
          { $pull: { intel: intelDoc._id } },
          { session }
        );
      }

      // Delete the intel
      // findByIdAndDelete is not a function on the model when using sessions directly for deletion.
      // Use deleteOne or remove on the instance if needed, or findOneAndDelete with session.
      const deletionResult = await Intel.findOneAndDelete(
        { _id: id, organization: user.organization },
        { session }
      );

      // This check ensures that the document was actually deleted in this transaction session.
      if (!deletionResult) {
          // This could happen if the document was deleted by another process after the initial findOne
          // or if there's an issue with the delete operation itself under session.
          throw new Error('Intel not found during deletion attempt or deletion failed within transaction');
      }

      res.status(200).json({
        success: true,
        data: {}
      });
    });
  } catch (error) {
    console.error('Delete intel error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error deleting intel';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Intel not found' || errorMessage === 'Intel not found during deletion attempt or deletion failed within transaction') statusCode = 404;

    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
}; 