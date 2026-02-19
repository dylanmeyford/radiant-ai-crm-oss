import { Request, Response } from 'express';
import NylasConnection, { INylasConnection } from '../models/NylasConnection';
import * as NylasService from '../services/NylasService';
import { NotetakerConfig } from '../types/notetaker.types';

// Define a type for the response data to make it clearer
interface NotetakerSettingsResponse {
  connectionId: string; // Or grantId, depending on what's more useful
  config: NotetakerConfig;
  message?: string; // Optional message per connection
}

export const getNotetakerSettings = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?._id;

  if (!userId) {
    res.status(401).json({ success: false, message: 'User not authenticated' });
    return;
  }

  try {
    const nylasConnections: INylasConnection[] = await NylasConnection.find({ user: userId });

    if (!nylasConnections || nylasConnections.length === 0) {
      res.status(404).json({ success: false, message: 'No Nylas connections found for this user.' });
      return;
    }

    const settingsResponse: NotetakerSettingsResponse[] = nylasConnections.map((connection: INylasConnection) => {
      if (!connection.notetaker_config) {
        return {
          connectionId: connection.id,
          config: { enabled: false, default_settings: {} } as NotetakerConfig,
          message: 'Notetaker settings not yet configured for this connection.',
        };
      }
      return {
        connectionId: connection.id,
        config: connection.notetaker_config,
      };
    });

    res.status(200).json({
      success: true,
      message: 'Notetaker settings retrieved successfully for all connections.',
      data: settingsResponse,
    });

  } catch (error: any) {
    console.error('Error retrieving notetaker settings:', error);
    res.status(500).json({ success: false, message: error.message || 'Error retrieving notetaker settings' });
  }
};

export const updateNotetakerSettings = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { enabled, rules } = req.body as NotetakerConfig;
  const userId = req.user?._id;

  if (typeof enabled !== 'boolean') {
    res.status(400).json({ success: false, message: 'Invalid input: enabled must be a boolean.' });
    return;
  }

  if (!userId) {
    res.status(401).json({ success: false, message: 'User not authenticated' });
    return;
  }

  try {
    const nylasConnections: INylasConnection[] = await NylasConnection.find({ user: userId, _id: id });

    if (!nylasConnections || nylasConnections.length === 0) {
      res.status(404).json({ success: false, message: 'No Nylas connections found for this user.' });
      return;
    }

    const updatedSettingsResponse: NotetakerSettingsResponse[] = [];

    for (const connection of nylasConnections) {
      // Update notetaker_config in the database for the current connection
      connection.notetaker_config = {
        enabled,
        default_settings: rules || connection.notetaker_config?.default_settings || {},
      };
      await connection.save();

      // If enabling, configure calendars. If disabling, potentially clean up.
      if (enabled) {
        if (connection.calendars && connection.calendars.length > 0) {
          for (const calendarId of connection.calendars) {
            try {
              await NylasService.configureCalendarForNotetaker(connection.grantId, calendarId, {
                enabled: true,
                rules: rules, // Pass rules from request body
              });
              console.log(`Configured calendar ${calendarId} for notetaker on connection ${connection.id}.`);
              await connection.save();
            } catch (calendarError) {
              console.error(`Error configuring calendar ${calendarId} for notetaker on connection ${connection.id}:`, calendarError);
              // Log and continue, consider how to report partial failures
            }
          }
        } else {
          console.log(`No calendars found for Nylas connection ${connection.id} to configure for notetaker.`);
        }
      } else {
        // Disabling notetaker
        if (connection.calendars && connection.calendars.length > 0) {
          for (const calendarId of connection.calendars) {
            try {
              await NylasService.configureCalendarForNotetaker(connection.grantId, calendarId, {
                enabled: false,
                rules: rules, // Pass rules to potentially remove/reset them
              });
              await connection.save();
              console.log(`Disabled notetaker for calendar ${calendarId} on connection ${connection.id}.`);
            } catch (calendarError) {
              console.error(`Error disabling notetaker for calendar ${calendarId} on connection ${connection.id}:`, calendarError);
            }
          }
        }
        console.log(`Notetaker disabled for connection ${connection.id}.`);
      }
      updatedSettingsResponse.push({
        connectionId: connection.id,
        config: connection.notetaker_config,
        message: `Notetaker settings updated for connection ${connection.id}.`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notetaker settings updated successfully for all applicable connections.',
      data: updatedSettingsResponse,
    });

  } catch (error: any) {
    console.error('Error updating notetaker settings:', error);
    res.status(500).json({ success: false, message: error.message || 'Error updating notetaker settings' });
  }
}; 