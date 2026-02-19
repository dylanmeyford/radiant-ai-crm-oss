/**
 * Migration script to create default pipelines for existing organizations
 * and update all existing PipelineStages and Opportunities to reference them.
 * 
 * Run with: npx ts-node src/scripts/migratePipelines.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Organization from '../models/Organization';
import Pipeline from '../models/Pipeline';
import PipelineStage from '../models/PipelineStage';
import Opportunity from '../models/Opportunity';

dotenv.config();

async function migrate() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // 1. Get all organizations
      const organizations = await Organization.find({}).session(session);
      console.log(`Found ${organizations.length} organizations to process`);

      for (const org of organizations) {
        console.log(`\nProcessing organization: ${org.name} (${org._id})`);

        // 2. Check if a default pipeline already exists for this organization
        let pipeline = await Pipeline.findOne({
          organization: org._id,
          isDefault: true
        }).session(session);

        if (pipeline) {
          console.log(`  Default pipeline already exists: ${pipeline.name}`);
        } else {
          // 3. Create a default pipeline for the organization
          pipeline = new Pipeline({
            name: 'Sales Pipeline',
            description: 'Default sales pipeline',
            organization: org._id,
            isDefault: true,
          });
          await pipeline.save({ session });
          console.log(`  Created default pipeline: ${pipeline.name} (${pipeline._id})`);
        }

        // 4. Update all PipelineStages for this organization to reference the pipeline
        const stagesResult = await PipelineStage.updateMany(
          { 
            organization: org._id,
            pipeline: { $exists: false }
          },
          { $set: { pipeline: pipeline._id } },
          { session }
        );
        console.log(`  Updated ${stagesResult.modifiedCount} pipeline stages`);

        // 5. Update all Opportunities for this organization to reference the pipeline
        const oppsResult = await Opportunity.updateMany(
          { 
            organization: org._id,
            pipeline: { $exists: false }
          },
          { $set: { pipeline: pipeline._id } },
          { session }
        );
        console.log(`  Updated ${oppsResult.modifiedCount} opportunities`);
      }

      console.log('\n✅ Migration completed successfully!');
    });
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await session.endSession();
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

migrate().catch((error) => {
  console.error('Migration script failed:', error);
  process.exit(1);
});
