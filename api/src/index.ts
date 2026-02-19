import dotenv from 'dotenv';
import connectDB from './config/database';
import path from 'path';
import { app } from './app';
// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.devcontainer/dev.env') });

// Connect to MongoDB
connectDB();

const port = process.env.PORT!;

// Start server
const server = app.listen(port, async () => {
  console.log(`Server running on port ${port}`);

  // Start the email scheduler service
  const emailSchedulerService = require('./schedulers/EmailSchedulerService').default;
  emailSchedulerService.start();

  // Start the opportunity intelligence scheduler service
  try {
    const { opportunityIntelligenceScheduler } = require('./schedulers/OpportunityIntelligenceSchedulerService');
    opportunityIntelligenceScheduler.start();
    console.log('Opportunity intelligence scheduler started successfully');
  } catch (error) {
    console.error('Failed to start opportunity intelligence scheduler:', error);
    // Don't crash the server if scheduler fails to start
  }

  // Start the monthly billing scheduler service
  try {
    const { monthlyBillingScheduler } = require('./schedulers/MonthlyBillingScheduler');
    monthlyBillingScheduler.start();
    console.log('Monthly billing scheduler started successfully');
  } catch (error) {
    console.error('Failed to start monthly billing scheduler:', error);
    // Don't crash the server if scheduler fails to start
  }

  // Start the meeting preparation scheduler service
  try {
    const meetingPrepSchedulerService = require('./schedulers/MeetingPrepSchedulerService').default;
    meetingPrepSchedulerService.start();
    console.log('Meeting preparation scheduler started successfully');
  } catch (error) {
    console.error('Failed to start meeting preparation scheduler:', error);
    // Don't crash the server if scheduler fails to start
  }

  // Start the grant keep-alive scheduler service
  try {
    const { grantKeepAliveScheduler } = require('./schedulers/GrantKeepAliveSchedulerService');
    grantKeepAliveScheduler.start();
    console.log('Grant keep-alive scheduler started successfully');
  } catch (error) {
    console.error('Failed to start grant keep-alive scheduler:', error);
    // Don't crash the server if scheduler fails to start
  }

  // Start the deal mining scheduler service
  try {
    const { dealMiningSchedulerService } = require('./schedulers/DealMiningSchedulerService');
    dealMiningSchedulerService.start();
    console.log('Deal mining scheduler started successfully');
  } catch (error) {
    console.error('Failed to start deal mining scheduler:', error);
    // Don't crash the server if scheduler fails to start
  }

  // Start the activity processing queue worker system
  try {
    const { QueueWorkerService } = require('./services/activityProcessingService/queueWorkerService');
    await QueueWorkerService.start();

    // Start the media processing service
    const { MediaProcessingService } = require('./services/mediaProcessingService');
    await MediaProcessingService.start();
    console.log('Activity processing queue worker started successfully');
  } catch (error) {
    console.error('Failed to start activity processing queue worker:', error);
    // Don't crash the server if queue worker fails to start
    // Activities will fall back to direct processing
  }
});

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Stop the opportunity intelligence scheduler
    const { opportunityIntelligenceScheduler } = require('./schedulers/OpportunityIntelligenceSchedulerService');
    opportunityIntelligenceScheduler.stop();
    console.log('Opportunity intelligence scheduler stopped');
  } catch (error) {
    console.error('Error stopping opportunity intelligence scheduler:', error);
  }

  try {
    // Stop the meeting preparation scheduler
    const meetingPrepSchedulerService = require('./schedulers/MeetingPrepSchedulerService').default;
    meetingPrepSchedulerService.stop();
    console.log('Meeting preparation scheduler stopped');
  } catch (error) {
    console.error('Error stopping meeting preparation scheduler:', error);
  }

  try {
    // Stop the grant keep-alive scheduler
    const { grantKeepAliveScheduler } = require('./schedulers/GrantKeepAliveSchedulerService');
    grantKeepAliveScheduler.stop();
    console.log('Grant keep-alive scheduler stopped');
  } catch (error) {
    console.error('Error stopping grant keep-alive scheduler:', error);
  }

  try {
    // Stop the queue worker system
    const { QueueWorkerService } = require('./services/activityProcessingService/queueWorkerService');
    await QueueWorkerService.stop();
    
    // Stop the media processing service
    const { MediaProcessingService } = require('./services/mediaProcessingService');
    await MediaProcessingService.stop();
    console.log('Activity processing and media processing services stopped');
  } catch (error) {
    console.error('Error stopping queue worker:', error);
  }

  // Close the server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forcing exit after 10 seconds');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
