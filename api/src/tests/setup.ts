import mongoose from 'mongoose';
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load test environment variables
// Prefer test.env, then .env.test, then fall back to .devcontainer/dev.env
const testEnvPath = path.join(process.cwd(), 'test.env');
const devTestEnvPath = path.join(process.cwd(), '.devcontainer', 'test.env');

if (fs.existsSync(testEnvPath)) {
  config({ path: testEnvPath });
} else if (fs.existsSync(devTestEnvPath)) {
  config({ path: devTestEnvPath });
} else {
  console.log('No test.env found, using environment variables from container');
}

const TEST_DB_NAME = 'helpme_test';
const MAX_RETRIES = 10;
const RETRY_DELAY = 2000;

// Helper function to connect to MongoDB
async function connectToMongoDB(): Promise<void> {
  // Use the existing MONGODB_URI but replace the database name for testing
  const baseMongoUri = process.env.MONGODB_URI || 'mongodb://mongodb:27017/crm?replicaSet=rs0';
  const testMongoUri = baseMongoUri.replace('/crm', `/${TEST_DB_NAME}`);
  
  console.log('Connecting to test database:', testMongoUri);
  
  await mongoose.connect(testMongoUri, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    maxPoolSize: 1, // Use a single connection for tests
  });
  
  // Test the connection
  await mongoose.connection.db?.admin().ping();
  console.log('✅ Connected to MongoDB test database');
}

beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.OPPORTUNITY_REPROCESSING_DEBOUNCE_MS = '1000'; // Short timeout for tests
  
  // Connect to MongoDB
  await connectToMongoDB();
}, 60000); // 60 second timeout for beforeAll

afterAll(async () => {
  try {
    // Cleanup - drop the test database
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
    }
  } catch (error) {
    console.log('Warning: Failed to drop test database:', (error as Error).message);
  } finally {
    await mongoose.connection.close();
  }
});

afterEach(async () => {
  // Clear all collections after each test
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    const deletePromises = Object.keys(collections).map(async (key) => {
      try {
        await collections[key].deleteMany({});
      } catch (error) {
        // Ignore errors for collections that don't exist
        console.log(`Warning: Failed to clear collection ${key}:`, (error as Error).message);
      }
    });
    await Promise.all(deletePromises);
  }
});

// Global test timeout
jest.setTimeout(60000); 