import { Request, Response } from 'express';
import NylasConnection from '../models/NylasConnection';
import * as NylasService from '../services/NylasService';

export const inviteNotetaker = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user._id) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const nylasConnection = await NylasConnection.findOne({ user: user._id });
    if (!nylasConnection || !nylasConnection.grantId) {
      res.status(404).json({ success: false, message: 'Nylas connection not found for this user or grantId is missing.' });
      return;
    }

    const { inviteUrl } = req.body;

    if (!inviteUrl) {
      res.status(400).json({ success: false, message: 'Missing inviteUrl in request body' });
      return;
    }
    
    const result = await NylasService.inviteNotetakerToMeeting(nylasConnection.grantId, inviteUrl);

    if (result.success && result.data) {
      // Task 3.3.2: Store the notetaker_id returned by Nylas,
      // possibly creating/updating a preliminary MeetingActivity/CalendarActivity record.
      // For now, just returning the success response with data.
      // Actual DB operation to create/update a MeetingActivity would happen here.
      // e.g.,
      // const preliminaryActivity = await CalendarActivity.create({
      //   title: meetingDetails.title,
      //   startTime: new Date(meetingDetails.startTime * 1000), // Assuming startTime is Unix timestamp
      //   endTime: new Date(meetingDetails.endTime * 1000),   // Assuming endTime is Unix timestamp
      //   nylasNotetakerId: result.data.notetakerId,
      //   meetingStatus: 'pending_invite', // or similar initial status
      //   organization: user.organization,
      //   createdBy: user._id,
      //   // Potentially link to a calendar if known, or contacts if provided
      // });
      // console.log('Preliminary meeting activity created/updated with notetakerId:', result.data.notetakerId);
      
      res.status(200).json({ success: true, data: result.data });
    } else {
      console.error('Error inviting notetaker:', result.error);
      res.status(result.error?.statusCode || 500).json({ 
        success: false, 
        message: result.message || 'Failed to invite notetaker',
        error: result.error 
      });
    }
  } catch (error: any) {
    console.error('Invite notetaker controller error:', error);
    res.status(500).json({ success: false, message: 'Internal server error while inviting notetaker', error: error.message });
  }
};

export const cancelNotetaker = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user._id) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const nylasConnection = await NylasConnection.findOne({ user: user._id });
    if (!nylasConnection || !nylasConnection.grantId) {
      res.status(404).json({ success: false, message: 'Nylas connection not found for this user or grantId is missing.' });
      return;
    }

    const { notetakerId } = req.params;
    if (!notetakerId) {
      res.status(400).json({ success: false, message: 'Missing notetakerId in request parameters' });
      return;
    }

    const result = await NylasService.cancelScheduledNotetaker(nylasConnection.grantId, notetakerId);

    if (result.success) {
      // Optionally: Update MeetingActivity/CalendarActivity status to 'cancelled' here.
      // For example:
      // await CalendarActivity.findOneAndUpdate(
      //   { nylasNotetakerId: notetakerId, organization: user.organization },
      //   { meetingStatus: 'cancelled' }
      // );
      // console.log('Meeting activity status updated to cancelled for notetakerId:', notetakerId);
      res.status(200).json({ success: true, message: result.message || 'Notetaker cancelled successfully', requestId: result.requestId });
    } else {
      console.error('Error cancelling notetaker:', result.error);
      res.status(result.error?.statusCode || 500).json({ 
        success: false, 
        message: result.message || 'Failed to cancel notetaker', 
        error: result.error 
      });
    }
  } catch (error: any) {
    console.error('Cancel notetaker controller error:', error);
    res.status(500).json({ success: false, message: 'Internal server error while cancelling notetaker', error: error.message });
  }
};

export const makeNotetakerLeaveMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user._id) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const nylasConnection = await NylasConnection.findOne({ user: user._id });
    if (!nylasConnection || !nylasConnection.grantId) {
      res.status(404).json({ success: false, message: 'Nylas connection not found for this user or grantId is missing.' });
      return;
    }

    const { notetakerId } = req.params;
    if (!notetakerId) {
      res.status(400).json({ success: false, message: 'Missing notetakerId in request parameters' });
      return;
    }

    const result = await NylasService.makeNotetakerLeaveMeeting(nylasConnection.grantId, notetakerId);

    if (result.success) {
      // Optionally: Update MeetingActivity/CalendarActivity status if needed.
      // e.g., to 'left_meeting' or similar.
      // console.log('Notetaker left meeting for notetakerId:', notetakerId);
      res.status(200).json({ success: true, message: result.message || 'Notetaker leave request processed successfully', requestId: result.requestId });
    } else {
      console.error('Error making notetaker leave meeting:', result.error);
      res.status(result.error?.statusCode || 500).json({ 
        success: false, 
        message: result.message || 'Failed to make notetaker leave meeting', 
        error: result.error 
      });
    }
  } catch (error: any) {
    console.error('Make notetaker leave meeting controller error:', error);
    res.status(500).json({ success: false, message: 'Internal server error while making notetaker leave meeting', error: error.message });
  }
}; 