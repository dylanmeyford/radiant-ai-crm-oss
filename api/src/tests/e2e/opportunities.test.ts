/**
 * Opportunities Test File
 * 
 * This file is designed to test the opportunities functionality of the application, as they are used by the application.
 * This includes prospect routes, opportunity routes and contact routes.
 * 
 * It should also test:
 * 1. Race conditions
 * 2. Resilience to api failures (e.g. nylas failure, enrichment failure, etc.)
 * 3. Edge Cases
 * 4. Error handling
 * 5. Data Segregation
 */

import request from 'supertest';
import mongoose from 'mongoose';

// Mock Nylas-related services to prevent real API calls during tests
// These workflows don't rely on Nylas functionality
jest.mock('../../services/NylasService', () => {
  const actual = jest.requireActual('../../services/NylasService');
  return {
    ...actual,
    fetchEmailsAndEventsForContact: jest.fn().mockResolvedValue(undefined),
    getEmailThreads: jest.fn().mockResolvedValue([]),
    getAllEmailThreads: jest.fn().mockResolvedValue([]),
  };
});

jest.mock('../../services/contactAutoPopulationService', () => ({
  searchAndPopulateContacts: jest.fn().mockResolvedValue({
    totalFound: 0,
    totalCreated: 0,
    totalErrors: 0,
  }),
}));

jest.mock('../../services/contactResearchService', () => ({
  executeContactResearch: jest.fn().mockResolvedValue(undefined),
  researchContact: jest.fn().mockResolvedValue(undefined),
}));

import { app } from '../../app';
import {
  registerUser,
  createProspectViaRoute,
  createContactViaRoute,
  createOpportunityViaRoute,
  createPipelineViaRoute,
  AuthenticatedUser,
} from '../helpers/RouteFactory';

jest.setTimeout(60000);

describe('Opportunity Creation', () => {
  describe('Basic opportunity creation (following OpportunityForm pattern)', () => {
    let auth: AuthenticatedUser;
    let prospectId: string;

    beforeEach(async () => {
      // Step 1: Register a user (creates user + organization)
      auth = await registerUser();
      
      // Step 2: Create a prospect with domains (as OpportunityForm does)
      const prospect = await createProspectViaRoute(auth, {
        name: 'Acme Corporation',
        domains: ['acme.com', 'acme.io'],
      });
      prospectId = prospect._id.toString();
    });

    test('creates an opportunity with minimal required fields', async () => {
      // This mirrors how OpportunityForm submits with just name, amount, and prospect
      const response = await request(app)
        .post('/api/opportunities')
        .set('Authorization', `Bearer ${auth.accessToken}`)
        .send({
          name: 'Enterprise Deal',
          amount: 50000,
          prospect: prospectId,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: 'Enterprise Deal',
        amount: 50000,
      });
      expect(response.body.data._id).toBeDefined();
      expect(response.body.data.stage).toBeDefined();
      expect(response.body.data.pipeline).toBeDefined();
    });

    test('creates an opportunity with all fields from OpportunityForm', async () => {
      // First, get the default pipeline and its first stage
      const pipelinesResponse = await request(app)
        .get('/api/pipelines/default')
        .set('Authorization', `Bearer ${auth.accessToken}`);
      
      expect(pipelinesResponse.status).toBe(200);
      const defaultPipeline = pipelinesResponse.body.data;

      // Get stages for the pipeline
      const stagesResponse = await request(app)
        .get(`/api/pipelines/${defaultPipeline._id}/stages`)
        .set('Authorization', `Bearer ${auth.accessToken}`);
      
      expect(stagesResponse.status).toBe(200);
      const stages = stagesResponse.body.data;
      expect(stages.length).toBeGreaterThan(0);
      const firstStage = stages[0];

      // Create opportunity with full OpportunityForm payload
      const createdDate = new Date('2025-01-15');
      const response = await request(app)
        .post('/api/opportunities')
        .set('Authorization', `Bearer ${auth.accessToken}`)
        .send({
          name: 'Full Enterprise Deal',
          description: 'A comprehensive enterprise software deal',
          amount: 100000,
          stage: firstStage._id,
          pipeline: defaultPipeline._id,
          probability: 50,
          expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdDate: createdDate,
          prospect: prospectId,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: 'Full Enterprise Deal',
        description: 'A comprehensive enterprise software deal',
        amount: 100000,
        probability: 50,
      });
      expect(response.body.data.stage.toString()).toBe(firstStage._id);
      expect(response.body.data.pipeline.toString()).toBe(defaultPipeline._id);
    });

    test('opportunity is linked to the prospect', async () => {
      const opportunity = await createOpportunityViaRoute(auth, prospectId, {
        name: 'Linked Deal',
        amount: 25000,
      });

      // Verify the opportunity references the prospect
      expect(opportunity.prospect.toString()).toBe(prospectId);

      // Verify the prospect now references the opportunity
      const prospectResponse = await request(app)
        .get(`/api/prospects/${prospectId}`)
        .set('Authorization', `Bearer ${auth.accessToken}`);
      
      expect(prospectResponse.status).toBe(200);
      const prospectOpportunities = prospectResponse.body.data.opportunities || [];
      expect(prospectOpportunities.some((o: any) => o._id.toString() === opportunity._id.toString())).toBe(true);
    });

    test('opportunity automatically includes prospect contacts', async () => {
      // Create a contact for the prospect
      const contact = await createContactViaRoute(auth, prospectId, {
        firstName: 'John',
        lastName: 'Smith',
        emails: [{ address: 'john.smith@acme.com', category: 'work', isPrimary: true }],
        isPrimary: true,
      });

      // Create opportunity - contacts should be auto-added
      const response = await request(app)
        .post('/api/opportunities')
        .set('Authorization', `Bearer ${auth.accessToken}`)
        .send({
          name: 'Deal with Contacts',
          amount: 75000,
          prospect: prospectId,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.contacts).toBeDefined();
      expect(response.body.data.contacts.length).toBeGreaterThan(0);
      
      // Verify the contact ID is included
      const contactIds = response.body.data.contacts.map((c: any) => c._id?.toString() || c.toString());
      expect(contactIds).toContain((contact._id as string).toString());
    });
  });

  describe('Error handling', () => {
    let auth: AuthenticatedUser;

    beforeEach(async () => {
      auth = await registerUser();
    });

    test('returns 404 when prospect does not exist', async () => {
      const fakeProspectId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .post('/api/opportunities')
        .set('Authorization', `Bearer ${auth.accessToken}`)
        .send({
          name: 'Orphan Deal',
          amount: 10000,
          prospect: fakeProspectId,
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Prospect not found');
    });

    test('returns 401 when not authenticated', async () => {
      const response = await request(app)
        .post('/api/opportunities')
        .send({
          name: 'Unauthorized Deal',
          amount: 10000,
          prospect: new mongoose.Types.ObjectId().toString(),
        });

      expect(response.status).toBe(401);
    });

    test('returns 404 when pipeline stage does not exist', async () => {
      const prospect = await createProspectViaRoute(auth);
      const fakeStageId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .post('/api/opportunities')
        .set('Authorization', `Bearer ${auth.accessToken}`)
        .send({
          name: 'Bad Stage Deal',
          amount: 10000,
          prospect: prospect._id.toString(),
          stage: fakeStageId,
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Pipeline stage not found');
    });
  });

  describe('Data segregation', () => {
    test('cannot create opportunity for another organization\'s prospect', async () => {
      // Create two separate users (each with their own organization)
      const auth1 = await registerUser();
      const auth2 = await registerUser();

      // Create a prospect belonging to org1
      const prospect = await createProspectViaRoute(auth1, {
        name: 'Org1 Prospect',
        domains: ['org1-prospect.com'],
      });

      // Try to create an opportunity from org2 using org1's prospect
      const response = await request(app)
        .post('/api/opportunities')
        .set('Authorization', `Bearer ${auth2.accessToken}`)
        .send({
          name: 'Cross-Org Deal',
          amount: 50000,
          prospect: prospect._id.toString(),
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Prospect not found');
    });

    test('cannot access another organization\'s opportunity', async () => {
      // Create two separate users
      const auth1 = await registerUser();
      const auth2 = await registerUser();

      // Create prospect and opportunity for org1
      const prospect = await createProspectViaRoute(auth1);
      const opportunity = await createOpportunityViaRoute(auth1, prospect._id.toString());

      // Try to access org1's opportunity from org2
      const response = await request(app)
        .get(`/api/opportunities/${opportunity._id}`)
        .set('Authorization', `Bearer ${auth2.accessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Opportunity with custom pipeline and stages', () => {
    let auth: AuthenticatedUser;
    let prospectId: string;

    beforeEach(async () => {
      auth = await registerUser();
      const prospect = await createProspectViaRoute(auth, {
        name: 'Custom Pipeline Prospect',
        domains: ['custom.com'],
      });
      prospectId = prospect._id.toString();
    });

    test('creates opportunity with custom pipeline and stage', async () => {
      // Create a custom pipeline (this automatically creates default stages)
      const pipeline = await createPipelineViaRoute(auth, {
        name: 'Custom Sales Pipeline',
        isDefault: false,
      });

      // Get the stages that were auto-created with the pipeline
      const stagesResponse = await request(app)
        .get(`/api/pipelines/${pipeline._id}/stages`)
        .set('Authorization', `Bearer ${auth.accessToken}`);
      
      expect(stagesResponse.status).toBe(200);
      const stages = stagesResponse.body.data;
      expect(stages.length).toBeGreaterThan(0);
      
      // Use the second stage (Demo) to verify we can specify a non-default stage
      const selectedStage = stages.find((s: any) => s.name === 'Demo') || stages[1];

      // Create opportunity with custom pipeline and stage
      const response = await request(app)
        .post('/api/opportunities')
        .set('Authorization', `Bearer ${auth.accessToken}`)
        .send({
          name: 'Custom Pipeline Deal',
          amount: 35000,
          prospect: prospectId,
          pipeline: pipeline._id,
          stage: selectedStage._id,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.pipeline.toString()).toBe(pipeline._id);
      expect(response.body.data.stage.toString()).toBe(selectedStage._id);
    });
  });
});
