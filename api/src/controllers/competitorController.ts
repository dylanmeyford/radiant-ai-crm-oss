import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Competitor from '../models/Competitor';
import Intel from '../models/Intel';

// Create a new competitor
export const createCompetitor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      name, 
      website, 
      logo, 
      industry, 
      size, 
      description, 
      strengths, 
      weaknesses, 
      products, 
      pricing, 
      status 
    } = req.body;
    
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    if (!name) {
      res.status(400).json({ success: false, message: 'Please provide competitor name' });
      return;
    }

    const competitor = await Competitor.create({
      name,
      website,
      logo,
      industry,
      size,
      description,
      strengths,
      weaknesses,
      products,
      pricing,
      organization: user.organization,
      createdBy: user._id,
      status: status || 'active'
    });

    res.status(201).json({
      success: true,
      data: competitor
    });
  } catch (error) {
    console.error('Create competitor error:', error);
    res.status(500).json({ success: false, message: 'Error creating competitor' });
  }
};

// Get all competitors for the organization
export const getCompetitors = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const filters: any = { organization: user.organization };
    
    // Apply filters from query params if provided
    const { industry, status } = req.query;
    if (industry) filters.industry = industry;
    if (status) filters.status = status;

    const competitors = await Competitor.find(filters)
      .populate({
        path: 'intel',
        select: 'title importance createdAt',
        options: { sort: { createdAt: -1 }, limit: 5 }
      });

    res.status(200).json({
      success: true,
      count: competitors.length,
      data: competitors
    });
  } catch (error) {
    console.error('Get competitors error:', error);
    res.status(500).json({ success: false, message: 'Error fetching competitors' });
  }
};

// Get a single competitor
export const getCompetitor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const competitor = await Competitor.findOne({
      _id: id,
      organization: user.organization
    }).populate({
      path: 'intel',
      select: 'title content importance source url createdAt',
      options: { sort: { createdAt: -1 } }
    });

    if (!competitor) {
      res.status(404).json({ success: false, message: 'Competitor not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: competitor
    });
  } catch (error) {
    console.error('Get competitor error:', error);
    res.status(500).json({ success: false, message: 'Error fetching competitor' });
  }
};

// Update a competitor
export const updateCompetitor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    // Don't allow changing organization or createdBy
    delete updates.organization;
    delete updates.createdBy;
    delete updates.intel;

    const competitor = await Competitor.findOneAndUpdate(
      { _id: id, organization: user.organization },
      updates,
      { new: true, runValidators: true }
    ).populate({
      path: 'intel',
      select: 'title importance createdAt',
      options: { sort: { createdAt: -1 }, limit: 5 }
    });

    if (!competitor) {
      res.status(404).json({ success: false, message: 'Competitor not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: competitor
    });
  } catch (error) {
    console.error('Update competitor error:', error);
    res.status(500).json({ success: false, message: 'Error updating competitor' });
  }
};

// Delete a competitor
export const deleteCompetitor = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const user = req.user;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Check if the competitor exists before attempting to delete
      const competitorExists = await Competitor.findOne({
        _id: id,
        organization: user.organization
      }).session(session);

      if (!competitorExists) {
        throw new Error('Competitor not found');
      }

      // First update any intel records referencing this competitor
      await Intel.updateMany(
        { competitor: id, organization: user.organization },
        { $unset: { competitor: "" } },
        { session }
      );

      const competitor = await Competitor.findOneAndDelete({
        _id: id,
        organization: user.organization
      }, { session });

      if (!competitor) {
        throw new Error('Competitor not found during deletion attempt');
      }

      res.status(200).json({
        success: true,
        data: {}
      });
    });
  } catch (error) {
    console.error('Delete competitor error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error deleting competitor';
    let statusCode = 500;
    if (errorMessage === 'User not authenticated') statusCode = 401;
    if (errorMessage === 'Competitor not found' || errorMessage === 'Competitor not found during deletion attempt') statusCode = 404;
    
    res.status(statusCode).json({ success: false, message: errorMessage });
  } finally {
    await session.endSession();
  }
}; 