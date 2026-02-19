import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load test environment variables BEFORE any modules are imported
const testEnvPath = path.join(process.cwd(), 'test.env');
const devTestEnvPath = path.join(process.cwd(), '.devcontainer', 'test.env');

// Use override: true to ensure test.env values take precedence over
// environment variables pre-loaded by the dev container
if (fs.existsSync(testEnvPath)) {
  config({ path: testEnvPath, override: true });
} else if (fs.existsSync(devTestEnvPath)) {
  config({ path: devTestEnvPath, override: true });
} else {
  console.log('No test.env found, using environment variables from container');
}
